import React, { useState, useMemo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { parseModelIdForDisplay, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import ResponseRenderer, { RenderAsType } from '@/app/components/ResponseRenderer';
import { createClientLogger } from '@/app/utils/clientLogger';
import Icon from '@/components/ui/icon';
import { ComparisonViewProps } from '../types/engTypes';
import { CriterionText, JudgeReflection, ResponseSkeleton, EvaluationSkeleton } from './ui';
import { TextualBar } from './TextualBar';
import { formatPercentage, truncateText } from '../utils/textualUtils';
import { PATH_COLORS } from '../utils/engConstants';

const debug = createClientLogger('ComparisonView');

/**
 * ComparisonView displays a detailed comparison table for selected models
 * Shows responses, criteria, scores, and judge reflections side-by-side
 * Supports path-based criteria grouping and judge agreement metrics
 */
export const ComparisonView = React.memo<ComparisonViewProps>(function ComparisonView({
  comparisonItems,
  removeFromComparison,
  clearAllComparisons,
  getCachedResponse,
  getCachedEvaluation,
  fetchModalResponse,
  fetchEvaluationDetails,
  isLoadingResponse,
  isLoadingEvaluation,
  allCoverageScores,
  promptTexts,
  config,
  hasMultipleSystemPrompts,
}) {
  // Get common scenario (all items should be from same scenario)
  const firstItem = comparisonItems[0];
  const promptId = firstItem?.split('::')[0];
  const promptText = promptTexts[promptId] || '';

  // Get renderAs for this prompt
  const promptConfig = config?.prompts?.find((p: any) => p.id === promptId);
  const renderAs = (promptConfig?.render_as as RenderAsType) || 'markdown';

  // Track which model column's α badge is expanded
  const [expandedAlphaColumn, setExpandedAlphaColumn] = useState<string | null>(null);

  // Ref for the scrollable table container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevItemCountRef = useRef(comparisonItems.length);
  const mountTimeRef = useRef(Date.now());
  const lastScrollRef = useRef(0);

  // Auto-scroll to show newly added models (with aggressive safety checks)
  useEffect(() => {
    const now = Date.now();
    const timeSinceMount = now - mountTimeRef.current;
    const timeSinceLastScroll = now - lastScrollRef.current;

    // SAFETY CHECK 1: Skip if mounted less than 2 seconds ago (avoid initial render chaos)
    if (timeSinceMount < 2000) {
      prevItemCountRef.current = comparisonItems.length;
      return;
    }

    // SAFETY CHECK 2: Debounce - don't scroll more than once per second
    if (timeSinceLastScroll < 1000) {
      prevItemCountRef.current = comparisonItems.length;
      return;
    }

    const currentCount = comparisonItems.length;
    const prevCount = prevItemCountRef.current;

    // SAFETY CHECK 3: Only scroll if exactly one item was added (user clicked one model)
    // Skip batch additions which likely indicate programmatic/state restoration
    if (currentCount !== prevCount + 1) {
      prevItemCountRef.current = currentCount;
      return;
    }

    // SAFETY CHECK 4: Only scroll if container exists and is scrollable
    if (!scrollContainerRef.current || scrollContainerRef.current.scrollWidth <= scrollContainerRef.current.clientWidth) {
      prevItemCountRef.current = currentCount;
      return;
    }

    // All checks passed - safe to scroll
    lastScrollRef.current = now;
    prevItemCountRef.current = currentCount;

    // Use requestAnimationFrame + timeout for maximum stability
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            left: scrollContainerRef.current.scrollWidth,
            behavior: 'smooth'
          });
        }
      }, 100);
    });
  }, [comparisonItems]);

  // Batch fetch responses and evaluations for all comparison items
  useEffect(() => {
    if (comparisonItems.length === 0) return;

    // Collect items that need fetching
    const responsePairs: { promptId: string; modelId: string }[] = [];
    const evaluationPairs: { promptId: string; modelId: string }[] = [];

    comparisonItems.forEach(itemKey => {
      const parts = itemKey.split('::');
      const itemPromptId = parts[0];
      const modelId = parts[1];

      if (!getCachedResponse?.(itemPromptId, modelId)) {
        responsePairs.push({ promptId: itemPromptId, modelId });
      }
      if (!getCachedEvaluation?.(itemPromptId, modelId)) {
        evaluationPairs.push({ promptId: itemPromptId, modelId });
      }
    });

    // Batch fetch responses in parallel
    if (responsePairs.length > 0) {
      debug.log('ComparisonView - Batch fetching responses', { count: responsePairs.length });
      Promise.all(
        responsePairs.map(({ promptId: pid, modelId }) =>
          fetchModalResponse?.(pid, modelId)
        )
      ).catch(err => {
        debug.error('ComparisonView - Batch response fetch failed', err);
      });
    }

    // Batch fetch evaluations in parallel
    if (evaluationPairs.length > 0) {
      debug.log('ComparisonView - Batch fetching evaluations', { count: evaluationPairs.length });
      Promise.all(
        evaluationPairs.map(({ promptId: pid, modelId }) =>
          fetchEvaluationDetails?.(pid, modelId)
        )
      ).catch(err => {
        debug.error('ComparisonView - Batch evaluation fetch failed', err);
      });
    }
  }, [comparisonItems, getCachedResponse, getCachedEvaluation, fetchModalResponse, fetchEvaluationDetails]);

  // Create stable evaluation data cache to prevent unnecessary recalculations
  const evaluationData = useMemo(() => {
    const cache: Record<string, any> = {};
    comparisonItems.forEach(itemKey => {
      const parts = itemKey.split('::');
      const modelId = parts[1];
      const evaluation = getCachedEvaluation?.(promptId, modelId);
      if (evaluation) {
        cache[modelId] = evaluation;
      }
    });
    return cache;
  }, [comparisonItems, promptId, getCachedEvaluation]);

  // Debug: Log what data we're receiving
  useEffect(() => {
    if (comparisonItems.length > 0) {
      const firstItem = comparisonItems[0];
      const parts = firstItem.split('::');
      const modelId = parts[1];
      const evaluation = evaluationData[modelId];

      debug.log('ComparisonView - Evaluation data check:', {
        promptId,
        modelId,
        hasEvaluation: !!evaluation,
        hasPointAssessments: !!evaluation?.pointAssessments,
        pointAssessmentsLength: evaluation?.pointAssessments?.length,
        sampleAssessment: evaluation?.pointAssessments?.[0],
        pathIds: evaluation?.pointAssessments?.map((a: any) => a.pathId).filter(Boolean)
      });
    }
  }, [comparisonItems, promptId, evaluationData]);

  // Collect all unique criteria across all models with full assessment details
  // Now organized by path - OPTIMIZED to use stable evaluationData
  const criteriaByPath = useMemo(() => {
    const requiredCriteria: Array<{
      text: string;
      citation: string | null;
      isInverted: boolean;
      assessments: Map<string, {
        score: number;
        individualJudgements: Array<{ judgeModelId: string; reflection: string; coverageExtent: number }> | null;
      }>;
    }> = [];

    const pathGroups: Map<string, Array<{
      text: string;
      citation: string | null;
      isInverted: boolean;
      assessments: Map<string, {
        score: number;
        individualJudgements: Array<{ judgeModelId: string; reflection: string; coverageExtent: number }> | null;
      }>;
    }>> = new Map();

    const criteriaMap = new Map<string, {
      text: string;
      citation: string | null;
      pathId: string | null;
      isInverted: boolean;
      assessments: Map<string, {
        score: number;
        individualJudgements: Array<{ judgeModelId: string; reflection: string; coverageExtent: number }> | null;
      }>;
    }>();

    comparisonItems.forEach(itemKey => {
      const parts = itemKey.split('::');
      const modelId = parts[1];
      const evaluation = evaluationData[modelId];

      if (evaluation?.pointAssessments) {
        evaluation.pointAssessments.forEach((assessment: any) => {
          const criterionText = assessment.keyPointText;
          if (!criteriaMap.has(criterionText)) {
            criteriaMap.set(criterionText, {
              text: criterionText,
              citation: assessment.citation || null,
              pathId: assessment.pathId || null,
              isInverted: assessment.isInverted || false,
              assessments: new Map()
            });
          }
          criteriaMap.get(criterionText)!.assessments.set(modelId, {
            score: assessment.coverageExtent ?? 0,
            individualJudgements: assessment.individualJudgements || null,
          });
        });
      }
    });

    // Group criteria by path
    criteriaMap.forEach(criterion => {
      if (criterion.pathId) {
        if (!pathGroups.has(criterion.pathId)) {
          pathGroups.set(criterion.pathId, []);
        }
        pathGroups.get(criterion.pathId)!.push(criterion);
      } else {
        requiredCriteria.push(criterion);
      }
    });

    debug.log('ComparisonView - Path grouping results:', {
      requiredCount: requiredCriteria.length,
      pathCount: pathGroups.size,
      pathIds: Array.from(pathGroups.keys()),
      pathSizes: Array.from(pathGroups.entries()).map(([id, items]) => ({ id, count: items.length }))
    });

    return { requiredCriteria, pathGroups };
  }, [comparisonItems, evaluationData]);

  return (
    <div className="space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
      {/* Header */}
      <div className="border-b border-border pb-2 sm:pb-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base sm:text-lg font-semibold">
            {comparisonItems.length === 1 ? 'Model Detail' : `Comparing ${comparisonItems.length} variants`}
          </h2>
          <button
            onClick={clearAllComparisons}
            aria-label={comparisonItems.length === 1 ? 'Close model detail' : `Clear all ${comparisonItems.length} models from comparison`}
            className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 px-2 py-1 rounded touch-manipulation active:bg-muted/50"
          >
            {comparisonItems.length === 1 ? 'Close' : 'Clear all'}
          </button>
        </div>
        <p className="text-[11px] sm:text-xs text-muted-foreground">{promptText}</p>
        {/* Mobile hint for horizontal scroll */}
        <p className="text-[10px] text-muted-foreground/70 mt-1 lg:hidden">
          ← Swipe horizontally to view all data →
        </p>
      </div>

      {/* Unified comparison table */}
      <div className="border border-border rounded overflow-hidden transition-all duration-200">
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto -webkit-overflow-scrolling-touch"
          style={{ touchAction: 'pan-x pan-y' }}
        >
          <table
            className="text-[10px] sm:text-xs"
            style={{ width: 'max-content', minWidth: '100%' }}
          >
            {/* Column headers: Model names with overall scores */}
            <thead className="bg-muted/30">
              <tr>
                <th scope="col" className="text-left px-2 sm:px-3 py-2 sm:py-3 font-medium border-b border-r border-border sticky left-0 bg-muted w-[150px] sm:w-[200px] max-w-[150px] sm:max-w-[200px] z-10">
                  <span className="text-[10px] sm:text-xs">Criterion</span>
                </th>
                {comparisonItems.map(itemKey => {
                  const parts = itemKey.split('::');
                  const modelId = parts[1];
                  const result = allCoverageScores?.[promptId]?.[modelId];
                  const hasScore = result && !('error' in result) && result.avgCoverageExtent !== undefined;
                  const judgeAgreement = result && !('error' in result) ? (result as any).judgeAgreement : null;
                  const parsed = parseModelIdForDisplay(modelId);
                  const modelLabel = getModelDisplayLabel(parsed, {
                    hideProvider: true,
                    prettifyModelName: true,
                    hideTemperature: false,
                    hideSystemPrompt: !hasMultipleSystemPrompts,
                  });

                  return (
                    <th key={itemKey} scope="col" className="text-center px-2 sm:px-3 py-2 sm:py-3 border-b border-border w-[180px] sm:w-[250px] max-w-[180px] sm:max-w-[250px]">
                      <div className="space-y-1.5 sm:space-y-2">
                        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                          <div className="font-medium truncate flex-1 text-left text-[11px] sm:text-xs">{modelLabel}</div>
                          <button
                            onClick={() => removeFromComparison(itemKey)}
                            aria-label={`Remove ${modelLabel} from comparison`}
                            className="text-sm sm:text-xs text-muted-foreground hover:text-destructive p-1 rounded touch-manipulation active:bg-destructive/10"
                          >
                            <span aria-hidden="true">✕</span>
                          </button>
                        </div>
                        {hasScore && (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{formatPercentage(result.avgCoverageExtent ?? null, 0)}</span>
                            <div className="flex-1">
                              <TextualBar score={result.avgCoverageExtent ?? null} length={12} />
                            </div>
                          </div>
                        )}
                        {judgeAgreement && (() => {
                          const isExpanded = expandedAlphaColumn === itemKey;
                          return (
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedAlphaColumn(isExpanded ? null : itemKey);
                                }}
                                className="flex items-center justify-center gap-0.5 px-1 py-0.5 rounded-sm hover:bg-muted/50 transition-colors"
                              >
                                <Icon name="users" className={cn(
                                  "w-3 h-3",
                                  judgeAgreement.interpretation === 'reliable' && "text-green-600 dark:text-green-400",
                                  judgeAgreement.interpretation === 'tentative' && "text-amber-600 dark:text-amber-400",
                                  judgeAgreement.interpretation === 'unreliable' && "text-red-600 dark:text-red-400",
                                  judgeAgreement.interpretation === 'unstable' && "text-slate-600 dark:text-slate-400"
                                )} />
                                <span className={cn(
                                  "font-mono font-semibold",
                                  judgeAgreement.interpretation === 'reliable' && "text-green-600 dark:text-green-400",
                                  judgeAgreement.interpretation === 'tentative' && "text-amber-600 dark:text-amber-400",
                                  judgeAgreement.interpretation === 'unreliable' && "text-red-600 dark:text-red-400",
                                  judgeAgreement.interpretation === 'unstable' && "text-slate-600 dark:text-slate-400"
                                )}>
                                  α={judgeAgreement.krippendorffsAlpha.toFixed(2)}
                                </span>
                                <Icon name={isExpanded ? "chevron-up" : "chevron-down"} className="w-2.5 h-2.5 text-muted-foreground" />
                              </button>

                              {isExpanded && (
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-72 p-3 rounded-md bg-white dark:bg-slate-800 border border-border shadow-lg z-50">
                                  <div className="space-y-2 text-xs">
                                    <div className="font-semibold border-b border-border pb-1">Judge Agreement</div>
                                    <p className="text-muted-foreground leading-relaxed">
                                      This measures how consistently multiple AI judges scored this evaluation.
                                      Higher values mean judges agreed more on their assessments.
                                    </p>
                                    <div className="space-y-1 pt-1">
                                      <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Krippendorff's α:</span>
                                        <span className="font-medium">{judgeAgreement.krippendorffsAlpha.toFixed(3)}</span>
                                      </div>
                                      <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Interpretation:</span>
                                        <span className={cn(
                                          "font-medium capitalize",
                                          judgeAgreement.interpretation === 'reliable' && "text-green-600 dark:text-green-400",
                                          judgeAgreement.interpretation === 'tentative' && "text-amber-600 dark:text-amber-400",
                                          judgeAgreement.interpretation === 'unreliable' && "text-red-600 dark:text-red-400",
                                          judgeAgreement.interpretation === 'unstable' && "text-slate-600 dark:text-slate-400"
                                        )}>{judgeAgreement.interpretation}</span>
                                      </div>
                                      <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Judges:</span>
                                        <span>{judgeAgreement.numJudges}</span>
                                      </div>
                                      <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Items:</span>
                                        <span>{judgeAgreement.numItems}</span>
                                      </div>
                                      <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Comparisons:</span>
                                        <span>{judgeAgreement.numComparisons}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {/* System Prompt row - only show if multiple system prompts */}
              {hasMultipleSystemPrompts && (
                <tr className="bg-muted/10">
                  <th scope="row" className="px-3 py-2 font-medium border-r border-border sticky left-0 bg-background w-[150px] sm:w-[200px] max-w-[150px] sm:max-w-[200px]">
                    System Prompt
                  </th>
                  {comparisonItems.map(itemKey => {
                    const parts = itemKey.split('::');
                    const modelId = parts[1];
                    const parsed = parseModelIdForDisplay(modelId);
                    const systemPromptIndex = parsed.systemPromptIndex ?? 0;
                    const systemPrompt = config?.systems?.[systemPromptIndex] || '[No System Prompt]';

                    return (
                      <td key={itemKey} className="px-3 py-2 align-top w-[180px] sm:w-[250px] max-w-[180px] sm:max-w-[250px]">
                        <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                          {systemPrompt}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* Response row */}
              <tr className="bg-muted/10">
                <th scope="row" className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium border-r border-border sticky left-0 bg-background z-10 w-[150px] sm:w-[200px] max-w-[150px] sm:max-w-[200px]">
                  Response
                </th>
                {comparisonItems.map(itemKey => {
                  const parts = itemKey.split('::');
                  const modelId = parts[1];
                  const response = getCachedResponse?.(promptId, modelId);
                  const loading = isLoadingResponse(promptId, modelId);

                  return (
                    <td key={itemKey} className="px-2 sm:px-3 py-2 align-top w-[180px] sm:w-[250px] max-w-[180px] sm:max-w-[250px]">
                      <div className={cn(
                        "border border-border rounded bg-background overflow-auto text-[10px] sm:text-xs",
                        renderAs === 'html' ? "h-[250px] sm:h-[300px]" : "max-h-48 sm:max-h-64"
                      )}>
                        {loading ? (
                          <ResponseSkeleton />
                        ) : response ? (
                          <div className="p-2 h-[100%]">
                            <ResponseRenderer content={response} renderAs={renderAs} />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground p-2">No response data</p>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Required Criteria Section */}
              {criteriaByPath.requiredCriteria.length > 0 && criteriaByPath.pathGroups.size > 0 && (
                <tr className="bg-muted/20">
                  <td colSpan={comparisonItems.length + 1} className="px-3 py-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-slate-400 rounded" />
                      <span className="text-xs font-semibold">Required Criteria</span>
                    </div>
                  </td>
                </tr>
              )}

              {/* Required criteria rows */}
              {criteriaByPath.requiredCriteria.map((criterion, idx) => {
                return (
                  <tr key={`req-${idx}`} className="hover:bg-muted/20">
                    <td className="px-2 sm:px-3 py-2 sm:py-3 text-left border-r border-border sticky left-0 bg-background z-10 w-[150px] sm:w-[200px] max-w-[150px] sm:max-w-[200px]">
                      <div className="space-y-1.5 sm:space-y-2 text-[10px] sm:text-xs">
                        <div className="flex items-start gap-1.5 sm:gap-2">
                          <CriterionText text={criterion.text} />
                          {criterion.isInverted && (
                            <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-purple-600 dark:text-purple-400 flex-shrink-0" title="Inverted criterion: should NOT be present" role="img" aria-label="Inverted criterion">
                              <span aria-hidden="true">🚫</span>
                              <span className="font-semibold text-[9px] sm:text-xs">NOT</span>
                            </div>
                          )}
                        </div>
                        {criterion.citation && (
                          <div className="text-[10px] sm:text-xs text-muted-foreground italic pl-2 sm:pl-3 border-l-2 border-primary/30">
                            "{truncateText(criterion.citation, 150)}"
                          </div>
                        )}
                      </div>
                    </td>
                    {comparisonItems.map(itemKey => {
                      const parts = itemKey.split('::');
                      const modelId = parts[1];
                      const assessment = criterion.assessments.get(modelId);
                      const evalLoading = isLoadingEvaluation?.(`${promptId}:${modelId}`) || false;

                      if (evalLoading) {
                        return (
                          <td key={itemKey} className="px-2 sm:px-3 py-2 sm:py-3 align-top w-[180px] sm:w-[250px] max-w-[180px] sm:max-w-[250px]">
                            <EvaluationSkeleton />
                          </td>
                        );
                      }

                      if (!assessment) {
                        return (
                          <td key={itemKey} className="px-2 sm:px-3 py-2 sm:py-3 text-center text-muted-foreground align-top w-[180px] sm:w-[250px] max-w-[180px] sm:max-w-[250px]">
                            —
                          </td>
                        );
                      }

                      const { score, individualJudgements } = assessment;
                      const statusIcon = score >= 0.8 ? '✓' : score >= 0.5 ? '~' : '✗';
                      const statusLabel = score >= 0.8 ? 'Pass' : score >= 0.5 ? 'Partial' : 'Fail';

                      return (
                        <td key={itemKey} className="px-2 sm:px-3 py-2 sm:py-3 align-top w-[180px] sm:w-[250px] max-w-[180px] sm:max-w-[250px]">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "text-lg font-bold",
                                  score >= 0.8 ? "text-green-600 dark:text-green-400" :
                                  score >= 0.5 ? "text-amber-600 dark:text-amber-400" :
                                  "text-red-600 dark:text-red-400"
                                )}
                                aria-label={statusLabel}
                                role="img"
                              >
                                {statusIcon}
                              </span>
                              <span className="font-mono text-sm">{formatPercentage(score, 0)}</span>
                              <div className="flex-1">
                                <TextualBar score={score} length={8} />
                              </div>
                            </div>
                            {individualJudgements && individualJudgements.length > 0 && (() => {
                              // Calculate judge disagreement if we have multiple judges
                              let hasDisagreement = false;
                              let judgeStdDev = 0;
                              if (individualJudgements.length > 1) {
                                const scores = individualJudgements.map(j => j.coverageExtent);
                                const mean = scores.reduce((a, b) => a + b) / scores.length;
                                judgeStdDev = Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length);
                                hasDisagreement = judgeStdDev > 0.3;
                              }

                              return (
                                <div className="space-y-2">
                                  {hasDisagreement && (
                                    <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/10 px-2 py-1 rounded">
                                      <Icon name="users" className="w-3 h-3" />
                                      <span className="font-medium">Judge disagreement (StdDev: {judgeStdDev.toFixed(2)})</span>
                                    </div>
                                  )}
                                  {individualJudgements.map((judgement, jIdx) => (
                                    <div key={jIdx} className="text-xs text-muted-foreground pl-3 border-l-2 border-border leading-relaxed">
                                      {individualJudgements.length > 1 && (
                                        <div className="font-semibold mb-1 opacity-70">
                                          Judge {jIdx + 1} ({formatPercentage(judgement.coverageExtent, 0)}):
                                        </div>
                                      )}
                                      <JudgeReflection text={judgement.reflection} />
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Alternative Path Sections */}
              {Array.from(criteriaByPath.pathGroups.entries()).map(([pathId, criteria], pathIndex) => {
                const pathNumber = parseInt(pathId.split('_')[1] || '0') + 1;
                const pathColor = PATH_COLORS[pathIndex % PATH_COLORS.length];

                return (
                  <React.Fragment key={pathId}>
                    {/* Path header row */}
                    <tr className="bg-muted/20">
                      <td colSpan={comparisonItems.length + 1} className="px-3 py-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: pathColor }}
                          />
                          <span className="text-xs font-semibold">Path {pathNumber}</span>
                          <span className="text-xs text-muted-foreground">
                            ({criteria.length} {criteria.length === 1 ? 'criterion' : 'criteria'})
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Path criteria rows */}
                    {criteria.map((criterion, idx) => (
                      <tr key={`path-${pathId}-${idx}`} className="hover:bg-muted/20">
                        <td className="px-3 py-3 text-left border-r border-border sticky left-0 bg-background w-[150px] sm:w-[200px] max-w-[150px] sm:max-w-[200px]">
                          <div className="flex gap-2">
                            <div
                              className="w-1 flex-shrink-0 rounded"
                              style={{ backgroundColor: pathColor }}
                            />
                            <div className="space-y-2 flex-1">
                              <div className="flex items-start gap-2">
                                <CriterionText text={criterion.text} />
                                {criterion.isInverted && (
                                  <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 flex-shrink-0" title="Inverted criterion: should NOT be present" role="img" aria-label="Inverted criterion">
                                    <span aria-hidden="true">🚫</span>
                                    <span className="font-semibold">NOT</span>
                                  </div>
                                )}
                              </div>
                              {criterion.citation && (
                                <div className="text-xs text-muted-foreground italic pl-3 border-l-2 border-primary/30">
                                  "{truncateText(criterion.citation, 150)}"
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        {comparisonItems.map(itemKey => {
                          const parts = itemKey.split('::');
                          const modelId = parts[1];
                          const assessment = criterion.assessments.get(modelId);
                          const evalLoading = isLoadingEvaluation?.(`${promptId}:${modelId}`) || false;

                          if (evalLoading) {
                            return (
                              <td key={itemKey} className="px-3 py-3 align-top w-[180px] sm:w-[250px] max-w-[180px] sm:max-w-[250px]">
                                <EvaluationSkeleton />
                              </td>
                            );
                          }

                          if (!assessment) {
                            return (
                              <td key={itemKey} className="px-3 py-3 text-center text-muted-foreground align-top w-[180px] sm:w-[250px] max-w-[180px] sm:max-w-[250px]">
                                —
                              </td>
                            );
                          }

                          const { score, individualJudgements } = assessment;
                          const statusIcon = score >= 0.8 ? '✓' : score >= 0.5 ? '~' : '✗';
                          const statusLabel = score >= 0.8 ? 'Pass' : score >= 0.5 ? 'Partial' : 'Fail';

                          return (
                            <td key={itemKey} className="px-3 py-3 align-top w-[180px] sm:w-[250px] max-w-[180px] sm:max-w-[250px]">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "text-lg font-bold",
                                      score >= 0.8 ? "text-green-600 dark:text-green-400" :
                                      score >= 0.5 ? "text-amber-600 dark:text-amber-400" :
                                      "text-red-600 dark:text-red-400"
                                    )}
                                    aria-label={statusLabel}
                                    role="img"
                                  >
                                    {statusIcon}
                                  </span>
                                  <span className="font-mono text-sm">{formatPercentage(score, 0)}</span>
                                  <div className="flex-1">
                                    <TextualBar score={score} length={8} />
                                  </div>
                                </div>
                                {individualJudgements && individualJudgements.length > 0 && (() => {
                                  // Calculate judge disagreement if we have multiple judges
                                  let hasDisagreement = false;
                                  let judgeStdDev = 0;
                                  if (individualJudgements.length > 1) {
                                    const scores = individualJudgements.map(j => j.coverageExtent);
                                    const mean = scores.reduce((a, b) => a + b) / scores.length;
                                    judgeStdDev = Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length);
                                    hasDisagreement = judgeStdDev > 0.3;
                                  }

                                  return (
                                    <div className="space-y-2">
                                      {hasDisagreement && (
                                        <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/10 px-2 py-1 rounded">
                                          <Icon name="users" className="w-3 h-3" />
                                          <span className="font-medium">Judge disagreement (StdDev: {judgeStdDev.toFixed(2)})</span>
                                        </div>
                                      )}
                                      {individualJudgements.map((judgement, jIdx) => (
                                        <div key={jIdx} className="text-xs text-muted-foreground pl-3 border-l-2 border-border leading-relaxed">
                                          {individualJudgements.length > 1 && (
                                            <div className="font-semibold mb-1 opacity-70">
                                              Judge {jIdx + 1} ({formatPercentage(judgement.coverageExtent, 0)}):
                                            </div>
                                          )}
                                          <JudgeReflection text={judgement.reflection} />
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
