import { useMemo } from 'react';
import { createClientLogger } from '@/app/utils/clientLogger';
import { ScenarioStat } from '../types/inspectorTypes';
import { LLMCoverageScores } from '@/types/shared';

const debug = createClientLogger('useScenarioStats');

interface UseScenarioStatsProps {
  promptIds: string[];
  promptTexts: Record<string, string>;
  models: string[];
  allCoverageScores: LLMCoverageScores | undefined;
}

export function useScenarioStats({
  promptIds,
  promptTexts,
  models,
  allCoverageScores,
}: UseScenarioStatsProps): ScenarioStat[] {
  return useMemo(() => {
    try {
      return promptIds.map((promptId, index) => {
        const promptText = promptTexts[promptId] || promptId;

        // Calculate average score across all models for this scenario
        const scores = models.map(modelId => {
          const result = allCoverageScores?.[promptId]?.[modelId];
          return result && !('error' in result) && typeof result.avgCoverageExtent === 'number'
            ? result.avgCoverageExtent
            : null;
        }).filter((s): s is number => s !== null);

        const avgScore = scores.length > 0
          ? scores.reduce((sum, s) => sum + s, 0) / scores.length
          : 0;

        return { promptId, promptText, index, avgScore };
      });
    } catch (err) {
      debug.error('Failed to calculate scenario stats:', err);
      return [];
    }
  }, [promptIds, promptTexts, models, allCoverageScores]);
}
