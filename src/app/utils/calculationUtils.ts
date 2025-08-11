import { ComparisonDataV2 as FetchedComparisonData, EvaluationResults } from '@/app/utils/types';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';

export const IDEAL_MODEL_ID = 'IDEAL_BENCHMARK';

export interface OverallCoverageExtremes {
    bestCoverage: { modelId: string; avgScore: number } | null;
    worstCoverage: { modelId: string; avgScore: number } | null;
}

export interface HybridScoreExtremes {
    bestHybrid: { modelId: string; avgScore: number } | null;
    worstHybrid: { modelId: string; avgScore: number } | null;
}

export interface IdealScoreExtremes {
    mostSimilar: { modelId: string; value: number } | null;
    leastSimilar: { modelId: string; value: number } | null;
}

export interface ModelScoreRanking {
    modelId: string;
    avgScore: number;
    count: number;
}

export interface AllModelScoreRankings {
    rankedModels: ModelScoreRanking[];
}

/**
 * Calculates the standard deviation of a sample.
 * @param numbers - An array of numbers.
 * @returns The standard deviation, or null if the array has fewer than 2 elements.
 */
export function calculateStandardDeviation(numbers: number[]): number | null {
  if (numbers.length < 2) return null;
  const mean = numbers.reduce((sum, val) => sum + val, 0) / numbers.length;
  const variance = numbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (numbers.length - 1);
  return Math.sqrt(variance);
}

/**
 * Calculates a hybrid score from a similarity score and a coverage score.
 * - If both scores are valid numbers, it returns their weighted arithmetic mean.
 * - If only one score is a valid number, it returns that score.
 * - If neither score is valid, it returns null.
 * Scores are clamped to be non-negative.
 * The default weighting is 35% for similarity and 65% for coverage.
 *
 * @param simScore - The similarity score (0-1).
 * @param covScore - The coverage score (0-1).
 * @returns The calculated hybrid score, or null.
 */
export function calculateHybridScore(simScore: number | null | undefined, covScore: number | null | undefined): number | null {
    const isValidSim = typeof simScore === 'number' && !isNaN(simScore);
    const isValidCov = typeof covScore === 'number' && !isNaN(covScore);
    const SIMILARITY_WEIGHT = 0;
    const COVERAGE_WEIGHT = 1.0;

    if (isValidSim && isValidCov) {
        // Both scores are available, use weighted arithmetic mean
        const safeSim = Math.max(0, simScore as number);
        const safeCov = Math.max(0, covScore as number);
        return (SIMILARITY_WEIGHT * safeSim) + (COVERAGE_WEIGHT * safeCov);
    } else if (isValidSim) {
        // Only similarity score is available
        return Math.max(0, simScore as number);
    } else if (isValidCov) {
        // Only coverage score is available
        return Math.max(0, covScore as number);
    }

    return null; // Neither score is available
}

/**
 * Calculates the average hybrid score for an entire comparison run.
 * Averages hybrid scores across all models (excluding IDEAL_BENCHMARK) and all prompts.
 *
 * @returns An object with the average and standard deviation of hybrid scores for the run.
 */
export function calculateAverageHybridScoreForRun(
  perPromptSimilarities: EvaluationResults['perPromptSimilarities'],
  llmCoverageScores: EvaluationResults['llmCoverageScores'],
  effectiveModels: FetchedComparisonData['effectiveModels'],
  promptIds: FetchedComparisonData['promptIds'],
  idealModelId: string
): { average: number | null; stddev: number | null } {
    const allRunHybridScores: number[] = [];
    const nonIdealModels = effectiveModels.filter(modelId => modelId !== idealModelId);

    for (const modelId of nonIdealModels) {
        for (const promptId of promptIds) {
            const simDataEntry = perPromptSimilarities?.[promptId]?.[modelId]?.[idealModelId] ??
                                 perPromptSimilarities?.[promptId]?.[idealModelId]?.[modelId];
            const simScore = (typeof simDataEntry === 'number' && !isNaN(simDataEntry)) ? simDataEntry : null;

            const covData = llmCoverageScores?.[promptId]?.[modelId];
            const covScore = (covData && !('error' in covData) && typeof covData.avgCoverageExtent === 'number' && !isNaN(covData.avgCoverageExtent))
                ? covData.avgCoverageExtent
                : null;

            const hybridScore = calculateHybridScore(simScore, covScore);
            if (hybridScore !== null) {
                allRunHybridScores.push(hybridScore);
            }
        }
    }

    if (allRunHybridScores.length === 0) {
        return { average: null, stddev: null };
    }

    const average = allRunHybridScores.reduce((sum, score) => sum + score, 0) / allRunHybridScores.length;
    const stddev = calculateStandardDeviation(allRunHybridScores);
    return { average, stddev };
}

