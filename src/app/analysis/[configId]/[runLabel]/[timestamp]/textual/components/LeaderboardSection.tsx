'use client';

import { useMemo, useState } from 'react';
import { TextualBar } from './TextualBar';
import { formatPercentage, getOrdinalSuffix } from '../utils/textualUtils';
import { getModelDisplayLabel, parseModelIdForDisplay, getCanonicalModels } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { calculateStats } from '../utils/textualUtils';

interface LeaderboardSectionProps {
  allCoverageScores: any;
  promptIds: string[];
  models: string[];
  config: any;
  onModelClick?: (modelId: string) => void;
}

interface ModelRanking {
  modelId: string;
  displayLabel: string;
  average: number;
  stdDev: number | null;
  rank: number;
  winCount: number;
}

export function LeaderboardSection({
  allCoverageScores,
  promptIds,
  models,
  config,
  onModelClick
}: LeaderboardSectionProps) {

  // Get canonical models (collapse temperature/system prompt variants)
  const canonicalModels = useMemo(() => {
    const filtered = models.filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase());
    return getCanonicalModels(filtered, config);
  }, [models, config]);

  // Calculate rankings
  const rankings = useMemo((): ModelRanking[] => {
    const modelStats = canonicalModels.map(modelId => {
      // Collect scores for this model across all prompts
      const scores = promptIds.map(promptId => {
        const result = allCoverageScores[promptId]?.[modelId];
        if (!result || 'error' in result || typeof result.avgCoverageExtent !== 'number') {
          return null;
        }
        return result.avgCoverageExtent;
      });

      const stats = calculateStats(scores);

      // Count wins (how many prompts this model scored best on)
      let winCount = 0;
      promptIds.forEach(promptId => {
        const modelScore = allCoverageScores[promptId]?.[modelId]?.avgCoverageExtent;
        if (modelScore === null || modelScore === undefined) return;

        // Find best score for this prompt
        const bestScore = Math.max(
          ...canonicalModels.map(m => {
            const s = allCoverageScores[promptId]?.[m]?.avgCoverageExtent;
            return s ?? -1;
          })
        );

        if (modelScore === bestScore && bestScore > 0) {
          winCount++;
        }
      });

      return {
        modelId,
        displayLabel: getModelDisplayLabel(parseModelIdForDisplay(modelId), {
          hideProvider: true,
          hideModelMaker: false,
          prettifyModelName: true,
          hideSystemPrompt: true,
          hideTemperature: true,
        }),
        average: stats.average ?? 0,
        stdDev: stats.stdDev,
        winCount,
      };
    });

    // Sort by average score (descending)
    const sorted = modelStats.sort((a, b) => b.average - a.average);

    // Assign ranks (handle ties)
    let currentRank = 1;
    sorted.forEach((model, index) => {
      if (index > 0 && model.average < sorted[index - 1].average) {
        currentRank = index + 1;
      }
      (model as ModelRanking).rank = currentRank;
    });

    return sorted as ModelRanking[];
  }, [canonicalModels, promptIds, allCoverageScores]);

  const [showAll, setShowAll] = useState(false);
  const displayedRankings = showAll ? rankings : rankings.slice(0, 5);

  return (
    <div className="border border-border rounded-lg p-4 bg-card/30">
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-border">
        <h2 className="text-base font-semibold">Model Rankings</h2>
        <span className="text-xs text-muted-foreground">
          {canonicalModels.length} models × {promptIds.length} scenarios
        </span>
      </div>

      <div className="space-y-1 text-sm">
        {displayedRankings.map((model) => (
          <div
            key={model.modelId}
            className={
              onModelClick
                ? 'flex items-center gap-3 py-1.5 hover:bg-muted/30 rounded cursor-pointer'
                : 'flex items-center gap-3 py-1.5'
            }
            onClick={() => onModelClick?.(model.modelId)}
            title={onModelClick ? `View detailed analysis of ${model.displayLabel}` : undefined}
          >
            {/* Rank */}
            <div className="w-8 text-right text-muted-foreground font-medium flex-shrink-0">
              {model.rank}.
            </div>

            {/* Model Name */}
            <div className="flex-1 min-w-0 font-medium truncate">
              {model.displayLabel}
            </div>

            {/* Score */}
            <div className="w-14 text-right font-mono font-semibold flex-shrink-0">
              {formatPercentage(model.average, 1)}
            </div>

            {/* Visual Bar */}
            <div className="w-32 flex-shrink-0 font-mono text-xs">
              <TextualBar score={model.average} length={16} />
            </div>

            {/* Win Count */}
            {model.winCount > 0 && (
              <div className="w-16 text-xs text-muted-foreground flex-shrink-0">
                {model.winCount}/{promptIds.length}
              </div>
            )}
          </div>
        ))}
      </div>

      {rankings.length > 5 && (
        <div className="mt-3 pt-2 border-t border-border">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            {showAll ? 'Show top 5 only' : `Show all ${rankings.length} models`}
          </button>
        </div>
      )}
    </div>
  );
}
