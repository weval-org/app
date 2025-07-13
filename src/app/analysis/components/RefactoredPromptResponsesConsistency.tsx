'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnalysis } from '../context/AnalysisContext';
import RefactoredSimilarityGraph from './RefactoredSimilarityGraph';

interface RefactoredPromptResponsesConsistencyProps {
    models: string[];
}

const RefactoredPromptResponsesConsistency: React.FC<RefactoredPromptResponsesConsistencyProps> = ({ models }) => {
    const { data, currentPromptId } = useAnalysis();

    if (!data || !currentPromptId || !data.evaluationResults?.perPromptSimilarities || !data.evaluationResults.perPromptSimilarities[currentPromptId]) {
        return (
            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle>Response Consistency</CardTitle>
                    <CardDescription>
                        Semantic similarity between model responses for this prompt.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Similarity data not available for this prompt.</p>
                </CardContent>
            </Card>
        );
    }
    
    const similarityData = data.evaluationResults.perPromptSimilarities[currentPromptId];
    
    return (
        <Card className="shadow-md">
            <CardHeader>
                <CardTitle>Response Consistency</CardTitle>
                <CardDescription>
                    Semantic similarity between model responses for this prompt.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-96">
                    <RefactoredSimilarityGraph models={models} similarityMatrix={similarityData} />
                </div>
            </CardContent>
        </Card>
    );
};

export default RefactoredPromptResponsesConsistency; 