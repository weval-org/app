'use client';

import React, { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { AllCoverageScores, AllFinalAssistantResponses } from '../types';
import { ParsedModelId } from '@/app/utils/modelIdUtils';
import { CoverageResult, ComparisonDataV2 as ImportedComparisonDataV2 } from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { EvaluationView } from './SharedEvaluationComponents';
import { getGradedCoverageColor } from '../utils/colorUtils';
import { MobileModelPerformanceAnalysis, PromptPerformance as MobilePromptPerformance } from './MobileModelPerformanceAnalysis';
import PromptContextDisplay from './PromptContextDisplay';
import { ConversationMessage } from '@/types/shared';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });
const BarChart3 = dynamic(() => import("lucide-react").then((mod) => mod.BarChart3), { ssr: false });
const TrendingUp = dynamic(() => import("lucide-react").then((mod) => mod.TrendingUp), { ssr: false });
const TrendingDown = dynamic(() => import("lucide-react").then((mod) => mod.TrendingDown), { ssr: false });
const AlertTriangle = dynamic(() => import("lucide-react").then((mod) => mod.AlertTriangle), { ssr: false });
const CheckCircle = dynamic(() => import("lucide-react").then((mod) => mod.CheckCircle), { ssr: false });

interface ModelPerformanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    modelId: string;
    parsedModelsMap: Record<string, ParsedModelId>;
    allCoverageScores: AllCoverageScores;
    allFinalAssistantResponses: AllFinalAssistantResponses;
    promptIds: string[];
    promptTexts: Record<string, string>;
    calculatePromptAverage: (promptId: string) => number | null;
    config: ImportedComparisonDataV2['config'];
    promptContexts?: ImportedComparisonDataV2['promptContexts'];
}

interface PromptPerformance {
    promptId: string;
    promptText: string;
    coverageResult: CoverageResult | undefined;
    response: string | undefined;
    score: number | null;
    rank: 'excellent' | 'good' | 'poor' | 'error';
}

