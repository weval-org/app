'use client';

import React, { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import SimilarityGraph from '@/app/analysis/components/SimilarityGraph';
import DendrogramChart from '@/app/analysis/components/DendrogramChart';
import KeyPointCoverageTable from '@/app/analysis/components/KeyPointCoverageTable';
import SystemPromptsDisplay from '@/app/analysis/components/SystemPromptsDisplay';
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
    CoverageResult as ImportedCoverageResult,
    PointAssessment,
    SelectedPairInfo,
} from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import ModelEvaluationDetailModalV2, { ModelEvaluationDetailModalData } from '@/app/analysis/components/ModelEvaluationDetailModalV2';
import { ResponseComparisonModal } from '@/app/analysis/components/ResponseComparisonModal';

const Quote = dynamic(() => import('lucide-react').then(mod => mod.Quote), { ssr: false });
const HelpCircle = dynamic(() => import("lucide-react").then(mod => mod.HelpCircle));
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfm = dynamic(() => import('remark-gfm'), { ssr: false });

interface SinglePromptViewProps {
    data: ImportedComparisonDataV2;
    currentPromptId: string;
    currentPromptDisplayText: string;
    displayedModels: string[];
    canonicalModels: string[];
    prepareResponseComparisonModalData: (info: Partial<SelectedPairInfo>) => SelectedPairInfo | null;
    prepareModelEvaluationModalData: (args: { promptId: string; modelId: string; }) => ModelEvaluationDetailModalData | null;
    resolvedTheme?: string;
}

