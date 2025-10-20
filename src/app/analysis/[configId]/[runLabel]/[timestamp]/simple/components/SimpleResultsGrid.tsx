'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { getModelDisplayLabel, parseModelIdForDisplay, getCanonicalModels } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { calculatePromptScores } from '../utils/semanticScoring';
import Icon from '@/components/ui/icon';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import RemarkGfmPlugin from 'remark-gfm';

// Number of models to prefetch for each prompt
const PREFETCH_MODEL_COUNT = 5;

export const SimpleResultsGrid: React.FC = () => {
    const {
        data,
        modelsForMacroTable,
        openModelEvaluationDetailModal,
        openPromptDetailModal,
        openModelPerformanceModal,
        fetchPromptResponses,
        fetchModalResponseBatch,
        getCachedResponse,
        configId,
        runLabel,
        timestamp
    } = useAnalysis();

    const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
    const [showAllPrompts, setShowAllPrompts] = useState(false);
    const [isLoadingResponses, setIsLoadingResponses] = useState(false);
    const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set());
    const hasPrefetched = useRef(false);

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

    // Prefetch first N models for all prompts on mount
    useEffect(() => {
        if (hasPrefetched.current || !fetchModalResponseBatch || !data?.promptIds) {
            return;
        }

        const canonicalModels = modelsForMacroTable.filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase());
        const topModels = getCanonicalModels(canonicalModels, data.config).slice(0, PREFETCH_MODEL_COUNT);

        if (topModels.length === 0 || data.promptIds.length === 0) {
            return;
        }

        hasPrefetched.current = true;

        // Create pairs of all prompts × first N models
        const pairs = data.promptIds.flatMap(promptId =>
            topModels.map(modelId => ({ promptId, modelId }))
        );

        // Prefetch in background without blocking UI
        console.log(`[SimpleResultsGrid] Prefetching ${pairs.length} responses (${data.promptIds.length} prompts × ${topModels.length} models)`);
        fetchModalResponseBatch(pairs).catch(err => {
            console.error('[SimpleResultsGrid] Prefetch failed:', err);
        });
    }, [data?.promptIds, data?.config, modelsForMacroTable, fetchModalResponseBatch]);

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

    // Check what eval methods are available
    const hasCoverage = !!data?.evaluationResults?.llmCoverageScores
        && Object.keys(data.evaluationResults.llmCoverageScores).length > 0;
    const hasSimilarity = !!data?.evaluationResults?.perPromptSimilarities
        && Object.keys(data.evaluationResults.perPromptSimilarities).length > 0;
    const evalMethodsUsed = data?.evalMethodsUsed || [];

    // Don't show if NO eval methods were run
    if (!data || (evalMethodsUsed.length === 0 && !hasCoverage && !hasSimilarity)) {
        return (
            <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                <CardContent className="py-6">
                    <Alert variant="default" className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10">
                        <Icon name="alert-circle" className="h-4 w-4 text-blue-600" />
                        <AlertTitle>No Evaluation Data</AlertTitle>
                        <AlertDescription>
                            This run did not include any evaluation methods.
                            Re-run with <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">--eval-method</code> to enable scoring.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        );
    }

    const {
        evaluationResults: { llmCoverageScores: allCoverageScores, perPromptSimilarities },
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

    // Calculate scores for each model-prompt combination (adaptive: coverage or similarity)
    const getScore = useCallback((promptId: string, modelId: string): { score: number; type: 'coverage' | 'similarity' } | null => {
        // Try coverage first
        const coverageResult = allCoverageScores?.[promptId]?.[modelId];
        if (coverageResult && !('error' in coverageResult) && typeof coverageResult.avgCoverageExtent === 'number') {
            return { score: coverageResult.avgCoverageExtent, type: 'coverage' };
        }

        // Fallback to similarity
        if (perPromptSimilarities) {
            const similarity = perPromptSimilarities[promptId]?.[modelId]?.[IDEAL_MODEL_ID];
            if (typeof similarity === 'number' && !isNaN(similarity)) {
                return { score: similarity, type: 'similarity' };
            }
        }

        return null;
    }, [allCoverageScores, perPromptSimilarities]);

    // Get color class for score
    const getScoreColorClass = useCallback((scoreData: { score: number; type: 'coverage' | 'similarity' } | null) => {
        if (scoreData === null) return 'bg-gray-200 dark:bg-gray-700';
        const score = scoreData.score;
        if (score >= 0.8) return 'bg-green-500';
        if (score >= 0.6) return 'bg-yellow-500';
        if (score >= 0.4) return 'bg-orange-500';
        return 'bg-red-500';
    }, []);

    // Get model average score
    const getModelAverage = useCallback((modelId: string) => {
        const scoreResults = promptIds.map(pid => getScore(pid, modelId)).filter((s): s is { score: number; type: 'coverage' | 'similarity' } => s !== null);
        if (scoreResults.length === 0) return null;
        const avgScore = scoreResults.reduce((sum, s) => sum + s.score, 0) / scoreResults.length;
        return { score: avgScore, type: scoreResults[0].type }; // Use type of first score
    }, [promptIds, getScore]);

    // Get prompt average score
    const getPromptAverage = useCallback((promptId: string) => {
        const scoreResults = canonicalModels.map(mid => getScore(promptId, mid)).filter((s): s is { score: number; type: 'coverage' | 'similarity' } => s !== null);
        if (scoreResults.length === 0) return null;
        const avgScore = scoreResults.reduce((sum, s) => sum + s.score, 0) / scoreResults.length;
        return { score: avgScore, type: scoreResults[0].type }; // Use type of first score
    }, [canonicalModels, getScore]);

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
                                const scoreData = getScore(selectedPrompt, modelId);
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
                                                className={`w-12 h-2 rounded-full ${getScoreColorClass(scoreData)} hover:scale-105 transition-transform`}
                                                title={scoreData ? `${(scoreData.score * 100).toFixed(1)}% ${scoreData.type} score • Click for breakdown` : 'No score available'}
                                            />
                                            {scoreData && scoreData.type === 'similarity' && (
                                                <Icon name="activity" className="w-3 h-3 text-muted-foreground" title="Similarity score (embeddings)" />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-mono group-hover:text-primary transition-colors">
                                                {scoreData ? `${(scoreData.score * 100).toFixed(0)}%` : '-'}
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
                {/* Show badges for available eval methods */}
                <div className="flex items-center justify-center gap-2 mb-4">
                    {hasCoverage && (
                        <Badge variant="default" className="text-xs">
                            <Icon name="check-circle" className="w-3 h-3 mr-1" />
                            Coverage Scores
                        </Badge>
                    )}
                    {hasSimilarity && (
                        <Badge variant="outline" className="text-xs">
                            <Icon name="git-compare-arrows" className="w-3 h-3 mr-1" />
                            Similarity Scores
                        </Badge>
                    )}
                </div>

                <div className="space-y-4">
                    {displayedPrompts.map(prompt => {
                        const avgScoreData = getPromptAverage(prompt.id);

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
                                                    const scoreData = getScore(prompt.id, modelId);
                                                    return (
                                                        <div
                                                            key={modelId}
                                                            className={`w-6 h-6 rounded-full border-2 border-white dark:border-slate-800 ${getScoreColorClass(scoreData)} cursor-pointer hover:scale-110 transition-transform`}
                                                            title={`${getModelDisplayLabel(parseModelIdForDisplay(modelId), { hideProvider: true, prettifyModelName: true })}: ${scoreData ? `${(scoreData.score * 100).toFixed(0)}% (${scoreData.type})` : 'No score'} • Click for model details`}
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
                                            {avgScoreData !== null && (
                                                <Badge
                                                    variant="secondary"
                                                    className="text-xs cursor-pointer hover:bg-primary/20 transition-colors"
                                                    title={`Average ${avgScoreData.type} score across all models • Click to see scenario details`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openPromptDetailModal(prompt.id);
                                                    }}
                                                >
                                                    Avg: {(avgScoreData.score * 100).toFixed(0)}%
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
