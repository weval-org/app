'use client';

import React, { useMemo } from 'react';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

import ModelResponseCard from './ModelResponseCard';
import PromptResponsesConsistency from './PromptResponsesConsistency';
import ModelResponseCardGrid from './ModelResponseCardGrid';

export const SinglePromptView: React.FC = () => {
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
            <ModelResponseCardGrid>
                {displayedModels.map((modelId) => (
                    <ModelResponseCard
                        key={modelId}
                        modelId={modelId}
                    />
                ))}
            </ModelResponseCardGrid>
            
            {data.evaluationResults?.perPromptSimilarities?.[currentPromptId] && (
                <PromptResponsesConsistency
                    models={canonicalModels}
                />
            )}
        </div>
    );
}; 