/**
 * Calculates per-model hybrid scores for a single run, averaging across all prompts.
 *
 * @returns A map from modelId to its average and standard deviation of hybrid scores.
 */
export function calculatePerModelHybridScoresForRun(
  perPromptSimilarities: EvaluationResults['perPromptSimilarities'],
  llmCoverageScores: EvaluationResults['llmCoverageScores'],
  effectiveModels: FetchedComparisonData['effectiveModels'],
  promptIds: FetchedComparisonData['promptIds'],
  idealModelId: string
): Map<string, { average: number | null; stddev: number | null }> {
  const perModelScores = new Map<string, { average: number | null; stddev: number | null }>();

  if (!effectiveModels) {
    return perModelScores;
  }

  for (const modelId of effectiveModels) {
    if (modelId === idealModelId) continue;

    const modelPromptHybridScores: number[] = [];
    const modelPromptWeights: number[] = [];
    for (const promptId of promptIds) {
        const simDataEntry = perPromptSimilarities?.[promptId]?.[modelId]?.[idealModelId] ??
                               perPromptSimilarities?.[promptId]?.[idealModelId]?.[modelId];
        const simScore = (typeof simDataEntry === 'number' && !isNaN(simDataEntry)) ? simDataEntry : null;

        const covData = llmCoverageScores?.[promptId]?.[modelId];
        const covScore = (covData && !('error' in covData) && typeof covData.avgCoverageExtent === 'number' && !isNaN(covData.avgCoverageExtent))
            ? covData.avgCoverageExtent
            : null;

        const hybridScore = calculateHybridScore(simScore, covScore);
        if (hybridScore !== null) {
            modelPromptHybridScores.push(hybridScore);
            // Weight will be injected into resultData.evaluationResults.promptStatistics later; fallback = 1
            // For now, try to read from a known location on the frontend data shape if present
            const weight = (llmCoverageScores as any)?.__promptWeights?.[promptId] ?? 1;
            modelPromptWeights.push(typeof weight === 'number' && !isNaN(weight) ? weight : 1);
        }
    }

    if (modelPromptHybridScores.length > 0) {
      // Weighted average by prompt weights when available; fall back to unweighted
      const totalWeight = modelPromptWeights.reduce((sum, w) => sum + (w ?? 1), 0);
      const average = totalWeight > 0
        ? modelPromptHybridScores.reduce((sum, score, idx) => sum + score * (modelPromptWeights[idx] ?? 1), 0) / totalWeight
        : modelPromptHybridScores.reduce((sum, score) => sum + score, 0) / modelPromptHybridScores.length;
      // For stddev, use unweighted sample to keep interpretation consistent
      const stddev = calculateStandardDeviation(modelPromptHybridScores);
      perModelScores.set(modelId, { average, stddev });
    } else {
      perModelScores.set(modelId, { average: null, stddev: null });
    }
  }
  return perModelScores;
}

/**
 * Calculates the average similarity across all pairs in a similarity matrix.
 * Excludes self-comparisons and invalid/NaN values.
 */
