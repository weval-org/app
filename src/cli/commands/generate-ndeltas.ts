import { Command } from 'commander';
import { getConfig } from '../config';
import pLimit from '@/lib/pLimit';
import {
  listConfigIds,
  listRunsForConfig,
  getResultByFileName,
  saveModelNDeltas,
  ModelNDeltasFileContent,
  saveNDeltasIndex,
  getNDeltasIndex,
} from '@/lib/storageService';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { ComparisonDataV2 as WevalResult } from '@/app/utils/types';

function getCoreNameFromEffective(fullId: string): string {
  const base = parseModelIdForDisplay(fullId).baseId; // e.g., "openai:gpt-4o"
  const core = base.includes(':') ? base.split(':')[1] : base; // -> "gpt-4o"
  return core.toLowerCase();
}

function getCoreNameFromInput(input: string): string {
  const norm = parseModelIdForDisplay(input).baseId; // may add provider if present
  const core = norm.includes(':') ? norm.split(':')[1] : norm;
  return core.toLowerCase();
}

function computeCoverage(result: WevalResult, promptId: string, modelId: string): number | null {
  const cov = result?.evaluationResults?.llmCoverageScores?.[promptId]?.[modelId];
  if (!cov || (cov as any).error) return null;
  const v = (cov as any).avgCoverageExtent;
  return typeof v === 'number' && !isNaN(v) ? v : null;
}

