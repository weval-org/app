'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getModelDisplayLabel, parseModelIdForDisplay, resolveModelId, findModelVariants } from '@/app/utils/modelIdUtils';
import { CoverageResult } from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { EvaluationView } from '@/app/analysis/components/SharedEvaluationComponents';
// Removed mobile-only component usage; unified layout will be used for all viewports
import TemperatureTabbedEvaluation, { TempVariantBundle } from './TemperatureTabbedEvaluation';
import { ConversationMessage } from '@/types/shared';
import { useAnalysis } from '../context/AnalysisContext';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { getHybridScoreColorClass } from '../utils/colorUtils';
import Icon from '@/components/ui/icon';
// import { usePreloadIcons } from '@/components/ui/use-preload-icons';

import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';

interface PromptPerformance {
    promptId: string;
    promptText: string;
    coverageResult: CoverageResult | undefined;
    response: string | undefined;
    score: number | null;
    rank: 'excellent' | 'good' | 'poor' | 'error';
}

const ModelPerformanceModal: React.FC = () => {
    const {
        data,
        modelPerformanceModal,
        closeModelPerformanceModal,
        displayedModels,
        openModelEvaluationDetailModal,
        promptTextsForMacroTable,
        analysisStats,
        fetchModalResponse,
        fetchEvaluationDetails,
        fetchEvaluationDetailsBatchForPrompt,
        fetchPromptResponses,
        getCachedResponse,
        getCachedEvaluation,
        openPromptSimilarityModal,
    } = useAnalysis();

    const [expandedResponse, setExpandedResponse] = useState<Record<string, boolean>>({});
    // No mobile-only rendering; unified layout

    // Preload icons used in this modal
    // usePreloadIcons(['quote', 'alert-triangle']);

    const { isOpen, modelId } = modelPerformanceModal;

    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
    const [isLoadingModalData, setIsLoadingModalData] = useState(false);
    const [evalRefreshKey, setEvalRefreshKey] = useState(0);
    const [historiesForPrompt, setHistoriesForPrompt] = useState<Record<string, any[]>>({});

    

    // No explicit abort logic; rely on unmounting and idempotent fetch handling

    // Fetching is defined after currentVariantModelId to satisfy linting rules

    const { modelVariants, initialVariantIndex } = useMemo(() => {
        if (!isOpen || !modelId || !data) return { modelVariants: [], initialVariantIndex: 0 };

        const clickedParsed = parseModelIdForDisplay(modelId);
        const variants = data.effectiveModels
            .filter(m => {
                const p = parseModelIdForDisplay(m);
                return p.baseId === clickedParsed.baseId && p.temperature === clickedParsed.temperature;
            })
            .sort((a, b) => {
                const idxA = parseModelIdForDisplay(a).systemPromptIndex ?? 0;
                const idxB = parseModelIdForDisplay(b).systemPromptIndex ?? 0;
                return idxA - idxB;
            });
        
        return {
            modelVariants: variants.length > 1 ? variants : [],
            initialVariantIndex: clickedParsed.systemPromptIndex ?? 0
        };
    }, [isOpen, modelId, data]);

    const [selectedVariantIndex, setSelectedVariantIndex] = useState(initialVariantIndex);

    useEffect(() => {
        setSelectedVariantIndex(initialVariantIndex);
    }, [initialVariantIndex]);

    // Resolve the model ID for baseId values (from leaderboard) using utility function
    const resolvedModelId = useMemo(() => {
        if (!modelId || !data?.effectiveModels) {
            console.log('🔸 ModelPerformanceModal: resolvedModelId - missing data', { hasModelId: !!modelId, hasEffectiveModels: !!data?.effectiveModels });
            return modelId;
        }
        const resolved = resolveModelId(modelId, data.effectiveModels);
        console.log('🔸 ModelPerformanceModal: resolvedModelId', { originalModelId: modelId, resolvedModelId: resolved });
        return resolved;
    }, [modelId, data?.effectiveModels]);

    const currentVariantModelId = modelVariants.length > 0 ? modelVariants[selectedVariantIndex] : resolvedModelId;
    
    console.log('🔶 ModelPerformanceModal: currentVariantModelId calculation', {
        modelVariantsLength: modelVariants.length,
        selectedVariantIndex,
        resolvedModelId,
        currentVariantModelId,
        modelVariants: modelVariants.slice(0, 3)
    });

    // Use enhanced coverage scores with detailed evaluation data
    const allCoverageScores = useMemo(() => {
        if (!data?.evaluationResults?.llmCoverageScores) return null;
        return data.evaluationResults.llmCoverageScores;
    }, [data?.evaluationResults?.llmCoverageScores]);
    
    // Use cached model responses instead of stripped core data
    const allFinalAssistantResponses = useMemo(() => {
        if (!data?.allFinalAssistantResponses) return null;
        return data.allFinalAssistantResponses;
    }, [data?.allFinalAssistantResponses]);
    const promptIds = data?.promptIds;
    const promptTexts = data ? Object.fromEntries(data.promptIds.map(id => [id, data.promptContexts?.[id] ? (typeof data.promptContexts[id] === 'string' ? data.promptContexts[id] as string : (data.promptContexts[id] as ConversationMessage[]).map(m => m.content).join('\n')) : id])) : {};
    const config = data?.config;

    const toggleLogExpansion = (index: number) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };
    
    const modelDisplayName = modelId ? getModelDisplayLabel(modelId, { hideSystemPrompt: true, hideTemperature: true }) : 'N/A';

    const promptPerformances = useMemo<PromptPerformance[]>(() => {
        console.log('🟣 ModelPerformanceModal: Computing promptPerformances', {
            hasPromptIds: !!promptIds,
            promptIdsCount: promptIds?.length,
            hasAllCoverageScores: !!allCoverageScores,
            hasAllFinalAssistantResponses: !!allFinalAssistantResponses,
            modelId,
            resolvedModelId,
            allCoverageScoresKeys: allCoverageScores ? Object.keys(allCoverageScores).slice(0, 3) : [],
            allFinalAssistantResponsesKeys: allFinalAssistantResponses ? Object.keys(allFinalAssistantResponses).slice(0, 3) : []
        });

        if (!promptIds || !allCoverageScores || !allFinalAssistantResponses || !modelId || !resolvedModelId) return [];
        
        const performances = promptIds.map(promptId => {
            // Use resolvedModelId to get data for the actual model variant
            const coverageResult = allCoverageScores[promptId]?.[resolvedModelId];
            const response = allFinalAssistantResponses[promptId]?.[resolvedModelId];
            const promptText = promptTexts[promptId] || promptId;
            
            console.log(`⚡ ModelPerformanceModal: Processing prompt ${promptId}`, {
                hasCoverageResult: !!coverageResult,
                hasResponse: !!response,
                coverageResultType: coverageResult && 'error' in coverageResult ? 'error' : 'data',
                avgCoverageExtent: coverageResult && !('error' in coverageResult) ? coverageResult.avgCoverageExtent : null
            });
            
            let score: number | null = null;
            let rank: 'excellent' | 'good' | 'poor' | 'error' = 'error';
            if (coverageResult && !('error' in coverageResult) && typeof coverageResult.avgCoverageExtent === 'number') {
                score = coverageResult.avgCoverageExtent;
                if (score !== null && score >= 0.8) rank = 'excellent';
                else if (score !== null && score >= 0.6) rank = 'good';
                else if (score !== null) rank = 'poor';
            }
            return { promptId, promptText, coverageResult, response, score, rank };
        });
        
        console.log('🟣 ModelPerformanceModal: Final promptPerformances', {
            count: performances.length,
            ranks: performances.map(p => ({ promptId: p.promptId, rank: p.rank, score: p.score }))
        });
        
        return performances;
    }, [promptIds, allCoverageScores, allFinalAssistantResponses, promptTexts, modelId, resolvedModelId]);

    const sortedPrompts = useMemo(() => {
        return [...promptPerformances].sort((a, b) => {
            if (a.score === null && b.score === null) return 0;
            if (a.score === null) return 1;
            if (b.score === null) return -1;
            return b.score - a.score;
        });
    }, [promptPerformances]);

    // Enhance promptPerformances for mobile with cached detailed evaluations/responses
    // Unified data path; no separate mobile dataset

    // Do not auto-select a prompt; wait for user click to avoid unnecessary fetching
    useEffect(() => {
        if (sortedPrompts.length === 0 && selectedPromptId !== null) {
            setSelectedPromptId(null);
        }
    }, [sortedPrompts, selectedPromptId]);

    const currentVariantPerformance = useMemo(() => {
        console.log('🎯 ModelPerformanceModal: Computing currentVariantPerformance', {
            selectedPromptId,
            hasAllCoverageScores: !!allCoverageScores,
            hasAllFinalAssistantResponses: !!allFinalAssistantResponses,
            currentVariantModelId,
            coverageScoresForPrompt: selectedPromptId && allCoverageScores ? Object.keys(allCoverageScores[selectedPromptId] || {}) : [],
            responsesForPrompt: selectedPromptId && allFinalAssistantResponses ? Object.keys(allFinalAssistantResponses[selectedPromptId] || {}) : []
        });

        if (!selectedPromptId || !allCoverageScores || !allFinalAssistantResponses || !currentVariantModelId) return null;
    
        const coverageResult = allCoverageScores[selectedPromptId]?.[currentVariantModelId];
        const cachedResp = getCachedResponse(selectedPromptId, currentVariantModelId);
        const response = cachedResp !== null ? cachedResp : allFinalAssistantResponses[selectedPromptId]?.[currentVariantModelId];
        
        console.log('🎯 ModelPerformanceModal: Data lookup results', {
            selectedPromptId,
            currentVariantModelId,
            hasCoverageResult: !!coverageResult,
            hasResponse: response !== undefined,
            coverageResultType: coverageResult && 'error' in coverageResult ? 'error' : 'data',
            responseLength: typeof response === 'string' ? response.length : 'not-string'
        });
        
        if (!coverageResult || response === undefined) {
            console.log('🎯 ModelPerformanceModal: Returning error - missing data');
            return { error: 'Data not found for this variant.' };
        }
        
        console.log('🎯 ModelPerformanceModal: Returning valid performance data');
        return { coverageResult, response };
    }, [selectedPromptId, allCoverageScores, allFinalAssistantResponses, currentVariantModelId, getCachedResponse, isLoadingModalData, evalRefreshKey]);

    const idealResponse = selectedPromptId && allFinalAssistantResponses ? allFinalAssistantResponses[selectedPromptId]?.[IDEAL_MODEL_ID] : null;

    // Fetch data only when a prompt is selected (on-demand), scoped to the current model variant
    useEffect(() => {
        if (!isOpen || !data || !selectedPromptId || !currentVariantModelId) return;
        setIsLoadingModalData(true);
        Promise.all([
            fetchModalResponse(selectedPromptId, currentVariantModelId),
            fetchEvaluationDetails(selectedPromptId, currentVariantModelId),
        ]).finally(() => setIsLoadingModalData(false));
    }, [isOpen, data, selectedPromptId, currentVariantModelId, fetchModalResponse, fetchEvaluationDetails]);

    // Batch load prompt-level details and responses so temps/assessments are complete
    useEffect(() => {
        if (!isOpen || !data || !selectedPromptId) return;
        (async () => {
            try {
                await Promise.all([
                    fetchEvaluationDetailsBatchForPrompt(selectedPromptId),
                    fetchPromptResponses(selectedPromptId),
                ]);
            } finally {
                setEvalRefreshKey(k => k + 1);
            }
        })();
    }, [isOpen, data, selectedPromptId, fetchEvaluationDetailsBatchForPrompt, fetchPromptResponses]);

    // Lazily fetch conversation histories for all matching temps for the selected prompt
    useEffect(() => {
        if (!isOpen || !data || !selectedPromptId || !currentVariantModelId) return;
        try {
            const clickedParsed = parseModelIdForDisplay(currentVariantModelId);
            const matchingModelIds = data.effectiveModels.filter((m) => {
                const p = parseModelIdForDisplay(m);
                return (
                    p.baseId === clickedParsed.baseId &&
                    (p.systemPromptIndex ?? 0) === (clickedParsed.systemPromptIndex ?? 0)
                );
            });
            const baseUrl = `/api/comparison/${encodeURIComponent(data.configId)}/${encodeURIComponent(data.runLabel)}/${encodeURIComponent(data.timestamp)}`;
            matchingModelIds.forEach(async (mId) => {
                const cacheKey = `${selectedPromptId}:${mId}`;
                if (historiesForPrompt[cacheKey]) return;
                try {
                    const url = `${baseUrl}/modal-data/${encodeURIComponent(selectedPromptId)}/${encodeURIComponent(mId)}`;
                    const resp = await fetch(url);
                    if (!resp.ok) return;
                    const json = await resp.json();
                    if (Array.isArray(json.history)) {
                        setHistoriesForPrompt(prev => ({ ...prev, [cacheKey]: json.history }));
                    }
                } catch {}
            });
        } catch {}
    }, [isOpen, data, selectedPromptId, currentVariantModelId, historiesForPrompt]);

    // Build temperature bundles for the selected system variant
    const tempVariants: TempVariantBundle[] = useMemo(() => {
        if (
            !selectedPromptId ||
            !data ||
            !allCoverageScores ||
            !allFinalAssistantResponses ||
            !currentVariantModelId
        ) {
            return [];
        }

        const clickedParsed = parseModelIdForDisplay(currentVariantModelId);

        // Gather all models that share the same baseId and systemPromptIndex but vary in temperature
        const matchingModelIds = data.effectiveModels.filter((m) => {
            const p = parseModelIdForDisplay(m);
            return (
                p.baseId === clickedParsed.baseId &&
                (p.systemPromptIndex ?? 0) === (clickedParsed.systemPromptIndex ?? 0)
            );
        });

        const perTempBundles: TempVariantBundle[] = [];

        matchingModelIds.forEach((mId) => {
            const p = parseModelIdForDisplay(mId);
            const temp = p.temperature ?? 0;
            const cov = getCachedEvaluation(selectedPromptId, mId) || allCoverageScores[selectedPromptId]?.[mId];
            const cachedResp = getCachedResponse(selectedPromptId, mId);
            const resp = cachedResp !== null ? cachedResp : allFinalAssistantResponses[selectedPromptId]?.[mId];
            const histKey = `${selectedPromptId}:${mId}`;
            const genHist = historiesForPrompt[histKey];
            if (
                cov &&
                !('error' in cov) &&
                resp !== undefined &&
                typeof temp === 'number'
            ) {
                perTempBundles.push({
                    temperature: temp,
                    assessments: cov.pointAssessments || [],
                    modelResponse: resp,
                    generatedHistory: Array.isArray(genHist) ? genHist : undefined,
                });
            }
        });

        if (perTempBundles.length === 0) {
            // Fallback to whatever current variant we have as a single variant (no tabs)
            if (
                currentVariantPerformance &&
                !('error' in currentVariantPerformance) &&
                currentVariantPerformance.coverageResult &&
                !('error' in currentVariantPerformance.coverageResult) &&
                currentVariantPerformance.response
            ) {
                const parsed = parseModelIdForDisplay(currentVariantModelId);
                const histKey = `${selectedPromptId}:${currentVariantModelId}`;
                const genHist = historiesForPrompt[histKey];
                return [{
                    temperature: typeof parsed.temperature === 'number' ? parsed.temperature : 0,
                    assessments: (getCachedEvaluation(selectedPromptId, currentVariantModelId)?.pointAssessments) || currentVariantPerformance.coverageResult.pointAssessments || [],
                    modelResponse: currentVariantPerformance.response,
                    generatedHistory: Array.isArray(genHist) ? genHist : undefined,
                }];
            }
            return [];
        }

        // Sort by temperature ascending and dedupe identical temperatures
        perTempBundles.sort((a, b) => (a.temperature ?? 0) - (b.temperature ?? 0));
        const seen = new Set<number>();
        const deduped: TempVariantBundle[] = [];
        perTempBundles.forEach(b => {
            const t = b.temperature ?? 0;
            if (!seen.has(t)) {
                seen.add(t);
                deduped.push(b);
            }
        });
        return deduped;
    }, [selectedPromptId, data, allCoverageScores, allFinalAssistantResponses, currentVariantModelId, currentVariantPerformance, isLoadingModalData, getCachedEvaluation, getCachedResponse, historiesForPrompt, evalRefreshKey]);

    // System prompt and prompt context are no longer displayed in this modal header area

    const getScoreColor = (rank: 'excellent' | 'good' | 'poor' | 'error') => {
        switch (rank) {
            case 'excellent': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
            case 'good': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
            case 'poor': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
            case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
        }
    };

    const renderPromptCard = (performance: PromptPerformance) => (
        <Card 
            key={performance.promptId}
            className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedPromptId === performance.promptId ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setSelectedPromptId(performance.promptId)}
        >
            <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium line-clamp-2 flex-1">{performance.promptText}</CardTitle>
                    <Badge className={getScoreColor(performance.rank)}>{performance.score !== null ? `${(performance.score * 100).toFixed(0)}%` : 'Error'}</Badge>
                </div>
            </CardHeader>
        </Card>
    );

    if (!isOpen || !modelId || !data) return null;

    // Always render unified dialog

    return (
        <Dialog open={isOpen} onOpenChange={closeModelPerformanceModal}>
            <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0">
                <DialogHeader className="p-4 md:p-6 border-b flex-shrink-0">
                    <DialogTitle className="text-xl font-semibold text-foreground">Model Performance: <span className="text-primary">{modelDisplayName}</span></DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col md:flex-row min-h-0">
                    <div className="md:w-1/3 lg:w-1/4 border-r flex-shrink-0 flex flex-col min-h-0">
                        <div className="p-4 border-b"><h3 className="font-semibold text-sm">Select Prompt</h3></div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">{sortedPrompts.map(renderPromptCard)}</div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                        {isLoadingModalData ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="text-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                                    <p className="text-muted-foreground">Loading model responses and evaluations...</p>
                                </div>
                            </div>
                        ) : currentVariantPerformance && config ? (
                            <div className="flex-1 flex flex-col min-h-0 p-4 md:p-6 overflow-y-auto custom-scrollbar">
                                {modelVariants.length > 0 && (
                                    <div className="mb-4 pb-4 border-b">
                                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">System Prompt Variant</h3>
                                        <RadioGroup
                                            value={selectedVariantIndex.toString()}
                                            onValueChange={(value) => setSelectedVariantIndex(parseInt(value, 10))}
                                            className="flex flex-wrap gap-4"
                                        >
                                            {modelVariants.map((variantId, index) => {
                                                const parsedVariant = parseModelIdForDisplay(variantId);
                                                const score = analysisStats?.perSystemVariantHybridScores?.[parsedVariant.systemPromptIndex ?? 0];
                                                return (
                                                    <div key={variantId} className="flex items-center space-x-2">
                                                        <RadioGroupItem value={index.toString()} id={`perf-variant-${index}`} />
                                                        <Label htmlFor={`perf-variant-${index}`} className="text-sm cursor-pointer">
                                                            <div className="flex items-center gap-2">
                                                                <span>Variant {parsedVariant.systemPromptIndex ?? index}</span>
                                                                {score !== null && score !== undefined && (
                                                                    <span className={`px-1.5 py-0.5 rounded-sm text-xs font-semibold ${getHybridScoreColorClass(score)}`}>
                                                                        {(score * 100).toFixed(0)}%
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </Label>
                                                    </div>
                                                );
                                            })}
                                        </RadioGroup>
                                    </div>
                                )}
                                <div className="mb-4 pb-4 border-b">
                                    <div className="mb-4">
                                        {openPromptSimilarityModal && selectedPromptId && (
                                            <button
                                                onClick={() => openPromptSimilarityModal(selectedPromptId)}
                                                className="ml-2 text-xs font-normal underline underline-offset-2 text-muted-foreground hover:text-primary"
                                                title="View semantic similarity matrix between models for this prompt"
                                            >
                                                View and compare model embeddings & similarities
                                            </button>
                                        )}
                                        {config.prompts.find(p => p.id === selectedPromptId)?.description && (
                                            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1 mb-4">
                                                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{config.prompts.find(p => p.id === selectedPromptId)?.description}</ReactMarkdown>
                                            </div>
                                        )}
                                        {config.prompts.find(p => p.id === selectedPromptId)?.citation && (
                                            <div className="flex items-start space-x-1.5 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-3 py-2 mb-4">
                                                <Icon name="quote" className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                                <span>Source: {config.prompts.find(p => p.id === selectedPromptId)?.citation}</span>
                                            </div>
                                        )}
                                        {/* System prompt and conversation thread omitted; history is shown with the model output */}
                                    </div>
                                </div>
                                {currentVariantPerformance.coverageResult && !('error' in currentVariantPerformance.coverageResult) && currentVariantPerformance.response ? (
                                    <TemperatureTabbedEvaluation
                                        variants={tempVariants}
                                        idealResponse={idealResponse ?? undefined}
                                        expandedLogs={expandedLogs}
                                        toggleLogExpansion={toggleLogExpansion}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-muted/50 rounded-lg">
                                        <Icon name="alert-triangle" className="w-12 h-12 text-destructive/80 mb-4" />
                                        <h3 className="text-lg font-semibold text-foreground">Evaluation Not Available</h3>
                                        <p className="text-sm text-muted-foreground max-w-md">There was an error generating the evaluation for this prompt, or the model did not provide a response.</p>
                                        {currentVariantPerformance.coverageResult && 'error' in currentVariantPerformance.coverageResult && (<pre className="mt-4 text-xs bg-destructive/10 text-destructive-foreground p-2 rounded-md whitespace-pre-wrap text-left w-full max-w-lg">{currentVariantPerformance.coverageResult.error}</pre>)}
                                    </div>
                                )}
                            </div>
                        ) : (<div className="flex items-center justify-center h-full text-muted-foreground">Select a prompt to view details.</div>)}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ModelPerformanceModal; 