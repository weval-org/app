import { Command } from 'commander';
import pLimit from '@/lib/pLimit';
import { getConfig } from '../config';
import {
  listConfigIds,
  listRunsForConfig,
  getResultByFileName,
} from '@/lib/storageService';
import { ComparisonDataV2 as WevalResult } from '@/app/utils/types';
import { parseModelIdForDisplay, parseModelIdForApiCall } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID, calculateStandardDeviation } from '@/app/utils/calculationUtils';
import { EvaluationResults } from '@/app/utils/types';
import { saveCompassIndex, CompassIndexContent, CompassExemplar, CompassAxisExemplars, CompassComparisonPair } from '@/lib/storageService';

type AxisAccum = Map<string, { weightedSum: number; weightSum: number; runs: number }>; // modelBase -> ...

// Track potential exemplars during collection
interface ExemplarCandidate {
  promptId: string;
  promptText: string;
  modelId: string;
  modelResponse: string;
  coverageScore: number;
  axisScore: number;
  configId: string;
  runLabel: string;
  timestamp: string;
}

type AxisExemplarCandidates = {
  candidates: ExemplarCandidate[];
  promptVariances: Map<string, { variance: number; promptText: string }>; // promptId -> variance info
};

// --- Compass weighting defaults (override here as needed) ---
const COMPASS_SIMILARITY_WEIGHT = 0.0;
const COMPASS_COVERAGE_WEIGHT = 1.0;


