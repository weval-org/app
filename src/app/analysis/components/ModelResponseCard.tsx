'use client';

import React, { useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { useAnalysis } from '../context/AnalysisContext';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { getHybridScoreColorClass } from '@/app/analysis/utils/colorUtils';
import ResponseRenderer, { RenderAsType } from '@/app/components/ResponseRenderer';

interface ModelResponseCardProps {
    modelId: string;
}

const ModelResponseCard: React.FC<ModelResponseCardProps> = ({ modelId }) => {
    const {
        data,
        analysisStats,
        currentPromptId,
        openModelEvaluationDetailModal,
        getCachedResponse,
        fetchModalResponse,
        isLoadingResponse,
    } = useAnalysis();

    if (!data || !currentPromptId) return null;

    const { allFinalAssistantResponses, evaluationResults } = data;
    const { calculatedPerModelHybridScores, calculatedPerModelSemanticScores } = analysisStats || {};

    // Try to get cached response first, fallback to allFinalAssistantResponses
    const cachedResponse = getCachedResponse(currentPromptId, modelId);
    const initialResponse = allFinalAssistantResponses?.[currentPromptId]?.[modelId];
    const response = cachedResponse || initialResponse;
    const isLoading = isLoadingResponse(currentPromptId, modelId);

    // Fetch response on mount if not available
    useEffect(() => {
        if (!response && !isLoading) {
            fetchModalResponse(currentPromptId, modelId);
        }
    }, [currentPromptId, modelId, response, isLoading, fetchModalResponse]);
    const llmCoverageResult = evaluationResults?.llmCoverageScores?.[currentPromptId]?.[modelId];
    const hybridScoreData = calculatedPerModelHybridScores?.get(modelId);
    const semanticScoreData = calculatedPerModelSemanticScores?.get(modelId);

    const { baseId: modelBaseId } = parseModelIdForDisplay(modelId);

    // Get renderAs from prompt config
    const promptConfig = data.config.prompts?.find(p => p.id === currentPromptId);
    const renderAs = promptConfig?.render_as as RenderAsType | undefined;

    const similarityToIdeal = useMemo(() => {
        if (!evaluationResults?.perPromptSimilarities?.[currentPromptId] || !evaluationResults.perPromptSimilarities[currentPromptId][modelId]) {
            return null;
        }
        return evaluationResults.perPromptSimilarities[currentPromptId][modelId][IDEAL_MODEL_ID];
    }, [evaluationResults, currentPromptId, modelId]);

    const displayLabel = getModelDisplayLabel(modelId);
    
    if (modelId === IDEAL_MODEL_ID) {
        return (
            <Card className="flex flex-col h-full shadow-lg border-2 border-dashed border-green-500/70 dark:border-green-400/60 bg-green-50/30 dark:bg-green-900/10">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-green-700 dark:text-green-300">
                        ✨ Ideal Response
                    </CardTitle>
                    <CardDescription className="text-green-800/80 dark:text-green-200/80 text-xs">
                        This is the target response all other models are evaluated against.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow overflow-y-auto custom-scrollbar">
                    {response && <ResponseRenderer content={response} renderAs={renderAs} />}
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card className="flex flex-col h-full shadow-md border-border dark:border-border/80">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <CardTitle className="text-base font-semibold" title={modelId}>{displayLabel}</CardTitle>
                    {hybridScoreData?.average !== null && hybridScoreData?.average !== undefined && (
                        <div className={`text-lg font-bold ${getHybridScoreColorClass(hybridScoreData.average)}`}>
                            {(hybridScoreData.average * 100).toFixed(1)}%
                        </div>
                    )}
                </div>
                <div className="text-xs text-muted-foreground space-x-2">
                    {semanticScoreData?.average !== null && semanticScoreData?.average !== undefined && (
                        <span title={`Average semantic similarity to ideal: ${semanticScoreData.average.toFixed(3)}`}>
                            Sem. Sim: {(semanticScoreData.average * 100).toFixed(1)}%
                        </span>
                    )}
                    {llmCoverageResult && !('error' in llmCoverageResult) && llmCoverageResult.avgCoverageExtent !== undefined && (
                         <span title={`Average key point coverage: ${(llmCoverageResult.avgCoverageExtent * 100).toFixed(1)}%`}>
                            Coverage: {(llmCoverageResult.avgCoverageExtent * 100).toFixed(1)}%
                         </span>
                    )}
                </div>
            </CardHeader>
            <CardContent className="flex-grow overflow-y-auto custom-scrollbar">
                {isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-4/5" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                    </div>
                ) : response ? (
                    <ResponseRenderer content={response} renderAs={renderAs} />
                ) : (
                    <span className="text-muted-foreground italic">No response generated.</span>
                )}
            </CardContent>
            <div className="p-4 border-t border-border/80 mt-auto">
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openModelEvaluationDetailModal({ promptId: currentPromptId, modelId })}
                        disabled={!llmCoverageResult || ('error' in llmCoverageResult)}
                    >
                        View Evaluation
                    </Button>
                </div>
            </div>
        </Card>
    );
};

export default ModelResponseCard; 