const ModelPerformanceModal: React.FC<ModelPerformanceModalProps> = ({
    isOpen,
    onClose,
    modelId,
    parsedModelsMap,
    allCoverageScores,
    allFinalAssistantResponses,
    promptIds,
    promptTexts,
    calculatePromptAverage,
    config,
    promptContexts,
}) => {
    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
    const [isMobileView, setIsMobileView] = useState(false);

    // Mobile detection
    useEffect(() => {
        const checkMobile = () => {
            setIsMobileView(window.innerWidth < 768); // md breakpoint
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const toggleLogExpansion = (index: number) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const modelDisplayName = getModelDisplayLabel(parsedModelsMap[modelId]);

    // Calculate performance data for all prompts
    const promptPerformances = useMemo<PromptPerformance[]>(() => {
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

            return {
                promptId,
                promptText,
                coverageResult,
                response,
                score,
                rank,
            };
        });
    }, [promptIds, allCoverageScores, allFinalAssistantResponses, promptTexts, modelId]);

    // Sort prompts by performance for overview
    const sortedPrompts = useMemo(() => {
        return [...promptPerformances].sort((a, b) => {
            if (a.score === null && b.score === null) return 0;
            if (a.score === null) return 1;
            if (b.score === null) return -1;
            return b.score - a.score;
        });
    }, [promptPerformances]);

    useEffect(() => {
        if (sortedPrompts.length > 0 && !selectedPromptId) {
            setSelectedPromptId(sortedPrompts[0].promptId);
        }
    }, [sortedPrompts, selectedPromptId]);

    const selectedPromptPerformance = selectedPromptId 
        ? promptPerformances.find(p => p.promptId === selectedPromptId)
        : null;

    const selectedPromptContext = selectedPromptId && promptContexts ? promptContexts[selectedPromptId] : null;

    const { effectiveSystemPrompt, conversationContext } = useMemo(() => {
        if (!selectedPromptId || !config) return { effectiveSystemPrompt: null, conversationContext: null };

        const context = promptContexts?.[selectedPromptId];
        let conversationContextValue: string | ConversationMessage[] | null | undefined = context;
        let effectiveSystemPromptValue: string | null = null;
        
        // Highest precedence: a 'system' message in the conversation history
        if (Array.isArray(context) && context.length > 0 && context[0].role === 'system') {
            effectiveSystemPromptValue = context[0].content;
            conversationContextValue = context.slice(1);
        } else {
            // Medium precedence: a 'system' property on the specific prompt
            const promptConfig = config.prompts.find(p => p.id === selectedPromptId);
            if (promptConfig?.system) {
                effectiveSystemPromptValue = promptConfig.system;
            } else {
                // Lowest precedence: a run-level system prompt from a permutation
                const parsed = parseEffectiveModelId(modelId);
                if (config.systems && typeof parsed.systemPromptIndex === 'number' && config.systems[parsed.systemPromptIndex]) {
                    effectiveSystemPromptValue = config.systems[parsed.systemPromptIndex];
                } else if (config.systems && typeof parsed.systemPromptIndex === 'number' && config.systems[parsed.systemPromptIndex] === null) {
                    effectiveSystemPromptValue = '[No System Prompt]';
                }
            }
        }
        
        return { effectiveSystemPrompt: effectiveSystemPromptValue, conversationContext: conversationContextValue };
    }, [selectedPromptId, modelId, config, promptContexts]);

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
            className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                selectedPromptId === performance.promptId ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setSelectedPromptId(performance.promptId)}
        >
            <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium line-clamp-2 flex-1">
                        {performance.promptText}
                    </CardTitle>
                    <Badge className={getScoreColor(performance.rank)}>
                        {performance.score !== null ? `${(performance.score * 100).toFixed(0)}%` : 'Error'}
                    </Badge>
                </div>
            </CardHeader>
        </Card>
    );

    if (!isOpen) return null;

    // Mobile: Use dedicated full-screen mobile experience
    if (isMobileView) {
        return (
            <MobileModelPerformanceAnalysis
                modelId={modelId}
                modelDisplayName={modelDisplayName}
                promptPerformances={promptPerformances as MobilePromptPerformance[]}
                allCoverageScores={allCoverageScores}
                allFinalAssistantResponses={allFinalAssistantResponses}
                isOpen={isOpen}
                onClose={onClose}
            />
        );
    }

    // Desktop: Use existing responsive layout
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0">
                <DialogHeader className="p-4 md:p-6 border-b flex-shrink-0">
                    <DialogTitle className="text-xl font-semibold text-foreground">
                        Model Performance: <span className="text-primary">{modelDisplayName}</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col md:flex-row min-h-0">
                    {/* Prompt List */}
                    <div className="md:w-1/3 lg:w-1/4 border-r flex-shrink-0 flex flex-col min-h-0">
                        <div className="p-4 border-b">
                            <h3 className="font-semibold text-sm">Select Prompt</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                            {sortedPrompts.map(renderPromptCard)}
                        </div>
                    </div>

                    {/* Detailed View */}
                    <div className="flex-1 flex flex-col min-h-0">
                        {selectedPromptPerformance ? (
                            <div className="flex-1 flex flex-col min-h-0 p-4 md:p-6 overflow-y-auto custom-scrollbar">
                                <div className="mb-4 pb-4 border-b">
                                    <div className="mb-4">
                                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">The Prompt</h3>
                                        {conversationContext ? (
                                            <PromptContextDisplay promptContext={conversationContext} />
                                        ) : (
                                            <p className="font-semibold text-lg">{selectedPromptPerformance.promptText}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <Badge className={getScoreColor(selectedPromptPerformance.rank)}>
                                            {selectedPromptPerformance.score !== null 
                                                ? `Score: ${(selectedPromptPerformance.score * 100).toFixed(1)}%` 
                                                : 'Error'
                                            }
                                        </Badge>
                                    </div>
                                    {effectiveSystemPrompt && (
                                        <div className="mt-4">
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">System Prompt</h4>
                                            <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/40 ring-1 ring-green-200 dark:ring-green-800 text-sm text-green-900 dark:text-green-200 whitespace-pre-wrap">
                                                {effectiveSystemPrompt}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                {selectedPromptPerformance.coverageResult && !('error' in selectedPromptPerformance.coverageResult) ? (
                                    <div className="flex-1 min-h-0">
                                        <EvaluationView
                                            assessments={selectedPromptPerformance.coverageResult.pointAssessments || []}
                                            modelResponse={selectedPromptPerformance.response || ''}
                                            expandedLogs={expandedLogs}
                                            toggleLogExpansion={toggleLogExpansion}
                                            isMobile={false}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center">
                                        <div className="text-center p-8">
                                            <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                                            <p className="text-lg font-medium">No evaluation data available</p>
                                            <p className="text-muted-foreground">
                                                {selectedPromptPerformance.coverageResult && 'error' in selectedPromptPerformance.coverageResult
                                                    ? `Error: ${selectedPromptPerformance.coverageResult.error}`
                                                    : 'This prompt was not evaluated for this model.'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center p-8">
                                    <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                    <p className="text-lg font-medium">Select a prompt</p>
                                    <p className="text-muted-foreground">Choose a prompt from the list to see detailed analysis</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ModelPerformanceModal; 