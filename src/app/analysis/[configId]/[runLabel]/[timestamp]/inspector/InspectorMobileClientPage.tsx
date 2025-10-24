'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { parseModelIdForDisplay, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { TextualBar } from './components/TextualBar';
import { formatPercentage, truncateText } from './utils/textualUtils';
import { cn } from '@/lib/utils';
import { createClientLogger } from '@/app/utils/clientLogger';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import CIPLogo from '@/components/icons/CIPLogo';
import Link from 'next/link';
import Icon from '@/components/ui/icon';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import { StructuredSummary } from '@/app/analysis/components/StructuredSummary';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { prettifyTag, normalizeTag } from '@/app/utils/tagUtils';

const debug = createClientLogger('InspectorMobileClientPage');

export const InspectorMobileClientPage: React.FC = () => {
  const {
    data,
    loading,
    error,
    displayedModels,
    promptTextsForMacroTable,
  } = useAnalysis();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Extract coverage scores from data
  const allCoverageScores = data?.evaluationResults?.llmCoverageScores;

  // Get models without IDEAL
  const models = useMemo(() => {
    return displayedModels.filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase());
  }, [displayedModels]);

  // Detect if we have multiple system prompts
  const hasMultipleSystemPrompts = useMemo(() => {
    if (!data?.config) return false;
    const systems = data.config.systems || (data.config.system ? [data.config.system] : []);
    return systems.length > 1;
  }, [data?.config]);

  // Derive state from URL
  const showExecutiveSummary = searchParams.get('view') === 'summary';
  const selectedScenario = showExecutiveSummary ? null : searchParams.get('scenario');
  const selectedModels = useMemo(() => {
    const modelsParam = searchParams.get('models');
    return modelsParam ? modelsParam.split(',').filter(Boolean) : [];
  }, [searchParams]);

  // Calculate scenario stats
  const scenarioStats = useMemo(() => {
    if (!data) return [];
    const { promptIds } = data;

    try {
      return promptIds.map((promptId, index) => {
        const promptText = promptTextsForMacroTable[promptId] || promptId;

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
  }, [data, promptTextsForMacroTable, models, allCoverageScores]);

  // Helper to build URL (memoized)
  const buildUrl = useCallback((params: URLSearchParams) => {
    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [pathname]);

  // Navigation functions with instant UI feedback (memoized to prevent re-renders)
  const navigateToExecutiveSummary = useCallback(() => {
    const params = new URLSearchParams();
    params.set('view', 'summary');
    router.replace(buildUrl(params), { scroll: false });
  }, [router, buildUrl]);

  const navigateToScenario = useCallback((promptId: string) => {
    const params = new URLSearchParams();
    params.set('scenario', promptId);
    router.replace(buildUrl(params), { scroll: false });
  }, [router, buildUrl]);

  const navigateToComparison = useCallback((promptId: string, modelIds: string[]) => {
    const params = new URLSearchParams();
    params.set('scenario', promptId);
    if (modelIds.length > 0) {
      params.set('models', modelIds.join(','));
    }
    router.replace(buildUrl(params), { scroll: false });
  }, [router, buildUrl]);

  // Smart back navigation - always go to logical parent, not browser back
  const navigateBackToScenarios = useCallback(() => {
    const params = new URLSearchParams();
    // Clear all params to show scenarios list
    router.replace(buildUrl(params), { scroll: false });
  }, [router, buildUrl]);

  const navigateBackToModels = useCallback((promptId: string) => {
    const params = new URLSearchParams();
    params.set('scenario', promptId);
    // Keep scenario but clear models
    router.replace(buildUrl(params), { scroll: false });
  }, [router, buildUrl]);

  // Determine which screen to show
  const currentScreen = useMemo(() => {
    if (showExecutiveSummary) return 'executive-summary';
    if (selectedScenario && selectedModels.length > 0) return 'comparison';
    if (selectedScenario) return 'models';
    return 'scenarios';
  }, [showExecutiveSummary, selectedScenario, selectedModels]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading evaluation data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-destructive mb-2">Error loading data</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { config } = data;

  return (
    <div className="h-screen flex flex-col bg-background font-mono">
      {/* Top bar - Compact on mobile */}
      <div className="border-b border-border px-3 py-2 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CIPLogo className="w-5 h-5 text-foreground flex-shrink-0" />
            <Link href="/">
              <h2 className="text-base font-bold text-foreground">
                <span style={{ fontWeight: 700 }}>w</span>
                <span style={{ fontWeight: 200 }}>eval</span>
              </h2>
            </Link>
            <div className="h-6 w-px bg-border flex-shrink-0" />
            <h1 className="text-sm font-bold tracking-tight truncate" title={config.title || config.configTitle || config.id || 'Unknown config'}>
              {config.title || config.configTitle || config.id || 'Unknown config'}
            </h1>
          </div>
        </div>
      </div>

      {/* Main content - Full screen based on current screen */}
      <div className="flex-1 overflow-hidden">
        <ErrorBoundary>
          {currentScreen === 'scenarios' && (
            <ScenariosScreen
              scenarios={scenarioStats}
              executiveSummary={data.executiveSummary}
              onSelectScenario={navigateToScenario}
              onSelectExecutiveSummary={navigateToExecutiveSummary}
            />
          )}

          {currentScreen === 'models' && selectedScenario && (
            <ModelsScreen
              promptId={selectedScenario}
              promptText={promptTextsForMacroTable[selectedScenario]}
              models={models}
              allCoverageScores={allCoverageScores}
              selectedModels={selectedModels}
              onBack={navigateBackToScenarios}
              onSelectModels={(modelIds) => navigateToComparison(selectedScenario, modelIds)}
              hasMultipleSystemPrompts={hasMultipleSystemPrompts}
            />
          )}

          {currentScreen === 'comparison' && selectedScenario && selectedModels.length > 0 && (
            <ComparisonScreen
              promptId={selectedScenario}
              modelIds={selectedModels}
              onBack={() => navigateBackToModels(selectedScenario)}
            />
          )}

          {currentScreen === 'executive-summary' && data.executiveSummary && (
            <ExecutiveSummaryScreen
              executiveSummary={data.executiveSummary}
              config={config}
              onBack={navigateBackToScenarios}
            />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
};

// Screen 1: Scenarios List
interface ScenariosScreenProps {
  scenarios: Array<{ promptId: string; promptText: string; index: number; avgScore: number }>;
  executiveSummary: any;
  onSelectScenario: (promptId: string) => void;
  onSelectExecutiveSummary: () => void;
}

const ScenariosScreen = React.memo<ScenariosScreenProps>(function ScenariosScreen({
  scenarios,
  executiveSummary,
  onSelectScenario,
  onSelectExecutiveSummary,
}) {
  return (
    <div className="h-full overflow-auto p-4" style={{ touchAction: 'pan-y pinch-zoom' }}>
      <div className="space-y-1">
        <h2 className="text-lg font-bold mb-3">Select Scenario</h2>

        {/* Executive Summary Option */}
        {executiveSummary && (
          <button
            onClick={onSelectExecutiveSummary}
            className="w-full text-left px-4 py-4 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 active:bg-muted/70 transition-colors touch-manipulation"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">Executive Summary</span>
              <Icon name="chevron-right" className="w-5 h-5 text-muted-foreground" />
            </div>
          </button>
        )}

        {/* Scenario List */}
        {scenarios.map((scenario) => {
          const score = scenario.avgScore;
          const hasScore = score > 0;
          const scoreColor = hasScore && score >= 0.8
            ? 'text-green-600 dark:text-green-400'
            : hasScore && score >= 0.5
            ? 'text-amber-600 dark:text-amber-400'
            : hasScore
            ? 'text-red-600 dark:text-red-400'
            : 'text-muted-foreground';

          return (
            <button
              key={scenario.promptId}
              onClick={() => onSelectScenario(scenario.promptId)}
              className="w-full text-left px-4 py-4 rounded-lg border border-border hover:bg-muted/30 active:bg-muted/50 transition-colors touch-manipulation"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-muted-foreground text-xs font-mono">
                        {String(scenario.index + 1).padStart(2, '0')}
                      </span>
                      {hasScore && (
                        <span className={cn("text-sm font-mono font-bold", scoreColor)}>
                          {formatPercentage(score, 0)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium break-words">
                      {scenario.promptText}
                    </p>
                  </div>
                  <Icon name="chevron-right" className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
                {hasScore && (
                  <div className="h-2">
                    <TextualBar score={score} length={24} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

// Screen 2: Models List
interface ModelsScreenProps {
  promptId: string;
  promptText: string;
  models: string[];
  allCoverageScores: any;
  selectedModels: string[];
  onBack: () => void;
  onSelectModels: (modelIds: string[]) => void;
  hasMultipleSystemPrompts: boolean;
}

const ModelsScreen = React.memo<ModelsScreenProps>(function ModelsScreen({
  promptId,
  promptText,
  models,
  allCoverageScores,
  selectedModels,
  onBack,
  onSelectModels,
  hasMultipleSystemPrompts,
}) {
  const [localSelectedModels, setLocalSelectedModels] = useState<Set<string>>(
    new Set(selectedModels)
  );
  const backButtonRef = React.useRef<HTMLButtonElement>(null);

  // Focus back button on mount for accessibility
  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

  // Group models by baseId
  const baseModels = useMemo(() => {
    const baseModelMap = new Map<string, {
      baseId: string;
      displayName: string;
      variants: string[];
      avgScore: number | null;
    }>();

    models.forEach(modelId => {
      const parsed = parseModelIdForDisplay(modelId);
      const baseId = parsed.baseId;

      if (!baseModelMap.has(baseId)) {
        const displayName = getModelDisplayLabel(parsed, {
          hideProvider: true,
          prettifyModelName: true,
          hideTemperature: true,
          hideSystemPrompt: !hasMultipleSystemPrompts,
        });
        baseModelMap.set(baseId, {
          baseId,
          displayName,
          variants: [],
          avgScore: null,
        });
      }

      const baseModel = baseModelMap.get(baseId)!;
      baseModel.variants.push(modelId);
    });

    // Calculate average scores
    baseModelMap.forEach(baseModel => {
      const scores = baseModel.variants.map(variantId => {
        const result = allCoverageScores?.[promptId]?.[variantId];
        return result && !('error' in result) ? result.avgCoverageExtent : null;
      }).filter((s): s is number => s !== null);

      baseModel.avgScore = scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : null;
    });

    // Sort by score
    return Array.from(baseModelMap.values()).sort((a, b) => {
      if (a.avgScore !== null && b.avgScore !== null) {
        return b.avgScore - a.avgScore;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }, [models, promptId, allCoverageScores, hasMultipleSystemPrompts]);

  const toggleModel = (baseId: string, variants: string[]) => {
    setLocalSelectedModels(prev => {
      const next = new Set(prev);
      const allSelected = variants.every(v => next.has(v));

      if (allSelected) {
        // Remove all variants
        variants.forEach(v => next.delete(v));
      } else {
        // Add all variants
        variants.forEach(v => next.add(v));
      }

      return next;
    });
  };

  const handleViewComparison = () => {
    onSelectModels(Array.from(localSelectedModels));
  };

  const selectedCount = localSelectedModels.size;

  return (
    <div className="h-full flex flex-col">
      {/* Header with back button */}
      <div className="border-b border-border px-4 py-3 flex-shrink-0">
        <button
          ref={backButtonRef}
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2 touch-manipulation p-1 -ml-1"
          aria-label="Back to Scenarios"
        >
          <Icon name="chevron-left" className="w-4 h-4" />
          <span>Back to Scenarios</span>
        </button>
        <h2 className="text-base font-bold truncate">{promptText}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Select models to compare ({selectedCount} selected)
        </p>
      </div>

      {/* Models list */}
      <div className="flex-1 overflow-auto p-4" style={{ touchAction: 'pan-y pinch-zoom' }}>
        <div className="space-y-2">
          {baseModels.map((baseModel) => {
            const allSelected = baseModel.variants.every(v => localSelectedModels.has(v));
            const score = baseModel.avgScore;
            const hasScore = score !== null;
            const scoreColor = hasScore && score >= 0.8
              ? 'text-green-600 dark:text-green-400'
              : hasScore && score >= 0.5
              ? 'text-amber-600 dark:text-amber-400'
              : hasScore
              ? 'text-red-600 dark:text-red-400'
              : 'text-muted-foreground';

            return (
              <button
                key={baseModel.baseId}
                onClick={() => toggleModel(baseModel.baseId, baseModel.variants)}
                className={cn(
                  "w-full text-left px-4 py-4 rounded-lg border transition-colors touch-manipulation",
                  allSelected
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/30 active:bg-muted/50"
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={cn("text-xl flex-shrink-0", allSelected && "text-primary")}>
                        {allSelected ? '☑' : '☐'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium break-words">
                          {baseModel.displayName}
                          {baseModel.variants.length > 1 && (
                            <span className="text-muted-foreground ml-1 text-xs">
                              ({baseModel.variants.length} variants)
                            </span>
                          )}
                        </p>
                        {hasScore && (
                          <span className={cn("text-sm font-mono font-bold mt-1 inline-block", scoreColor)}>
                            {formatPercentage(score, 0)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {hasScore && (
                    <div className="h-2 ml-8">
                      <TextualBar score={score} length={20} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom action button */}
      {selectedCount > 0 && (
        <div className="border-t border-border px-4 py-3 flex-shrink-0 bg-background">
          <button
            onClick={handleViewComparison}
            className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium touch-manipulation hover:bg-primary/90 active:bg-primary/80 transition-colors"
          >
            View Comparison ({selectedCount} {selectedCount === 1 ? 'model' : 'models'})
          </button>
        </div>
      )}
    </div>
  );
});

// Screen 3: Comparison View - Mobile-optimized stacked cards
interface ComparisonScreenProps {
  promptId: string;
  modelIds: string[];
  onBack: () => void;
}

const ComparisonScreen = React.memo<ComparisonScreenProps>(function ComparisonScreen({
  promptId,
  modelIds,
  onBack,
}) {
  const {
    promptTextsForMacroTable,
    getCachedResponse,
    getCachedEvaluation,
    fetchModalResponse,
    fetchEvaluationDetails,
    isLoadingResponse,
    data,
  } = useAnalysis();

  const promptText = promptTextsForMacroTable[promptId] || promptId;
  const config = data?.config;
  const allCoverageScores = data?.evaluationResults?.llmCoverageScores;
  const backButtonRef = React.useRef<HTMLButtonElement>(null);

  // Track which models we've attempted to fetch (prevents flashing)
  const [fetchAttempted, setFetchAttempted] = useState<Set<string>>(new Set());

  // Track which model cards have expanded criteria (lifted from render)
  const [expandedCriteriaByModel, setExpandedCriteriaByModel] = useState<Set<string>>(new Set());

  // Focus back button on mount for accessibility
  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

  // Batch fetch data on mount
  useEffect(() => {
    const newAttempts = new Set<string>();

    modelIds.forEach(modelId => {
      if (!getCachedResponse?.(promptId, modelId)) {
        fetchModalResponse?.(promptId, modelId);
        newAttempts.add(`response-${modelId}`);
      }
      if (!getCachedEvaluation?.(promptId, modelId)) {
        fetchEvaluationDetails?.(promptId, modelId);
        newAttempts.add(`eval-${modelId}`);
      }
    });

    if (newAttempts.size > 0) {
      setFetchAttempted(prev => new Set([...prev, ...newAttempts]));
    }
  }, [promptId, modelIds, getCachedResponse, getCachedEvaluation, fetchModalResponse, fetchEvaluationDetails]);

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border px-4 py-3 flex-shrink-0">
        <button
          ref={backButtonRef}
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground touch-manipulation p-1 -ml-1"
          aria-label="Back to Models"
        >
          <Icon name="chevron-left" className="w-4 h-4" />
          <span>Back to Models</span>
        </button>
        <h2 className="text-sm font-bold mt-2 truncate">{promptText}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Comparing {modelIds.length} {modelIds.length === 1 ? 'model' : 'models'}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4" style={{ touchAction: 'pan-y pinch-zoom' }}>
        <div className="space-y-4">
          {modelIds.map(modelId => {
            const parsed = parseModelIdForDisplay(modelId);
            const modelLabel = getModelDisplayLabel(parsed, {
              hideProvider: false,
              prettifyModelName: true,
              hideTemperature: false,
              hideSystemPrompt: false,
            });

            const result = allCoverageScores?.[promptId]?.[modelId];
            const hasScore = result && !('error' in result) && typeof result.avgCoverageExtent === 'number';
            const score: number | null = (hasScore && typeof result.avgCoverageExtent === 'number') ? result.avgCoverageExtent : null;

            const response = getCachedResponse?.(promptId, modelId);
            const loading = isLoadingResponse(promptId, modelId);
            const evaluation = getCachedEvaluation?.(promptId, modelId);

            // Determine if we should show loading state
            const hasFetchedResponse = response || !fetchAttempted.has(`response-${modelId}`);
            const isLoadingOrPending = loading || (!response && !hasFetchedResponse);

            return (
              <div key={modelId} className="border border-border rounded-lg p-4 space-y-3">
                {/* Model header */}
                <div>
                  <h3 className="font-bold text-sm">{modelLabel}</h3>
                  {hasScore && score !== null && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="font-mono text-base font-bold">
                        {formatPercentage(score, 0)}
                      </span>
                      <div className="flex-1">
                        <TextualBar score={score} length={16} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Response */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">RESPONSE</div>
                  <div className="border border-border rounded p-2 bg-muted/20 max-h-48 overflow-auto text-xs">
                    {isLoadingOrPending ? (
                      // Show skeleton while loading or before fetch completes
                      <div className="animate-pulse space-y-2">
                        <div className="h-2 bg-muted rounded w-full"></div>
                        <div className="h-2 bg-muted rounded w-5/6"></div>
                        <div className="h-2 bg-muted rounded w-4/6"></div>
                      </div>
                    ) : response ? (
                      // Show response if we have data
                      <ResponseRenderer content={response} renderAs="markdown" />
                    ) : (
                      // Only show subtle error if loading completed and no data
                      <div className="flex items-center gap-2 text-muted-foreground/60 text-xs italic">
                        <Icon name="alert-circle" className="w-3.5 h-3.5" />
                        <p>Response unavailable</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Evaluation summary */}
                {evaluation?.pointAssessments && (() => {
                  const isExpanded = expandedCriteriaByModel.has(modelId);
                  const criteriaToShow = isExpanded
                    ? evaluation.pointAssessments
                    : evaluation.pointAssessments.slice(0, 5);
                  const hasMore = evaluation.pointAssessments.length > 5;

                  const toggleExpanded = () => {
                    setExpandedCriteriaByModel(prev => {
                      const next = new Set(prev);
                      if (next.has(modelId)) {
                        next.delete(modelId);
                      } else {
                        next.add(modelId);
                      }
                      return next;
                    });
                  };

                  return (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                        CRITERIA ({evaluation.pointAssessments.length})
                      </div>
                      <div className="space-y-1">
                        {criteriaToShow.map((assessment: any, idx: number) => {
                          const criterionScore = assessment.coverageExtent ?? 0;
                          const statusIcon = criterionScore >= 0.8 ? '✓' : criterionScore >= 0.5 ? '~' : '✗';
                          const statusColor = criterionScore >= 0.8
                            ? 'text-green-600 dark:text-green-400'
                            : criterionScore >= 0.5
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400';

                          return (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <span className={cn("font-bold", statusColor)}>{statusIcon}</span>
                              <span className="flex-1 truncate">{truncateText(assessment.keyPointText, 40)}</span>
                              <span className={cn("font-mono font-bold", statusColor)}>
                                {formatPercentage(criterionScore, 0)}
                              </span>
                            </div>
                          );
                        })}
                        {hasMore && (
                          <button
                            onClick={toggleExpanded}
                            className="text-xs text-primary hover:text-primary/80 font-medium italic w-full text-left py-1 touch-manipulation active:text-primary/60"
                          >
                            {isExpanded ? (
                              'Show less'
                            ) : (
                              `+${evaluation.pointAssessments.length - 5} more criteria...`
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// Screen 4: Executive Summary
interface ExecutiveSummaryScreenProps {
  executiveSummary: any;
  config: any;
  onBack: () => void;
}

const ExecutiveSummaryScreen = React.memo<ExecutiveSummaryScreenProps>(function ExecutiveSummaryScreen({
  executiveSummary,
  config,
  onBack,
}) {
  const backButtonRef = React.useRef<HTMLButtonElement>(null);

  // Focus back button on mount for accessibility
  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

  // Check for structured data
  const hasStructured = executiveSummary &&
    typeof executiveSummary === 'object' &&
    'isStructured' in executiveSummary &&
    executiveSummary.isStructured &&
    executiveSummary.structured;

  // Handle different executive summary formats for fallback
  let content: string;
  if (typeof executiveSummary === 'string') {
    content = executiveSummary;
  } else if (executiveSummary && typeof executiveSummary === 'object' && 'content' in executiveSummary) {
    content = executiveSummary.content;
  } else {
    content = 'No executive summary available.';
  }

  const hasDescription = config?.description && config.description.trim() !== '';
  const tags = config?.tags || [];
  const author = config?.author;
  const references = (config as any)?.references;

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border px-4 py-3 flex-shrink-0">
        <button
          ref={backButtonRef}
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground touch-manipulation p-1 -ml-1"
          aria-label="Back to Scenarios"
        >
          <Icon name="chevron-left" className="w-4 h-4" />
          <span>Back to Scenarios</span>
        </button>
        <h2 className="text-base font-bold mt-2">Executive Summary</h2>
      </div>
      <div className="flex-1 overflow-auto p-4" style={{ touchAction: 'pan-y pinch-zoom' }}>
        <div className="space-y-4">
          {/* Metadata section */}
          {(hasDescription || tags.length > 0 || author || (references && references.length > 0)) && (
            <div className="space-y-3 bg-muted/50 dark:bg-slate-900/40 p-3 rounded-lg text-sm">
              {/* Description */}
              {hasDescription && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ResponseRenderer content={config.description} />
                </div>
              )}

              {/* Author */}
              {author && (
                <div>
                  {(() => {
                    const a: any = author;
                    const name: string = typeof a === 'string' ? a : a.name;
                    const url: string | undefined = typeof a === 'string' ? undefined : a.url;
                    const imageUrl: string | undefined = typeof a === 'string' ? undefined : a.image_url;
                    const content = (
                      <span className="text-xs text-foreground">
                        {imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrl} alt={name} className="h-4 w-4 rounded-full border border-border inline mr-1 align-text-bottom" />
                        ) : (
                          <Icon name="user" className="w-3 h-3 text-foreground inline mr-1 align-text-bottom" />
                        )}
                        By: <span className="font-bold">{name}</span>
                      </span>
                    );
                    return (
                      <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-1 border border-border/60" title="Blueprint author">
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {content}
                          </a>
                        ) : content}
                      </span>
                    );
                  })()}
                </div>
              )}

              {/* References */}
              {references && Array.isArray(references) && references.length > 0 && (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center text-xs text-foreground mr-1">
                      <Icon name="book-open" className="w-3 h-3 text-foreground inline mr-1 align-text-bottom" />
                      <span>Reference{references.length > 1 ? 's' : ''}:</span>
                    </div>
                    {references.map((r: any, index: number) => {
                      const title: string = typeof r === 'string' ? r : (r.title || r.name);
                      const url: string | undefined = typeof r === 'string' ? undefined : r.url;
                      const maxLength = 35;
                      const displayTitle = title.length > maxLength ? `${title.substring(0, maxLength)}...` : title;
                      const content = (
                        <span className="font-bold text-xs">{displayTitle}</span>
                      );
                      return (
                        <span key={index} className="inline-flex items-center rounded-full bg-muted/60 px-2 py-1 border border-border/60">
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {content}
                            </a>
                          ) : content}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tags */}
              {tags && tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                  <span className="text-[10px] font-semibold text-muted-foreground">TAGS:</span>
                  {tags.map((tag: string) => (
                    <Link href={`/tags/${normalizeTag(tag)}`} key={tag}>
                      <Badge variant="secondary" className="hover:bg-primary/20 transition-colors text-[10px]">
                        {prettifyTag(tag)}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Executive summary content */}
          <div className="prose prose-sm max-w-none dark:prose-invert font-mono text-sm">
            {hasStructured ? (
              <StructuredSummary insights={executiveSummary.structured} disableModelLinks={true} />
            ) : (
              <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
