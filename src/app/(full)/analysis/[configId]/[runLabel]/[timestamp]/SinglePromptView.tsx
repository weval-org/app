'use client';

import React, { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SimilarityHeatmap from '@/app/(full)/analysis/components/SimilarityHeatmap';
import SimilarityGraph from '@/app/(full)/analysis/components/SimilarityGraph';
import DendrogramChart from '@/app/(full)/analysis/components/DendrogramChart';
import KeyPointCoverageTable from '@/app/(full)/analysis/components/KeyPointCoverageTable';
import KeyPointCoverageComparisonDisplay from '@/app/(full)/analysis/components/KeyPointCoverageComparisonDisplay';
import SemanticExtremesDisplay from '@/app/(full)/analysis/components/SemanticExtremesDisplay';
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
    CoverageResult as ImportedCoverageResult,
    PointAssessment,
} from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

const HelpCircle = dynamic(() => import("lucide-react").then(mod => mod.HelpCircle));

interface SinglePromptViewProps {
    data: ImportedComparisonDataV2;
    currentPromptId: string;
    currentPromptDisplayText: string;
    displayedModels: string[];
    canonicalModels: string[];
    handleSimilarityCellClick: (modelA: string, modelB: string, similarity: number, promptId: string) => void;
    handleCoverageCellClick: (modelId: string, assessment: PointAssessment, promptId: string) => void;
    handleSemanticExtremesClick: (modelId: string) => void;
    openModelEvaluationDetailModal: (args: { promptId: string; modelId: string; }) => void;
    resolvedTheme?: string;
}

