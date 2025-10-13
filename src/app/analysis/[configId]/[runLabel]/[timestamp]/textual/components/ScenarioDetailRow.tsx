'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextualBar } from './TextualBar';
import { formatPercentage, getScoreEmoji, truncateText } from '../utils/textualUtils';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { PointAssessment } from '@/app/utils/types';
import Icon from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import ResponseRenderer, { RenderAsType } from '@/app/components/ResponseRenderer';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { ScenarioDisplayMode } from '../hooks/useScenarioDisplayMode';

interface ScenarioDetailRowProps {
  promptId: string;
  promptText: string;
  models: string[];
  allCoverageScores: any;
  isLoadingResponses: boolean;
  renderAs?: RenderAsType;
  displayMode?: ScenarioDisplayMode;
}

interface CriterionScore {
  text: string;
  scores: Array<{ modelId: string; score: number | null; isInverted?: boolean }>;
  avgScore: number;
  bestModelId: string | null;
}

interface PathInfo {
  pathId: string;
  pathNumber: number;
  criteria: CriterionScore[];
  avgScore: number;
}

export function ScenarioDetailRow({
  promptId,
  promptText,
  models,
  allCoverageScores,
  isLoadingResponses,
  renderAs = 'markdown',
  displayMode = 'detailed'
}: ScenarioDetailRowProps) {
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set());
  const [expandedJudgements, setExpandedJudgements] = useState<Set<string>>(new Set());
  const [isLoadingEvaluations, setIsLoadingEvaluations] = useState(true);
  const [hasFetchedEvaluations, setHasFetchedEvaluations] = useState(false);

  // Modal state for responses (compact/table modes)
  const [responseModal, setResponseModal] = useState<{ modelId: string; response: string } | null>(null);

  // Engineer mode state
  const [expandedCriteria, setExpandedCriteria] = useState<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [expandedModelGroups, setExpandedModelGroups] = useState<Set<string>>(new Set());
  const [inlineModal, setInlineModal] = useState<{
    type: 'response' | 'judge';
    modelId: string;
    content: string;
    criterionText?: string;
  } | null>(null);

  // Get data fetching functions from context
  const {
    data,
    getCachedResponse,
    getCachedEvaluation,
    fetchEvaluationDetailsBatchForPrompt
  } = useAnalysis();

  // Deduplicate models (in case temperature variants weren't properly collapsed)
  const uniqueModels = useMemo(() => {
    return Array.from(new Set(models));
  }, [models]);

  // Check if we have multiple system prompts (to determine if we should show sys: prefix)
  const hasMultipleSystemPrompts = useMemo(() => {
    if (!data?.config) return false;
    const systems = data.config.systems || (data.config.system ? [data.config.system] : []);
    return systems.length > 1;
  }, [data?.config]);

  // Fetch detailed evaluation data for this prompt when component mounts
  useEffect(() => {
    if (!promptId || !fetchEvaluationDetailsBatchForPrompt || hasFetchedEvaluations) {
      return;
    }

    // Check if we already have cached evaluation data for at least one model
    const hasCachedData = uniqueModels.some(modelId => {
      const cached = getCachedEvaluation?.(promptId, modelId);
      return cached && cached.pointAssessments && cached.pointAssessments.length > 0;
    });

    if (hasCachedData) {
      setIsLoadingEvaluations(false);
      setHasFetchedEvaluations(true);
      return;
    }

    setIsLoadingEvaluations(true);

    fetchEvaluationDetailsBatchForPrompt(promptId)
      .then(() => {
        setIsLoadingEvaluations(false);
        setHasFetchedEvaluations(true);
      })
      .catch(err => {
        console.error(`[ScenarioDetailRow] Failed to fetch evaluation details for ${promptId}:`, err);
        setIsLoadingEvaluations(false);
        setHasFetchedEvaluations(true);
      });
  }, [promptId, fetchEvaluationDetailsBatchForPrompt, hasFetchedEvaluations]);

  // Toggle response expansion
  const toggleResponse = (modelId: string) => {
    setExpandedResponses(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  // Toggle judgement expansion
  const toggleJudgement = (key: string) => {
    setExpandedJudgements(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Analyze criteria and paths - use detailed evaluation data
  const { requiredCriteria, paths, hasMultiplePaths } = useMemo(() => {
    const criteriaMap = new Map<string, CriterionScore>();
    const pathsMap = new Map<string, { criteria: Map<string, CriterionScore>; scores: number[] }>();
    const processedModelCriteria = new Set<string>(); // Track model+criterion to avoid duplicates

    uniqueModels.forEach(modelId => {
      // Get score data from allCoverageScores (for scores)
      const result = allCoverageScores[promptId]?.[modelId];
      if (!result || 'error' in result) {
        console.log(`[ScenarioDetailRow] Skipping ${modelId} - no result or error`);
        return;
      }

      // Get detailed evaluation data from cache (for keyPointText and other details)
      const detailedEvaluation = getCachedEvaluation?.(promptId, modelId);
      if (!detailedEvaluation || !detailedEvaluation.pointAssessments) {
        // console.log(`[ScenarioDetailRow] Skipping ${modelId} - detailed evaluation not loaded yet`);
        // remove this log as its causing too much noise
        return;
      }

      // Debug: Log what we got
      if (modelId === uniqueModels[0]) {
        console.log(`[ScenarioDetailRow] Data for ${promptId}, model ${modelId}:`, {
          hasResult: !!result,
          hasDetailedEval: !!detailedEvaluation,
          assessmentsCount: detailedEvaluation.pointAssessments?.length || 0,
          firstAssessment: detailedEvaluation.pointAssessments?.[0],
        });
      }

      detailedEvaluation.pointAssessments.forEach((assessment: PointAssessment, idx: number) => {
        const { keyPointText, pathId, coverageExtent, isInverted } = assessment as any;

        // Skip if no criterion text (data quality issue)
        if (!keyPointText || keyPointText.trim() === '') {
          console.log(`[ScenarioDetailRow] Skipping assessment ${idx} for ${modelId} - empty keyPointText`);
          return;
        }

        // Create unique key for this model+criterion combination
        const criterionKey = `${modelId}:${pathId || 'required'}:${keyPointText}`;

        // Skip if we've already processed this model+criterion combo
        if (processedModelCriteria.has(criterionKey)) {
          console.log(`[ScenarioDetailRow] Skipping duplicate: ${criterionKey}`);
          return;
        }
        processedModelCriteria.add(criterionKey);

        if (pathId) {
          // Alternative path criterion
          if (!pathsMap.has(pathId)) {
            pathsMap.set(pathId, { criteria: new Map(), scores: [] });
          }
          const pathData = pathsMap.get(pathId)!;

          if (!pathData.criteria.has(keyPointText)) {
            pathData.criteria.set(keyPointText, {
              text: keyPointText,
              scores: [],
              avgScore: 0,
              bestModelId: null,
            });
          }
          pathData.criteria.get(keyPointText)!.scores.push({
            modelId,
            score: coverageExtent ?? null,
            isInverted,
          });
        } else {
          // Required criterion
          if (!criteriaMap.has(keyPointText)) {
            criteriaMap.set(keyPointText, {
              text: keyPointText,
              scores: [],
              avgScore: 0,
              bestModelId: null,
            });
          }
          criteriaMap.get(keyPointText)!.scores.push({
            modelId,
            score: coverageExtent ?? null,
            isInverted,
          });
        }
      });
    });

    // Calculate averages and best models for required criteria
    const requiredCriteria: CriterionScore[] = Array.from(criteriaMap.values()).map(criterion => {
      const validScores = criterion.scores.filter(s => s.score !== null);
      const avgScore = validScores.length > 0
        ? validScores.reduce((sum, s) => sum + (s.score ?? 0), 0) / validScores.length
        : 0;

      const bestScore = Math.max(...validScores.map(s => s.score ?? 0));
      const bestModelId = validScores.find(s => s.score === bestScore)?.modelId ?? null;

      return { ...criterion, avgScore, bestModelId };
    });

    // Calculate averages for paths
    const paths: PathInfo[] = Array.from(pathsMap.entries()).map(([pathId, pathData]) => {
      const pathNumber = parseInt(pathId.split('_')[1] || '0') + 1;
      const criteria = Array.from(pathData.criteria.values()).map(criterion => {
        const validScores = criterion.scores.filter(s => s.score !== null);
        const avgScore = validScores.length > 0
          ? validScores.reduce((sum, s) => sum + (s.score ?? 0), 0) / validScores.length
          : 0;

        const bestScore = Math.max(...validScores.map(s => s.score ?? 0));
        const bestModelId = validScores.find(s => s.score === bestScore)?.modelId ?? null;

        return { ...criterion, avgScore, bestModelId };
      });

      const avgScore = criteria.length > 0
        ? criteria.reduce((sum, c) => sum + c.avgScore, 0) / criteria.length
        : 0;

      return { pathId, pathNumber, criteria, avgScore };
    }).sort((a, b) => b.avgScore - a.avgScore); // Best path first

    // Debug: Log final results
    console.log(`[ScenarioDetailRow] Final results for ${promptId}:`, {
      requiredCriteriaCount: requiredCriteria.length,
      pathsCount: paths.length,
      hasMultiplePaths: paths.length > 0,
      totalCriteriaMapSize: criteriaMap.size,
      totalPathsMapSize: pathsMap.size,
    });

    if (requiredCriteria.length === 0 && paths.length === 0) {
      console.warn(`[ScenarioDetailRow] NO CRITERIA FOUND for ${promptId}!`, {
        uniqueModelsCount: uniqueModels.length,
        firstModelId: uniqueModels[0],
        firstModelResult: allCoverageScores[promptId]?.[uniqueModels[0]],
      });
    }

    return {
      requiredCriteria,
      paths,
      hasMultiplePaths: paths.length > 0,
    };
  }, [promptId, uniqueModels, allCoverageScores, getCachedEvaluation]);

  // Render criterion row with expandable details
  const renderCriterion = (criterion: CriterionScore, isPath: boolean = false) => {
    // Get detailed assessment for a model (with reflection and citation)
    const getDetailedAssessment = (modelId: string) => {
      const detailedEvaluation = getCachedEvaluation?.(promptId, modelId);
      if (!detailedEvaluation || !detailedEvaluation.pointAssessments) return null;

      return detailedEvaluation.pointAssessments.find((a: any) => a.keyPointText === criterion.text);
    };

    // Find all variants for a given canonical model (by baseId and systemPromptIndex)
    const getModelVariants = (modelId: string) => {
      const parsed = parseModelIdForDisplay(modelId);
      return uniqueModels.filter(m => {
        const p = parseModelIdForDisplay(m);
        return p.baseId === parsed.baseId && (p.systemPromptIndex ?? 0) === (parsed.systemPromptIndex ?? 0);
      });
    };

    // Get a citation example from any model (they should be similar across models for the same criterion)
    const getExampleCitation = () => {
      for (const scoreEntry of criterion.scores) {
        const assessment = getDetailedAssessment(scoreEntry.modelId);
        if (assessment?.citation) {
          return assessment.citation;
        }
      }
      return null;
    };

    const exampleCitation = getExampleCitation();

    return (
      <div key={criterion.text} className="py-2 border-b border-border/30 last:border-0">
        <div className="flex items-start gap-2 mb-2">
          <span className="text-lg">{getScoreEmoji(criterion.avgScore)}</span>
          <div className="flex-1">
            <div className="font-medium text-sm">{criterion.text}</div>

            {/* Show citation at the top if available */}
            {exampleCitation && (
              <div className="mt-1 text-xs text-muted-foreground italic border-l-2 border-border/50 pl-2">
                <span className="font-semibold not-italic text-foreground/70">Citation: </span>
                "{truncateText(exampleCitation, 200)}"
              </div>
            )}

            {criterion.avgScore < 0.6 && (
              <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                ⚠ Models struggled with this criterion
              </div>
            )}
          </div>
        </div>
        <div className="pl-7 space-y-3">
          {(() => {
            // Group scores hierarchically: baseId → systemPromptIndex → temperature
            type TemperatureVariant = {
              modelId: string;
              temperature: number;
              score: number | null;
              isInverted?: boolean;
            };
            type SystemPromptGroup = {
              systemPromptIndex: number;
              temperatures: TemperatureVariant[];
            };
            type ModelGroup = {
              baseId: string;
              displayName: string;
              systemPrompts: SystemPromptGroup[];
              isWinner: boolean;
            };

            const modelGroups = new Map<string, ModelGroup>();

            criterion.scores.forEach(scoreEntry => {
              const parsed = parseModelIdForDisplay(scoreEntry.modelId);
              const baseId = parsed.baseId;
              const sysIdx = parsed.systemPromptIndex ?? 0;
              const temp = parsed.temperature ?? 0;

              // Create model group if doesn't exist
              if (!modelGroups.has(baseId)) {
                const displayName = getModelDisplayLabel(parsed, {
                  hideProvider: true,
                  prettifyModelName: true,
                  hideTemperature: true,
                  hideSystemPrompt: true,
                });
                modelGroups.set(baseId, {
                  baseId,
                  displayName,
                  systemPrompts: [],
                  isWinner: false,
                });
              }

              const modelGroup = modelGroups.get(baseId)!;

              // Check if this variant is the winner
              if (scoreEntry.modelId === criterion.bestModelId) {
                modelGroup.isWinner = true;
              }

              // Find or create system prompt group
              let sysGroup = modelGroup.systemPrompts.find(s => s.systemPromptIndex === sysIdx);
              if (!sysGroup) {
                sysGroup = { systemPromptIndex: sysIdx, temperatures: [] };
                modelGroup.systemPrompts.push(sysGroup);
              }

              // Add temperature variant
              sysGroup.temperatures.push({
                modelId: scoreEntry.modelId,
                temperature: temp,
                score: scoreEntry.score,
                isInverted: scoreEntry.isInverted,
              });
            });

            // Sort system prompts and temperatures
            modelGroups.forEach(modelGroup => {
              modelGroup.systemPrompts.sort((a, b) => a.systemPromptIndex - b.systemPromptIndex);
              modelGroup.systemPrompts.forEach(sysGroup => {
                sysGroup.temperatures.sort((a, b) => a.temperature - b.temperature);
              });
            });

            return Array.from(modelGroups.values()).map(modelGroup => {
              const hasMultipleSys = modelGroup.systemPrompts.length > 1;
              const hasMultipleVariants = modelGroup.systemPrompts.some(s => s.temperatures.length > 1);

              return (
                <div key={modelGroup.baseId} className="space-y-2">
                  {/* Model Name (top level) */}
                  <div className="font-semibold text-sm text-foreground">
                    {modelGroup.displayName}
                    {modelGroup.isWinner && ' 🏆'}
                  </div>

                  {/* System Prompts (second level) */}
                  {modelGroup.systemPrompts.map(sysGroup => {
                    // Get judge assessment from first temperature variant
                    const firstVariant = sysGroup.temperatures[0];
                    const canonicalAssessment = getDetailedAssessment(firstVariant.modelId);
                    const judgementKey = `${modelGroup.baseId}::sys${sysGroup.systemPromptIndex}::${criterion.text}`;
                    const isJudgementExpanded = expandedJudgements.has(judgementKey);
                    const firstJudgementText = canonicalAssessment?.individualJudgements?.[0]?.reflection
                      || canonicalAssessment?.reflection
                      || null;

                    return (
                      <div key={sysGroup.systemPromptIndex} className="ml-4 space-y-1">
                        {/* System Prompt Header (if multiple) */}
                        {hasMultipleSys && (
                          <div className="text-xs font-semibold text-muted-foreground">
                            sys:{sysGroup.systemPromptIndex}
                          </div>
                        )}

                        {/* Temperature Variants (third level) */}
                        {sysGroup.temperatures.map(tempVariant => {
                          const response = getCachedResponse?.(promptId, tempVariant.modelId);
                          const isResponseExpanded = expandedResponses.has(tempVariant.modelId);

                          return (
                            <div key={tempVariant.modelId} className="ml-4 space-y-1">
                              {/* Temperature Header with Bar, Score, and Judgement Preview */}
                              <div
                                className="flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors rounded px-1 -mx-1"
                                onClick={() => firstJudgementText && toggleJudgement(judgementKey)}
                                title={firstJudgementText ? "Click to see full judge reasoning" : undefined}
                              >
                                {hasMultipleVariants && (
                                  <div className="w-16 text-xs text-muted-foreground flex-shrink-0">
                                    temp:{tempVariant.temperature}
                                  </div>
                                )}
                                <div className="w-32 flex-shrink-0">
                                  <TextualBar score={tempVariant.score} length={20} />
                                </div>
                                <div className="w-20 text-right text-sm font-mono flex-shrink-0">
                                  {formatPercentage(tempVariant.score, 0)}
                                </div>
                                {tempVariant.isInverted && (
                                  <div className="text-xs text-purple-600 dark:text-purple-400 flex-shrink-0" title="Inverted criterion: should NOT be present">
                                    🚫
                                  </div>
                                )}
                                {/* Truncated judgement preview (inline) */}
                                {firstJudgementText && !isJudgementExpanded && (
                                  <div className="flex-1 text-xs text-muted-foreground italic truncate">
                                    {truncateText(firstJudgementText, 150)}
                                  </div>
                                )}
                              </div>

                              {/* Expanded Judge's Reasoning (appears right after judgement preview) */}
                              {isJudgementExpanded && canonicalAssessment && (
                                <div className="ml-4 text-xs text-muted-foreground border-l-2 border-border/50 pl-2 space-y-1">
                                  {canonicalAssessment.individualJudgements && canonicalAssessment.individualJudgements.length > 0 ? (
                                    canonicalAssessment.individualJudgements.map((judgement: any, idx: number) => (
                                      <div key={idx}>
                                        <span className="font-semibold text-foreground/70">
                                          Judge {idx + 1} ({judgement.judgeModelId}, score: {formatPercentage(judgement.coverageExtent, 0)}):
                                        </span>{' '}
                                        {judgement.reflection}
                                      </div>
                                    ))
                                  ) : canonicalAssessment.reflection ? (
                                    <div>
                                      <span className="font-semibold text-foreground/70">Judge's reasoning: </span>
                                      {canonicalAssessment.reflection}
                                    </div>
                                  ) : null}
                                </div>
                              )}

                              {/* Model Response (truncated, expandable) */}
                              <div className="ml-4">
                                <div
                                  className={cn(
                                    "text-xs border-l-2 border-border/50 pl-2 transition-colors",
                                    response ? "text-muted-foreground cursor-pointer hover:border-primary/50" : "text-muted-foreground/50",
                                    response && !isResponseExpanded && "line-clamp-1"
                                  )}
                                  onClick={response ? () => toggleResponse(tempVariant.modelId) : undefined}
                                  title={response ? "Click to expand/collapse response" : "Loading response..."}
                                >
                                  {response ? (
                                    isResponseExpanded ? (
                                      <div className="prose prose-xs dark:prose-invert max-w-none">
                                        <ResponseRenderer content={response} renderAs={renderAs} />
                                      </div>
                                    ) : (
                                      <span className="italic">{truncateText(response, 150)}</span>
                                    )
                                  ) : (
                                    <span className="italic inline-flex items-center gap-1">
                                      <Icon name="loader-2" className="w-3 h-3 animate-spin" />
                                      Loading response...
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>
      </div>
    );
  };

  // === COMPACT MODE RENDERER ===
  const renderCompactMode = () => {
    // Simplified version - collapse variants, no emojis, responses in modal
    return (
      <div className="bg-muted/10 border-t border-border">
        <div className="p-4 space-y-4">
          {/* Prompt Context */}
          <div className="border-l-2 border-primary/50 pl-3 py-2">
            <div className="text-xs font-medium text-muted-foreground mb-1">Test Scenario</div>
            <div className="text-sm text-foreground">{promptText}</div>
          </div>

          {/* Loading State */}
          {isLoadingEvaluations ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Loading evaluation criteria...
            </div>
          ) : (
            <>
              {/* Required Criteria */}
              {requiredCriteria.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                    {hasMultiplePaths ? 'Required Criteria' : 'Evaluation Criteria'}
                  </h4>
                  {requiredCriteria.map(criterion => (
                    <div key={criterion.text} className="border border-border rounded-lg p-3 bg-card/50">
                      <div className="font-medium text-sm mb-2">{criterion.text}</div>
                      <div className="space-y-1">
                        {criterion.scores.slice(0, 3).map(scoreEntry => {
                          const parsed = parseModelIdForDisplay(scoreEntry.modelId);
                          const modelLabel = getModelDisplayLabel(parsed, {
                            hideProvider: true,
                            prettifyModelName: true,
                            hideTemperature: true,
                            hideSystemPrompt: !hasMultipleSystemPrompts,
                          });
                          const response = getCachedResponse?.(promptId, scoreEntry.modelId);

                          return (
                            <div key={scoreEntry.modelId} className="flex items-center gap-2 text-xs">
                              <div className="w-32 truncate">{modelLabel}</div>
                              <div className="w-24"><TextualBar score={scoreEntry.score} length={12} /></div>
                              <div className="w-12 text-right font-mono">{formatPercentage(scoreEntry.score, 0)}</div>
                              {response && (
                                <button
                                  onClick={() => setResponseModal({ modelId: scoreEntry.modelId, response })}
                                  className="text-primary hover:underline text-xs"
                                >
                                  view response
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {criterion.scores.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            + {criterion.scores.length - 3} more models
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Alternative Paths */}
              {hasMultiplePaths && paths.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase">Alternative Paths</h4>
                  {paths.map((path, idx) => (
                    <div key={path.pathId} className={cn(
                      "border rounded-lg p-3",
                      idx === 0 ? "border-primary/50 bg-primary/5" : "border-border bg-card/50"
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Path {path.pathNumber}</span>
                        {idx === 0 && <span className="text-xs text-primary">Best</span>}
                        <span className="text-xs font-mono">{formatPercentage(path.avgScore)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {path.criteria.length} criteria
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Response Modal */}
        <Dialog open={!!responseModal} onOpenChange={() => setResponseModal(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>
                Model Response: {responseModal && getModelDisplayLabel(parseModelIdForDisplay(responseModal.modelId))}
              </DialogTitle>
            </DialogHeader>
            {responseModal && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ResponseRenderer content={responseModal.response} renderAs={renderAs} />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // === TABLE MODE RENDERER ===
  const renderTableMode = () => {
    // Flat table per criterion
    return (
      <div className="bg-muted/10 border-t border-border">
        <div className="p-4 space-y-4">
          {/* Prompt Context */}
          <div className="border-l-2 border-primary/50 pl-3 py-2">
            <div className="text-xs font-medium text-muted-foreground mb-1">Test Scenario</div>
            <div className="text-sm text-foreground">{promptText}</div>
          </div>

          {/* Loading State */}
          {isLoadingEvaluations ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Loading evaluation criteria...
            </div>
          ) : (
            <>
              {/* Required Criteria */}
              {requiredCriteria.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                    {hasMultiplePaths ? 'Required Criteria' : 'Evaluation Criteria'}
                  </h4>
                  {requiredCriteria.map(criterion => (
                    <div key={criterion.text} className="border border-border rounded-lg overflow-hidden bg-card/50">
                      <div className="bg-muted/30 px-3 py-2 font-medium text-sm border-b border-border">
                        {criterion.text}
                        <span className="ml-2 text-xs text-muted-foreground">
                          (avg: {formatPercentage(criterion.avgScore, 0)})
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/20">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Model</th>
                              <th className="text-right px-3 py-2 font-medium">Score</th>
                              <th className="text-center px-3 py-2 font-medium w-40">Performance</th>
                              <th className="text-left px-3 py-2 font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {criterion.scores.map(scoreEntry => {
                              const parsed = parseModelIdForDisplay(scoreEntry.modelId);
                              const modelLabel = getModelDisplayLabel(parsed, {
                                hideProvider: true,
                                prettifyModelName: true,
                                hideTemperature: true,
                                hideSystemPrompt: !hasMultipleSystemPrompts,
                              });
                              const response = getCachedResponse?.(promptId, scoreEntry.modelId);
                              const isWinner = scoreEntry.modelId === criterion.bestModelId;

                              return (
                                <tr key={scoreEntry.modelId} className={cn(
                                  "hover:bg-muted/30",
                                  isWinner && "bg-primary/5"
                                )}>
                                  <td className="px-3 py-2">
                                    <span className="font-medium">{modelLabel}</span>
                                    {isWinner && <span className="ml-2 text-xs text-primary">Winner</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono">
                                    {formatPercentage(scoreEntry.score, 0)}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="font-mono text-[10px]">
                                      <TextualBar score={scoreEntry.score} length={20} />
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    {response && (
                                      <button
                                        onClick={() => setResponseModal({ modelId: scoreEntry.modelId, response })}
                                        className="text-primary hover:underline"
                                      >
                                        view response
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Alternative Paths */}
              {hasMultiplePaths && paths.length > 0 && (
                <div className="space-y-3 mt-6">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase">Alternative Paths</h4>
                  {paths.map((path, idx) => (
                    <div key={path.pathId} className={cn(
                      "border rounded-lg p-3",
                      idx === 0 ? "border-primary/50 bg-primary/5" : "border-border bg-card/50"
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Path {path.pathNumber}</span>
                        {idx === 0 && <span className="text-xs text-primary">Best performing</span>}
                        <span className="text-xs font-mono">{formatPercentage(path.avgScore)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {path.criteria.length} criteria - expand for details
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Response Modal */}
        <Dialog open={!!responseModal} onOpenChange={() => setResponseModal(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>
                Model Response: {responseModal && getModelDisplayLabel(parseModelIdForDisplay(responseModal.modelId))}
              </DialogTitle>
            </DialogHeader>
            {responseModal && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ResponseRenderer content={responseModal.response} renderAs={renderAs} />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // === ENGINEER MODE RENDERER ===
  const renderEngineerMode = () => {
    // Engineer-oriented terminal-style display
    const toggleCriterion = (text: string) => {
      setExpandedCriteria(prev => {
        const next = new Set(prev);
        if (next.has(text)) {
          next.delete(text);
        } else {
          next.add(text);
        }
        return next;
      });
    };

    const togglePath = (pathId: string) => {
      setExpandedPaths(prev => {
        const next = new Set(prev);
        if (next.has(pathId)) {
          next.delete(pathId);
        } else {
          next.add(pathId);
        }
        return next;
      });
    };

    const toggleModelGroup = (key: string) => {
      setExpandedModelGroups(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    };

    const getStatusIndicator = (score: number | null) => {
      if (score === null) return '[?]';
      if (score >= 0.8) return '[✓]';
      if (score >= 0.5) return '[~]';
      return '[✗]';
    };

    const getDetailedAssessment = (modelId: string, criterionText: string) => {
      const detailedEvaluation = getCachedEvaluation?.(promptId, modelId);
      if (!detailedEvaluation || !detailedEvaluation.pointAssessments) return null;
      return detailedEvaluation.pointAssessments.find((a: any) => a.keyPointText === criterionText);
    };

    const renderEngineerCriterion = (criterion: CriterionScore, prefix: string = '├─', isLast: boolean = false) => {
      const isExpanded = expandedCriteria.has(criterion.text);
      const statusIndicator = getStatusIndicator(criterion.avgScore);

      // Group scores by baseId (collapse temp variants)
      const groupedScores = new Map<string, {
        baseId: string;
        displayName: string;
        variants: Array<{ modelId: string; score: number | null; temp: number; sysIdx: number; isInverted?: boolean }>;
      }>();

      criterion.scores.forEach(scoreEntry => {
        const parsed = parseModelIdForDisplay(scoreEntry.modelId);
        const baseId = parsed.baseId;

        if (!groupedScores.has(baseId)) {
          const displayName = getModelDisplayLabel(parsed, {
            hideProvider: true,
            prettifyModelName: true,
            hideTemperature: true,
            hideSystemPrompt: true,
          });
          groupedScores.set(baseId, { baseId, displayName, variants: [] });
        }

        groupedScores.get(baseId)!.variants.push({
          modelId: scoreEntry.modelId,
          score: scoreEntry.score,
          temp: parsed.temperature ?? 0,
          sysIdx: parsed.systemPromptIndex ?? 0,
          isInverted: scoreEntry.isInverted,
        });
      });

      // Sort variants by score (best first)
      groupedScores.forEach(group => {
        group.variants.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      });

      const sortedGroups = Array.from(groupedScores.values()).sort(
        (a, b) => (b.variants[0]?.score ?? 0) - (a.variants[0]?.score ?? 0)
      );

      return (
        <div key={criterion.text} className="font-mono text-xs">
          {/* Criterion header */}
          <div
            className="flex items-center gap-2 cursor-pointer hover:bg-muted/20 py-1 px-1 -mx-1"
            onClick={() => toggleCriterion(criterion.text)}
          >
            <span className="text-muted-foreground">{isLast ? '└─' : prefix}</span>
            <span className={cn(
              "font-bold",
              criterion.avgScore >= 0.8 ? "text-green-600 dark:text-green-400" :
              criterion.avgScore >= 0.5 ? "text-amber-600 dark:text-amber-400" :
              "text-red-600 dark:text-red-400"
            )}>
              {statusIndicator}
            </span>
            <span className="flex-1">{truncateText(criterion.text, 80)}</span>
            <span className="text-muted-foreground">[{isExpanded ? '-' : '+'}]</span>
          </div>

          {/* Expanded models */}
          {isExpanded && (
            <div className="ml-3 border-l border-border/30 pl-3 mt-1 space-y-1">
              {sortedGroups.map((group, groupIdx) => {
                const groupKey = `${criterion.text}::${group.baseId}`;
                const isGroupExpanded = expandedModelGroups.has(groupKey);
                const bestVariant = group.variants[0];
                const hasMultipleVariants = group.variants.length > 1;
                const isWinner = group.variants.some(v => v.modelId === criterion.bestModelId);

                return (
                  <div key={group.baseId} className="space-y-0.5">
                    {/* Model name + best score */}
                    <div className="flex items-center gap-2">
                      <span className="w-28 truncate">{group.displayName}</span>
                      <span className="w-16 text-right">{formatPercentage(bestVariant.score, 0)}</span>
                      <div className="w-20">
                        <TextualBar score={bestVariant.score} length={12} />
                      </div>
                      {bestVariant.isInverted && (
                        <span className="text-purple-600 dark:text-purple-400" title="Inverted">NOT</span>
                      )}
                      {isWinner && <span className="text-primary">WINNER</span>}
                      <button
                        onClick={() => {
                          const response = getCachedResponse?.(promptId, bestVariant.modelId);
                          if (response) {
                            setInlineModal({ type: 'response', modelId: bestVariant.modelId, content: response });
                          }
                        }}
                        className="text-primary hover:underline"
                      >
                        [resp]
                      </button>
                      <button
                        onClick={() => {
                          const assessment = getDetailedAssessment(bestVariant.modelId, criterion.text);
                          const judgeText = assessment?.individualJudgements?.[0]?.reflection || assessment?.reflection;
                          if (judgeText) {
                            setInlineModal({
                              type: 'judge',
                              modelId: bestVariant.modelId,
                              content: judgeText,
                              criterionText: criterion.text
                            });
                          }
                        }}
                        className="text-primary hover:underline"
                      >
                        [judge]
                      </button>
                      {hasMultipleVariants && (
                        <button
                          onClick={() => toggleModelGroup(groupKey)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          [{group.variants.length} variants {isGroupExpanded ? '-' : '+'}]
                        </button>
                      )}
                    </div>

                    {/* Expanded variants */}
                    {isGroupExpanded && hasMultipleVariants && (
                      <div className="ml-4 border-l border-border/20 pl-2 space-y-0.5 text-muted-foreground">
                        {group.variants.map((variant, vIdx) => (
                          <div key={variant.modelId} className="flex items-center gap-2">
                            <span className="w-16 text-xs">
                              sys:{variant.sysIdx}/t{variant.temp}
                            </span>
                            <span className="w-16 text-right">{formatPercentage(variant.score, 0)}</span>
                            <div className="w-20">
                              <TextualBar score={variant.score} length={12} />
                            </div>
                            <button
                              onClick={() => {
                                const response = getCachedResponse?.(promptId, variant.modelId);
                                if (response) {
                                  setInlineModal({ type: 'response', modelId: variant.modelId, content: response });
                                }
                              }}
                              className="text-primary hover:underline text-xs"
                            >
                              [resp]
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="bg-black/5 dark:bg-black/20 border-t border-border font-mono">
        <div className="p-3 space-y-3 text-xs">
          {/* Prompt (terminal style) */}
          <div className="border border-border/50 p-2 bg-muted/20">
            <div className="text-muted-foreground mb-1">$ scenario --show-prompt</div>
            <div className="text-foreground">{promptText}</div>
          </div>

          {/* Loading State */}
          {isLoadingEvaluations ? (
            <div className="text-center py-4 text-muted-foreground">
              Loading evaluation data...
            </div>
          ) : (
            <>
              {/* Criteria Breakdown */}
              <div className="border border-border/50 p-2 bg-muted/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-muted-foreground">┌─ CRITERION BREAKDOWN</div>
                  {hasMultiplePaths && (
                    <div className="text-muted-foreground">
                      ({paths.length} alternative paths detected)
                    </div>
                  )}
                </div>

                {/* Required Criteria */}
                {requiredCriteria.length > 0 && (
                  <div className="space-y-1">
                    {!hasMultiplePaths ? (
                      requiredCriteria.map((criterion, idx) =>
                        renderEngineerCriterion(criterion, '├─', idx === requiredCriteria.length - 1)
                      )
                    ) : (
                      <>
                        <div className="text-muted-foreground mb-1">├─ REQUIRED (all paths must satisfy):</div>
                        <div className="ml-3">
                          {requiredCriteria.map((criterion, idx) =>
                            renderEngineerCriterion(criterion, '  ├─', idx === requiredCriteria.length - 1)
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Alternative Paths */}
                {hasMultiplePaths && paths.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {paths.map((path, pathIdx) => {
                      const isPathExpanded = expandedPaths.has(path.pathId);
                      const isBestPath = pathIdx === 0;

                      return (
                        <div key={path.pathId} className="space-y-1">
                          <div
                            className={cn(
                              "flex items-center gap-2 cursor-pointer hover:bg-muted/20 py-1 px-1 -mx-1",
                              isBestPath && "text-primary"
                            )}
                            onClick={() => togglePath(path.pathId)}
                          >
                            <span className="text-muted-foreground">│</span>
                            <span className="font-bold">
                              PATH_{path.pathNumber - 1}: {isBestPath && '★ '}
                            </span>
                            <span className="flex-1 text-muted-foreground">
                              (chosen by {path.criteria[0]?.scores.length || 0} models)
                            </span>
                            <span>avg:{formatPercentage(path.avgScore)}</span>
                            <span className="text-muted-foreground">[{isPathExpanded ? '-' : '+'}]</span>
                          </div>

                          {isPathExpanded && (
                            <div className="ml-3 border-l border-border/30 pl-3 space-y-1">
                              {path.criteria.map((criterion, critIdx) =>
                                renderEngineerCriterion(
                                  criterion,
                                  '  ├─',
                                  critIdx === path.criteria.length - 1
                                )
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="text-muted-foreground mt-2">└─ END CRITERIA</div>
              </div>

              {/* Legend */}
              <div className="border border-border/50 p-2 bg-muted/10 text-[10px] text-muted-foreground">
                <div className="mb-1">LEGEND:</div>
                <div className="space-y-0.5 ml-2">
                  <div>[✓] passed (≥80%) · [~] partial (50-79%) · [✗] failed (&lt;50%) · [?] no data</div>
                  <div>[+] expand section · [-] collapse section · [resp] view response · [judge] view reasoning</div>
                  <div>★ = best performing path · WINNER = highest score for criterion</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Inline Modal for Responses/Judge Reasoning */}
        <Dialog open={!!inlineModal} onOpenChange={() => setInlineModal(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto font-mono">
            <DialogHeader>
              <DialogTitle className="font-mono text-sm">
                {inlineModal?.type === 'response' ? (
                  `┌─ MODEL RESPONSE: ${getModelDisplayLabel(parseModelIdForDisplay(inlineModal.modelId))}`
                ) : (
                  `┌─ JUDGE REASONING`
                )}
              </DialogTitle>
            </DialogHeader>
            {inlineModal && (
              <div className="space-y-2">
                {inlineModal.type === 'judge' && inlineModal.criterionText && (
                  <div className="text-xs text-muted-foreground border-l-2 border-border pl-2">
                    <span className="font-bold">Criterion:</span> {inlineModal.criterionText}
                    <br />
                    <span className="font-bold">Model:</span> {getModelDisplayLabel(parseModelIdForDisplay(inlineModal.modelId))}
                  </div>
                )}
                <div className={cn(
                  "text-xs border border-border/50 p-3 rounded bg-muted/10",
                  inlineModal.type === 'response' && "prose prose-xs dark:prose-invert max-w-none"
                )}>
                  {inlineModal.type === 'response' ? (
                    <ResponseRenderer content={inlineModal.content} renderAs={renderAs} />
                  ) : (
                    <div className="whitespace-pre-wrap">{inlineModal.content}</div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(inlineModal.content);
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setInlineModal(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // Mode router - delegate to appropriate render function
  if (displayMode === 'compact') {
    return renderCompactMode();
  }

  if (displayMode === 'table') {
    return renderTableMode();
  }

  if (displayMode === 'engineer') {
    return renderEngineerMode();
  }

  // Default: Detailed mode (original view)
  return (
    <div className="bg-muted/20 border-t-2 border-primary/30">
      <div className="p-6 space-y-6">
        {/* Prompt Context */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-500 p-4 rounded-r-lg">
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-2">
            Test Scenario
          </div>
          <div className="text-base leading-relaxed text-foreground">
            {promptText}
          </div>
        </div>

        {/* Required Criteria */}
        {isLoadingEvaluations ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <Icon name="loader-2" className="h-6 w-6 animate-spin text-primary mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">Loading evaluation criteria...</div>
          </div>
        ) : requiredCriteria.length > 0 ? (
          <div>
            <h4 className="text-sm font-bold font-mono text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Icon name="check-circle-2" className="w-4 h-4" />
              {hasMultiplePaths ? 'Required Criteria (all paths)' : 'Evaluation Criteria'}
            </h4>
            <div className="bg-card border border-border rounded-lg p-4">
              {requiredCriteria.map(criterion => renderCriterion(criterion))}
            </div>
          </div>
        ) : !hasMultiplePaths ? (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Icon name="alert-triangle" className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900 dark:text-amber-200">
                <div className="font-semibold mb-1">No evaluation criteria found</div>
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  This scenario may have missing or incomplete assessment data.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Alternative Paths */}
        {!isLoadingEvaluations && hasMultiplePaths && paths.length > 0 && (
          <div>
            <h4 className="text-sm font-bold font-mono text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Icon name="git-branch" className="w-4 h-4" />
              Alternative Evaluation Paths
            </h4>
            <div className="text-xs text-muted-foreground mb-3">
              This scenario can be evaluated using different paths. Each path has its own criteria.
            </div>
            <div className="space-y-3">
              {paths.map((path, pathIdx) => (
                <div
                  key={path.pathId}
                  className={cn(
                    'bg-card border rounded-lg p-4',
                    pathIdx === 0 ? 'border-primary/50 shadow-sm' : 'border-border'
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">Path {path.pathNumber}</span>
                      {pathIdx === 0 && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full border border-primary/20">
                          ⭐ Best performing
                        </span>
                      )}
                    </div>
                    <div className="text-sm">
                      Avg: <span className="font-bold font-mono">{formatPercentage(path.avgScore)}</span>
                    </div>
                  </div>
                  {path.criteria.map(criterion => renderCriterion(criterion, true))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