export const calculateAverageSimilarity = (matrix: Record<string, Record<string, number>> | undefined): number => {
  if (!matrix) return 0; // Handle undefined matrix
  let totalSimilarity = 0;
  let count = 0;

  const modelKeys = Object.keys(matrix);

  modelKeys.forEach(model1 => {
    if (matrix[model1] && typeof matrix[model1] === 'object') {
      modelKeys.forEach(model2 => {
        if (model1 !== model2) {
          const similarityValue = matrix[model1][model2];
          if (typeof similarityValue === 'number' && !isNaN(similarityValue)) {
            totalSimilarity += similarityValue;
            count++;
          }
        }
      });
    }
  });

  // Each pair (A,B) and (B,A) might be present, adjust count if needed (though logic assumes symmetry)
  return count > 0 ? totalSimilarity / count : 0;
};

/**
 * Finds the model pairs with the highest and lowest similarity scores in a matrix.
 * Returns null if no valid pairs are found.
 */
export const findSimilarityExtremes = (matrix: Record<string, Record<string, number>> | undefined): {
  mostSimilar: { pair: [string, string]; value: number } | null;
  leastSimilar: { pair: [string, string]; value: number } | null;
} => {
  if (!matrix) return { mostSimilar: null, leastSimilar: null };
  let mostSimilar = { pair: ['', ''] as [string, string], value: -Infinity };
  let leastSimilar = { pair: ['', ''] as [string, string], value: Infinity };

  const modelKeys = Object.keys(matrix);

  modelKeys.forEach(model1 => {
    if (matrix[model1] && typeof matrix[model1] === 'object') {
      Object.keys(matrix[model1]).forEach(model2 => {
        if (model1 !== model2) {
          const similarity = matrix[model1][model2];
          if (typeof similarity === 'number' && !isNaN(similarity)) {
            if (similarity > mostSimilar.value) {
              mostSimilar = { pair: [model1, model2], value: similarity };
            }
            if (similarity < leastSimilar.value) {
              leastSimilar = { pair: [model1, model2], value: similarity };
            }
          }
        }
      });
    }
  });

  if (mostSimilar.value === -Infinity || leastSimilar.value === Infinity) {
    return { mostSimilar: null, leastSimilar: null };
  }

  return { mostSimilar, leastSimilar };
};

/**
 * Calculates the overall best and worst average coverage scores across all prompts for each model.
 * Excludes the IDEAL_MODEL_ID.
 */
export const calculateOverallCoverageExtremes = (
  coverageScores: EvaluationResults['llmCoverageScores'],
  models: string[]
): OverallCoverageExtremes => {
  if (!coverageScores || models.length === 0) {
    return { bestCoverage: null, worstCoverage: null };
  }

  const modelScores = new Map<string, { totalScore: number; count: number }>();
  const nonIdealModels = models.filter(m => m !== IDEAL_MODEL_ID);

  // Initialize map
  nonIdealModels.forEach(m => modelScores.set(m, { totalScore: 0, count: 0 }));

  // Accumulate scores across prompts
  Object.keys(coverageScores).forEach(promptId => {
    const promptData = coverageScores[promptId];
    if (!promptData) return;

    nonIdealModels.forEach(modelId => {
      const scoreData = promptData[modelId];
      if (scoreData && !('error' in scoreData) && typeof scoreData.avgCoverageExtent === 'number' && !isNaN(scoreData.avgCoverageExtent)) {
        const current = modelScores.get(modelId)!;
        current.totalScore += scoreData.avgCoverageExtent;
        current.count++;
        modelScores.set(modelId, current);
      }
    });
  });

  // Calculate averages and find extremes
  let bestCoverage: { modelId: string; avgScore: number } | null = null;
  let worstCoverage: { modelId: string; avgScore: number } | null = null;
  let maxAvg = -Infinity;
  let minAvg = Infinity;

  modelScores.forEach((data, modelId) => {
    if (data.count > 0) {
      const avgScore = data.totalScore / data.count;
      if (avgScore > maxAvg) {
        maxAvg = avgScore;
        bestCoverage = { modelId, avgScore };
      }
      if (avgScore < minAvg) {
        minAvg = avgScore;
        worstCoverage = { modelId, avgScore };
      }
    }
  });

  if (bestCoverage === null || worstCoverage === null) {
    console.warn("[calculateOverallCoverageExtremes] No valid coverage scores found to calculate overall extremes.");
    return { bestCoverage: null, worstCoverage: null };
  }
  
  return { bestCoverage, worstCoverage };
};

