import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { TextualBar } from './TextualBar';
import { formatPercentage } from '../utils/textualUtils';
import { LeaderboardViewProps } from '../types/engTypes';
import { parseModelIdForDisplay, getModelDisplayLabel } from '@/app/utils/modelIdUtils';

/**
 * Leaderboard view showing overall model performance across all scenarios
 * Displays aggregated statistics including average score, win rate, and judge agreement
 */
export function LeaderboardView({ models, allCoverageScores, promptIds, hasMultipleSystemPrompts }: LeaderboardViewProps) {
  // Group models by baseId and calculate stats
  const leaderboardData = useMemo(() => {
    const baseModelMap = new Map<string, {
      baseId: string;
      displayName: string;
      variants: string[];
      scores: number[];
      judgeAlphas: number[];
    }>();

    // Group models and collect all scores
    models.forEach(modelId => {
      const parsed = parseModelIdForDisplay(modelId);
      const baseId = parsed.baseId;

      if (!baseModelMap.has(baseId)) {
        const displayName = getModelDisplayLabel(parsed, {
          hideProvider: true,
          prettifyModelName: true,
          hideTemperature: true,
          hideSystemPrompt: true, // Always hide since we're showing aggregated results across all variants
        });
        baseModelMap.set(baseId, {
          baseId,
          displayName,
          variants: [],
          scores: [],
          judgeAlphas: [],
        });
      }

      const baseModel = baseModelMap.get(baseId)!;
      baseModel.variants.push(modelId);

      // Collect scores across all prompts
      promptIds.forEach(promptId => {
        const result = allCoverageScores?.[promptId]?.[modelId];
        if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number') {
          baseModel.scores.push(result.avgCoverageExtent);

          // Collect judge alpha if available
          if (result.judgeAgreement?.krippendorffsAlpha != null) {
            baseModel.judgeAlphas.push(result.judgeAgreement.krippendorffsAlpha);
          }
        }
      });
    });

    // Calculate stats for each base model
    const leaderboard = Array.from(baseModelMap.values()).map(baseModel => {
      const avgScore = baseModel.scores.length > 0
        ? baseModel.scores.reduce((sum, s) => sum + s, 0) / baseModel.scores.length
        : 0;

      const winRate = baseModel.scores.length > 0
        ? baseModel.scores.filter(s => s >= 0.8).length / baseModel.scores.length
        : 0;

      const avgJudgeAlpha = baseModel.judgeAlphas.length > 0
        ? baseModel.judgeAlphas.reduce((sum, a) => sum + a, 0) / baseModel.judgeAlphas.length
        : null;

      // Calculate variance across variants (if multiple variants exist)
      let variance: number | null = null;
      if (baseModel.variants.length > 1) {
        // Calculate avg score per variant
        const variantScores = baseModel.variants.map(variantId => {
          const scores = promptIds
            .map(promptId => {
              const result = allCoverageScores?.[promptId]?.[variantId];
              return result && !('error' in result) && typeof result.avgCoverageExtent === 'number'
                ? result.avgCoverageExtent
                : null;
            })
            .filter((s): s is number => s !== null);

          return scores.length > 0
            ? scores.reduce((sum, s) => sum + s, 0) / scores.length
            : null;
        }).filter((s): s is number => s !== null);

        if (variantScores.length > 1) {
          const mean = variantScores.reduce((sum, s) => sum + s, 0) / variantScores.length;
          const squaredDiffs = variantScores.map(s => Math.pow(s - mean, 2));
          const stdDev = Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / variantScores.length);
          variance = stdDev;
        }
      }

      return {
        baseId: baseModel.baseId,
        displayName: baseModel.displayName,
        variantCount: baseModel.variants.length,
        avgScore,
        variance,
        winRate,
        avgJudgeAlpha,
      };
    });

    // Sort by average score descending
    return leaderboard.sort((a, b) => b.avgScore - a.avgScore);
  }, [models, allCoverageScores, promptIds]);

  const hasAnyVariance = leaderboardData.some(entry => entry.variance !== null);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
      {/* Header */}
      <div className="border-b border-border pb-3">
        <h2 className="text-base sm:text-lg font-semibold mb-1">Model Leaderboard</h2>
        <p className="text-xs text-muted-foreground">
          Overall performance across all {promptIds.length} scenario{promptIds.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Leaderboard Table */}
      <div className="border border-border rounded overflow-hidden">
        <div className="overflow-x-auto -webkit-overflow-scrolling-touch" style={{ touchAction: 'pan-x pan-y' }}>
          <table className="w-full text-xs font-mono">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th scope="col" className="text-left px-3 py-2 font-semibold w-12">#</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold min-w-[180px]">Model</th>
                <th scope="col" className="text-left px-3 py-2 font-semibold min-w-[140px]">Avg Score</th>
                <th scope="col" className="text-right px-3 py-2 font-semibold w-20">Win Rate</th>
                {leaderboardData.some(e => e.avgJudgeAlpha !== null) && (
                  <th scope="col" className="text-right px-3 py-2 font-semibold w-16">α</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leaderboardData.map((entry, index) => {
                const rank = index + 1;
                const scoreColor = entry.avgScore >= 0.8
                  ? 'text-green-600 dark:text-green-400'
                  : entry.avgScore >= 0.5
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400';

                return (
                  <tr key={entry.baseId} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground font-semibold">{rank}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{entry.displayName}</span>
                        {entry.variantCount > 1 && (
                          <span className="text-muted-foreground text-[10px]">({entry.variantCount})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("font-mono font-semibold min-w-[3ch]", scoreColor)}>
                            {formatPercentage(entry.avgScore, 0)}
                          </span>
                          {entry.variance !== null && (
                            <span className="text-muted-foreground text-[10px]">
                              ±{formatPercentage(entry.variance, 0)}¹
                            </span>
                          )}
                        </div>
                        <div className="w-32">
                          <TextualBar score={entry.avgScore} length={16} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatPercentage(entry.winRate, 0)}
                    </td>
                    {leaderboardData.some(e => e.avgJudgeAlpha !== null) && (
                      <td className="px-3 py-2 text-right font-mono">
                        {entry.avgJudgeAlpha !== null ? entry.avgJudgeAlpha.toFixed(2) : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer note */}
      {hasAnyVariance && (
        <div className="text-[10px] text-muted-foreground px-1">
          ¹ ± shows std dev across temp/system configurations
        </div>
      )}
    </div>
  );
}
