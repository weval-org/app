'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
    CoverageResult,
} from '@/app/utils/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import TemperatureTabbedEvaluation, { TempVariantBundle } from './TemperatureTabbedEvaluation';
import { SharedModelCard, ModelSummary } from './SharedModelCard';
import { MobileKeyPointAnalysis } from './MobileKeyPointAnalysis';
import Icon from '@/components/ui/icon';
import { RenderAsType } from '@/app/components/ResponseRenderer';

// --- Components adapted from SharedEvaluationComponents ---

interface ModelCardProps {
    modelId: string;
    promptCoverageScores: Record<string, CoverageResult>;
    promptResponses: Record<string, string>;
    idealResponse?: string;
    historiesForPrompt?: Record<string, any>;
    requestHistory?: (modelId: string) => void;
    renderAs?: RenderAsType;
}

const ModelCard: React.FC<ModelCardProps> = ({ modelId, promptCoverageScores, promptResponses, idealResponse, historiesForPrompt, requestHistory, renderAs }) => {
    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});

    const toggleLogExpansion = (index: number) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };

    // Determine temperature-variant model IDs that share baseId and systemPromptIndex
    const relatedIds = useMemo(() => {
        const parsed = parseModelIdForDisplay(modelId);
        return Object.keys(promptCoverageScores).filter(mId => {
            const p = parseModelIdForDisplay(mId);
            return p.baseId === parsed.baseId && (p.systemPromptIndex ?? 0) === (parsed.systemPromptIndex ?? 0);
        });
    }, [modelId, promptCoverageScores]);

    // Prefetch conversation histories for all temperature variants so tabs have content
    useEffect(() => {
        if (!requestHistory) return;
        relatedIds.forEach(id => requestHistory(id));
    }, [requestHistory, relatedIds]);

    const tempVariants: TempVariantBundle[] = useMemo(() => {

        const bundles: TempVariantBundle[] = [];
        relatedIds.forEach(mId => {
            const p = parseModelIdForDisplay(mId);
            const cov = promptCoverageScores[mId];
            const resp = promptResponses[mId];
            if (!cov || 'error' in cov || resp === undefined) return;
            // Build generated transcript if history artefact present
            let generatedTranscript: string | undefined = undefined;
            let generatedHistory: any[] | undefined = undefined;
            try {
                const histObj = historiesForPrompt?.[mId];
                const hist = Array.isArray(histObj) ? histObj : (Array.isArray(histObj?.history) ? histObj.history : null);
                if (hist && Array.isArray(hist) && hist.length > 0) {
                    generatedHistory = hist;
                    const lines: string[] = [];
                    hist.forEach((m: any) => {
                        const role = m.role;
                        const content = m.content === null ? '[assistant: null — to be generated]' : m.content;
                        lines.push(`- ${role}: ${content}`);
                    });
                    generatedTranscript = lines.join('\n');
                }
            } catch {}
            bundles.push({
                temperature: p.temperature ?? 0,
                assessments: cov.pointAssessments || [],
                modelResponse: resp,
                generatedTranscript,
                generatedHistory,
            });
        });

        if (bundles.length === 0) return [];
        bundles.sort((a, b) => (a.temperature ?? 0) - (b.temperature ?? 0));
        // Return only real per-temperature bundles; no synthetic aggregate
        return bundles;
    }, [relatedIds, promptCoverageScores, promptResponses, historiesForPrompt]);

    if (tempVariants.length === 0) {
        return (
            <Card className="h-full w-full border-dashed border-destructive/50">
                <CardHeader>
                    <CardTitle>{getModelDisplayLabel(modelId)}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-destructive">Error loading evaluation data for this model.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full flex flex-col flex-1 min-h-0">
            <CardHeader>
                <CardTitle className="text-lg">{getModelDisplayLabel(modelId)}</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col min-h-0">
                <TemperatureTabbedEvaluation
                    variants={tempVariants}
                    idealResponse={idealResponse}
                    expandedLogs={expandedLogs}
                    toggleLogExpansion={toggleLogExpansion}
                    isMobile={false}
                    renderAs={renderAs}
                />
            </CardContent>
        </Card>
    );
}

// --- End: Adapted Components ---