/**
 * Calculates the overall best and worst average hybrid scores (geometric mean of similarity-to-ideal and coverage).
 * Requires per-prompt similarity and coverage data.
 * Excludes the IDEAL_MODEL_ID.
 */
export const calculateHybridScoreExtremes = (
  // Assumes perPromptSimilarities format for the matrix input
  similarityMatrix: EvaluationResults['perPromptSimilarities'],
  coverageScores: EvaluationResults['llmCoverageScores'],
  models: string[],
  idealModelId: string = IDEAL_MODEL_ID
): HybridScoreExtremes => {

  if (!similarityMatrix || !coverageScores || models.length === 0 || !models.includes(idealModelId)) {
    console.warn('[calculateHybridScoreExtremes] Missing required data (per-prompt similarity, coverage, models, or ideal). Returning nulls.');
    return { bestHybrid: null, worstHybrid: null };
  }

  const modelHybridScores = new Map<string, { totalScore: number; count: number }>();
  const nonIdealModels = models.filter(m => m !== idealModelId);
  const promptIdsWithCoverage = Object.keys(coverageScores);

  // Initialize map
  nonIdealModels.forEach(m => modelHybridScores.set(m, { totalScore: 0, count: 0 }));

  // Accumulate scores across prompts
  promptIdsWithCoverage.forEach(promptId => {
    const promptCovData = coverageScores[promptId];
    const promptSimData = similarityMatrix[promptId]; // Access per-prompt similarity data

    if (!promptCovData || !promptSimData) { // Skip prompt if missing either specific data type
      return;
    }

    nonIdealModels.forEach(modelId => {
      const covData = promptCovData[modelId];
      // Get similarity between modelId and idealModelId for this specific prompt
      const simData = promptSimData?.[modelId]?.[idealModelId] ?? promptSimData?.[idealModelId]?.[modelId];

      const covScore = (covData && !('error' in covData) && typeof covData.avgCoverageExtent === 'number' && !isNaN(covData.avgCoverageExtent)) ? covData.avgCoverageExtent : null;

      const isValidCov = covScore !== null && covScore >= 0;
      const isValidSim = typeof simData === 'number' && !isNaN(simData);

      if (isValidCov && isValidSim) {
        const hybridScore = calculateHybridScore(simData, covScore);
        
        if (hybridScore !== null) {
            const current = modelHybridScores.get(modelId)!;
            current.totalScore += hybridScore;
            current.count++;
            modelHybridScores.set(modelId, current);
        }
      } else {
        // console.warn(`[calculateHybridScoreExtremes] Skipping model ${modelId} for prompt ${promptId} due to invalid Sim (${simData}) or Cov (${covData?.avgCoverageExtent}).`);
      }
    });
  });

  // Calculate averages and find extremes
  let bestHybrid: { modelId: string; avgScore: number } | null = null;
  let worstHybrid: { modelId: string; avgScore: number } | null = null;
  let maxAvg = -Infinity;
  let minAvg = Infinity;

  modelHybridScores.forEach((data, modelId) => {
    if (data.count > 0) {
      const avgScore = data.totalScore / data.count;
      if (avgScore > maxAvg) {
        maxAvg = avgScore;
        bestHybrid = { modelId, avgScore };
      }
      if (avgScore < minAvg) {
        minAvg = avgScore;
        worstHybrid = { modelId, avgScore };
      }
    }
  });

  if (bestHybrid === null || worstHybrid === null) {
    console.warn("[calculateHybridScoreExtremes] No valid hybrid scores found to calculate overall extremes.");
    return { bestHybrid: null, worstHybrid: null };
  }

  return { bestHybrid, worstHybrid };
};

/**
 * Calculates average coverage scores for all models and returns them ranked from best to worst.
 * Groups by canonical model name and averages across variants (system prompt/temperature permutations).
 * Excludes the IDEAL_MODEL_ID.
 */
