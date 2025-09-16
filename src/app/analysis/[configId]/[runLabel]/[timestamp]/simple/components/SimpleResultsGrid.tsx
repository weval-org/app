'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { getModelDisplayLabel, parseModelIdForDisplay, getCanonicalModels } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import Icon from '@/components/ui/icon';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import RemarkGfmPlugin from 'remark-gfm';

export const SimpleResultsGrid: React.FC = () => {
    const { 
        data, 
        modelsForMacroTable,
        openModelEvaluationDetailModal,
        openPromptDetailModal,
        openModelPerformanceModal,
        fetchPromptResponses,
        getCachedResponse,
        configId,
        runLabel,
        timestamp 
    } = useAnalysis();
    
    const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
    const [showAllPrompts, setShowAllPrompts] = useState(false);
    const [isLoadingResponses, setIsLoadingResponses] = useState(false);
    const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set());

    // Fetch responses when a prompt is selected
    useEffect(() => {
        if (selectedPrompt && fetchPromptResponses) {
            setIsLoadingResponses(true);
            setExpandedResponses(new Set()); // Reset expanded state when changing prompts
            fetchPromptResponses(selectedPrompt).finally(() => {
                setIsLoadingResponses(false);
            });
        }
    }, [selectedPrompt, fetchPromptResponses]);

    const toggleResponseExpansion = (modelId: string) => {
        setExpandedResponses(prev => {
            const newSet = new Set(prev);
            if (newSet.has(modelId)) {
                newSet.delete(modelId);
            } else {
                newSet.add(modelId);
            }
            return newSet;
        });
    };

    if (!data?.evaluationResults?.llmCoverageScores) {
        return null;
    }

    const { 
        evaluationResults: { llmCoverageScores: allCoverageScores },
        promptIds,
        promptContexts,
        config,
    } = data;

    // Get canonical models (collapse variants)
    const canonicalModels = useMemo(() => {
        const models = modelsForMacroTable.filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase());
        return getCanonicalModels(models, config);
    }, [modelsForMacroTable, config]);

    // Get simplified prompt data
    const promptData = useMemo(() => {
        return promptIds.map(promptId => {
            const context = promptContexts?.[promptId];
            let displayText = promptId;
            
            if (typeof context === 'string') {
                displayText = context.length > 100 ? `${context.substring(0, 100)}...` : context;
            } else if (Array.isArray(context) && context.length > 0) {
                const lastUserMessage = [...context].reverse().find(msg => msg.role === 'user');
                if (lastUserMessage && typeof lastUserMessage.content === 'string') {
                    const text = lastUserMessage.content;
                    displayText = text.length > 100 ? `${text.substring(0, 100)}...` : text;
                }
            }
            
            return {
                id: promptId,
                displayText,
                fullContext: context
            };
        });
    }, [promptIds, promptContexts]);

    const displayedPrompts = showAllPrompts ? promptData : promptData.slice(0, 8);

    // Calculate scores for each model-prompt combination
    const getScore = (promptId: string, modelId: string) => {
        const result = allCoverageScores[promptId]?.[modelId];
        if (!result || 'error' in result || typeof result.avgCoverageExtent !== 'number') {
            return null;
        }
        return result.avgCoverageExtent;
    };

    // Get color class for score
    const getScoreColorClass = (score: number | null) => {
        if (score === null) return 'bg-gray-200 dark:bg-gray-700';
        if (score >= 0.8) return 'bg-green-500';
        if (score >= 0.6) return 'bg-yellow-500';
        if (score >= 0.4) return 'bg-orange-500';
        return 'bg-red-500';
    };

    // Get model average score
    const getModelAverage = (modelId: string) => {
        const scores = promptIds.map(pid => getScore(pid, modelId)).filter(s => s !== null) as number[];
        if (scores.length === 0) return null;
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    };

    // Get prompt average score
    const getPromptAverage = (promptId: string) => {
        const scores = canonicalModels.map(mid => getScore(promptId, mid)).filter(s => s !== null) as number[];
        if (scores.length === 0) return null;
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    };

    if (selectedPrompt) {
        // Single prompt view - show model responses
        const prompt = promptData.find(p => p.id === selectedPrompt);
        if (!prompt) return null;

        const promptConfig = data.config.prompts?.find(p => p.id === selectedPrompt);
        const renderAs = promptConfig?.render_as || 'markdown';

        // Get the actual responses for this prompt from cache
        const getResponseForModel = (modelId: string) => {
            return getCachedResponse ? getCachedResponse(selectedPrompt, modelId) : null;
        };

        return (
            <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xl font-bold">
                            Model Responses
                        </CardTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedPrompt(null)}
                            className="gap-2"
                        >
                            <Icon name="arrow-left" className="w-4 h-4" />
                            Back to overview
                        </Button>
                    </div>
                    <div className="text-left">
                        <p className="text-sm text-muted-foreground mb-3">Test Scenario:</p>
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                            <div className="text-base leading-relaxed text-foreground">
                                {typeof prompt.fullContext === 'string' ? (
                                    prompt.fullContext
                                ) : Array.isArray(prompt.fullContext) && prompt.fullContext.length > 0 ? (
                                    <div className="space-y-3">
                                        {prompt.fullContext.map((message, index) => (
                                            <div key={index} className={`p-3 rounded-md ${
                                                message.role === 'system' 
                                                    ? 'bg-gray-100 dark:bg-gray-800 border-l-4 border-gray-400' 
                                                    : message.role === 'user'
                                                    ? 'bg-blue-100 dark:bg-blue-900/40 border-l-4 border-blue-500'
                                                    : 'bg-green-100 dark:bg-green-900/40 border-l-4 border-green-500'
                                            }`}>
                                                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                                    {message.role}
                                                </div>
                                                <div className="text-sm leading-relaxed">
                                                    {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    prompt.id
                                )}
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoadingResponses ? (
                        <div className="flex items-center justify-center py-8">
                            <Icon name="loader-2" className="h-6 w-6 animate-spin text-primary mr-2" />
                            <span className="text-muted-foreground">Loading responses...</span>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {canonicalModels.map(modelId => {
                                const score = getScore(selectedPrompt, modelId);
                                const response = getResponseForModel(modelId);
                                const hasResponse = response && response.trim() !== '';
                                const displayResponse = hasResponse ? response : 'Loading response...';
                                const displayLabel = getModelDisplayLabel(parseModelIdForDisplay(modelId), {
                                    hideProvider: true,
                                    hideModelMaker: true,
                                    hideSystemPrompt: true,
                                    hideTemperature: true,
                                    prettifyModelName: true
                                });

                            return (
                                <div
                                    key={modelId}
                                    className="border border-border/50 rounded-lg overflow-hidden hover:shadow-md transition-all duration-200"
                                >
                                    {/* Header with model name and score */}
                                    <div 
                                        className="flex items-center justify-between p-4 bg-muted/20 border-b border-border/30 cursor-pointer hover:bg-muted/30 transition-colors group"
                                        onClick={() => openModelEvaluationDetailModal({ promptId: selectedPrompt, modelId })}
                                        title="Click to see detailed evaluation breakdown"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="font-semibold group-hover:text-primary transition-colors">{displayLabel}</span>
                                            <div
                                                className={`w-12 h-2 rounded-full ${getScoreColorClass(score)} hover:scale-105 transition-transform`}
                                                title={score ? `${(score * 100).toFixed(1)}% score • Click for breakdown` : 'No score available'}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-mono group-hover:text-primary transition-colors">
                                                {score ? `${(score * 100).toFixed(0)}%` : '-'}
                                            </span>
                                            <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                        </div>
                                    </div>
                                    
                                    {/* Response content */}
                                    <div className="p-4">
                                        {hasResponse ? (
                                            <div className="relative">
                                                <div 
                                                    className={`prose prose-sm dark:prose-invert max-w-none text-foreground/90 transition-all duration-300 ${
                                                        expandedResponses.has(modelId) ? '' : 'max-h-64 overflow-hidden'
                                                    }`}
                                                >
                                                    <ResponseRenderer content={displayResponse} renderAs={renderAs} />
                                                </div>
                                                
                                                {/* Show/Hide button for long content */}
                                                {!expandedResponses.has(modelId) && (
                                                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-slate-900 to-transparent flex items-end justify-center pb-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => toggleResponseExpansion(modelId)}
                                                            className="gap-2 shadow-md"
                                                        >
                                                            <Icon name="chevron-down" className="w-4 h-4" />
                                                            Show full response
                                                        </Button>
                                                    </div>
                                                )}
                                                
                                                {expandedResponses.has(modelId) && (
                                                    <div className="mt-4 flex justify-center">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => toggleResponseExpansion(modelId)}
                                                            className="gap-2"
                                                        >
                                                            <Icon name="chevron-up" className="w-4 h-4" />
                                                            Show less
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-muted-foreground italic">
                                                {displayResponse}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    }

    // Overview grid
    return (
        <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
                    <Icon name="layout-grid" className="w-6 h-6 text-primary" />
                    Test Results Overview
                </CardTitle>
                <p className="text-muted-foreground">
                    Click any scenario to see how different AI models responded
                </p>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {displayedPrompts.map(prompt => {
                        const avgScore = getPromptAverage(prompt.id);
                        
                        return (
                            <div
                                key={prompt.id}
                                className="p-4 rounded-xl border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 transition-all duration-200 cursor-pointer group bg-card hover:bg-primary/5"
                                onClick={() => setSelectedPrompt(prompt.id)}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
                                            {prompt.displayText}
                                        </p>
                                        <div className="flex items-center gap-4 mt-3">
                                            <div className="flex -space-x-1">
                                                {canonicalModels.slice(0, 4).map(modelId => {
                                                    const score = getScore(prompt.id, modelId);
                                                    return (
                                                        <div
                                                            key={modelId}
                                                            className={`w-6 h-6 rounded-full border-2 border-white dark:border-slate-800 ${getScoreColorClass(score)} cursor-pointer hover:scale-110 transition-transform`}
                                                            title={`${getModelDisplayLabel(parseModelIdForDisplay(modelId), { hideProvider: true, prettifyModelName: true })}: ${score ? `${(score * 100).toFixed(0)}%` : 'No score'} • Click for model details`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openModelPerformanceModal(modelId);
                                                            }}
                                                        />
                                                    );
                                                })}
                                                {canonicalModels.length > 4 && (
                                                    <div className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-800 bg-muted flex items-center justify-center">
                                                        <span className="text-xs font-bold text-muted-foreground">
                                                            +{canonicalModels.length - 4}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            {avgScore !== null && (
                                                <Badge 
                                                    variant="secondary" 
                                                    className="text-xs cursor-pointer hover:bg-primary/20 transition-colors"
                                                    title="Average score across all models • Click to see scenario details"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openPromptDetailModal(prompt.id);
                                                    }}
                                                >
                                                    Avg: {(avgScore * 100).toFixed(0)}%
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <Icon name="chevron-right" className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {promptData.length > 8 && (
                    <div className="mt-6 text-center">
                        <Button
                            variant="outline"
                            onClick={() => setShowAllPrompts(!showAllPrompts)}
                            className="gap-2"
                        >
                            {showAllPrompts ? (
                                <>
                                    <Icon name="chevron-up" className="w-4 h-4" />
                                    Show fewer scenarios
                                </>
                            ) : (
                                <>
                                    <Icon name="chevron-down" className="w-4 h-4" />
                                    Show all {promptData.length} scenarios
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
