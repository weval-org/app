'use client';

import React, { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import KeyPointCoverageTable from '@/app/analysis/components/KeyPointCoverageTable';
import PromptContextDisplay from '@/app/analysis/components/PromptContextDisplay';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { parseModelIdForDisplay, getCanonicalModels } from '@/app/utils/modelIdUtils';
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
        configId,
        runLabel,
        timestamp,
        fetchPromptResponses
    } = useAnalysis();

    const [responseCache, setResponseCache] = useState<Record<string, string>>({});
    const [evaluationCache, setEvaluationCache] = useState<Map<string, any>>(new Map());
    const [isLoading, setIsLoading] = useState(false);

    // Collapse temperature variants: keep only one entry per {baseId, systemPromptIndex}
    const canonicalModels = useMemo(() => {
        const base = displayedModels.filter(m => m !== IDEAL_MODEL_ID);
        return getCanonicalModels(base, data?.config);
    }, [displayedModels, data]);
    
    // Preload icons used in this modal and child components
    usePreloadIcons(['quote', 'chevrons-up-down']);
    
    const { isOpen, promptId } = promptDetailModal;

    // Fetch data when modal opens
    useEffect(() => {
        if (!isOpen || !promptId || !data) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch prompt responses for all models
                const responses = await fetchPromptResponses(promptId);
                if (responses) {
                    setResponseCache(responses);
                }

                // Fetch detailed evaluations in a single batch call
                try {
                    const baseUrl = `/api/comparison/${configId}/${runLabel}/${timestamp}`;
                    const resp = await fetch(`${baseUrl}/evaluation-details-batch/${encodeURIComponent(promptId)}`);
                    if (resp.ok) {
                        const batchData = await resp.json();
                        const evaluations = batchData.evaluations as Record<string, any>;
                        if (evaluations) {
                            setEvaluationCache(prev => {
                                const newMap = new Map(prev);
                                Object.entries(evaluations).forEach(([modelId, details]) => {
                                    newMap.set(`${promptId}:${modelId}`, details);
                                });
                                return newMap;
                            });
                        }
                    } else {
                        console.error('Failed to fetch batch evaluation details', resp.statusText);
                    }
                } catch (err) {
                    console.error('Error fetching batch evaluation details', err);
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [isOpen, promptId, data, canonicalModels, fetchPromptResponses, configId, runLabel, timestamp]);

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
        if (evaluationCache.size > 0 && enhanced.evaluationResults?.llmCoverageScores?.[promptId]) {
            const enhancedScores = { ...enhanced.evaluationResults.llmCoverageScores[promptId] };
            
            evaluationCache.forEach((details, cacheKey) => {
                if (cacheKey.startsWith(`${promptId}:`)) {
                    const modelId = cacheKey.substring(promptId.length + 1);
                    if (enhancedScores[modelId]) {
                        enhancedScores[modelId] = details;
                    }
                }
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
    }, [data, promptId, responseCache, evaluationCache]);

    if (!isOpen || !promptId || !data) {
        return null;
    }
    
    const promptConfig = data.config.prompts.find(p => p.id === promptId);
    const hasSystemVariants = Array.isArray(data.config.systems) && data.config.systems.length > 1;

    return (
        <Dialog open={isOpen} onOpenChange={closePromptDetailModal}>
            <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0">
                <DialogHeader className="p-4 md:p-6 border-b flex-shrink-0">
                    <DialogTitle className="text-xl font-semibold text-foreground">
                        Prompt Performance Analysis
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col min-h-0">
                    <div className='p-4 md:p-6 border-b flex-shrink-0'>
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">The Prompt</h3>
                        {promptConfig?.description && (
                            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1 mb-4">
                                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{promptConfig.description}</ReactMarkdown>
                            </div>
                        )}
                        
                        {promptConfig?.citation && (
                            <div className="flex items-start space-x-1.5 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-3 py-2 mb-4">
                                <Icon name="quote" className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                <span>Source: {promptConfig.citation}</span>
                            </div>
                        )}
                        
                        {effectiveSystemPrompt && (
                            <div className="mb-4">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                    {hasSystemVariants ? 'Base System Prompt' : 'System Prompt'}
                                </h4>
                                <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/40 ring-1 ring-green-200 dark:ring-green-800 text-sm text-green-900 dark:text-green-200 whitespace-pre-wrap">
                                    {effectiveSystemPrompt}
                                </div>
                            </div>
                        )}
                        <PromptContextDisplay promptContext={conversationContext || undefined} />
                    </div>
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
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default PromptPerformanceModal; 