// Helper function to calculate model performance summary
const calculateModelSummary = (coverageResult: CoverageResult | undefined): ModelSummary => {
    if (!coverageResult || 'error' in coverageResult || !coverageResult.pointAssessments) {
        return { total: 0, passed: 0, criticalFailures: 0, majorGaps: 0, avgCoverage: 0 };
    }

    const assessments = coverageResult.pointAssessments;
    const total = assessments.length;
    let passed = 0;
    let criticalFailures = 0;
    let majorGaps = 0;

    assessments.forEach(a => {
        const score = a.coverageExtent;
        if (score === undefined || score === null || isNaN(score)) return;
        
        if (a.isInverted) {
            if (score < 0.7) criticalFailures++;
            else passed++;
        } else {
            if (score < 0.4) majorGaps++;
            else passed++;
        }
    });
    
    const avgCoverage = coverageResult.avgCoverageExtent !== undefined && coverageResult.avgCoverageExtent !== null
        ? Math.round(coverageResult.avgCoverageExtent * 100)
        : 0;

    return { total, passed, criticalFailures, majorGaps, avgCoverage };
};

// Helper function to determine display strategy for model names
const getModelDisplayStrategy = (baseIds: string[]) => {
    const prettifiedNames = baseIds.map(baseId => 
        getModelDisplayLabel(baseId, { hideProvider: true, hideModelMaker: true, prettifyModelName: true })
    );
    
    const uniquePrettifiedNames = new Set(prettifiedNames);
    const hasDuplicates = uniquePrettifiedNames.size !== prettifiedNames.length;
    
    if (hasDuplicates) {
        // If prettifying creates duplicates, fall back to full names
        return {
            shouldPrettify: false,
            getDisplayName: (baseId: string) => getModelDisplayLabel(baseId),
            getTooltipName: (baseId: string) => getModelDisplayLabel(baseId)
        };
    } else {
        // Safe to prettify
        return {
            shouldPrettify: true,
            getDisplayName: (baseId: string) => getModelDisplayLabel(baseId, { 
                hideProvider: true, 
                hideModelMaker: true, 
                prettifyModelName: true 
            }),
            getTooltipName: (baseId: string) => getModelDisplayLabel(baseId)
        };
    }
};

