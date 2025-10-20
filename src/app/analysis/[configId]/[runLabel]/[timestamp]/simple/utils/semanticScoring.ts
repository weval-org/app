import { ComparisonDataV2 } from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

/**
 * Calculate a leaderboard based on semantic similarity to IDEAL responses.
 * Used as a fallback when llm-coverage scores are not available.
 */
export function calculateSemanticLeaderboard(
  data: ComparisonDataV2,
  models: string[]
): Array<{ id: string; score: number; count: number }> | null {
  const { evaluationResults, promptIds } = data;
  const perPromptSimilarities = evaluationResults?.perPromptSimilarities;

  if (!perPromptSimilarities || !promptIds || promptIds.length === 0) {
    return null;
  }

  const modelScores = new Map<string, { sum: number; count: number }>();

  models.forEach(modelId => {
    let sum = 0;
    let count = 0;

    promptIds.forEach(promptId => {
      const similarity = perPromptSimilarities[promptId]?.[modelId]?.[IDEAL_MODEL_ID];
      if (typeof similarity === 'number' && !isNaN(similarity)) {
        sum += similarity;
        count++;
      }
    });

    if (count > 0) {
      modelScores.set(modelId, { sum, count });
    }
  });

  return Array.from(modelScores.entries())
    .map(([id, { sum, count }]) => ({ id, score: sum / count, count }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Get a human-readable label for score type
 */
export function getScoreTypeLabel(type: 'coverage' | 'similarity' | null): string {
  switch (type) {
    case 'coverage': return 'Coverage';
    case 'similarity': return 'Similarity';
    default: return 'N/A';
  }
}

/**
 * Calculate scores for a specific prompt, trying coverage first then similarity
 */
export function calculatePromptScores(
  promptId: string,
  modelIds: string[],
  allCoverageScores: Record<string, Record<string, any>> | undefined,
  perPromptSimilarities: Record<string, Record<string, Record<string, number>>> | undefined
): Map<string, { score: number; type: 'coverage' | 'similarity' | null }> {
  const scores = new Map<string, { score: number; type: 'coverage' | 'similarity' | null }>();

  modelIds.forEach(modelId => {
    // Try coverage first
    const coverageResult = allCoverageScores?.[promptId]?.[modelId];
    if (coverageResult && !('error' in coverageResult) && typeof coverageResult.avgCoverageExtent === 'number') {
      scores.set(modelId, {
        score: coverageResult.avgCoverageExtent,
        type: 'coverage'
      });
      return;
    }

    // Fallback to similarity
    if (perPromptSimilarities) {
      const similarity = perPromptSimilarities[promptId]?.[modelId]?.[IDEAL_MODEL_ID];
      if (typeof similarity === 'number' && !isNaN(similarity)) {
        scores.set(modelId, {
          score: similarity,
          type: 'similarity'
        });
        return;
      }
    }

    // No score available
    scores.set(modelId, { score: 0, type: null });
  });

  return scores;
}
