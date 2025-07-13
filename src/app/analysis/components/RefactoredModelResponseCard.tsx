'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { useAnalysis } from '../context/AnalysisContext';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { getHybridScoreColorClass } from '@/app/analysis/utils/colorUtils';

interface RefactoredModelResponseCardProps {
    modelId: string;
}

const RefactoredModelResponseCard: React.FC<RefactoredModelResponseCardProps> = ({ modelId }) => {
    const { data, analysisStats, currentPromptId, openModelEvaluationDetailModal } = useAnalysis();

    if (!data || !currentPromptId) return null;
    
    const { allFinalAssistantResponses, evaluationResults } = data;
    const { calculatedPerModelHybridScores, calculatedPerModelSemanticScores } = analysisStats || {};

    const response = allFinalAssistantResponses?.[currentPromptId]?.[modelId];
    const llmCoverageResult = evaluationResults?.llmCoverageScores?.[currentPromptId]?.[modelId];
    const hybridScoreData = calculatedPerModelHybridScores?.get(modelId);
    const semanticScoreData = calculatedPerModelSemanticScores?.get(modelId);

    const { baseId: modelBaseId } = parseEffectiveModelId(modelId);

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
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        {response}
                    </div>
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
                <div className="prose prose-sm dark:prose-invert max-w-none mb-4">
                    {response || <span className="text-muted-foreground italic">No response generated.</span>}
                </div>
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

export default RefactoredModelResponseCard; 