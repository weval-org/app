'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { TextualBar } from './TextualBar';
import { ScenarioDetailRow } from './ScenarioDetailRow';
import { formatPercentage, truncateText, getDifficultyLabel, calculateStats } from '../utils/textualUtils';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { useResponsePrefetch } from '../hooks/useResponsePrefetch';
import { cn } from '@/lib/utils';
import { ScenarioDisplayMode } from '../hooks/useScenarioDisplayMode';

interface ScenarioTableProps {
  allCoverageScores: any;
  promptIds: string[];
  promptTexts: Record<string, string>;
  models: string[];
  config: any;
  displayMode?: ScenarioDisplayMode;
}

export function ScenarioTable({
  allCoverageScores,
  promptIds,
  promptTexts,
  models,
  config,
  displayMode = 'detailed',
}: ScenarioTableProps) {
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Prefetching hook
  const {
    observeElement,
    unobserveElement,
    eagerPrefetch,
    isLoading: isPrefetchLoading,
    isLoaded: isPrefetchLoaded,
  } = useResponsePrefetch(promptIds);

  // Eager prefetch first scenario on mount
  useEffect(() => {
    if (promptIds.length > 0) {
      eagerPrefetch(promptIds[0]);
    }
  }, [promptIds, eagerPrefetch]);

  // Observe rows for prefetching
  useEffect(() => {
    rowRefs.current.forEach((element, promptId) => {
      if (element) {
        observeElement(element);
      }
    });

    return () => {
      rowRefs.current.forEach((element) => {
        if (element) {
          unobserveElement(element);
        }
      });
    };
  }, [observeElement, unobserveElement]);

  // Calculate scenario statistics
  const scenarioStats = useMemo(() => {
    return promptIds.map(promptId => {
      const promptText = promptTexts[promptId] || promptId;

      // Get scores for all models on this prompt
      const modelScores = models.map(modelId => {
        const result = allCoverageScores[promptId]?.[modelId];
        if (!result || 'error' in result || typeof result.avgCoverageExtent !== 'number') {
          return null;
        }
        return result.avgCoverageExtent;
      });

      const stats = calculateStats(modelScores);
      const difficulty = getDifficultyLabel(stats.average);

      // Find winner(s)
      const maxScore = stats.max ?? 0;
      const winners = models.filter(modelId => {
        const result = allCoverageScores[promptId]?.[modelId];
        return result && !('error' in result) && result.avgCoverageExtent === maxScore && maxScore > 0;
      });

      return {
        promptId,
        promptText,
        avgScore: stats.average,
        stdDev: stats.stdDev,
        difficulty,
        winners,
        modelScores: models.map(modelId => {
          const result = allCoverageScores[promptId]?.[modelId];
          return {
            modelId,
            score: result && !('error' in result) ? result.avgCoverageExtent : null,
            hasError: result && 'error' in result,
          };
        }),
      };
    });
  }, [promptIds, promptTexts, models, allCoverageScores]);

  const toggleRow = (promptId: string) => {
    const isExpanding = expandedPrompt !== promptId;
    setExpandedPrompt(prev => prev === promptId ? null : promptId);

    // Eagerly fetch responses when expanding a row
    if (isExpanding) {
      eagerPrefetch(promptId);
    }
  };

  return (
    <div className="border border-border rounded-lg bg-card/30">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="pb-3 border-b border-border">
          <h2 className="text-base font-semibold">Scenario Performance</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Click any row to view detailed analysis and model responses
          </p>
        </div>

        {/* Column Headers */}
        <div className="hidden md:flex items-center gap-3 px-3 py-2 bg-muted/20 rounded text-xs text-muted-foreground font-medium">
          <div className="w-12 text-center">#</div>
          <div className="flex-1 min-w-0">Scenario</div>
          <div className="w-24 text-center">Difficulty</div>
          <div className="w-28 text-center">Avg Score</div>
          <div className="w-48 text-center hidden lg:block">Performance</div>
          <div className="w-32 text-center">Winner</div>
          <div className="w-6"></div>
        </div>

        {/* Scenario Rows */}
        <div className="space-y-2">
          {scenarioStats.map((scenario, index) => {
            const isExpanded = expandedPrompt === scenario.promptId;
            const renderAs = config.prompts?.find((p: any) => p.id === scenario.promptId)?.render_as || 'markdown';

            return (
              <div
                key={scenario.promptId}
                ref={(el) => {
                  if (el) {
                    rowRefs.current.set(scenario.promptId, el);
                  } else {
                    rowRefs.current.delete(scenario.promptId);
                  }
                }}
                data-prompt-id={scenario.promptId}
                className={cn(
                  'border rounded-lg overflow-hidden transition-all duration-200',
                  isExpanded ? 'border-primary shadow-lg' : 'border-border hover:border-primary/50 hover:shadow-md'
                )}
              >
                {/* Row Header */}
                <div
                  className={cn(
                    'flex flex-col md:flex-row md:items-center gap-3 p-3 cursor-pointer transition-colors',
                    isExpanded ? 'bg-primary/10' : 'bg-card hover:bg-muted/30'
                  )}
                  onClick={() => toggleRow(scenario.promptId)}
                >
                  {/* Index */}
                  <div className="hidden md:block w-12 text-center font-bold text-muted-foreground">
                    {index + 1}
                  </div>

                  {/* Scenario Text */}
                  <div className="flex-1 min-w-0">
                    <div className="md:hidden text-xs text-muted-foreground mb-1">
                      Scenario #{index + 1}
                    </div>
                    <div className="font-medium line-clamp-2">
                      {truncateText(scenario.promptText, 120)}
                    </div>
                  </div>

                  {/* Difficulty */}
                  <div className="w-full md:w-24 flex md:flex-col items-center md:justify-center gap-2">
                    <span className="md:hidden text-xs text-muted-foreground">Difficulty:</span>
                    <span className="text-sm font-medium">{scenario.difficulty.label}</span>
                  </div>

                  {/* Average Score */}
                  <div className="w-full md:w-28 flex md:flex-col items-center md:justify-center gap-2">
                    <span className="md:hidden text-xs text-muted-foreground">Avg:</span>
                    <div className="font-bold font-mono">
                      {formatPercentage(scenario.avgScore, 0)}
                    </div>
                    {scenario.stdDev !== null && scenario.stdDev > 0.15 && (
                      <div className="text-xs text-muted-foreground">
                        high variance
                      </div>
                    )}
                  </div>

                  {/* Performance Bar (desktop only) */}
                  <div className="hidden lg:flex w-48 items-center justify-center">
                    <TextualBar score={scenario.avgScore} length={24} />
                  </div>

                  {/* Winner */}
                  <div className="w-full md:w-32 flex md:flex-col items-center md:justify-center gap-2">
                    {scenario.winners.length > 0 && (
                      <>
                        <span className="md:hidden text-xs text-muted-foreground">Winner:</span>
                        <div className="text-sm text-center font-medium">
                          {scenario.winners.length === 1
                            ? truncateText(
                                getModelDisplayLabel(parseModelIdForDisplay(scenario.winners[0]), {
                                  hideProvider: true,
                                  prettifyModelName: true,
                                  hideTemperature: true,
                                }),
                                15
                              )
                            : `${scenario.winners.length} tied`}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Expand indicator */}
                  <div className="w-full md:w-6 flex justify-center text-muted-foreground text-sm">
                    {isExpanded ? '▲' : '▼'}
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <ScenarioDetailRow
                    promptId={scenario.promptId}
                    promptText={scenario.promptText}
                    models={models}
                    allCoverageScores={allCoverageScores}
                    isLoadingResponses={isPrefetchLoading(scenario.promptId) && !isPrefetchLoaded(scenario.promptId)}
                    renderAs={renderAs}
                    displayMode={displayMode}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Legend */}
        <div className="pt-3 border-t border-border text-xs text-muted-foreground">
          <div className="font-medium mb-1">Legend:</div>
          <div className="space-y-0.5">
            <div>Difficulty: Easy (≥85% avg) · Medium (65-84%) · Hard (45-64%) · Very Hard (&lt;45%)</div>
            <div>Performance bars: █ = high coverage · ░ = low coverage</div>
          </div>
        </div>
      </div>
    </div>
  );
}