const ModelView: React.FC<{
    displayedModels: string[];
    promptCoverageScores: Record<string, CoverageResult>;
    promptResponses: Record<string, string>;
    systemPrompts?: (string | null)[] | null;
    promptSimilarities: Record<string, Record<string, number>> | null;
    historiesForPrompt?: Record<string, any>;
    requestHistory?: (modelId: string) => void;
    renderAs?: RenderAsType;
}> = ({ displayedModels, promptCoverageScores, promptResponses, systemPrompts, promptSimilarities, historiesForPrompt, requestHistory, renderAs }) => {

    displayedModels = displayedModels.filter(modelId => {
        const parsed = parseModelIdForDisplay(modelId);
        // Don't show ideal model id as a distinct model in the key coverage area
        // as the inner coverage area has a tabbed interface for seeing that.
        return parsed.baseId.toLowerCase() !== 'ideal_model_id';
    });

    const [selectedModelId, setSelectedModelId] = useState<string | null>(
        displayedModels.length > 0 ? displayedModels[0] : null
    );

    const groupedModels = useMemo(() => {
        const groups: Record<string, { modelId: string; systemPromptIndex?: number }[]> = {};
        const seenByBase: Record<string, Set<number | 'u'>> = {};

        displayedModels.forEach(modelId => {
            const parsed = parseModelIdForDisplay(modelId);
            const baseId = parsed.baseId;
            const sysIdxKey: number | 'u' = (parsed.systemPromptIndex ?? null) === null ? 'u' : (parsed.systemPromptIndex ?? 'u');

            if (!groups[baseId]) {
                groups[baseId] = [];
                seenByBase[baseId] = new Set();
            }

            // Collapse temperature variants: only keep a single representative per systemPromptIndex
            if (!seenByBase[baseId].has(sysIdxKey)) {
                groups[baseId].push({
                    modelId: modelId,
                    systemPromptIndex: parsed.systemPromptIndex,
                });
                seenByBase[baseId].add(sysIdxKey);
            }
        });
        
        for (const baseId in groups) {
            groups[baseId].sort((a, b) => (a.systemPromptIndex ?? -1) - (b.systemPromptIndex ?? -1));
        }

        return Object.entries(groups).sort(([baseIdA], [baseIdB]) => baseIdA.localeCompare(baseIdB));

    }, [displayedModels]);

    // Determine display strategy based on all base IDs
    const allBaseIds = groupedModels.map(([baseId]) => baseId);
    const displayStrategy = getModelDisplayStrategy(allBaseIds);

    // Lazily request history when selection changes
    useEffect(() => {
        if (selectedModelId && requestHistory) requestHistory(selectedModelId);
    }, [selectedModelId, requestHistory]);

    return (
        <div className="flex flex-col md:flex-row gap-6 h-full min-h-0">
            <div className="md:w-1/3 lg:w-1/4 flex-shrink-0 flex flex-col min-h-0">
                <p className="text-sm font-semibold text-muted-foreground mb-3 px-1">Models</p>
                <div className="space-y-3 overflow-y-auto custom-scrollbar pr-2 flex-1 min-h-0">
                    {groupedModels.map(([baseId, variants]) => (
                        <div key={baseId}>
                            {variants.length > 1 ? (
                                <Collapsible defaultOpen={true}>
                                    <CollapsibleTrigger className='w-full'>
                                        <div className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-muted font-semibold text-primary text-base">
                                            <span title={displayStrategy.getTooltipName(baseId)}>{displayStrategy.getDisplayName(baseId)}</span>
                                            <Icon name="chevrons-up-down" className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="space-y-1 pt-1">
                                        {variants.map(({ modelId, systemPromptIndex }) => {
                                            const summary = calculateModelSummary(promptCoverageScores[modelId]);
                                            const systemPrompt = (systemPrompts && systemPromptIndex !== undefined) ? systemPrompts[systemPromptIndex] : undefined;
                                            
                                            let displayText = `Sys. Prompt #${systemPromptIndex}`;
                                            if (systemPrompt) {
                                                displayText = `"${systemPrompt}"`;
                                            } else if (systemPrompt === null) {
                                                displayText = '[No System Prompt]';
                                            }

                                            const similarityScore = promptSimilarities && (promptSimilarities[modelId]?.[IDEAL_MODEL_ID] ?? promptSimilarities[IDEAL_MODEL_ID]?.[modelId] ?? null);

                                                                                    return (
                                            <div key={modelId} className="pl-3">
                                                <SharedModelCard
                                                    displayText={displayText}
                                                    summary={summary}
                                                    similarityScore={similarityScore}
                                                    onClick={() => setSelectedModelId(modelId)}
                                                    isSelected={selectedModelId === modelId}
                                                    fullModelName={displayStrategy.getTooltipName(baseId)}
                                                />
                                            </div>
                                        );
                                        })}
                                    </CollapsibleContent>
                                </Collapsible>
                            ) : (
                                <div>
                                    {variants.map(({ modelId, systemPromptIndex }) => {
                                        const summary = calculateModelSummary(promptCoverageScores[modelId]);
                                        const systemPrompt = (systemPrompts && systemPromptIndex !== undefined) ? systemPrompts[systemPromptIndex] : undefined;
                                        
                                        let displayText = displayStrategy.getDisplayName(baseId);
                                        if (systemPrompt) {
                                            displayText += ` - "${systemPrompt}"`;
                                        } else if (systemPrompt === null) {
                                            displayText += ' - [No System Prompt]';
                                        }

                                        const similarityScore = promptSimilarities && (promptSimilarities[modelId]?.[IDEAL_MODEL_ID] ?? promptSimilarities[IDEAL_MODEL_ID]?.[modelId] ?? null);

                                        return (
                                            <div key={modelId}>
                                                <SharedModelCard
                                                    displayText={displayText}
                                                    summary={summary}
                                                    similarityScore={similarityScore}
                                                    onClick={() => setSelectedModelId(modelId)}
                                                    isSelected={selectedModelId === modelId}
                                                    fullModelName={displayStrategy.getTooltipName(baseId)}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="flex-grow min-w-0 flex flex-col min-h-0">
                 {selectedModelId ? (
                    <ModelCard
                        modelId={selectedModelId}
                        promptCoverageScores={promptCoverageScores}
                        promptResponses={promptResponses}
                        idealResponse={promptResponses[IDEAL_MODEL_ID]}
                        historiesForPrompt={historiesForPrompt}
                        requestHistory={requestHistory}
                        renderAs={renderAs}
                    />
                 ) : (
                    <div className="flex items-center justify-center h-full p-8 bg-muted/30 rounded-lg">
                        <p className="text-muted-foreground italic">Select a model to view its detailed evaluation.</p>
                    </div>
                 )}
            </div>
        </div>
    );
};

interface KeyPointCoverageTableProps {
  data: ImportedComparisonDataV2;
  promptId: string;
  displayedModels: string[]; // List of effective model IDs to display
  hideHeader?: boolean;
  renderAs?: RenderAsType;
}

const KeyPointCoverageTable: React.FC<KeyPointCoverageTableProps> = ({
  data,
  promptId,
  displayedModels,
  hideHeader = false,
  renderAs,
}) => {
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [historiesForPrompt, setHistoriesForPrompt] = useState<Record<string, any>>({});
  
  const {
      evaluationResults,
      config,
  } = data;
  
  const promptCoverageScores = useMemo(() => {
      return evaluationResults?.llmCoverageScores?.[promptId] || {};
  }, [evaluationResults, promptId]);

  const promptResponses = useMemo(() => {
    return data.allFinalAssistantResponses?.[promptId] || {};
  }, [data.allFinalAssistantResponses, promptId]);

  const promptSimilarities = useMemo(() => {
    return evaluationResults?.perPromptSimilarities?.[promptId] || null;
  }, [evaluationResults, promptId]);

  // Seed histories from initial data if available (sandbox runs include fullConversationHistories)
  const staticHistoriesForPrompt = useMemo(() => {
    const fh = (data as any).fullConversationHistories;
    return (fh && fh[promptId]) ? fh[promptId] as Record<string, any> : {};
  }, [data, promptId]);

  useEffect(() => {
    // Initialize with static histories for this prompt when prompt changes
    setHistoriesForPrompt(staticHistoriesForPrompt);
  }, [staticHistoriesForPrompt]);

  const requestHistory = React.useCallback((modelId: string) => {
    const baseUrl = `/api/comparison/${encodeURIComponent(data.configId)}/${encodeURIComponent(data.runLabel)}/${encodeURIComponent(data.timestamp)}`;
    if (staticHistoriesForPrompt[modelId] || historiesForPrompt[modelId]) return;
    (async () => {
      try {
        const resp = await fetch(`${baseUrl}/modal-data/${encodeURIComponent(promptId)}/${encodeURIComponent(modelId)}`);
        if (!resp.ok) {
          // Mark as loaded with no history to avoid perpetual "loading" state
          setHistoriesForPrompt(prev => ({ ...prev, [modelId]: [] }));
          return;
        }
        const json = await resp.json();
        if (Array.isArray(json.history)) {
          setHistoriesForPrompt(prev => ({ ...prev, [modelId]: json.history }));
        } else {
          // Loaded successfully but no history available
          setHistoriesForPrompt(prev => ({ ...prev, [modelId]: [] }));
        }
      } catch {}
    })();
  }, [data.configId, data.runLabel, data.timestamp, promptId, historiesForPrompt, staticHistoriesForPrompt]);

  const modelViewContent = (
    <>
      {/* Desktop View */}
      <div className="hidden md:block h-full">
        <ModelView
            displayedModels={displayedModels}
            promptCoverageScores={promptCoverageScores}
            promptResponses={promptResponses}
            systemPrompts={config.systems}
            promptSimilarities={promptSimilarities}
            historiesForPrompt={historiesForPrompt}
            requestHistory={requestHistory}
            renderAs={renderAs}
        />
      </div>
      
      {/* Mobile View */}
      <div className="md:hidden">
        <div className="flex items-center justify-center p-8 bg-muted/30 rounded-lg">
          <button
            onClick={() => setIsMobileModalOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-lg font-medium transition-colors"
          >
            View Model Analysis ({displayedModels.length} models)
          </button>
        </div>
      </div>
      
      {/* Mobile Modal */}
      <MobileKeyPointAnalysis
        data={data}
        promptId={promptId}
        displayedModels={displayedModels}
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
      />
    </>
  );

  if (displayedModels.length === 0) {
    return (
      <div className="p-4 my-4 text-center text-sm bg-muted/50 dark:bg-slate-800/50 rounded-lg ring-1 ring-border dark:ring-slate-700/70 text-muted-foreground dark:text-slate-400">
        No models available for key point coverage analysis.
      </div>
    );
  }

  if (hideHeader) {
    return modelViewContent;
  }

  return (
    <Card className="shadow-lg border-border dark:border-border mt-6">
        <CardHeader>
            <CardTitle className="text-primary">Key Point Coverage Analysis</CardTitle>
            <CardDescription className="text-muted-foreground pt-1 text-sm">
                Select a model on the left to see a detailed breakdown of how its response covers the evaluation criteria.
            </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col">
            {modelViewContent}
        </CardContent>
    </Card>
  );
};

export default KeyPointCoverageTable; 