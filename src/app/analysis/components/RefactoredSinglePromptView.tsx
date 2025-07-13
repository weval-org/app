'use client';

import React, { useMemo } from 'react';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

import RefactoredModelResponseCard from './RefactoredModelResponseCard';
import RefactoredPromptResponsesConsistency from './RefactoredPromptResponsesConsistency';
import RefactoredModelResponseCardGrid from './RefactoredModelResponseCardGrid';

export const RefactoredSinglePromptView: React.FC = () => {
    const {
        data,
        currentPromptId,
        displayedModels,
        canonicalModels,
    } = useAnalysis();

    if (!data || !currentPromptId) {
        return null;
    }

    return (
        <div className="space-y-8">
            <RefactoredModelResponseCardGrid>
                {displayedModels.map((modelId) => (
                    <RefactoredModelResponseCard
                        key={modelId}
                        modelId={modelId}
                    />
                ))}
            </RefactoredModelResponseCardGrid>
            
            {data.evaluationResults?.perPromptSimilarities?.[currentPromptId] && (
                <RefactoredPromptResponsesConsistency
                    models={canonicalModels}
                />
            )}
        </div>
    );
}; 