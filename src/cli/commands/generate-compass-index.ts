import { Command } from 'commander';
import pLimit from '@/lib/pLimit';
import { getConfig } from '../config';
import {
  listConfigIds,
  listRunsForConfig,
  getResultByFileName,
} from '@/lib/storageService';
import { ComparisonDataV2 as WevalResult } from '@/app/utils/types';
import { parseModelIdForApiCall } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { EvaluationResults } from '@/app/utils/types';
import { saveCompassIndex, CompassIndexContent } from '@/lib/storageService';

type AxisAccum = Map<string, { weightedSum: number; weightSum: number; runs: number }>; // modelBase -> ...

// --- Compass weighting defaults (override here as needed) ---
const COMPASS_SIMILARITY_WEIGHT = 0.1;
const COMPASS_COVERAGE_WEIGHT = 0.9;


export async function actionGenerateCompassIndex(options: { verbose?: boolean; concurrency?: number }) {
  const { logger } = getConfig();
  const limiter = pLimit(Math.max(1, options.concurrency ?? 8));

  // axis -> accumulators
  const axisToAccum = new Map<string, AxisAccum>();

  const configIds = await listConfigIds();
  await Promise.all(configIds.map(configId => limiter(async () => {
    try {
      // We only need latest run per config for this aggregation
      const runs = await listRunsForConfig(configId);
      if (!runs || runs.length === 0) return;
      const latest = runs[0];
      const runData = await getResultByFileName(configId, latest.fileName) as WevalResult | null;
      if (!runData) return;

      // Identify compass axes for this config via tags like _compass:axisId
      const tags = (runData.config?.tags || []).filter(Boolean);
      const axisTags = tags.filter(t => t.startsWith('_compass:'));
      if (axisTags.length === 0) return;

      // Per-model composite from this run using compass weights (sim/cov)
      const perModel = computePerModelComposite(runData.evaluationResults, runData.effectiveModels, runData.promptIds);
      perModel.forEach((val, fullId) => {
        if (fullId === IDEAL_MODEL_ID) return;
        const baseId = parseModelIdForApiCall(fullId).originalModelId;
        if (val === null || val === undefined || !isFinite(val)) return;
        // Contribute to all axes present on this config
        axisTags.forEach(tag => {
          const axisId = tag.substring('_compass:'.length);
          if (!axisToAccum.has(axisId)) axisToAccum.set(axisId, new Map());
          const accum = axisToAccum.get(axisId)!;
          const rec = accum.get(baseId) || { weightedSum: 0, weightSum: 0, runs: 0 };
          // Equal weight per config occurrence (could later add per-config weights)
          rec.weightedSum += (val as number) * 1;
          rec.weightSum += 1;
          rec.runs += 1;
          accum.set(baseId, rec);
        });
      });
    } catch (err: any) {
      if (options.verbose) logger.warn(`[Compass] Failed processing config ${configId}: ${err?.message || err}`);
    }
  })));

  // Build output
  const axes: CompassIndexContent['axes'] = {};
  axisToAccum.forEach((accum, axisId) => {
    const axisObj: Record<string, { value: number | null; runs: number }> = {};
    accum.forEach((rec, baseId) => {
      axisObj[baseId] = {
        value: rec.weightSum > 0 ? rec.weightedSum / rec.weightSum : null,
        runs: rec.runs,
      };
    });
    axes[axisId] = axisObj;
  });

  const out: CompassIndexContent = {
    axes,
    generatedAt: new Date().toISOString(),
  };

  // Add combined two-pole axes if present (MVP pairs)
  const pairs: Array<{ id: string; pos: string; neg: string }> = [
    { id: 'abstraction', pos: 'figurative', neg: 'literal' },
    { id: 'proactivity', pos: 'proactive', neg: 'reactive' },
    // { id: 'formality', pos: 'formal', neg: 'casual' },
    { id: 'epistemic-humility', pos: 'cautious', neg: 'confident' },
    { id: 'risk-level', pos: 'risk-seeking', neg: 'risk-averse' },
    { id: 'social-alignment', pos: 'heterodox', neg: 'normative' },
  ];
  pairs.forEach(pair => {
    const pos = out.axes[pair.pos];
    const neg = out.axes[pair.neg];
    if (!pos || !neg) return;
    const combined: Record<string, { value: number | null; runs: number }> = {};
    // Collect union of model IDs across both poles
    const modelIds = new Set<string>([...Object.keys(pos), ...Object.keys(neg)]);
    modelIds.forEach(mid => {
      const p = pos[mid];
      const n = neg[mid];
      if (!p || !n || p.value === null || n.value === null) {
        combined[mid] = { value: null, runs: 0 };
        return;
      }
      // Map difference to 0..1: ((pos - neg) + 1) / 2
      const raw = (p.value - n.value);
      const val01 = Math.max(0, Math.min(1, (raw + 1) / 2));
      combined[mid] = { value: val01, runs: Math.min(p.runs || 0, n.runs || 0) };
    });
    out.axes[pair.id] = combined;
  });

  out.axisMetadata = {
    abstraction: { id: 'abstraction', positivePole: 'Figurative', negativePole: 'Literal' },
    proactivity: { id: 'proactivity', positivePole: 'Proactive', negativePole: 'Reactive' },
    // formality: { id: 'formality', positivePole: 'Formal', negativePole: 'Casual' },
    'epistemic-humility': { id: 'epistemic-humility', positivePole: 'Cautious', negativePole: 'Confident' },
    'risk-level': { id: 'risk-level', positivePole: 'Risk-Seeking', negativePole: 'Risk-Averse' },
    'social-alignment': { id: 'social-alignment', positivePole: 'Heterodox', negativePole: 'Normative' },
  };

  await saveCompassIndex(out);
  logger.info(`Saved Compass index with ${Object.keys(axes).length} axes.`);
}

