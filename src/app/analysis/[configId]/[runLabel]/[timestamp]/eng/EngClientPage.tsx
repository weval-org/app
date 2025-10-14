'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { parseModelIdForDisplay, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { TextualBar } from '../textual/components/TextualBar';
import { formatPercentage, truncateText } from '../textual/utils/textualUtils';
import { cn } from '@/lib/utils';
import ResponseRenderer, { RenderAsType } from '@/app/components/ResponseRenderer';
import { StructuredSummary } from '@/app/analysis/components/StructuredSummary';

// Path colors matching MacroCoverageTable
const PATH_COLORS = [
  '#3b82f6', // blue
  '#a855f7', // purple
  '#22c55e', // green
  '#f97316', // orange
  '#ec4899', // pink
];

// Smart formatter for criterion text (handles function-style assertions)
function formatCriterionText(text: string): { display: string; full: string; isFunction: boolean; isTruncated: boolean } {
  // Check if it's a function-style criterion like "Function: imatches(...)"
  const functionMatch = text.match(/^Function:\s*(\w+)\((.*)\)$/);

  if (functionMatch) {
    const [, fnName, args] = functionMatch;

    // Try to intelligently truncate long arguments
    let displayArgs = args;
    let wasTruncated = false;

    if (args.length > 50) {
      wasTruncated = true;
      try {
        // Try to parse as JSON and extract key info
        const parsed = JSON.parse(args);
        if (typeof parsed === 'string') {
          // For regex patterns, show first and last part
          if (parsed.length > 40) {
            const start = parsed.substring(0, 20);
            const end = parsed.substring(parsed.length - 15);
            displayArgs = `"${start}...${end}"`;
          } else {
            displayArgs = JSON.stringify(parsed);
          }
        } else {
          displayArgs = '...';
        }
      } catch {
        displayArgs = '...';
      }
    }

    return {
      display: `${fnName}(${displayArgs})`,
      full: text,
      isFunction: true,
      isTruncated: wasTruncated
    };
  }

  // Not a function, return as-is (but truncate if very long)
  const needsTruncation = text.length > 100;
  return {
    display: needsTruncation ? text.substring(0, 97) + '...' : text,
    full: text,
    isFunction: false,
    isTruncated: needsTruncation
  };
}

