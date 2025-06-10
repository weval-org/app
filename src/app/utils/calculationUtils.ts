import { ComparisonDataV2 as FetchedComparisonData, EvaluationResults } from '@/app/utils/types';

// Helper function to calculate standard deviation
export function calculateStandardDeviation(numbers: number[]): number | null {
  if (numbers.length < 2) return null; // Std dev is not meaningful for less than 2 numbers
  const mean = numbers.reduce((sum, val) => sum + val, 0) / numbers.length;
  const variance = numbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (numbers.length -1); // sample std dev
  return Math.sqrt(variance);
}

export function calculateAverageHybridScoreForRun(
  perPromptSimilarities: EvaluationResults['perPromptSimilarities'],
  llmCoverageScores: EvaluationResults['llmCoverageScores'],
  effectiveModels: FetchedComparisonData['effectiveModels'],
  promptIds: FetchedComparisonData['promptIds'],
  idealModelId: string
): { average: number | null; stddev: number | null } {
  if (!perPromptSimilarities || !llmCoverageScores || !effectiveModels || !promptIds || 
  !idealModelId) {
      return { average: null, stddev: null };
  }

  const allRunHybridScores: number[] = [];
  const nonIdealModels = effectiveModels.filter(modelId => modelId !== idealModelId);

  for (const modelId of nonIdealModels) {
      for (const promptId of promptIds) {
          const simDataEntry = perPromptSimilarities?.[promptId]?.[modelId]?.[idealModelId] ??
                               perPromptSimilarities?.[promptId]?.[idealModelId]?.[modelId];
          const simScore = (typeof simDataEntry === 'number' && !isNaN(simDataEntry) && simDataEntry 
          >= 0) ? simDataEntry : null;

          const covData = llmCoverageScores?.[promptId]?.[modelId];
          const covScore = (covData && !('error' in covData) && typeof covData.avgCoverageExtent === 
          'number' && !isNaN(covData.avgCoverageExtent) && covData.avgCoverageExtent >=0) ? covData.
          avgCoverageExtent : null;

          if (simScore !== null && covScore !== null) {
              const safeSimScore = Math.max(0, simScore);
              const safeCovScore = Math.max(0, covScore);
              allRunHybridScores.push(Math.sqrt(safeSimScore * safeCovScore));
          }
      }
  }

  if (allRunHybridScores.length === 0) {
      return { average: null, stddev: null };
  }

  const average = allRunHybridScores.reduce((sum, score) => sum + score, 0) / allRunHybridScores.
  length;
  const stddev = calculateStandardDeviation(allRunHybridScores);
  return { average, stddev };
}

// Function to calculate per-model hybrid scores for a single run
export function calculatePerModelHybridScoresForRun(
  perPromptSimilarities: EvaluationResults['perPromptSimilarities'],
  llmCoverageScores: EvaluationResults['llmCoverageScores'],
  effectiveModels: FetchedComparisonData['effectiveModels'],
  promptIds: FetchedComparisonData['promptIds'],
  idealModelId: string
): Map<string, { average: number | null; stddev: number | null }> {
  const perModelScores = new Map<string, { average: number | null; stddev: number | null }>();

  if (!perPromptSimilarities || !llmCoverageScores || !effectiveModels || !promptIds) {
    return perModelScores;
  }

  for (const modelId of effectiveModels) {
    if (modelId === idealModelId) continue; // Skip IDEAL_MODEL_ID for this calculation

    const modelPromptHybridScores: number[] = [];
    for (const promptId of promptIds) {
      const simDataEntry = perPromptSimilarities?.[promptId]?.[modelId]?.[idealModelId] ??
                           perPromptSimilarities?.[promptId]?.[idealModelId]?.[modelId];
      // Get raw score, or null if not a valid number
      const simScoreVal = (typeof simDataEntry === 'number' && !isNaN(simDataEntry)) ? simDataEntry : null;

      const covData = llmCoverageScores?.[promptId]?.[modelId];
      // Get raw score, or null if not valid structure/number
      const covScoreVal = (covData && !('error' in covData) && typeof covData.avgCoverageExtent === 'number' && !isNaN(covData.avgCoverageExtent)) ? covData.avgCoverageExtent : null;
      
      if (simScoreVal !== null && covScoreVal !== null) {
        // Clamp scores to be >= 0 before calculating hybrid score
        const safeSimScore = Math.max(0, simScoreVal);
        const safeCovScore = Math.max(0, covScoreVal);
        const promptHybridScore = Math.sqrt(safeSimScore * safeCovScore);
        modelPromptHybridScores.push(promptHybridScore);
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