export const generateCompassIndexCommand = new Command('generate-compass-index')
  .description('Scan latest runs for configs tagged _compass:{axis} and aggregate per-axis model scores into a compass index.')
  .option('-v, --verbose', 'Verbose logging')
  .option('-c, --concurrency <number>', 'Parallelism for scanning configs', (v) => parseInt(v, 10))
  .action(async (opts: { verbose?: boolean; concurrency?: number }) => {
    await actionGenerateCompassIndex({ verbose: opts.verbose, concurrency: opts.concurrency });
  });

// Compute per-model composite with configurable Similarity:Coverage weights for compass
function computePerModelComposite(
  evalResults: WevalResult['evaluationResults'],
  effectiveModels: WevalResult['effectiveModels'],
  promptIds: WevalResult['promptIds'],
): Map<string, number | null> {
  const map = new Map<string, number | null>();
  if (!evalResults || !effectiveModels || !promptIds) return map;
  const sims = evalResults.perPromptSimilarities;
  const covs = evalResults.llmCoverageScores;
  effectiveModels.forEach(modelId => {
    if (modelId === IDEAL_MODEL_ID) return;
    const scores: number[] = [];
    for (const pid of promptIds) {
      const simEntry = sims?.[pid]?.[modelId]?.[IDEAL_MODEL_ID] ?? sims?.[pid]?.[IDEAL_MODEL_ID]?.[modelId];
      const sim = (typeof simEntry === 'number' && isFinite(simEntry)) ? simEntry : null;
      const covEntry = covs?.[pid]?.[modelId];
      const cov = (covEntry && !('error' in covEntry) && typeof covEntry.avgCoverageExtent === 'number' && isFinite(covEntry.avgCoverageExtent)) ? covEntry.avgCoverageExtent : null;
      if (sim !== null && cov !== null) {
        scores.push(COMPASS_SIMILARITY_WEIGHT * sim + COMPASS_COVERAGE_WEIGHT * cov);
      } else if (sim !== null) {
        scores.push(sim);
      } else if (cov !== null) {
        scores.push(cov);
      }
    }
    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      map.set(modelId, avg);
    } else {
      map.set(modelId, null);
    }
  });
  return map;
}