async function computeEntriesForCoreModel(coreName: string, options: { minPeers?: number; verbose?: boolean }) {
  const { logger } = getConfig();
  const entries: ModelNDeltasFileContent['entries'] = [];
  const configIds = await listConfigIds();
  const limiter = pLimit(8);
  const minPeers = options.minPeers ?? 0;
  let runsScanned = 0;
  let runsUsed = 0;
  let runsSkippedNoTarget = 0;
  let runsSkippedPeers = 0;
  let promptsAggregated = 0;

  const tasks = configIds.map(configId => limiter(async () => {
    try {
      const runs = await listRunsForConfig(configId);
      if (!runs || runs.length === 0) return false;
      const latest = runs[0];
      const runData = await getResultByFileName(configId, latest.fileName) as WevalResult | null;
      if (!runData) return false;
      runsScanned += 1;

      // Build groups by core name for this run
      const variantsByCore = new Map<string, string[]>();
      for (const m of runData.effectiveModels || []) {
        if (m === IDEAL_MODEL_ID) continue;
        const c = getCoreNameFromEffective(m);
        const arr = variantsByCore.get(c) || [];
        arr.push(m);
        variantsByCore.set(c, arr);
      }

      // Ensure target present as base group
      if (!variantsByCore.has(coreName)) {
        runsSkippedNoTarget += 1;
        if (options.verbose) logger.info(`[NDeltas] Skip ${configId}/${latest.runLabel}: target '${coreName}' not present.`);
        return false;
      }

      // Require minimum peer base groups
      const peerBaseCount = Array.from(variantsByCore.keys()).filter(k => k !== coreName).length;
      if (peerBaseCount < minPeers) {
        runsSkippedPeers += 1;
        if (options.verbose) logger.info(`[NDeltas] Skip ${configId}/${latest.runLabel}: only ${peerBaseCount} peer bases (< ${minPeers}).`);
        return false;
      }

      // For each prompt, compute target aggregated coverage and peer average (base-averaged first)
      for (const pid of runData.promptIds || []) {
        // target: average across its variants for this prompt
        const targetVariants = variantsByCore.get(coreName)!;
        const tScores: number[] = [];
        for (const tv of targetVariants) {
          const v = computeCoverage(runData, pid, tv);
          if (v !== null) tScores.push(v);
        }
        if (tScores.length === 0) continue;
        const targetAvg = tScores.reduce((a, b) => a + b, 0) / tScores.length;

        // peers: for each base, average its variant scores for this prompt
        const baseAvgByCore: Array<{ core: string; avg: number }> = [];
        for (const [peerCore, peerVariants] of variantsByCore.entries()) {
          const pScores: number[] = [];
          for (const pv of peerVariants) {
            const v = computeCoverage(runData, pid, pv);
            if (v !== null) pScores.push(v);
          }
          if (pScores.length > 0) {
            baseAvgByCore.push({ core: peerCore, avg: pScores.reduce((a, b) => a + b, 0) / pScores.length });
          }
        }
        // Build peer average excluding target base
        const peerBaseAverages = baseAvgByCore.filter(b => b.core !== coreName).map(b => b.avg);
        if (peerBaseAverages.length === 0) continue;
        const peerAvg = peerBaseAverages.reduce((a, b) => a + b, 0) / peerBaseAverages.length;

        // Ranking and context among bases
        const sortedBases = baseAvgByCore
          .slice()
          .sort((a, b) => b.avg - a.avg);
        const totalBases = sortedBases.length;
        const rankAmongBases = sortedBases.findIndex(b => b.core === coreName) + 1; // 1-based
        const percentileFromTop = Math.round(((rankAmongBases - 1) / (totalBases - 1 || 1)) * 100);
        const quartileFromTop = ((): 1 | 2 | 3 | 4 => {
          if (percentileFromTop <= 25) return 1;
          if (percentileFromTop <= 50) return 2;
          if (percentileFromTop <= 75) return 3;
          return 4;
        })();
        const topBases = sortedBases.slice(0, Math.min(3, sortedBases.length)).map(b => ({ base: b.core, coverage: b.avg }));

        const kp = (runData as any)?.evaluationResults?.llmCoverageScores?.[pid]?.[targetVariants[0]]?.keyPointsCount ?? null;

        // Choose a representative variant for response extraction (best-scoring target variant for this prompt)
        let selectedVariantId: string | undefined = undefined;
        let bestScore = -Infinity;
        for (const tv of targetVariants) {
          const v = computeCoverage(runData, pid, tv);
          if (v !== null && v > bestScore) { bestScore = v; selectedVariantId = tv; }
        }
        const responsesByPrompt = (runData as any)?.allFinalAssistantResponses?.[pid] || {};
        const finalResponse = selectedVariantId ? (responsesByPrompt[selectedVariantId] ?? null) : null;
        const systemPromptUsed = (runData as any)?.modelSystemPrompts?.[selectedVariantId || ''] ?? null;
        let temperatureUsed: number | null = null;
        try {
          const match = (selectedVariantId || '').match(/\[temp:([0-9.]+)\]/);
          if (match) temperatureUsed = parseFloat(match[1]);
        } catch {}
        const promptContext = (runData as any)?.promptContexts?.[pid]
          ?? (runData as any)?.config?.prompts?.find((p:any)=>p.id===pid)?.messages
          ?? (runData as any)?.config?.prompts?.find((p:any)=>p.id===pid)?.promptText
          ?? null;
        const fullConversationHistory = (runData as any)?.fullConversationHistories?.[pid]?.[selectedVariantId || ''] ?? undefined;

        entries.push({
          configId,
          configTitle: runData.configTitle || runData.config?.title || configId,
          runLabel: runData.runLabel,
          timestamp: runData.timestamp,
          promptId: pid,
          modelId: coreName,
          modelCoverage: targetAvg,
          peerAverageCoverage: peerAvg,
          delta: targetAvg - peerAvg,
          keyPointsCount: kp,
          totalBases,
          rankAmongBases,
          percentileFromTop,
          quartileFromTop,
          topBases,
          selectedVariantId,
          systemPromptUsed,
          temperatureUsed,
          promptContext,
          finalResponse,
          fullConversationHistory,
        });
        promptsAggregated += 1;
      }
      runsUsed += 1;
      return true;
    } catch (err: any) {
      logger.warn(`Failed processing config ${configId}: ${err.message}`);
      return false;
    }
  }));

  const results = await Promise.all(tasks);
  const participatingRuns = results.filter(Boolean).length;
  if (options.verbose) {
    logger.info(`[NDeltas] ${coreName}: scanned ${runsScanned} latest runs, used ${runsUsed}, skipped(no-target=${runsSkippedNoTarget}, insufficient-peers=${runsSkippedPeers}), prompts aggregated ${promptsAggregated}.`);
  }
  return { entries, participatingRuns, runsScanned, runsUsed, runsSkippedNoTarget, runsSkippedPeers, promptsAggregated };
}

