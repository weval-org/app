'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import KeyPointCoverageTable from '@/app/analysis/components/KeyPointCoverageTable';
import PromptContextDisplay from '@/app/analysis/components/PromptContextDisplay';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import Icon from '@/components/ui/icon';
import { usePreloadIcons } from '@/components/ui/use-preload-icons';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

const PromptPerformanceModal: React.FC = () => {
    const {
        data,
        promptDetailModal,
        closePromptDetailModal,
        displayedModels,
        fetchPromptResponses,
        fetchEvaluationDetailsBatchForPrompt,
        getCachedEvaluation,
        openPromptSimilarityModal,
    } = useAnalysis();

    const [responseCache, setResponseCache] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);
    const isFetchingRef = useRef(false);
    const [isPromptDetailsExpanded, setIsPromptDetailsExpanded] = useState<boolean>(false);

    // Collapse temperature variants: keep only one entry per {baseId, systemPromptIndex}
    // For PromptPerformanceModal we want to show each system-prompt variant
    // so we *do not* collapse variants by system prompt. We still exclude the IDEAL model.
    const canonicalModels = useMemo(() => {
        return displayedModels.filter(m => m !== IDEAL_MODEL_ID);
    }, [displayedModels]);
    
    // Preload icons used in this modal and child components
    usePreloadIcons(['quote', 'chevrons-up-down']);
    
    const { isOpen, promptId } = promptDetailModal;

    // Persist expanded/collapsed state per prompt in localStorage
    useEffect(() => {
        if (!promptId) return;
        try {
            const key = `weval_prompt_performance_expanded_${promptId}`;
            const stored = localStorage.getItem(key);
            setIsPromptDetailsExpanded(stored ? stored === '1' : false);
        } catch {}
    }, [promptId]);

    const togglePromptDetails = () => {
        const next = !isPromptDetailsExpanded;
        setIsPromptDetailsExpanded(next);
        try {
            if (promptId) {
                const key = `weval_prompt_performance_expanded_${promptId}`;
                localStorage.setItem(key, next ? '1' : '0');
            }
        } catch {}
    };

    // Fetch data when modal opens (deduped; guard against StrictMode double-invoke)
    useEffect(() => {
        if (!isOpen || !promptId || !data) return;
        if (isFetchingRef.current) return;

        const fetchData = async () => {
            setIsLoading(true);
            isFetchingRef.current = true;
            try {
                // Fetch prompt responses for all models
                const responses = await fetchPromptResponses(promptId);
                if (responses) {
                    setResponseCache(responses);
                }

                // Fetch detailed evaluations in a single batch call
                await fetchEvaluationDetailsBatchForPrompt(promptId);
            } finally {
                setIsLoading(false);
                isFetchingRef.current = false;
            }
        };

        fetchData();
    }, [isOpen, promptId, data, fetchPromptResponses, fetchEvaluationDetailsBatchForPrompt]);

    // No explicit abort logic; rely on unmount and dedupe behavior

    const promptContext = useMemo(() => {
        if (!data || !promptId) return null;
        return data.promptContexts?.[promptId];
    }, [data, promptId]);

    const { effectiveSystemPrompt, conversationContext } = useMemo(() => {
        if (!promptId || !data) return { effectiveSystemPrompt: null, conversationContext: null };

        const context = data.promptContexts?.[promptId];
        let conversationContextValue = context;
        let effectiveSystemPromptValue: string | null = null;
        
        if (Array.isArray(context) && context.length > 0 && context[0].role === 'system') {
            effectiveSystemPromptValue = context[0].content;
            conversationContextValue = context.slice(1);
        } else {
            const promptConfig = data.config.prompts.find(p => p.id === promptId);
            if (promptConfig?.system) {
                effectiveSystemPromptValue = promptConfig.system;
            } else if (data.config.system) {
                effectiveSystemPromptValue = data.config.system;
            } else if (Array.isArray(data.config.systems) && data.config.systems.length > 0) {
                effectiveSystemPromptValue = data.config.systems[0];
            }
        }
        
        return { effectiveSystemPrompt: effectiveSystemPromptValue, conversationContext: conversationContextValue };
    }, [promptId, data]);

    // Create enhanced data object with lazy-loaded responses and detailed evaluations
    const enhancedData = useMemo(() => {
        if (!data || !promptId) return data;

        // Create a copy of data with enhanced response and evaluation data
        const enhanced = { ...data };

        // Replace allFinalAssistantResponses for this prompt with cached responses
        if (Object.keys(responseCache).length > 0) {
            enhanced.allFinalAssistantResponses = {
                ...data.allFinalAssistantResponses,
                [promptId]: responseCache
            };
        }

        // Replace llmCoverageScores with detailed evaluation data that includes keyPointText
        if (enhanced.evaluationResults?.llmCoverageScores?.[promptId]) {
            const enhancedScores = { ...enhanced.evaluationResults.llmCoverageScores[promptId] };
            
            Object.keys(enhancedScores).forEach((modelId) => {
                const details = getCachedEvaluation(promptId, modelId);
                if (details) enhancedScores[modelId] = details;
            });

            enhanced.evaluationResults = {
                ...enhanced.evaluationResults,
                llmCoverageScores: {
                    ...enhanced.evaluationResults.llmCoverageScores,
                    [promptId]: enhancedScores
                }
            };
        }

        return enhanced;
    }, [data, promptId, responseCache, getCachedEvaluation]);

    if (!isOpen || !promptId || !data) {
        return null;
    }
    
    const config = data.config;
    const promptConfig = config.prompts.find(p => p.id === promptId);
    const hasSystemVariants = Array.isArray(data.config.systems) && data.config.systems.length > 1;

    return (
        <Dialog open={isOpen} onOpenChange={closePromptDetailModal}>
            <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0">
                <DialogHeader className="p-4 md:p-6 border-b flex-shrink-0">
                    <DialogTitle className="text-xl font-semibold text-foreground">
                        Prompt: <code>{promptId}</code>{openPromptSimilarityModal && (
                                    <button
                                        type="button"
                                        onClick={() => openPromptSimilarityModal(promptId)}
                                        className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-border hover:bg-muted/50 text-foreground ml-2"
                                        title="View semantic similarity matrix between models for this prompt"
                                    >
                                        View and compare model embeddings & similarities
                                    </button>
                                )}
                    </DialogTitle>
                </DialogHeader>

                <div className="p-4 md:p-6 flex-1 min-h-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                                <p className="text-muted-foreground">Loading prompt evaluation details...</p>
                            </div>
                        </div>
                    ) : (
                        <KeyPointCoverageTable
                            data={enhancedData!}
                            promptId={promptId}
                            displayedModels={canonicalModels}
                            hideHeader={true}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default PromptPerformanceModal; 