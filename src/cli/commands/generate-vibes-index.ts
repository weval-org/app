import { Command } from 'commander';
import pLimit from '@/lib/pLimit';
import { getConfig } from '../config';
import {
  listConfigIds,
  listRunsForConfig,
  getResultByFileName,
  saveVibesIndex,
  VibesIndexContent,
} from '@/lib/storageService';
import { ComparisonDataV2 as WevalResult } from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { parseModelIdForApiCall } from '@/app/utils/modelIdUtils';
import { calculatePerModelScoreStatsForRun } from '../utils/summaryCalculationUtils';
import { CAPABILITY_BUCKETS } from '@/lib/capabilities';

export async function actionGenerateVibesIndex(options: { dryRun?: boolean; verbose?: boolean; concurrency?: number }) {
  const { logger } = getConfig();
  const limiter = pLimit(Math.max(1, options.concurrency ?? 8));

  // Accumulators
  const pairSum: Map<string, Map<string, number>> = new Map();
  const pairCount: Map<string, Map<string, number>> = new Map();
  const modelRuns: Map<string, { runs: number; configs: Set<string>; hybridSum: number; hybridCount: number }>
    = new Map();
  // capability accumulation: baseModel -> capabilityId -> { weightedSum, weightSum, contributingRuns }
  const capabilityAccum: Map<string, Map<string, { weightedSum: number; weightSum: number; contributingRuns: number }>> = new Map();

  const addPair = (a: string, b: string, v: number) => {
    if (!isFinite(v)) return;
    if (!pairSum.has(a)) pairSum.set(a, new Map());
    if (!pairCount.has(a)) pairCount.set(a, new Map());
    pairSum.get(a)!.set(b, (pairSum.get(a)!.get(b) || 0) + v);
    pairCount.get(a)!.set(b, (pairCount.get(a)!.get(b) || 0) + 1);
  };

  const addModelHybrid = (baseId: string, configId: string, hybrid: number | null | undefined) => {
    if (hybrid === null || hybrid === undefined || !isFinite(hybrid)) return;
    const rec = modelRuns.get(baseId) || { runs: 0, configs: new Set<string>(), hybridSum: 0, hybridCount: 0 };
    rec.hybridSum += hybrid;
    rec.hybridCount += 1;
    rec.runs += 1;
    rec.configs.add(configId);
    modelRuns.set(baseId, rec);
  };

  const configIds = await listConfigIds();
  await Promise.all(configIds.map(configId => limiter(async () => {
    try {
      const runs = await listRunsForConfig(configId);
      if (!runs || runs.length === 0) return;
      const latest = runs[0];
      const runData = await getResultByFileName(configId, latest.fileName) as WevalResult | null;
      if (!runData) return;

      // Per-model hybrid from this run (base-aggregated)
      try {
        const perModel = calculatePerModelScoreStatsForRun(runData);
        perModel.forEach((stats, fullId) => {
          if (fullId === IDEAL_MODEL_ID) return;
          const baseId = parseModelIdForApiCall(fullId).originalModelId;
          addModelHybrid(baseId, runData.configId, stats.hybrid.average);
        });
        // Accumulate capability scores for buckets that reference this config
        try {
          const matchingBuckets = CAPABILITY_BUCKETS.filter(b => b.configs?.some(c => c.key === runData.configId));
          if (matchingBuckets.length > 0) {
            perModel.forEach((stats, fullId) => {
              if (fullId === IDEAL_MODEL_ID) return;
              const baseId = parseModelIdForApiCall(fullId).originalModelId;
              const val = stats.hybrid.average; // 0..1 or null
              if (val === null || val === undefined || !isFinite(val)) return;
              for (const bucket of matchingBuckets) {
                const weight = bucket.configs!.find(c => c.key === runData.configId)!.weight || 1;
                if (!capabilityAccum.has(baseId)) capabilityAccum.set(baseId, new Map());
                const inner = capabilityAccum.get(baseId)!;
                const rec = inner.get(bucket.id) || { weightedSum: 0, weightSum: 0, contributingRuns: 0 };
                rec.weightedSum += val * weight;
                rec.weightSum += weight;
                rec.contributingRuns += 1;
                inner.set(bucket.id, rec);
              }
            });
          }
        } catch (e: any) {
          if (options.verbose) logger.warn(`[Vibes] Failed capability accumulation for ${configId}: ${e?.message || e}`);
        }
      } catch (e: any) {
        if (options.verbose) logger.warn(`[Vibes] Failed per-model hybrid for ${configId}: ${e?.message || e}`);
      }

      // Similarity accumulation from perPromptSimilarities
      const sims = runData?.evaluationResults?.perPromptSimilarities;
      if (sims) {
        Object.keys(sims).forEach(promptId => {
          const mat = sims[promptId];
          if (!mat) return;
          const models = Object.keys(mat);
          models.forEach(a => {
            if (a === IDEAL_MODEL_ID) return;
            const aBase = parseModelIdForApiCall(a).originalModelId;
            models.forEach(b => {
              if (b === IDEAL_MODEL_ID || b === a) return;
              const bBase = parseModelIdForApiCall(b).originalModelId;
              const v = mat[a]?.[b];
              if (typeof v === 'number') {
                addPair(aBase, bBase, v);
              }
            });
          });
        });
      }
    } catch (err: any) {
      if (options.verbose) logger.warn(`[Vibes] Failed processing config ${configId}: ${err?.message || err}`);
    }
  })));

  // Build index payload
  const similarity: VibesIndexContent['similarity'] = {};
  Array.from(pairSum.entries()).forEach(([a, inner]) => {
    similarity[a] = {};
    inner.forEach((sum, b) => {
      const cnt = pairCount.get(a)?.get(b) || 0;
      similarity[a][b] = { score: cnt > 0 ? sum / cnt : 0, count: cnt };
    });
  });

  const models: VibesIndexContent['models'] = {};
  Array.from(modelRuns.entries()).forEach(([baseId, rec]) => {
    models[baseId] = {
      averageHybrid: rec.hybridCount > 0 ? rec.hybridSum / rec.hybridCount : null,
      totalRuns: rec.runs,
      uniqueConfigs: rec.configs.size,
    };
  });

  const output: VibesIndexContent = {
    models,
    similarity,
    capabilityScores: (() => {
      const result: VibesIndexContent['capabilityScores'] = {};
      capabilityAccum.forEach((byCap, baseId) => {
        const obj: Record<string, { score: number | null; contributingRuns: number }> = {};
        byCap.forEach((rec, capId) => {
          obj[capId] = {
            score: rec.weightSum > 0 ? rec.weightedSum / rec.weightSum : null,
            contributingRuns: rec.contributingRuns,
          };
        });
        if (Object.keys(obj).length > 0) result[baseId] = obj;
      });
      return Object.keys(result).length > 0 ? result : undefined;
    })(),
    generatedAt: new Date().toISOString(),
  };

  if (options.dryRun) {
    logger.info(`[DRY RUN] Vibes index computed. Models=${Object.keys(models).length}, pairs=${Object.keys(similarity).length}`);
    return;
  }
  await saveVibesIndex(output);
  logger.info(`Saved Vibes index with ${Object.keys(models).length} models.`);
}

export const generateVibesIndexCommand = new Command('generate-vibes-index')
  .description('Precompute a global model-vibes index combining similarity and coverage stats from latest runs.')
  .option('--dry-run', 'Log result but do not save')
  .option('-v, --verbose', 'Verbose logging')
  .option('-c, --concurrency <number>', 'Parallelism for scanning configs', (v) => parseInt(v, 10))
  .action(async (opts: { dryRun?: boolean; verbose?: boolean; concurrency?: number }) => {
    await actionGenerateVibesIndex({ dryRun: opts.dryRun, verbose: opts.verbose, concurrency: opts.concurrency });
  });