export async function actionGenerateNDeltas(modelOrFlag: string, options: { limit?: number; dryRun?: boolean; verbose?: boolean; allModels?: boolean; minRuns?: number; minPeers?: number }) {
  const { logger } = getConfig();
  const limit = typeof options.limit === 'number' && options.limit > 0 ? Math.floor(options.limit) : undefined;
  const minRuns = options.minRuns ?? 0;
  const minPeers = options.minPeers ?? 0;

  if (options.allModels) {
    logger.info('Generating NDeltas for all base models...');
    // Discover base core names and count eligible runs
    const configs = await listConfigIds();
    const baseToEligibleRuns = new Map<string, number>();
    const baseDiscovered = new Map<string, number>();
    for (const configId of configs) {
      try {
        const runs = await listRunsForConfig(configId);
        if (runs.length === 0) continue;
        const latest = runs[0];
        const runData = await getResultByFileName(configId, latest.fileName) as WevalResult | null;
        if (!runData) continue;
        const variantsByCore = new Map<string, string[]>();
        for (const m of runData.effectiveModels || []) {
          if (m === IDEAL_MODEL_ID) continue;
          const c = getCoreNameFromEffective(m);
          const arr = variantsByCore.get(c) || [];
          arr.push(m);
          variantsByCore.set(c, arr);
        }
        const cores = Array.from(variantsByCore.keys());
        cores.forEach(c => baseDiscovered.set(c, (baseDiscovered.get(c) || 0) + 1));
        for (const core of cores) {
          const peerBaseCount = cores.filter(k => k !== core).length;
          if (peerBaseCount >= minPeers) {
            baseToEligibleRuns.set(core, (baseToEligibleRuns.get(core) || 0) + 1);
          }
        }
      } catch {}
    }

    const targets = Array.from(baseToEligibleRuns.entries()).filter(([, count]) => count >= minRuns).map(([core]) => core);
    logger.info(`Found ${targets.length} base models meeting thresholds (minRuns=${minRuns}, minPeers=${minPeers}).`);
    if (options.verbose) {
      const discoveredList = Array.from(baseDiscovered.entries()).sort((a,b) => b[1]-a[1]).slice(0, 50).map(([c, n]) => `${c}:${n}`).join(', ');
      logger.info(`[NDeltas] Discovered ${baseDiscovered.size} base models across latest runs. Top (base:runCount): ${discoveredList}`);
      const eligibleList = Array.from(baseToEligibleRuns.entries()).sort((a,b)=> b[1]-a[1]).slice(0, 50).map(([c,n]) => `${c}:${n}`).join(', ');
      logger.info(`[NDeltas] Eligible base models (base:eligibleRunCount): ${eligibleList}`);
    }

    const limiter = pLimit(4);
    const resultsForIndex: Array<{ core: string; entries: number; worst: number | null; median: number | null; generatedAt: string }> = [];
    await Promise.all(targets.map(coreName => limiter(async () => {
      const { entries, participatingRuns, runsScanned, runsUsed, runsSkippedNoTarget, runsSkippedPeers, promptsAggregated } = await computeEntriesForCoreModel(coreName, { minPeers, verbose: options.verbose });
      entries.sort((a, b) => a.delta - b.delta);
      const finalEntries = typeof limit === 'number' ? entries.slice(0, limit) : entries;
      const output: ModelNDeltasFileContent = {
        modelId: coreName,
        totalEntries: finalEntries.length,
        generatedAt: new Date().toISOString(),
        entries: finalEntries,
      };
      if (options.dryRun) {
        logger.info(`[DRY RUN] (${coreName}) entries=${finalEntries.length} fromRuns=${participatingRuns} scanned=${runsScanned} used=${runsUsed} skippedNoTarget=${runsSkippedNoTarget} skippedPeers=${runsSkippedPeers} prompts=${promptsAggregated}`);
        const deltas = finalEntries.map(e => e.delta).sort((a,b)=>a-b);
        resultsForIndex.push({ core: coreName, entries: finalEntries.length, worst: deltas[0] ?? null, median: deltas.length ? deltas[Math.floor(deltas.length/2)] : null, generatedAt: output.generatedAt });
        return;
      }
      await saveModelNDeltas(coreName, output);
      logger.info(`Saved NDeltas for ${coreName} (entries=${finalEntries.length}, runs=${participatingRuns}, scanned=${runsScanned}, used=${runsUsed}, skippedNoTarget=${runsSkippedNoTarget}, skippedPeers=${runsSkippedPeers}, prompts=${promptsAggregated}).`);
      const deltas = finalEntries.map(e => e.delta).sort((a,b)=>a-b);
      resultsForIndex.push({ core: coreName, entries: finalEntries.length, worst: deltas[0] ?? null, median: deltas.length ? deltas[Math.floor(deltas.length/2)] : null, generatedAt: output.generatedAt });
    })));

    // Save an index manifest for UI listing
    const indexPayload = {
      models: resultsForIndex
        .sort((a,b) => (a.worst ?? 0) - (b.worst ?? 0))
        .map(r => ({ modelId: r.core, totalEntries: r.entries, generatedAt: r.generatedAt, worstDelta: r.worst, medianDelta: r.median })),
      lastUpdated: new Date().toISOString(),
    };
    if (options.dryRun) {
      logger.info(`[DRY RUN] Would save NDeltas index for ${resultsForIndex.length} models.`);
    } else {
      await saveNDeltasIndex(indexPayload);
      logger.info(`Saved NDeltas index for ${resultsForIndex.length} models.`);
    }
    return;
  }

  // Single model mode: interpret input as base core name (e.g., "gpt-4o")
  const coreName = getCoreNameFromInput(modelOrFlag);
  logger.info(`Generating NDeltas for base model: ${coreName}`);
  const { entries, participatingRuns, runsScanned, runsUsed, runsSkippedNoTarget, runsSkippedPeers, promptsAggregated } = await computeEntriesForCoreModel(coreName, { minPeers, verbose: options.verbose });
  entries.sort((a, b) => a.delta - b.delta);
  const finalEntries = typeof limit === 'number' ? entries.slice(0, limit) : entries;
  const output: ModelNDeltasFileContent = {
    modelId: coreName,
    totalEntries: finalEntries.length,
    generatedAt: new Date().toISOString(),
    entries: finalEntries,
  };
  if (options.dryRun) {
    logger.info(`[DRY RUN] Would save ${finalEntries.length} ndelta rows for base model ${coreName} (from ${participatingRuns} runs; scanned=${runsScanned}, used=${runsUsed}, skippedNoTarget=${runsSkippedNoTarget}, skippedPeers=${runsSkippedPeers}, prompts=${promptsAggregated}). Sample:`);
    console.log(JSON.stringify(finalEntries.slice(0, 10), null, 2));
    // Also show what would be written to index
    const deltas = finalEntries.map(e => e.delta).sort((a,b)=>a-b);
    const worst = deltas[0] ?? null;
    const median = deltas.length ? deltas[Math.floor(deltas.length/2)] : null;
    logger.info(`[DRY RUN] Would update NDeltas index entry: { modelId: ${coreName}, totalEntries: ${finalEntries.length}, worstDelta: ${worst}, medianDelta: ${median} }`);
    return;
  }
  await saveModelNDeltas(coreName, output);
  logger.info(`Saved NDeltas for ${coreName} with ${finalEntries.length} entries (runs=${participatingRuns}, scanned=${runsScanned}, used=${runsUsed}, skippedNoTarget=${runsSkippedNoTarget}, skippedPeers=${runsSkippedPeers}, prompts=${promptsAggregated}).`);
  // Update manifest index (merge or create)
  try {
    const deltas = finalEntries.map(e => e.delta).sort((a,b)=>a-b);
    const worst = deltas[0] ?? null;
    const median = deltas.length ? deltas[Math.floor(deltas.length/2)] : null;
    const existing = await getNDeltasIndex();
    const entry = { modelId: coreName, totalEntries: finalEntries.length, generatedAt: output.generatedAt, worstDelta: worst, medianDelta: median };
    const models = existing ? existing.models.slice() : [];
    const idx = models.findIndex(m => m.modelId === coreName);
    if (idx >= 0) models[idx] = entry; else models.push(entry);
    const indexPayload = { models: models.sort((a,b)=>(a.worstDelta ?? 0)-(b.worstDelta ?? 0)), lastUpdated: new Date().toISOString() };
    await saveNDeltasIndex(indexPayload);
    logger.info(`Updated NDeltas index with ${coreName}.`);
  } catch (err: any) {
    logger.warn(`Failed to update NDeltas index for ${coreName}: ${err?.message || err}`);
  }
}