export const SinglePromptView: React.FC<SinglePromptViewProps> = ({
    data,
    currentPromptId,
    currentPromptDisplayText,
    displayedModels,
    canonicalModels,
    handleSimilarityCellClick,
    handleCoverageCellClick,
    handleSemanticExtremesClick,
    openModelEvaluationDetailModal,
    resolvedTheme,
}) => {
    const [ReactMarkdown, setReactMarkdown] = useState<any>(null);
    const [RemarkGfm, setRemarkGfm] = useState<any>(null);

    useEffect(() => {
        import('react-markdown').then(mod => setReactMarkdown(() => mod.default));
        import('remark-gfm').then(mod => setRemarkGfm(() => mod.default));
    }, []);

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
                return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{messagesToRender}</div>;
            }

            if (Array.isArray(messagesToRender)) {
                if (messagesToRender.length === 1 && messagesToRender[0].role === 'user') {
                    return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{messagesToRender[0].content}</div>;
                }
                if (messagesToRender.length > 0) {
                    return (
                        <>
                            <p className="text-xs font-semibold text-muted-foreground mt-4">Conversation:</p>
                            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar p-1 rounded bg-muted/30 dark:bg-muted/20">
                                {messagesToRender.map((msg, index) => (
                                    <div key={index} className={`p-2 rounded-md ${msg.role === 'user' ? 'bg-sky-100 dark:bg-sky-900/50' : 'bg-muted dark:bg-muted/50'}`}>
                                        <p className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground capitalize">{msg.role}</p>
                                        <p className="text-sm text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    );
                }
            }
            return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{currentPromptDisplayText}</div>;
        }

        return (
            <div className="space-y-4">
                {promptConfig?.description && ReactMarkdown && RemarkGfm && (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1">
                        <ReactMarkdown remarkPlugins={[RemarkGfm]}>{promptConfig.description}</ReactMarkdown>
                    </div>
                )}
                
                {systemMessages.length > 0 && (
                    <div className="space-y-2 mt-4">
                        {systemMessages.map((sysMsg, index) => (
                            <div key={`sys-${index}`} className="p-3 rounded-md bg-green-50 dark:bg-green-900/40 ring-1 ring-green-200 dark:ring-green-800">
                                <h4 className="text-sm font-semibold text-green-800 dark:text-green-300">System Prompt</h4>
                                <p className="text-sm text-green-900 dark:text-green-200 whitespace-pre-wrap mt-1">{sysMsg.content}</p>
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
            {data?.config?.systems && (
                (data.config.systems.length > 1 || data.config.systems[0] !== null)
            ) && (
                <Card className="shadow-lg border-border dark:border-border mb-6">
                    <CardHeader>
                        <CardTitle className="text-primary text-primary">System Prompt Variants</CardTitle>
                        <CardDescription>This run was executed against the following system prompt variations.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-3">
                            {data.config.systems.map((systemPrompt, index) => (
                                <li key={index} className="flex items-start gap-3 p-2 rounded-md bg-muted/50 dark:bg-muted/30">
                                    <Badge variant="secondary" className="mt-1">{`sp_idx:${index}`}</Badge>
                                    <div className="text-sm text-card-foreground dark:text-card-foreground">
                                        {systemPrompt === null ? (
                                            <em className="text-muted-foreground">[No System Prompt]</em>
                                        ) : (
                                            <p className="whitespace-pre-wrap font-mono">{systemPrompt}</p>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

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
                <CardContent className="text-sm">
                    {renderPromptDetails()}
                </CardContent>
            </Card>

            {allFinalAssistantResponses && data.evaluationResults?.llmCoverageScores?.[currentPromptId] && allFinalAssistantResponses?.[currentPromptId]?.[IDEAL_MODEL_ID] && (
                <KeyPointCoverageComparisonDisplay
                    coverageScores={data.evaluationResults.llmCoverageScores[currentPromptId]}
                    models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)} 
                    promptResponses={allFinalAssistantResponses[currentPromptId]}
                    idealModelId={IDEAL_MODEL_ID}
                    promptId={currentPromptId}
                    onModelClick={(modelId: string) => openModelEvaluationDetailModal({ promptId: currentPromptId, modelId })}
                />
            )}

            {allFinalAssistantResponses && data.evaluationResults?.perPromptSimilarities?.[currentPromptId] && promptContexts?.[currentPromptId] && (
                <SemanticExtremesDisplay
                    promptSimilarities={data.evaluationResults.perPromptSimilarities[currentPromptId]}
                    models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                    promptResponses={allFinalAssistantResponses[currentPromptId]}
                    idealModelId={IDEAL_MODEL_ID}
                    promptId={currentPromptId}
                    onModelClick={(modelId: string) => handleSemanticExtremesClick(modelId)}
                />
            )}
            
            {evalMethodsUsed.includes('llm-coverage') && data.evaluationResults?.llmCoverageScores?.[currentPromptId] && (
                <Card className="shadow-lg border-border dark:border-border mt-6">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-primary text-primary">Key Point Coverage Details</CardTitle>
                            <Button variant="ghost" size="sm" title="Help: Key Point Coverage Table" asChild>
                                <Link href="#key-point-coverage-help" scroll={false}><HelpCircle className="w-4 h-4 text-muted-foreground" /></Link>
                            </Button>
                        </div>
                        <CardDescription className="text-muted-foreground dark:text-muted-foreground pt-1 text-sm">
                            Detailed breakdown of how each model response covers the evaluation criteria for prompt: <strong className="text-card-foreground dark:text-card-foreground font-normal">{currentPromptDisplayText}</strong>.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <KeyPointCoverageTable 
                            coverageScores={data.evaluationResults.llmCoverageScores[currentPromptId]}
                            models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                            onCellClick={(modelId, assessment) => {
                                if (assessment) {
                                    handleCoverageCellClick(modelId, assessment, currentPromptId)
                                }
                            }}
                            onModelHeaderClick={(modelId) => openModelEvaluationDetailModal({ promptId: currentPromptId, modelId })}
                        />
                    </CardContent>
                </Card>
            )}

            <div className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="shadow-lg border-border dark:border-border lg:col-span-2">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-primary text-primary">Model Similarity Matrix</CardTitle>
                            <Button variant="ghost" size="sm" title="Help: Similarity Matrix">
                                <HelpCircle className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        </div>
                        <CardDescription className="text-muted-foreground dark:text-muted-foreground pt-1 text-sm">
                            Pairwise semantic similarity for prompt: <strong className='text-card-foreground dark:text-card-foreground font-normal'>{currentPromptDisplayText}</strong>. Darker means more similar.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {safeMatrixForCurrentView && canonicalModels.length > 0 ? (
                            <SimilarityHeatmap 
                                similarityMatrix={safeMatrixForCurrentView} 
                                models={canonicalModels}
                                onCellClick={(modelA, modelB, similarity) => handleSimilarityCellClick(modelA, modelB, similarity, currentPromptId)}
                            />
                        ) : <p className="text-center text-muted-foreground dark:text-muted-foreground py-4">Not enough data or models to display heatmap for this view.</p>}
                    </CardContent>
                    </Card>

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
        </>
    );
}; 