export const calculateAllModelCoverageRankings = (
  coverageScores: EvaluationResults['llmCoverageScores'],
  models: string[]
): AllModelScoreRankings => {
  if (!coverageScores || models.length === 0) {
    return { rankedModels: [] };
  }

  // Extract prompt weights from the coverage scores metadata
  const promptWeights: Record<string, number> = {};
  try {
    const weightMap = (coverageScores as any)?.__promptWeights;
    if (weightMap && typeof weightMap === 'object') {
      Object.keys(weightMap).forEach(promptId => {
        const w = weightMap[promptId];
        if (typeof w === 'number' && !isNaN(w) && w > 0) {
          promptWeights[promptId] = w;
        }
      });
    }
  } catch {}
  const hasWeights = Object.keys(promptWeights).length > 0;

  // Group models by canonical base ID to handle variants with weighted aggregation
  const canonicalModelScores = new Map<string, { weightedSum: number; totalWeight: number; variants: Set<string> }>();
  const nonIdealModels = models.filter(m => m !== IDEAL_MODEL_ID);

  // Accumulate scores across prompts with weights, grouping by canonical model
  Object.keys(coverageScores).forEach(promptId => {
    // Skip metadata fields
    if (promptId.startsWith('__')) return;
    
    const promptData = coverageScores[promptId];
    if (!promptData) return;

    const promptWeight = hasWeights ? (promptWeights[promptId] ?? 1) : 1;

    nonIdealModels.forEach(modelId => {
      const scoreData = promptData[modelId];
      if (scoreData && !('error' in scoreData) && typeof scoreData.avgCoverageExtent === 'number' && !isNaN(scoreData.avgCoverageExtent)) {
        // Parse to get canonical model name
        const { baseId } = parseModelIdForDisplay(modelId);
        
        if (!canonicalModelScores.has(baseId)) {
          canonicalModelScores.set(baseId, { weightedSum: 0, totalWeight: 0, variants: new Set() });
        }
        
        const current = canonicalModelScores.get(baseId)!;
        current.weightedSum += scoreData.avgCoverageExtent * promptWeight;
        current.totalWeight += promptWeight;
        current.variants.add(modelId);
        canonicalModelScores.set(baseId, current);
      }
    });
  });

  // Calculate weighted averages and sort by score (descending)
  const rankedModels: ModelScoreRanking[] = [];
  canonicalModelScores.forEach((data, baseId) => {
    if (data.totalWeight > 0) {
      const avgScore = data.weightedSum / data.totalWeight;
      // Use the baseId as the modelId for display purposes
      rankedModels.push({ modelId: baseId, avgScore, count: Math.round(data.totalWeight) });
    }
  });

  // Sort by average score (highest first)
  rankedModels.sort((a, b) => b.avgScore - a.avgScore);

  return { rankedModels };
};

/**
 * Calculates average hybrid scores for all models and returns them ranked from best to worst.
 * Groups by canonical model name and averages across variants (system prompt/temperature permutations).
 * Excludes the IDEAL_MODEL_ID.
 */
