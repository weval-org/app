'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { CoverageResult } from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { EvaluationView } from '@/app/analysis/components/SharedEvaluationComponents';
import { MobileModelPerformanceAnalysis, PromptPerformance as MobilePromptPerformance } from '@/app/analysis/components/MobileModelPerformanceAnalysis';
import PromptContextDisplay from '@/app/analysis/components/PromptContextDisplay';
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
    } = useAnalysis();

    const [expandedResponse, setExpandedResponse] = useState<Record<string, boolean>>({});
    const [isMobileView, setIsMobileView] = useState(false);

    // Preload icons used in this modal
    // usePreloadIcons(['quote', 'alert-triangle']);

    const { isOpen, modelId } = modelPerformanceModal;

    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);

    useEffect(() => {
        const checkMobile = () => setIsMobileView(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

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

    const currentVariantModelId = modelVariants.length > 0 ? modelVariants[selectedVariantIndex] : modelId;

    const allCoverageScores = data?.evaluationResults?.llmCoverageScores;
    const allFinalAssistantResponses = data?.allFinalAssistantResponses;
    const promptIds = data?.promptIds;
    const promptTexts = data ? Object.fromEntries(data.promptIds.map(id => [id, data.promptContexts?.[id] ? (typeof data.promptContexts[id] === 'string' ? data.promptContexts[id] as string : (data.promptContexts[id] as ConversationMessage[]).map(m => m.content).join('\n')) : id])) : {};
    const config = data?.config;

    const toggleLogExpansion = (index: number) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };
    
    const modelDisplayName = modelId ? getModelDisplayLabel(modelId, { hideSystemPrompt: true, hideTemperature: true }) : 'N/A';

    const promptPerformances = useMemo<PromptPerformance[]>(() => {
        if (!promptIds || !allCoverageScores || !allFinalAssistantResponses || !modelId) return [];
        return promptIds.map(promptId => {
            const coverageResult = allCoverageScores[promptId]?.[modelId];
            const response = allFinalAssistantResponses[promptId]?.[modelId];
            const promptText = promptTexts[promptId] || promptId;
            let score: number | null = null;
            let rank: 'excellent' | 'good' | 'poor' | 'error' = 'error';
            if (coverageResult && !('error' in coverageResult) && typeof coverageResult.avgCoverageExtent === 'number') {
                score = coverageResult.avgCoverageExtent;
                if (score >= 0.8) rank = 'excellent';
                else if (score >= 0.6) rank = 'good';
                else rank = 'poor';
            }
            return { promptId, promptText, coverageResult, response, score, rank };
        });
    }, [promptIds, allCoverageScores, allFinalAssistantResponses, promptTexts, modelId]);

    const sortedPrompts = useMemo(() => {
        return [...promptPerformances].sort((a, b) => {
            if (a.score === null && b.score === null) return 0;
            if (a.score === null) return 1;
            if (b.score === null) return -1;
            return b.score - a.score;
        });
    }, [promptPerformances]);

    useEffect(() => {
        if (sortedPrompts.length > 0) {
            const currentSelectionExists = sortedPrompts.some(p => p.promptId === selectedPromptId);
            if (!currentSelectionExists) {
                setSelectedPromptId(sortedPrompts[0].promptId);
            }
        } else {
            setSelectedPromptId(null);
        }
    }, [sortedPrompts, selectedPromptId]);

    const currentVariantPerformance = useMemo(() => {
        if (!selectedPromptId || !allCoverageScores || !allFinalAssistantResponses || !currentVariantModelId) return null;
    
        const coverageResult = allCoverageScores[selectedPromptId]?.[currentVariantModelId];
        const response = allFinalAssistantResponses[selectedPromptId]?.[currentVariantModelId];
        
        if (!coverageResult || response === undefined) return { error: 'Data not found for this variant.' };
        
        return { coverageResult, response };
    }, [selectedPromptId, allCoverageScores, allFinalAssistantResponses, currentVariantModelId]);

    const idealResponse = selectedPromptId && allFinalAssistantResponses ? allFinalAssistantResponses[selectedPromptId]?.[IDEAL_MODEL_ID] : null;

    const { effectiveSystemPrompt, conversationContext } = useMemo(() => {
        if (!selectedPromptId || !config || !data?.promptContexts || !currentVariantModelId) return { effectiveSystemPrompt: null, conversationContext: null };

        const context = data.promptContexts[selectedPromptId];
        let conversationContextValue: string | ConversationMessage[] | null | undefined = context;
        let effectiveSystemPromptValue: string | null = null;
        
        if (Array.isArray(context) && context.length > 0 && context[0].role === 'system') {
            effectiveSystemPromptValue = context[0].content;
            conversationContextValue = context.slice(1);
        } else {
            const promptConfig = config.prompts.find(p => p.id === selectedPromptId);
            if (promptConfig?.system) {
                effectiveSystemPromptValue = promptConfig.system;
                            } else {
                    const parsed = parseModelIdForDisplay(currentVariantModelId);
                    if (config.systems && typeof parsed.systemPromptIndex === 'number' && config.systems[parsed.systemPromptIndex]) {
                        effectiveSystemPromptValue = config.systems[parsed.systemPromptIndex];
                    } else if (config.systems && typeof parsed.systemPromptIndex === 'number' && config.systems[parsed.systemPromptIndex] === null) {
                        effectiveSystemPromptValue = '[No System Prompt]';
                    }
                }
            }

            // Fallback: try to pull from stored modelSystemPrompts in result data
            if (!effectiveSystemPromptValue) {
                effectiveSystemPromptValue = (data as any).modelSystemPrompts?.[currentVariantModelId] ?? null;
                if (effectiveSystemPromptValue === undefined) {
                    effectiveSystemPromptValue = null;
                }
            }

            return { effectiveSystemPrompt: effectiveSystemPromptValue, conversationContext: conversationContextValue };
    }, [selectedPromptId, currentVariantModelId, config, data?.promptContexts]);

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

    if (isMobileView && allCoverageScores && allFinalAssistantResponses) {
        return (
            <MobileModelPerformanceAnalysis
                modelId={modelId}
                modelDisplayName={modelDisplayName}
                promptPerformances={promptPerformances as MobilePromptPerformance[]}
                allCoverageScores={allCoverageScores}
                allFinalAssistantResponses={allFinalAssistantResponses}
                isOpen={isOpen}
                onClose={closeModelPerformanceModal}
            />
        );
    }

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
                        {currentVariantPerformance && config ? (
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
                                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">The Prompt</h3>
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
                                        {effectiveSystemPrompt && (
                                            <div className="p-2 rounded-md bg-sky-100/50 dark:bg-sky-900/30 text-xs text-sky-800 dark:text-sky-200 ring-1 ring-sky-200 dark:ring-sky-800 mb-4">
                                                <p className="font-semibold text-sky-900 dark:text-sky-300">System Prompt:</p>
                                                <p className="whitespace-pre-wrap font-mono">{effectiveSystemPrompt}</p>
                                            </div>
                                        )}
                                        <PromptContextDisplay promptContext={conversationContext ?? undefined} />
                                    </div>
                                </div>
                                {currentVariantPerformance.coverageResult && !('error' in currentVariantPerformance.coverageResult) && currentVariantPerformance.response ? (
                                    <EvaluationView assessments={currentVariantPerformance.coverageResult.pointAssessments || []} modelResponse={currentVariantPerformance.response} idealResponse={idealResponse ?? undefined} expandedLogs={expandedLogs} toggleLogExpansion={toggleLogExpansion}/>
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