export async function actionGenerateCompassIndex(options: { verbose?: boolean; concurrency?: number }) {
  const { logger } = getConfig();
  const limiter = pLimit(Math.max(1, options.concurrency ?? 8));

  // axis -> accumulators
  const axisToAccum = new Map<string, AxisAccum>();
  // axis -> exemplar candidates
  const axisToExemplars = new Map<string, AxisExemplarCandidates>();

  const configIds = await listConfigIds();
  await Promise.all(configIds.map(configId => limiter(async () => {
    try {
      // We only need latest run per config for this aggregation
      const runs = await listRunsForConfig(configId);
      if (!runs || runs.length === 0) return;
      const latest = runs[0];
      const runData = await getResultByFileName(configId, latest.fileName) as WevalResult | null;
      if (!runData) return;

      // HARDCODED BLOCK: Exclude 'cohere/command-a' models from all compass processing.
      if (runData.effectiveModels) {
        runData.effectiveModels = runData.effectiveModels.filter(m => !m.includes('cohere/command-a'));
      }

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

      // Collect exemplar candidates for this config
      await collectExemplarCandidates(
        axisToExemplars,
        runData,
        configId,
        axisTags,
        options.verbose || false
      );
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
    { id: 'free-thinking', pos: 'heterodox', neg: 'normative' },
    { id: 'conscientiousness', pos: 'conscientious', neg: 'spontaneous' },
    { id: 'agreeableness', pos: 'agreeable', neg: 'disagreeable' },
    { id: 'extroversion', pos: 'extroverted', neg: 'introverted' },
  ];
  pairs.forEach(pair => {
    const pos = out.axes[pair.pos];
    const neg = out.axes[pair.neg];
    if (!pos || !neg) return;
    
    // --- Normalization Step ---
    // Find min/max for each pole across all models to create a normalized 0-1 score
    const posScores = Object.values(pos).map(p => p.value).filter((v): v is number => v !== null && isFinite(v));
    const negScores = Object.values(neg).map(n => n.value).filter((v): v is number => v !== null && isFinite(v));

    if (posScores.length < 2 || negScores.length < 2) return; // Not enough data to normalize

    const minPos = Math.min(...posScores);
    const maxPos = Math.max(...posScores);
    const rangePos = maxPos - minPos;
    
    const minNeg = Math.min(...negScores);
    const maxNeg = Math.max(...negScores);
    const rangeNeg = maxNeg - minNeg;

    const combined: Record<string, { value: number | null; runs: number }> = {};
    const modelIds = new Set<string>([...Object.keys(pos), ...Object.keys(neg)]);
    
    modelIds.forEach(mid => {
      const p = pos[mid];
      const n = neg[mid];
      if (!p || !n || p.value === null || n.value === null) {
        combined[mid] = { value: null, runs: 0 };
        return;
      }

      // Normalize scores for each pole
      const posNormalized = rangePos > 0 ? (p.value - minPos) / rangePos : 0.5;
      const negNormalized = rangeNeg > 0 ? (n.value - minNeg) / rangeNeg : 0.5;

      // New formula: (1 + pos^2 - neg^2) / 2
      const val01 = (1 + Math.pow(posNormalized, 2) - Math.pow(negNormalized, 2)) / 2;
      
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
    'free-thinking': { id: 'free-thinking', positivePole: 'Heterodox', negativePole: 'Normative' },
    conscientiousness: { id: 'conscientiousness', positivePole: 'Conscientious', negativePole: 'Spontaneous' },
    agreeableness: { id: 'agreeableness', positivePole: 'Agreeable', negativePole: 'Disagreeable' },
    extroversion: { id: 'extroversion', positivePole: 'Extroverted', negativePole: 'Introverted' },
  };

  // Process exemplars for bipolar axes
  out.exemplars = processExemplarsForBipolarAxes(axisToExemplars, pairs);

  await saveCompassIndex(out);
  const exemplarCount = Object.values(out.exemplars || {}).reduce((acc, e) => {
    return acc + (e.comparisonPairs?.length || 0);
  }, 0);
  logger.info(`Saved Compass index with ${Object.keys(axes).length} axes and ${exemplarCount} total comparison pairs.`);
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

/**
 * Collects exemplar candidates from a run for compass axes
 */
async function collectExemplarCandidates(
  axisToExemplars: Map<string, AxisExemplarCandidates>,
  runData: any,
  configId: string,
  axisTags: string[],
  verbose: boolean
): Promise<void> {
  if (!runData.allFinalAssistantResponses || !runData.evaluationResults?.llmCoverageScores) {
    return; // Can't collect exemplars without responses and coverage data
  }

  const { allFinalAssistantResponses, evaluationResults, promptIds, effectiveModels, config } = runData;
  const { llmCoverageScores } = evaluationResults;

  // Extract run info
  const runLabel = runData.runLabel || 'unknown';
  const timestamp = runData.timestamp || new Date().toISOString();

  // Process each axis tag for this config
  for (const tag of axisTags) {
    const axisId = tag.substring('_compass:'.length);
    
    if (!axisToExemplars.has(axisId)) {
      axisToExemplars.set(axisId, {
        candidates: [],
        promptVariances: new Map()
      });
    }
    
    const exemplarData = axisToExemplars.get(axisId)!;

    // Process each prompt for variance calculation and exemplar collection
    for (const promptId of promptIds) {
      // Exclude multiple choice questions from exemplars as they are not illustrative
      if (promptId.startsWith('mcq-')) {
        continue;
      }

      const promptResponses = allFinalAssistantResponses[promptId];
      const promptCoverage = llmCoverageScores[promptId];
      
      if (!promptResponses || !promptCoverage) continue;

      // Get prompt text from config
      const prompt = config?.prompts?.find((p: any) => p.id === promptId);
      const promptText = getPromptText(prompt);

      // Calculate coverage scores for this prompt/axis combination
      const modelCoverageScores: number[] = [];
      const candidates: ExemplarCandidate[] = [];

      for (const modelId of effectiveModels) {
        if (modelId === IDEAL_MODEL_ID) continue;

        const response = promptResponses[modelId];
        const coverage = promptCoverage[modelId];
        
        if (!response || !coverage || coverage.error) continue;
        if (typeof coverage.avgCoverageExtent !== 'number' || !isFinite(coverage.avgCoverageExtent)) continue;

        const coverageScore = coverage.avgCoverageExtent;
        modelCoverageScores.push(coverageScore);

        // Store as exemplar candidate
        candidates.push({
          promptId,
          promptText,
          modelId,
          modelResponse: response,
          coverageScore,
          axisScore: coverageScore, // For now, use coverage as axis score
          configId,
          runLabel,
          timestamp
        });
      }

      // Calculate variance for this prompt
      if (modelCoverageScores.length >= 2) {
        const variance = calculateStandardDeviation(modelCoverageScores);
        if (variance !== null) {
          const existingVariance = exemplarData.promptVariances.get(promptId);
          if (!existingVariance || variance > existingVariance.variance) {
            exemplarData.promptVariances.set(promptId, { variance, promptText });
          }
        }
      }

      // Add candidates to the pool
      exemplarData.candidates.push(...candidates);
    }
  }
}

/**
 * Processes collected exemplar candidates to produce final exemplars for bipolar axes
 * using a potency model. Potency is defined as the strength of a given trait,
 * derived from both high scores on the trait's blueprint and low scores on the
 * opposing trait's blueprint. It also ensures that only one exemplar from each
 * base model is selected. Finally, it pairs the top exemplars for a given prompt
 * with their most potent counterparts on the opposite pole.
 */
function processExemplarsForBipolarAxes(
  axisToExemplars: Map<string, AxisExemplarCandidates>,
  pairs: Array<{ id: string; pos: string; neg: string }>,
  limit = 3,
): Record<string, CompassAxisExemplars> {
  const result: Record<string, CompassAxisExemplars> = {};

  // Helper to get top N unique exemplars by base model ID
  const getTopUniqueExemplars = (candidates: (CompassExemplar & { potency: number })[]) => {
    const sorted = candidates.sort((a, b) => b.potency - a.potency);
    const unique: (CompassExemplar & { potency: number })[] = [];
    const seenBaseModels = new Set<string>();

    for (const candidate of sorted) {
      const baseId = parseModelIdForDisplay(candidate.modelId).baseId;
      if (!seenBaseModels.has(baseId)) {
        seenBaseModels.add(baseId);
        unique.push(candidate);
      }
    }
    return unique;
  };

  for (const pair of pairs) {
    const positivePoleCandidates = axisToExemplars.get(pair.pos)?.candidates || [];
    const negativePoleCandidates = axisToExemplars.get(pair.neg)?.candidates || [];

    // Create a map of all candidates for easy lookup by promptId
    const allCandidatesByPrompt = new Map<string, CompassExemplar[]>();
    [...positivePoleCandidates, ...negativePoleCandidates].forEach(c => {
      if (!allCandidatesByPrompt.has(c.promptId)) {
        allCandidatesByPrompt.set(c.promptId, []);
      }
      allCandidatesByPrompt.get(c.promptId)!.push(c);
    });

    // --- Calculate potency for each pole ---
    const positivePotencyCandidates = [
      ...positivePoleCandidates.map(c => ({ ...c, potency: c.axisScore })),
      ...negativePoleCandidates.map(c => ({ ...c, potency: 1 - c.axisScore })),
    ];
    const negativePotencyCandidates = [
      ...negativePoleCandidates.map(c => ({ ...c, potency: c.axisScore })),
      ...positivePoleCandidates.map(c => ({ ...c, potency: 1 - c.axisScore })),
    ];

    // --- Find top unique champions for each pole across all prompts ---
    const topPositiveChampions = getTopUniqueExemplars(positivePotencyCandidates).slice(0, limit);
    const topNegativeChampions = getTopUniqueExemplars(negativePotencyCandidates).slice(0, limit);

    // --- Create comparison pairs ---
    const comparisonPairs: CompassComparisonPair[] = [];
    const seenPrompts = new Set<string>();

    const createPairsFromChampions = (champions: (CompassExemplar & { potency: number })[], findRivalPotency: (c: CompassExemplar) => number) => {
      for (const champion of champions) {
        if (comparisonPairs.length >= limit || seenPrompts.has(champion.promptId)) continue;

        const rivals = allCandidatesByPrompt.get(champion.promptId) || [];
        if (rivals.length < 2) continue; // Need at least two models for a comparison

        let bestRival: CompassExemplar | undefined;
        let maxRivalPotency = -1;

        for (const rival of rivals) {
          // A model can't be its own rival
          if (rival.modelId === champion.modelId) continue;

          const rivalPotency = findRivalPotency(rival);
          if (rivalPotency > maxRivalPotency) {
            maxRivalPotency = rivalPotency;
            bestRival = rival;
          }
        }

        if (bestRival) {
          seenPrompts.add(champion.promptId);
          // Ensure consistent pairing (positiveExemplar is always from positive pole candidates)
          const isChampionPositive = positivePoleCandidates.some(p => p.modelId === champion.modelId && p.promptId === champion.promptId);
          
          comparisonPairs.push({
            promptText: champion.promptText,
            positiveExemplar: isChampionPositive ? champion : bestRival,
            negativeExemplar: isChampionPositive ? bestRival : champion,
          });
        }
      }
    };

    // Create pairs starting with positive champions, finding negative rivals
    createPairsFromChampions(topPositiveChampions, (c) => negativePoleCandidates.find(nc => nc.modelId === c.modelId && nc.promptId === c.promptId) ? c.axisScore : 1 - c.axisScore);

    // Create pairs starting with negative champions, finding positive rivals (to fill up if needed)
    createPairsFromChampions(topNegativeChampions, (c) => positivePoleCandidates.find(pc => pc.modelId === c.modelId && pc.promptId === c.promptId) ? c.axisScore : 1 - c.axisScore);

    if (comparisonPairs.length > 0) {
      result[pair.id] = { comparisonPairs };
    }
  }

  return result;
}

/**
 * Extracts text from a prompt object
 */
function getPromptText(prompt: any): string {
  if (!prompt) return 'Unknown prompt';
  
  if (typeof prompt.text === 'string') {
    return prompt.text;
  }
  
  if (Array.isArray(prompt.messages)) {
    return prompt.messages
      .map((msg: any) => `${msg.role}: ${msg.content}`)
      .join('\n');
  }
  
  return prompt.id || 'Unknown prompt';
}