// Component to render criterion with tooltip for full text
const CriterionText: React.FC<{ text: string }> = ({ text }) => {
  const formatted = formatCriterionText(text);
  const [expanded, setExpanded] = useState(false);

  if (formatted.isFunction) {
    return (
      <div className="space-y-1">
        <div className="flex items-start gap-1.5">
          <code className="text-xs font-mono text-primary break-words whitespace-pre-wrap">
            {expanded ? formatted.full.replace('Function: ', '') : formatted.display}
          </code>
          {formatted.isTruncated && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-muted-foreground hover:text-foreground font-mono flex-shrink-0 mt-0.5"
            >
              {expanded ? '[-]' : '[+]'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return <div className="font-medium break-words">{formatted.display}</div>;
};

export const EngClientPage: React.FC = () => {
  const {
    data,
    loading,
    error,
    displayedModels,
    promptTextsForMacroTable,
    getCachedResponse,
    getCachedEvaluation,
    fetchModalResponse,
    fetchEvaluationDetails,
  } = useAnalysis();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Monitor URL changes to see when browser actually updates
  useEffect(() => {
    console.log('[URL CHANGE] Browser URL updated', {
      url: window.location.href,
      timestamp: performance.now()
    });
  }, [searchParams]);

  // Extract timestamp from pathname
  const timestamp = useMemo(() => {
    // pathname format: /analysis/[configId]/[runLabel]/[timestamp]/eng
    const parts = pathname.split('/');
    const timestampStr = parts[parts.length - 2]; // Second to last segment
    if (!timestampStr) return null;

    // Convert timestamp format: 2025-10-14T00-30-41-094Z -> 2025-10-14T00:30:41.094Z
    const isoTimestamp = timestampStr
      .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z');

    try {
      const date = new Date(isoTimestamp);
      // Format as: "Oct 14, 2025 at 12:30 AM"
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return null;
    }
  }, [pathname]);

  // Derive all state from URL (single source of truth)
  const showExecutiveSummary = searchParams.get('view') === 'summary';
  const selectedScenario = showExecutiveSummary ? null : searchParams.get('scenario');
  const comparisonItems = useMemo(() => {
    const scenario = searchParams.get('scenario');
    const modelsParam = searchParams.get('models');
    if (scenario && modelsParam) {
      const modelIds = modelsParam.split(',').filter(Boolean);
      return modelIds.map(modelId => `${scenario}::${modelId}`);
    }
    return [];
  }, [searchParams]);

  // Get models without IDEAL
  const models = useMemo(() => {
    return displayedModels.filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase());
  }, [displayedModels]);

  // Helper to build URL with params
  const buildUrl = (params: URLSearchParams) => {
    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  };

  // Select executive summary
  const selectExecutiveSummary = () => {
    console.log('[selectExecutiveSummary] START', { timestamp: performance.now() });
    const params = new URLSearchParams();
    params.set('view', 'summary');
    const newUrl = buildUrl(params);
    console.log('[selectExecutiveSummary] Calling router.replace', { newUrl, timestamp: performance.now() });
    router.replace(newUrl, { scroll: false });
    console.log('[selectExecutiveSummary] Done', { timestamp: performance.now() });
  };

  // Select a scenario (middle column shows its models)
  const selectScenario = (promptId: string) => {
    console.log('[selectScenario] START', {
      promptId,
      currentSelectedScenario: selectedScenario,
      timestamp: performance.now()
    });
    const params = new URLSearchParams();
    params.set('scenario', promptId);
    const newUrl = buildUrl(params);
    console.log('[selectScenario] Calling router.replace', { newUrl, timestamp: performance.now() });
    router.replace(newUrl, { scroll: false });
    console.log('[selectScenario] Done', { timestamp: performance.now() });
  };

  // Toggle all variants of a base model in/out of comparison
  const toggleModel = (baseId: string) => {
    console.log('[toggleModel] Called with', {
      baseId,
      selectedScenario,
      timestamp: performance.now()
    });

    if (!selectedScenario) {
      console.log('[toggleModel] ABORT - no selectedScenario', { timestamp: performance.now() });
      return;
    }

    console.log('[toggleModel] START', { baseId, selectedScenario, timestamp: performance.now() });

    // Find all model variants that match this baseId
    const variantIds = models.filter(modelId => {
      const parsed = parseModelIdForDisplay(modelId);
      return parsed.baseId === baseId;
    });

    const newItemKeys = variantIds.map(modelId => `${selectedScenario}::${modelId}`);

    // Check if all variants are already in comparison
    const existingKeys = new Set(comparisonItems);
    const allVariantsPresent = newItemKeys.every(key => existingKeys.has(key));

    let newModelIds: string[];
    if (allVariantsPresent) {
      // Remove all variants (toggle off)
      const keysToRemove = new Set(newItemKeys);
      newModelIds = comparisonItems
        .filter(key => !keysToRemove.has(key))
        .map(key => key.split('::')[1]);
    } else {
      // Add missing variants (toggle on)
      const itemsToAdd = newItemKeys.filter(key => !existingKeys.has(key));
      newModelIds = [...comparisonItems, ...itemsToAdd].map(key => key.split('::')[1]);
    }

    console.log('[toggleModel] Building new URL', { timestamp: performance.now() });
    const params = new URLSearchParams();
    params.set('scenario', selectedScenario);
    if (newModelIds.length > 0) {
      params.set('models', newModelIds.join(','));
    }
    const newUrl = buildUrl(params);
    console.log('[toggleModel] Calling router.replace', { newUrl, timestamp: performance.now() });
    router.replace(newUrl, { scroll: false });
    console.log('[toggleModel] Done', { timestamp: performance.now() });
  };

  const removeFromComparison = (key: string) => {
    console.log('[removeFromComparison] START', { key, timestamp: performance.now() });
    if (!selectedScenario) return;

    const newModelIds = comparisonItems
      .filter(k => k !== key)
      .map(k => k.split('::')[1]);

    const params = new URLSearchParams();
    params.set('scenario', selectedScenario);
    if (newModelIds.length > 0) {
      params.set('models', newModelIds.join(','));
    }
    const newUrl = buildUrl(params);
    console.log('[removeFromComparison] Calling router.replace', { newUrl, timestamp: performance.now() });
    router.replace(newUrl, { scroll: false });
  };

  const clearAllComparisons = () => {
    console.log('[clearAllComparisons] START', { timestamp: performance.now() });
    if (!selectedScenario) return;

    const params = new URLSearchParams();
    params.set('scenario', selectedScenario);
    const newUrl = buildUrl(params);
    console.log('[clearAllComparisons] Calling router.replace', { newUrl, timestamp: performance.now() });
    router.replace(newUrl, { scroll: false });
  };

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

  const { evaluationResults: { llmCoverageScores: allCoverageScores }, promptIds, config } = data;

  // Debug: log data availability
  console.log('[EngClientPage] Data loaded:', {
    hasPromptIds: !!promptIds,
    promptIdsLength: promptIds?.length,
    promptIdsArray: promptIds,
    modelsLength: models.length,
    allCoverageScoresKeys: Object.keys(allCoverageScores || {}).length,
    dataKeys: Object.keys(data),
  });

  // Calculate scenario stats
  const scenarioStats = useMemo(() => {
    return promptIds.map((promptId, index) => {
      const promptText = promptTextsForMacroTable[promptId] || promptId;

      // Calculate average score across all models for this scenario
      const scores = models.map(modelId => {
        const result = allCoverageScores?.[promptId]?.[modelId];
        return result && !('error' in result) ? result.avgCoverageExtent : null;
      }).filter((s): s is number => s !== null);

      const avgScore = scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : 0;

      return { promptId, promptText, index, avgScore };
    });
  }, [promptIds, promptTextsForMacroTable, models, allCoverageScores]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold font-mono">Data Explorer</h1>
            <div className="text-sm text-muted-foreground">
              {config.id || 'Unknown config'}
            </div>
          </div>
          {timestamp && (
            <div className="text-xs text-muted-foreground font-mono">
              Eval run: {timestamp}
            </div>
          )}
        </div>
      </div>

      {/* Main content area: 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Scenarios Column */}
        <div className="w-[280px] flex-shrink-0 border-r border-border overflow-auto">
          <ScenariosColumn
            scenarios={scenarioStats}
            selectedScenario={selectedScenario}
            selectScenario={selectScenario}
            executiveSummary={data.executiveSummary}
            showExecutiveSummary={showExecutiveSummary}
            selectExecutiveSummary={selectExecutiveSummary}
          />
        </div>

        {/* Middle: Models Column (only visible when scenario selected) */}
        {selectedScenario && (
          <div className="w-[280px] flex-shrink-0 border-r border-border overflow-auto">
            <ModelsColumn
              promptId={selectedScenario}
              models={models}
              allCoverageScores={allCoverageScores}
              comparisonItems={comparisonItems}
              toggleModel={toggleModel}
            />
          </div>
        )}

        {/* Right: Comparison View */}
        <div className="flex-1 overflow-auto">
          <div className="p-4">
            {showExecutiveSummary && data.executiveSummary ? (
              <ExecutiveSummaryView executiveSummary={data.executiveSummary} />
            ) : comparisonItems.length > 0 ? (
              <ComparisonView
                comparisonItems={comparisonItems}
                removeFromComparison={removeFromComparison}
                clearAllComparisons={clearAllComparisons}
                getCachedResponse={getCachedResponse}
                getCachedEvaluation={getCachedEvaluation}
                fetchModalResponse={fetchModalResponse}
                fetchEvaluationDetails={fetchEvaluationDetails}
                allCoverageScores={allCoverageScores}
                promptTexts={promptTextsForMacroTable}
                config={config}
              />
            ) : selectedScenario ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <p className="mb-2">No models selected</p>
                  <p className="text-sm">Click on models in the middle column to view their details</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <p className="mb-2">No scenario selected</p>
                  <p className="text-sm">Select a scenario from the left column</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Scenarios Column (Left)
interface ScenariosColumnProps {
  scenarios: Array<{ promptId: string; promptText: string; index: number; avgScore: number }>;
  selectedScenario: string | null;
  selectScenario: (promptId: string) => void;
  executiveSummary: any;
  showExecutiveSummary: boolean;
  selectExecutiveSummary: () => void;
}

function ScenariosColumn({
  scenarios,
  selectedScenario,
  selectScenario,
  executiveSummary,
  showExecutiveSummary,
  selectExecutiveSummary,
}: ScenariosColumnProps) {
  return (
    <div className="p-2 font-mono text-sm">
      <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
        SCENARIOS
      </div>

      {/* Executive Summary Option */}
      {executiveSummary && (
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1 mb-0.5 rounded cursor-pointer hover:bg-muted/50 transition-colors",
            showExecutiveSummary && "bg-primary/10"
          )}
          onClick={selectExecutiveSummary}
        >
          <span className="flex-1 font-medium text-xs">Executive Summary</span>
        </div>
      )}

      {/* Scenario List */}
      <div className="space-y-0.5">
        {scenarios.map((scenario) => {
          const isSelected = selectedScenario === scenario.promptId;
          const score = scenario.avgScore;
          const hasScore = score > 0;

          // Color based on score
          const scoreColor = hasScore && score >= 0.8
            ? 'text-green-600 dark:text-green-400'
            : hasScore && score >= 0.5
            ? 'text-amber-600 dark:text-amber-400'
            : hasScore
            ? 'text-red-600 dark:text-red-400'
            : 'text-muted-foreground';

          return (
            <div
              key={scenario.promptId}
              className={cn(
                "flex flex-col gap-0.5 px-2 py-1 rounded cursor-pointer transition-colors",
                isSelected
                  ? "bg-primary/10"
                  : "hover:bg-muted/30"
              )}
              onClick={() => {
                console.log('[ScenariosColumn onClick] CLICK EVENT', {
                  promptId: scenario.promptId,
                  timestamp: performance.now()
                });
                selectScenario(scenario.promptId);
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs min-w-[2ch]">
                  {String(scenario.index + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 truncate text-xs">
                  {truncateText(scenario.promptText, 30)}
                </span>
                {hasScore && (
                  <span className={cn("text-right text-xs min-w-[3ch] font-mono", scoreColor)}>
                    {formatPercentage(score, 0)}
                  </span>
                )}
              </div>
              {hasScore && (
                <div className="ml-6 h-[0.35rem] overflow-hidden">
                  <TextualBar score={score} length={18} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Models Column (Middle)
interface ModelsColumnProps {
  promptId: string;
  models: string[];
  allCoverageScores: any;
  comparisonItems: string[];
  toggleModel: (baseId: string) => void;
}

function ModelsColumn({
  promptId,
  models,
  allCoverageScores,
  comparisonItems,
  toggleModel,
}: ModelsColumnProps) {
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
          hideSystemPrompt: true,
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

    // Calculate average scores (may be null if no scores available)
    baseModelMap.forEach(baseModel => {
      const scores = baseModel.variants.map(variantId => {
        const result = allCoverageScores?.[promptId]?.[variantId];
        return result && !('error' in result) ? result.avgCoverageExtent : null;
      }).filter((s): s is number => s !== null);

      baseModel.avgScore = scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : null;
    });

    // Sort by score if available, otherwise alphabetically
    return Array.from(baseModelMap.values()).sort((a, b) => {
      if (a.avgScore !== null && b.avgScore !== null) {
        return b.avgScore - a.avgScore;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }, [models, promptId, allCoverageScores]);

  return (
    <div className="p-2 font-mono text-sm">
      <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
        MODELS
      </div>

      <div className="space-y-0.5">
        {baseModels.map(baseModel => {
          // Check if this model is selected
          const variantKeys = baseModel.variants.map(v => `${promptId}::${v}`);
          const isSelected = variantKeys.some(key => comparisonItems.includes(key));
          const score = baseModel.avgScore;
          const hasScore = score !== null;

          // Color based on score
          const scoreColor = hasScore && score >= 0.8
            ? 'text-green-600 dark:text-green-400'
            : hasScore && score >= 0.5
            ? 'text-amber-600 dark:text-amber-400'
            : hasScore
            ? 'text-red-600 dark:text-red-400'
            : 'text-muted-foreground';

          return (
            <div
              key={baseModel.baseId}
              className={cn(
                "flex flex-col gap-0.5 px-2 py-1 rounded cursor-pointer transition-colors",
                isSelected
                  ? "bg-primary/10"
                  : "hover:bg-muted/30"
              )}
              onClick={() => {
                console.log('[ModelsColumn onClick] CLICK EVENT', { baseId: baseModel.baseId, timestamp: performance.now() });
                toggleModel(baseModel.baseId);
              }}
            >
              <div className="flex items-center gap-2">
                {/* Checkbox */}
                <span className="text-xs min-w-[1ch]">
                  {isSelected ? '☑' : '☐'}
                </span>

                <span className="flex-1 truncate text-xs">
                  {baseModel.displayName}
                  {baseModel.variants.length > 1 && (
                    <span className="text-muted-foreground ml-1 text-[10px]">
                      ({baseModel.variants.length})
                    </span>
                  )}
                </span>

                {hasScore && (
                  <span className={cn("text-right text-xs min-w-[3ch] font-mono", scoreColor)}>
                    {formatPercentage(score, 0)}
                  </span>
                )}
              </div>
              {hasScore && (
                <div className="ml-4 h-[0.35rem] overflow-hidden">
                  <TextualBar score={score} length={16} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Comparison View Component
interface ComparisonViewProps {
  comparisonItems: string[];
  removeFromComparison: (key: string) => void;
  clearAllComparisons: () => void;
  getCachedResponse: any;
  getCachedEvaluation: any;
  fetchModalResponse: any;
  fetchEvaluationDetails: any;
  allCoverageScores: any;
  promptTexts: Record<string, string>;
  config: any;
}

function ComparisonView({
  comparisonItems,
  removeFromComparison,
  clearAllComparisons,
  getCachedResponse,
  getCachedEvaluation,
  fetchModalResponse,
  fetchEvaluationDetails,
  allCoverageScores,
  promptTexts,
  config,
}: ComparisonViewProps) {
  // Get common scenario (all items should be from same scenario)
  const firstItem = comparisonItems[0];
  const promptId = firstItem?.split('::')[0];
  const promptText = promptTexts[promptId] || '';

  // Get renderAs for this prompt
  const promptConfig = config?.prompts?.find((p: any) => p.id === promptId);
  const renderAs = (promptConfig?.render_as as RenderAsType) || 'markdown';

  // Fetch responses and evaluations for all comparison items
  useEffect(() => {
    comparisonItems.forEach(itemKey => {
      const parts = itemKey.split('::');
      const itemPromptId = parts[0];
      const modelId = parts[1];

      // Trigger fetches if not already cached
      if (!getCachedResponse?.(itemPromptId, modelId)) {
        fetchModalResponse?.(itemPromptId, modelId);
      }
      if (!getCachedEvaluation?.(itemPromptId, modelId)) {
        fetchEvaluationDetails?.(itemPromptId, modelId);
      }
    });
  }, [comparisonItems, getCachedResponse, getCachedEvaluation, fetchModalResponse, fetchEvaluationDetails]);

  // Debug: Log what data we're receiving
  useEffect(() => {
    if (comparisonItems.length > 0) {
      const firstItem = comparisonItems[0];
      const parts = firstItem.split('::');
      const modelId = parts[1];
      const evaluation = getCachedEvaluation?.(promptId, modelId);

      console.log('[ComparisonView] Evaluation data check:', {
        promptId,
        modelId,
        hasEvaluation: !!evaluation,
        hasPointAssessments: !!evaluation?.pointAssessments,
        pointAssessmentsLength: evaluation?.pointAssessments?.length,
        sampleAssessment: evaluation?.pointAssessments?.[0],
        pathIds: evaluation?.pointAssessments?.map((a: any) => a.pathId).filter(Boolean)
      });
    }
  }, [comparisonItems, getCachedEvaluation, promptId]);

  // Collect all unique criteria across all models with full assessment details
  // Now organized by path
  const criteriaByPath = useMemo(() => {
    const requiredCriteria: Array<{
      text: string;
      citation: string | null;
      assessments: Map<string, {
        score: number;
        individualJudgements: Array<{ judgeModelId: string; reflection: string; coverageExtent: number }> | null;
      }>;
    }> = [];

    const pathGroups: Map<string, Array<{
      text: string;
      citation: string | null;
      assessments: Map<string, {
        score: number;
        individualJudgements: Array<{ judgeModelId: string; reflection: string; coverageExtent: number }> | null;
      }>;
    }>> = new Map();

    const criteriaMap = new Map<string, {
      text: string;
      citation: string | null;
      pathId: string | null;
      assessments: Map<string, {
        score: number;
        individualJudgements: Array<{ judgeModelId: string; reflection: string; coverageExtent: number }> | null;
      }>;
    }>();

    comparisonItems.forEach(itemKey => {
      const parts = itemKey.split('::');
      const modelId = parts[1];
      const evaluation = getCachedEvaluation?.(promptId, modelId);

      if (evaluation?.pointAssessments) {
        evaluation.pointAssessments.forEach((assessment: any) => {
          const criterionText = assessment.keyPointText;
          if (!criteriaMap.has(criterionText)) {
            criteriaMap.set(criterionText, {
              text: criterionText,
              citation: assessment.citation || null,
              pathId: assessment.pathId || null,
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

    console.log('[ComparisonView] Path grouping results:', {
      requiredCount: requiredCriteria.length,
      pathCount: pathGroups.size,
      pathIds: Array.from(pathGroups.keys()),
      pathSizes: Array.from(pathGroups.entries()).map(([id, items]) => ({ id, count: items.length }))
    });

    return { requiredCriteria, pathGroups };
  }, [comparisonItems, getCachedEvaluation, promptId]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-border pb-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">
            {comparisonItems.length === 1 ? 'Model Detail' : `Comparing ${comparisonItems.length} variants`}
          </h2>
          <button
            onClick={clearAllComparisons}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {comparisonItems.length === 1 ? 'Close' : 'Clear all'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{promptText}</p>
      </div>

      {/* Unified comparison table */}
      <div className="border border-border rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            {/* Column headers: Model names with overall scores */}
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-3 py-3 font-medium border-b border-r border-border sticky left-0 bg-muted/30 min-w-[200px]">
                  Criterion
                </th>
                {comparisonItems.map(itemKey => {
                  const parts = itemKey.split('::');
                  const modelId = parts[1];
                  const result = allCoverageScores?.[promptId]?.[modelId];
                  const hasScore = result && !('error' in result) && result.avgCoverageExtent !== undefined;
                  const parsed = parseModelIdForDisplay(modelId);
                  const modelLabel = getModelDisplayLabel(parsed, {
                    hideProvider: true,
                    prettifyModelName: true,
                    hideTemperature: false,
                    hideSystemPrompt: false,
                  });

                  return (
                    <th key={itemKey} className="text-center px-3 py-3 border-b border-border min-w-[250px]">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium truncate flex-1 text-left">{modelLabel}</div>
                          <button
                            onClick={() => removeFromComparison(itemKey)}
                            className="text-xs text-muted-foreground hover:text-destructive"
                          >
                            ✕
                          </button>
                        </div>
                        {hasScore && (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{formatPercentage(result.avgCoverageExtent, 0)}</span>
                            <div className="flex-1">
                              <TextualBar score={result.avgCoverageExtent} length={12} />
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {/* Response row */}
              <tr className="bg-muted/10">
                <td className="px-3 py-2 font-medium border-r border-border sticky left-0 bg-muted/10">
                  Response
                </td>
                {comparisonItems.map(itemKey => {
                  const parts = itemKey.split('::');
                  const modelId = parts[1];
                  const response = getCachedResponse?.(promptId, modelId);

                  return (
                    <td key={itemKey} className="px-3 py-2 align-top">
                      <div className={cn(
                        "border border-border rounded bg-background overflow-auto",
                        renderAs === 'html' ? "h-[400px]" : "max-h-64 p-2"
                      )}>
                        {response ? (
                          <ResponseRenderer content={response} renderAs={renderAs} />
                        ) : (
                          <p className="text-xs text-muted-foreground p-2">Loading...</p>
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
                    <td className="px-3 py-3 text-left border-r border-border sticky left-0 bg-background">
                      <div className="space-y-2">
                        <CriterionText text={criterion.text} />
                        {criterion.citation && (
                          <div className="text-xs text-muted-foreground italic pl-3 border-l-2 border-primary/30">
                            "{truncateText(criterion.citation, 150)}"
                          </div>
                        )}
                      </div>
                    </td>
                    {comparisonItems.map(itemKey => {
                      const parts = itemKey.split('::');
                      const modelId = parts[1];
                      const assessment = criterion.assessments.get(modelId);

                      if (!assessment) {
                        return (
                          <td key={itemKey} className="px-3 py-3 text-center text-muted-foreground align-top">
                            —
                          </td>
                        );
                      }

                      const { score, individualJudgements } = assessment;
                      const statusIcon = score >= 0.8 ? '✓' : score >= 0.5 ? '~' : '✗';

                      return (
                        <td key={itemKey} className="px-3 py-3 align-top">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-lg font-bold",
                                score >= 0.8 ? "text-green-600 dark:text-green-400" :
                                score >= 0.5 ? "text-amber-600 dark:text-amber-400" :
                                "text-red-600 dark:text-red-400"
                              )}>
                                {statusIcon}
                              </span>
                              <span className="font-mono text-sm">{formatPercentage(score, 0)}</span>
                              <div className="flex-1">
                                <TextualBar score={score} length={8} />
                              </div>
                            </div>
                            {individualJudgements && individualJudgements.length > 0 && (
                              <div className="space-y-2">
                                {individualJudgements.map((judgement, jIdx) => (
                                  <div key={jIdx} className="text-xs text-muted-foreground pl-3 border-l-2 border-border leading-relaxed">
                                    {individualJudgements.length > 1 && (
                                      <div className="font-semibold mb-1 opacity-70">
                                        Judge {jIdx + 1} ({formatPercentage(judgement.coverageExtent, 0)}):
                                      </div>
                                    )}
                                    <div>{judgement.reflection}</div>
                                  </div>
                                ))}
                              </div>
                            )}
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
                        <td className="px-3 py-3 text-left border-r border-border sticky left-0 bg-background">
                          <div className="flex gap-2">
                            <div
                              className="w-1 flex-shrink-0 rounded"
                              style={{ backgroundColor: pathColor }}
                            />
                            <div className="space-y-2 flex-1">
                              <CriterionText text={criterion.text} />
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

                          if (!assessment) {
                            return (
                              <td key={itemKey} className="px-3 py-3 text-center text-muted-foreground align-top">
                                —
                              </td>
                            );
                          }

                          const { score, individualJudgements } = assessment;
                          const statusIcon = score >= 0.8 ? '✓' : score >= 0.5 ? '~' : '✗';

                          return (
                            <td key={itemKey} className="px-3 py-3 align-top">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "text-lg font-bold",
                                    score >= 0.8 ? "text-green-600 dark:text-green-400" :
                                    score >= 0.5 ? "text-amber-600 dark:text-amber-400" :
                                    "text-red-600 dark:text-red-400"
                                  )}>
                                    {statusIcon}
                                  </span>
                                  <span className="font-mono text-sm">{formatPercentage(score, 0)}</span>
                                  <div className="flex-1">
                                    <TextualBar score={score} length={8} />
                                  </div>
                                </div>
                                {individualJudgements && individualJudgements.length > 0 && (
                                  <div className="space-y-2">
                                    {individualJudgements.map((judgement, jIdx) => (
                                      <div key={jIdx} className="text-xs text-muted-foreground pl-3 border-l-2 border-border leading-relaxed">
                                        {individualJudgements.length > 1 && (
                                          <div className="font-semibold mb-1 opacity-70">
                                            Judge {jIdx + 1} ({formatPercentage(judgement.coverageExtent, 0)}):
                                          </div>
                                        )}
                                        <div>{judgement.reflection}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
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

      {criteriaByPath.requiredCriteria.length === 0 && criteriaByPath.pathGroups.size === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No evaluation criteria available yet. Evaluations may still be loading.</p>
        </div>
      )}
    </div>
  );
}

// Executive Summary View Component
interface ExecutiveSummaryViewProps {
  executiveSummary: string | { content: string } | { modelId: string; content: string; structured?: any; isStructured?: boolean };
}

function ExecutiveSummaryView({ executiveSummary }: ExecutiveSummaryViewProps) {
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

  return (
    <div className="space-y-4">
      <div className="border-b border-border pb-3">
        <h2 className="text-2xl font-semibold">Executive Summary</h2>
      </div>
      <div className="prose prose-sm max-w-none dark:prose-invert">
        {hasStructured ? (
          <StructuredSummary insights={executiveSummary.structured} />
        ) : (
          <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
        )}
      </div>
    </div>
  );
}
