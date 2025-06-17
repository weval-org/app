import type { EvaluationResults } from './types';
import { calculateHybridScore } from './calculationUtils';

export const IDEAL_MODEL_ID = 'IDEAL_BENCHMARK';

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
): { bestCoverage: { modelId: string; avgScore: number } | null; worstCoverage: { modelId: string; avgScore: number } | null } => {
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
): { bestHybrid: { modelId: string; avgScore: number } | null; worstHybrid: { modelId: string; avgScore: number } | null } => {

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