export const SinglePromptView: React.FC<SinglePromptViewProps> = ({
    data,
    currentPromptId,
    currentPromptDisplayText,
    displayedModels,
    canonicalModels,
    prepareResponseComparisonModalData,
    prepareModelEvaluationModalData,
    resolvedTheme,
}) => {
    const [responseComparisonModal, setResponseComparisonModal] = useState<SelectedPairInfo | null>(null);
    const [modelEvaluationModal, setModelEvaluationModal] = useState<ModelEvaluationDetailModalData | null>(null);

    const handleSimilarityCellClick = (modelA: string, modelB: string, similarity: number, promptId: string) => {
        const coverageScoresForPrompt = data.evaluationResults?.llmCoverageScores?.[promptId] as Record<string, ImportedCoverageResult> | undefined;
        let coverageA: ImportedCoverageResult | null = null;
        let coverageB: ImportedCoverageResult | null = null;
        if (coverageScoresForPrompt) {
            coverageA = coverageScoresForPrompt[modelA] ?? null;
            coverageB = coverageScoresForPrompt[modelB] ?? null;
        }
        const pointAssessmentsA = (coverageA && !('error' in coverageA)) ? coverageA.pointAssessments : null;
        const pointAssessmentsB = (coverageB && !('error' in coverageB)) ? coverageB.pointAssessments : null;

        const modalData = prepareResponseComparisonModalData({
            modelA,
            modelB,
            promptId,
            semanticSimilarity: similarity,
            llmCoverageScoreA: coverageA,
            llmCoverageScoreB: coverageB,
            pointAssessmentsA: pointAssessmentsA || undefined,
            pointAssessmentsB: pointAssessmentsB || undefined,
        });
        if (modalData) {
            setResponseComparisonModal(modalData);
        }
    };

    const handleCoverageCellClick = (modelId: string, assessment: PointAssessment | null, promptId: string) => {
        if (!assessment) return;
        const modalData = prepareModelEvaluationModalData({ promptId, modelId });
        if (modalData) {
            setModelEvaluationModal(modalData);
        }
    };

    const openModelEvaluationDetailModal = (args: { promptId: string; modelId: string; }) => {
        const modalData = prepareModelEvaluationModalData(args);
        if (modalData) {
            setModelEvaluationModal(modalData);
        }
    };

    const handleSemanticExtremesClick = (modelId: string) => {
        if (!data || !data.promptIds || data.promptIds.length === 0) return;
        const modalData = prepareModelEvaluationModalData({ promptId: currentPromptId, modelId });
        if (modalData) {
            setModelEvaluationModal(modalData);
        }
    };

    const safeMatrixForCurrentView = useMemo(() => {
        if (!data?.evaluationResults?.similarityMatrix) return null;
        if (!currentPromptId) return data.evaluationResults.similarityMatrix;
        return data.evaluationResults?.perPromptSimilarities?.[currentPromptId] || null;
    }, [currentPromptId, data]);

    const renderPromptDetails = () => {
        if (!currentPromptId || !data || !data.promptContexts) {
            return null;
        }
        const context = data.promptContexts[currentPromptId];
        const promptConfig = data.config.prompts.find(p => p.id === currentPromptId);

        const systemMessages = Array.isArray(context) ? context.filter(msg => msg.role === 'system') : [];
        const conversationMessages = Array.isArray(context) ? context.filter(msg => msg.role !== 'system') : context;

        const renderContent = () => {
            const messagesToRender = conversationMessages;

            if (typeof messagesToRender === 'string') {
                return <div className="text-lg text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{messagesToRender}</div>;
            }

            if (Array.isArray(messagesToRender)) {
                if (messagesToRender.length === 1 && messagesToRender[0].role === 'user') {
                    return <div className="text-lg text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{messagesToRender[0].content}</div>;
                }
                if (messagesToRender.length > 0) {
                    return (
                        <>
                            <p className="text-sm font-semibold text-muted-foreground mt-4">Conversation:</p>
                            <div className="space-y-2 mt-2">
                                {messagesToRender.map((msg, index) => (
                                    <div key={index} className={`p-3 rounded-md ${msg.role === 'user' ? 'bg-sky-100 dark:bg-sky-900/50' : 'bg-muted dark:bg-muted/50'}`}>
                                        <p className="text-sm font-semibold text-muted-foreground dark:text-muted-foreground capitalize">{msg.role}</p>
                                        <p className="text-base text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    );
                }
            }
            return <div className="text-lg text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{currentPromptDisplayText}</div>;
        }

        return (
            <div className="space-y-4">
                {promptConfig?.description && (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1">
                        <ReactMarkdown remarkPlugins={[RemarkGfm as any]}>{promptConfig.description}</ReactMarkdown>
                    </div>
                )}
                
                {promptConfig?.citation && (
                    <div className="flex items-start space-x-1.5 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-3 py-2">
                        <Quote className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>Source: {promptConfig.citation}</span>
                    </div>
                )}
                
                {systemMessages.length > 0 && (
                    <div className="space-y-2 mt-4">
                        {systemMessages.map((sysMsg, index) => (
                            <div key={`sys-${index}`} className="p-3 rounded-md bg-green-50 dark:bg-green-900/40 ring-1 ring-green-200 dark:ring-green-800">
                                <h4 className="text-sm font-semibold text-green-800 dark:text-green-300">System Prompt</h4>
                                <p className="text-base text-green-900 dark:text-green-200 whitespace-pre-wrap mt-1">{sysMsg.content}</p>
                            </div>
                        ))}
                    </div>
                )}

                {renderContent()}
            </div>
        )
    };

    const currentPromptSystemPrompt = useMemo(() => {
        if (!currentPromptId || !data?.config?.prompts) {
            return null;
        }
        const promptConfig = data.config.prompts.find(p => p.id === currentPromptId);
        return promptConfig?.system ?? null;
    }, [currentPromptId, data?.config?.prompts]);

    const { 
        evalMethodsUsed,
        allFinalAssistantResponses,
        promptContexts,
    } = data;
    
    return (
        <>
            <SystemPromptsDisplay systemPrompts={data.config.systems || []} />

            {currentPromptSystemPrompt && (
                <Card className="shadow-lg border-border dark:border-border">
                    <CardHeader>
                        <CardTitle className="text-primary text-primary">Prompt-Specific System Prompt</CardTitle>
                        <CardDescription>
                            This prompt was executed with a specific system prompt, overriding any run-level variants.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/40 ring-1 ring-green-200 dark:ring-green-800">
                            <p className="text-sm text-green-900 dark:text-green-200 whitespace-pre-wrap">{currentPromptSystemPrompt}</p>
                        </div>
                    </CardContent>
                </Card>
            )}
            <Card className="shadow-lg border-border dark:border-border">
                <CardHeader>
                    <CardTitle className="text-primary text-primary">The Prompt:</CardTitle>
                </CardHeader>
                <CardContent className="text-base">
                    {renderPromptDetails()}
                </CardContent>
            </Card>
            
            {evalMethodsUsed.includes('llm-coverage') && data.evaluationResults?.llmCoverageScores?.[currentPromptId] && (
                <KeyPointCoverageTable
                    data={data}
                    promptId={currentPromptId}
                    displayedModels={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                />
            )}

            <div className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    <Card className="shadow-lg border-border dark:border-border lg:col-span-2">
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-primary text-primary">Model Similarity Graph</CardTitle>
                                <Button variant="ghost" size="sm" title="Help: Similarity Graph">
                                    <HelpCircle className="w-4 h-4 text-muted-foreground" />
                                </Button>
                            </div>
                            <CardDescription className="text-muted-foreground dark:text-muted-foreground pt-1 text-sm">
                                Force-directed graph based on semantic similarity for prompt: <strong className='text-card-foreground dark:text-card-foreground font-normal'>{currentPromptDisplayText}</strong>. Closer nodes are more similar.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            {safeMatrixForCurrentView && canonicalModels.length > 1 ? (
                                <SimilarityGraph 
                                    similarityMatrix={safeMatrixForCurrentView} 
                                    models={canonicalModels}
                                    resolvedTheme={resolvedTheme}
                                />
                            ) : <p className="text-center text-muted-foreground dark:text-muted-foreground py-4">Not enough data or models to display graph for this view.</p>}
                        </CardContent>
                    </Card>
                </div>

                <Card className="shadow-lg border-border dark:border-border">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-primary text-primary">Model Similarity Dendrogram</CardTitle>
                            <Button variant="ghost" size="sm" title="Help: Dendrogram">
                                <HelpCircle className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        </div>
                        <CardDescription className="text-muted-foreground dark:text-muted-foreground pt-1 text-sm">
                            Models clustered by semantic similarity for prompt: <strong className='text-card-foreground dark:text-card-foreground font-normal'>{currentPromptDisplayText}</strong>. Shorter branches mean more similar.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[450px] overflow-x-auto custom-scrollbar">
                        {safeMatrixForCurrentView && canonicalModels.length > 1 ? (
                            <DendrogramChart 
                                similarityMatrix={safeMatrixForCurrentView} 
                                models={canonicalModels}
                            />
                        ) : <p className="text-center text-muted-foreground dark:text-muted-foreground py-4">Not enough data or models to display dendrogram.</p>}
                    </CardContent>
                </Card>
            </div>

            {responseComparisonModal && (
                <ResponseComparisonModal 
                isOpen={true} 
                onClose={() => setResponseComparisonModal(null)}
                {...responseComparisonModal}
                />
            )}
            {modelEvaluationModal && (
                <ModelEvaluationDetailModalV2
                isOpen={true}
                onClose={() => setModelEvaluationModal(null)}
                data={modelEvaluationModal}
                />
            )}
        </>
    );
}; 