export const calculateAllModelHybridRankings = (
  similarityMatrix: EvaluationResults['perPromptSimilarities'],
  coverageScores: EvaluationResults['llmCoverageScores'],
  models: string[],
  idealModelId: string = IDEAL_MODEL_ID
): AllModelScoreRankings => {
  if (!similarityMatrix || !coverageScores || models.length === 0 || !models.includes(idealModelId)) {
    return { rankedModels: [] };
  }

  // Group models by canonical base ID to handle variants
  const canonicalModelScores = new Map<string, { totalScore: number; count: number; variants: Set<string> }>();
  const nonIdealModels = models.filter(m => m !== idealModelId);
  const promptIdsWithCoverage = Object.keys(coverageScores);

  // Accumulate scores across prompts, grouping by canonical model
  promptIdsWithCoverage.forEach(promptId => {
    const promptCovData = coverageScores[promptId];
    const promptSimData = similarityMatrix[promptId];

    if (!promptCovData || !promptSimData) {
      return;
    }

    nonIdealModels.forEach(modelId => {
      const covData = promptCovData[modelId];
      const simData = promptSimData?.[modelId]?.[idealModelId] ?? promptSimData?.[idealModelId]?.[modelId];

      const covScore = (covData && !('error' in covData) && typeof covData.avgCoverageExtent === 'number' && !isNaN(covData.avgCoverageExtent)) ? covData.avgCoverageExtent : null;

      const isValidCov = covScore !== null && covScore >= 0;
      const isValidSim = typeof simData === 'number' && !isNaN(simData);

      if (isValidCov && isValidSim) {
        const hybridScore = calculateHybridScore(simData, covScore);
        
        if (hybridScore !== null) {
          // Parse to get canonical model name
          const { baseId } = parseModelIdForDisplay(modelId);
          
          if (!canonicalModelScores.has(baseId)) {
            canonicalModelScores.set(baseId, { totalScore: 0, count: 0, variants: new Set() });
          }
          
          const current = canonicalModelScores.get(baseId)!;
          current.totalScore += hybridScore;
          current.count++;
          current.variants.add(modelId);
          canonicalModelScores.set(baseId, current);
        }
      }
    });
  });

  // Calculate averages and sort by score (descending)
  const rankedModels: ModelScoreRanking[] = [];
  canonicalModelScores.forEach((data, baseId) => {
    if (data.count > 0) {
      const avgScore = data.totalScore / data.count;
      // Use the baseId as the modelId for display purposes
      rankedModels.push({ modelId: baseId, avgScore, count: data.count });
    }
  });

  // Sort by average score (highest first)
  rankedModels.sort((a, b) => b.avgScore - a.avgScore);

  return { rankedModels };
};

/**
 * Calculates the overall average coverage score across all prompts and non-ideal models.
 * Returns the average score as a percentage (0-100) or null if no valid scores found.
 */
export const calculateOverallAverageCoverage = (
  allCoverageScores: EvaluationResults['llmCoverageScores'],
  models: string[],
  promptIds: string[]
): { average: number | null; stddev: number | null } => {
  if (!allCoverageScores || models.length === 0 || promptIds.length === 0) {
    return { average: null, stddev: null };
  }

  const individualCoverageScores: number[] = [];
  const nonIdealModels = models.filter(m => m !== IDEAL_MODEL_ID);

  promptIds.forEach(promptId => {
    const promptData = allCoverageScores[promptId];
    if (!promptData) return;

    nonIdealModels.forEach(modelId => {
      const scoreData = promptData[modelId];
      if (scoreData && !('error' in scoreData) && typeof scoreData.avgCoverageExtent === 'number' && !isNaN(scoreData.avgCoverageExtent)) {
        individualCoverageScores.push(scoreData.avgCoverageExtent);
      }
    });
  });

  if (individualCoverageScores.length === 0) {
    return { average: null, stddev: null };
  }

  const sum = individualCoverageScores.reduce((acc, score) => acc + score, 0);
  const averageAsDecimal = sum / individualCoverageScores.length;
  const averageForDisplay = averageAsDecimal * 100;

  let stddev: number | null = null;
  if (individualCoverageScores.length >= 2) {
    const variance = individualCoverageScores.reduce((acc, score) => acc + Math.pow(score - averageAsDecimal, 2), 0) / individualCoverageScores.length;
    stddev = Math.sqrt(variance);
  }

  return { average: averageForDisplay, stddev: stddev !== null ? stddev * 100 : null };
};

/**
 * Finds the models most and least similar to the ideal benchmark.
 * @param matrix - The similarity matrix (modelA -> modelB -> similarity).
 * @param idealModelId - The identifier for the ideal benchmark model.
 * @returns An object containing the most and least similar models and their scores.
 */
