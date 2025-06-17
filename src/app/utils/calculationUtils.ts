import { ComparisonDataV2 as FetchedComparisonData, EvaluationResults } from '@/app/utils/types';

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
 * - If both scores are valid numbers, it returns their geometric mean.
 * - If only one score is a valid number, it returns that score.
 * - If neither score is valid, it returns null.
 * Scores are clamped to be non-negative.
 *
 * @param simScore - The similarity score (0-1).
 * @param covScore - The coverage score (0-1).
 * @returns The calculated hybrid score, or null.
 */
export function calculateHybridScore(simScore: number | null | undefined, covScore: number | null | undefined): number | null {
    const isValidSim = typeof simScore === 'number' && !isNaN(simScore);
    const isValidCov = typeof covScore === 'number' && !isNaN(covScore);

    if (isValidSim && isValidCov) {
        // Both scores are available, use geometric mean
        const safeSim = Math.max(0, simScore as number);
        const safeCov = Math.max(0, covScore as number);
        return Math.sqrt(safeSim * safeCov);
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
        }
    }

    if (modelPromptHybridScores.length > 0) {
      const average = modelPromptHybridScores.reduce((sum, score) => sum + score, 0) / modelPromptHybridScores.length;
      const stddev = calculateStandardDeviation(modelPromptHybridScores);
      perModelScores.set(modelId, { average, stddev });
    } else {
      perModelScores.set(modelId, { average: null, stddev: null });
    }
  }
  return perModelScores;
} 