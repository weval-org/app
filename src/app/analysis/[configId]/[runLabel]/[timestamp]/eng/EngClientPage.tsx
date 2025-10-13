'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { parseModelIdForDisplay, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { TextualBar } from '../textual/components/TextualBar';
import { formatPercentage, truncateText } from '../textual/utils/textualUtils';
import { cn } from '@/lib/utils';

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

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [comparisonItems, setComparisonItems] = useState<string[]>([]);
  const [showExecutiveSummary, setShowExecutiveSummary] = useState(false);

  // Get models without IDEAL
  const models = useMemo(() => {
    return displayedModels.filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase());
  }, [displayedModels]);

  const toggleExpand = (key: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Add all variants of a base model to comparison
  const addToComparison = (promptId: string, baseId: string) => {
    // Clear executive summary view when adding to comparison
    setShowExecutiveSummary(false);

    // Find all model variants that match this baseId
    const variantIds = models.filter(modelId => {
      const parsed = parseModelIdForDisplay(modelId);
      return parsed.baseId === baseId;
    });

    // If there are existing items, check if they're from the same scenario
    if (comparisonItems.length > 0) {
      const existingPromptId = comparisonItems[0].split('::')[0];

      // If switching to a different scenario, clear and start fresh
      if (promptId !== existingPromptId) {
        const newItems = variantIds.map(modelId => `${promptId}::${modelId}`);
        setComparisonItems(newItems);
        return;
      }
    }

    // Same scenario - add all variants (additive, no duplicates)
    const newItemKeys = variantIds.map(modelId => `${promptId}::${modelId}`);
    const existingKeys = new Set(comparisonItems);
    const itemsToAdd = newItemKeys.filter(key => !existingKeys.has(key));
    const newItems = [...comparisonItems, ...itemsToAdd];
    setComparisonItems(newItems);
  };

  const removeFromComparison = (key: string) => {
    setComparisonItems(comparisonItems.filter(k => k !== key));
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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold font-mono">Data Explorer</h1>
          <div className="text-sm text-muted-foreground">
            {config.id || 'Unknown config'}
          </div>
        </div>
      </div>

      {/* Main content area: Tree + Detail */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Tree Navigator */}
        <div className="w-[400px] flex-shrink-0 border-r border-border overflow-auto">
          <div className="p-4">
            <ScenarioTreeView
              promptIds={promptIds}
              promptTexts={promptTextsForMacroTable}
              models={models}
              allCoverageScores={allCoverageScores}
              expandedItems={expandedItems}
              toggleExpand={toggleExpand}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
              addToComparison={addToComparison}
              getCachedResponse={getCachedResponse}
              getCachedEvaluation={getCachedEvaluation}
              config={config}
              executiveSummary={data.executiveSummary}
              showExecutiveSummary={showExecutiveSummary}
              setShowExecutiveSummary={setShowExecutiveSummary}
            />
          </div>
        </div>

        {/* Right: Detail View */}
        <div className="flex-1 overflow-auto">
          <div className="p-4">
            {showExecutiveSummary && data.executiveSummary ? (
              <ExecutiveSummaryView executiveSummary={data.executiveSummary} />
            ) : comparisonItems.length > 0 ? (
              <ComparisonView
                comparisonItems={comparisonItems}
                removeFromComparison={removeFromComparison}
                clearAllComparisons={() => setComparisonItems([])}
                getCachedResponse={getCachedResponse}
                getCachedEvaluation={getCachedEvaluation}
                fetchModalResponse={fetchModalResponse}
                fetchEvaluationDetails={fetchEvaluationDetails}
                allCoverageScores={allCoverageScores}
                promptTexts={promptTextsForMacroTable}
              />
            ) : selectedItem ? (
              <DetailView
                selectedItem={selectedItem}
                getCachedResponse={getCachedResponse}
                getCachedEvaluation={getCachedEvaluation}
                allCoverageScores={allCoverageScores}
                promptTexts={promptTextsForMacroTable}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <p className="mb-2">No item selected</p>
                  <p className="text-sm">Click an item in the tree to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Scenario Tree View Component
interface ScenarioTreeViewProps {
  promptIds: string[];
  promptTexts: Record<string, string>;
  models: string[];
  allCoverageScores: any;
  expandedItems: Set<string>;
  toggleExpand: (key: string) => void;
  selectedItem: string | null;
  setSelectedItem: (key: string | null) => void;
  addToComparison: (promptId: string, baseId: string) => void;
  getCachedResponse: any;
  getCachedEvaluation: any;
  config: any;
  executiveSummary: string | { content: string } | { modelId: string; content: string; structured?: any; isStructured?: boolean } | null | undefined;
  showExecutiveSummary: boolean;
  setShowExecutiveSummary: (value: boolean) => void;
}

function ScenarioTreeView({
  promptIds,
  promptTexts,
  models,
  allCoverageScores,
  expandedItems,
  toggleExpand,
  selectedItem,
  setSelectedItem,
  addToComparison,
  getCachedResponse,
  getCachedEvaluation,
  config,
  executiveSummary,
  showExecutiveSummary,
  setShowExecutiveSummary,
}: ScenarioTreeViewProps) {
  // Early return if no data
  if (!promptIds || promptIds.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="mb-2">No scenarios found</p>
        <p className="text-xs">This evaluation may not have loaded properly</p>
      </div>
    );
  }

  if (!models || models.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="mb-2">No models found</p>
        <p className="text-xs">This evaluation may not have any model results</p>
      </div>
    );
  }

  // Calculate scenario stats with normalized models (grouped by baseId)
  const scenarioStats = useMemo(() => {
    return promptIds.map((promptId, index) => {
      const promptText = promptTexts[promptId] || promptId;

      // Group models by baseId and calculate average scores
      const baseModelMap = new Map<string, {
        baseId: string;
        displayName: string;
        variants: string[];
        avgScore: number;
      }>();

      models.forEach(modelId => {
        const result = allCoverageScores[promptId]?.[modelId];
        const score = result && !('error' in result) ? result.avgCoverageExtent : null;

        if (score !== null) {
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
              avgScore: 0,
            });
          }

          const baseModel = baseModelMap.get(baseId)!;
          baseModel.variants.push(modelId);
        }
      });

      // Calculate average scores for each base model
      baseModelMap.forEach(baseModel => {
        const scores = baseModel.variants.map(variantId => {
          const result = allCoverageScores[promptId]?.[variantId];
          return result && !('error' in result) ? result.avgCoverageExtent : null;
        }).filter((s): s is number => s !== null);

        baseModel.avgScore = scores.length > 0
          ? scores.reduce((sum, s) => sum + s, 0) / scores.length
          : 0;
      });

      // Calculate overall scenario average
      const allScores = Array.from(baseModelMap.values()).map(bm => bm.avgScore);
      const avgScore = allScores.length > 0
        ? allScores.reduce((sum, s) => sum + s, 0) / allScores.length
        : 0;

      return {
        promptId,
        promptText,
        index,
        avgScore,
        baseModels: Array.from(baseModelMap.values()).sort((a, b) => b.avgScore - a.avgScore),
      };
    });
  }, [promptIds, promptTexts, models, allCoverageScores]);

  return (
    <div className="space-y-1 font-mono text-sm">
      {/* Executive Summary Button */}
      {executiveSummary && (
        <div
          className={cn(
            "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 transition-colors mb-2",
            showExecutiveSummary && "bg-muted"
          )}
          onClick={() => setShowExecutiveSummary(true)}
        >
          <span className="flex-1 font-medium text-primary">Executive Summary</span>
        </div>
      )}

      {scenarioStats.map((scenario) => {
        const isExpanded = expandedItems.has(scenario.promptId);
        const isSelected = selectedItem === scenario.promptId;

        return (
          <div key={scenario.promptId} className="space-y-1">
            {/* Scenario header */}
            <div
              className={cn(
                "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 transition-colors",
                isSelected && "bg-muted"
              )}
              onClick={() => {
                setSelectedItem(scenario.promptId);
                toggleExpand(scenario.promptId);
                setShowExecutiveSummary(false);
              }}
            >
              <span className="text-muted-foreground">
                {isExpanded ? '▼' : '▶'}
              </span>
              <span className="text-muted-foreground min-w-[2ch]">
                {String(scenario.index + 1).padStart(2, '0')}
              </span>
              <span className="flex-1 truncate">
                {truncateText(scenario.promptText, 60)}
              </span>
              <span className="text-right min-w-[3ch] text-xs">
                {formatPercentage(scenario.avgScore, 0)}
              </span>
              <div className="min-w-[100px]">
                <TextualBar score={scenario.avgScore} length={10} />
              </div>
            </div>

            {/* Expanded: Show normalized models */}
            {isExpanded && (
              <div className="ml-8 space-y-1">
                {scenario.baseModels.map(baseModel => {
                  return (
                    <div
                      key={baseModel.baseId}
                      className="flex items-center gap-2 p-1 rounded hover:bg-muted/30 cursor-pointer"
                      onClick={() => addToComparison(scenario.promptId, baseModel.baseId)}
                    >
                      <span className="flex-1 truncate text-xs">
                        {baseModel.displayName}
                        {baseModel.variants.length > 1 && (
                          <span className="text-muted-foreground ml-1">
                            ({baseModel.variants.length} variants)
                          </span>
                        )}
                      </span>
                      <span className="text-right min-w-[3ch] text-xs">
                        {formatPercentage(baseModel.avgScore, 0)}
                      </span>
                      <div className="min-w-[80px]">
                        <TextualBar score={baseModel.avgScore} length={8} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Detail View Component
interface DetailViewProps {
  selectedItem: string;
  getCachedResponse: any;
  getCachedEvaluation: any;
  allCoverageScores: any;
  promptTexts: Record<string, string>;
}

function DetailView({
  selectedItem,
  getCachedResponse,
  getCachedEvaluation,
  allCoverageScores,
  promptTexts,
}: DetailViewProps) {
  // Parse selectedItem to determine if it's a scenario or scenario+model
  const parts = selectedItem.split('::');
  const promptId = parts[0];
  const modelId = parts[1] || null;

  const promptText = promptTexts[promptId] || promptId;

  if (!modelId) {
    // Just showing scenario overview
    return (
      <div className="space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-lg font-semibold mb-2">Scenario</h2>
          <p className="text-sm leading-relaxed">{promptText}</p>
        </div>

        <div className="border border-border rounded p-4 bg-muted/10">
          <p className="text-sm text-muted-foreground">
            Expand a model in the tree to view its response and criteria scores
          </p>
        </div>
      </div>
    );
  }

  // Showing scenario + specific model
  const response = getCachedResponse?.(promptId, modelId);
  const evaluation = getCachedEvaluation?.(promptId, modelId);
  const result = allCoverageScores[promptId]?.[modelId];
  const parsed = parseModelIdForDisplay(modelId);
  const modelLabel = getModelDisplayLabel(parsed, {
    hideProvider: true,
    prettifyModelName: true,
    hideTemperature: false,
    hideSystemPrompt: false,
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-border pb-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">{modelLabel}</h2>
          {result && !('error' in result) && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono">{formatPercentage(result.avgCoverageExtent, 0)}</span>
              <div className="w-32">
                <TextualBar score={result.avgCoverageExtent} length={16} />
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{promptText}</p>
      </div>

      {/* Response */}
      {response ? (
        <div>
          <h3 className="text-sm font-medium mb-2">Response</h3>
          <div className="border border-border rounded p-3 bg-muted/10 max-h-64 overflow-auto">
            <pre className="text-xs whitespace-pre-wrap font-mono">{response}</pre>
          </div>
        </div>
      ) : (
        <div className="border border-border rounded p-3 bg-muted/10">
          <p className="text-xs text-muted-foreground">Loading response...</p>
        </div>
      )}

      {/* Criteria Breakdown */}
      {evaluation?.pointAssessments && evaluation.pointAssessments.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">
            Criteria ({evaluation.pointAssessments.length})
          </h3>
          <div className="space-y-2">
            {evaluation.pointAssessments.map((assessment: any, idx: number) => {
              const score = assessment.coverageExtent ?? 0;
              const statusIcon = score >= 0.8 ? '✓' : score >= 0.5 ? '~' : '✗';

              return (
                <div key={idx} className="border border-border rounded p-3 bg-muted/10">
                  <div className="flex items-start gap-2 mb-2">
                    <span className={cn(
                      "text-lg font-bold min-w-[1ch]",
                      score >= 0.8 ? "text-green-600 dark:text-green-400" :
                      score >= 0.5 ? "text-amber-600 dark:text-amber-400" :
                      "text-red-600 dark:text-red-400"
                    )}>
                      {statusIcon}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium mb-1">{assessment.keyPointText}</div>
                      {assessment.reflection && (
                        <div className="text-xs text-muted-foreground mt-2 pl-3 border-l-2 border-border">
                          {assessment.reflection}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono">{formatPercentage(score, 0)}</span>
                      <div className="w-20">
                        <TextualBar score={score} length={8} />
                      </div>
                    </div>
                  </div>

                  {assessment.citation && (
                    <div className="text-xs text-muted-foreground mt-2 pl-6">
                      <span className="font-semibold">Citation:</span> "{truncateText(assessment.citation, 120)}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
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
}: ComparisonViewProps) {
  // Get common scenario (all items should be from same scenario)
  const firstItem = comparisonItems[0];
  const promptId = firstItem?.split('::')[0];
  const promptText = promptTexts[promptId] || '';

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

  // Collect all unique criteria across all models with full assessment details
  const allCriteria = useMemo(() => {
    const criteriaMap = new Map<string, {
      text: string;
      citation: string | null;
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
              citation: assessment.citation || null, // Store citation at criterion level
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

    return Array.from(criteriaMap.values());
  }, [comparisonItems, getCachedEvaluation, promptId]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-border pb-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Comparing {comparisonItems.length} variants</h2>
          <button
            onClick={clearAllComparisons}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
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
                  const result = allCoverageScores[promptId]?.[modelId];
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
                        {result && !('error' in result) && (
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
                      <div className="border border-border rounded p-2 bg-background max-h-64 overflow-auto">
                        {response ? (
                          <pre className="text-xs whitespace-pre-wrap font-mono">{response}</pre>
                        ) : (
                          <p className="text-xs text-muted-foreground">Loading...</p>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Criteria rows */}
              {allCriteria.map((criterion, idx) => {
                return (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="px-3 py-3 text-left border-r border-border sticky left-0 bg-background">
                      <div className="space-y-2">
                        <div className="font-medium">{criterion.text}</div>
                        {/* Citation at criterion level */}
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
                            {/* Score and icon */}
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

                            {/* Individual judgements */}
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
            </tbody>
          </table>
        </div>
      </div>

      {allCriteria.length === 0 && (
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
  // Handle different executive summary formats
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
        <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
      </div>
    </div>
  );
}