export const findIdealExtremes = (
  matrix: Record<string, Record<string, number>> | undefined,
  idealModelId: string = 'IDEAL_BENCHMARK'
): IdealScoreExtremes => {
  // Check if the matrix or the specific ideal model data exists
  if (!matrix || !matrix[idealModelId] || typeof matrix[idealModelId] !== 'object') {
    console.warn('[findIdealExtremes] Matrix or Ideal Benchmark data missing or invalid.');
    return { mostSimilar: null, leastSimilar: null };
  }

  let mostSimilar: { modelId: string; value: number } | null = null;
  let leastSimilar: { modelId: string; value: number } | null = null;
  let maxSim = -Infinity;
  let minSim = Infinity;

  // Iterate over the keys of the ideal model's comparisons in the matrix
  Object.keys(matrix[idealModelId]).forEach(modelId => {
    // Skip comparing the ideal model to itself
    if (modelId === idealModelId) return;

    const similarity = matrix[idealModelId][modelId];

    // Check if similarity is a valid number
    if (typeof similarity === 'number' && !isNaN(similarity)) {
      if (similarity > maxSim) {
        maxSim = similarity;
        mostSimilar = { modelId, value: similarity };
      }
      if (similarity < minSim) {
        minSim = similarity;
        leastSimilar = { modelId, value: similarity };
      }
    }
  });

  // Log if no valid comparisons were found for the ideal model
  if (mostSimilar === null || leastSimilar === null) {
      console.warn('[findIdealExtremes] No valid similarity scores found for comparison against Ideal Benchmark.');
  }

  return { mostSimilar, leastSimilar };
};

/**
 * Finds the prompt that produced the most diverse (least similar) responses across models.
 * It does this by calculating the average similarity for each prompt and finding the minimum.
 * @param perPromptSimilarities - An object mapping prompt IDs to their similarity matrices.
 * @returns An object with the prompt ID and its standard deviation score, or null.
 */
export const calculateMostDifferentiatingPrompt = (
  perPromptSimilarities: EvaluationResults['perPromptSimilarities'] | undefined,
  llmCoverageScores: EvaluationResults['llmCoverageScores'] | undefined,
  effectiveModels: FetchedComparisonData['effectiveModels'] | undefined,
  promptIds: FetchedComparisonData['promptIds'] | undefined,
): { id: string; score: number, text?: string } | null => {
  if (!perPromptSimilarities || !llmCoverageScores || !effectiveModels || !promptIds) {
    return null;
  }

  let maxStdDev = -1;
  let mostDifferentiatingPromptId: string | null = null;
  
  const nonIdealModels = effectiveModels.filter(modelId => modelId !== IDEAL_MODEL_ID);

  // We need at least 2 models to have a standard deviation
  if (nonIdealModels.length < 2) {
      return null;
  }

  for (const promptId of promptIds) {
    const promptHybridScores: number[] = [];
    for (const modelId of nonIdealModels) {
        const simDataEntry = perPromptSimilarities[promptId]?.[modelId]?.[IDEAL_MODEL_ID] ??
                               perPromptSimilarities[promptId]?.[IDEAL_MODEL_ID]?.[modelId];
        const simScore = (typeof simDataEntry === 'number' && !isNaN(simDataEntry)) ? simDataEntry : null;

        const covData = llmCoverageScores[promptId]?.[modelId];
        const covScore = (covData && !('error' in covData) && typeof covData.avgCoverageExtent === 'number' && !isNaN(covData.avgCoverageExtent))
            ? covData.avgCoverageExtent
            : null;

        const hybridScore = calculateHybridScore(simScore, covScore);
        if (hybridScore !== null) {
            promptHybridScores.push(hybridScore);
        }
    }

    // We need at least 2 scores to calculate standard deviation
    if (promptHybridScores.length >= 2) {
        const stdDev = calculateStandardDeviation(promptHybridScores);
        if (stdDev !== null && stdDev > maxStdDev) {
            maxStdDev = stdDev;
            mostDifferentiatingPromptId = promptId;
        }
    }
  }

  if (mostDifferentiatingPromptId && maxStdDev !== -1) {
    return {
      id: mostDifferentiatingPromptId,
      score: maxStdDev,
    };
  }

  return null;
}; 