export const generateNDeltasCommand = new Command('generate-ndeltas')
  .description('Precomputes per-prompt negative deltas (model vs peer average coverage) for a given model across latest runs of all configs.')
  .option('-m, --model <modelId>', 'Target model ID (base or full). If omitted with --all-models, computes for all base models')
  .option('--all-models', 'Generate NDeltas for all base models meeting thresholds')
  .option('--min-runs <number>', 'Minimum number of eligible latest runs a model must appear in', (v) => parseInt(v, 10))
  .option('--min-peers <number>', 'Minimum number of peer base models required in a run', (v) => parseInt(v, 10))
  .option('-n, --limit <number>', 'Limit the number of entries saved (most negative first)', (v) => parseInt(v, 10))
  .option('--dry-run', 'Log result instead of saving file')
  .option('-v, --verbose', 'Verbose logging')
  .action(async (opts: { model?: string; limit?: number; dryRun?: boolean; verbose?: boolean; allModels?: boolean; minRuns?: number; minPeers?: number }) => {
    if (!opts.allModels && !opts.model) {
      throw new Error('Either --model or --all-models must be provided');
    }
    await actionGenerateNDeltas(opts.model || '', { limit: opts.limit, dryRun: opts.dryRun, verbose: opts.verbose, allModels: opts.allModels, minRuns: opts.minRuns, minPeers: opts.minPeers });
  });


