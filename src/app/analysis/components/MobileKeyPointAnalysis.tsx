'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MobileModelList } from './MobileModelList';
import { MobileModelDetail } from './MobileModelDetail';
import { ComparisonDataV2 as ImportedComparisonDataV2, CoverageResult } from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

interface MobileKeyPointAnalysisProps {
    data: ImportedComparisonDataV2;
    promptId: string;
    displayedModels: string[];
    isOpen: boolean;
    onClose: () => void;
}

export const MobileKeyPointAnalysis: React.FC<MobileKeyPointAnalysisProps> = ({
    data,
    promptId,
    displayedModels,
    isOpen,
    onClose
}) => {
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [view, setView] = useState<'list' | 'detail'>('list');

    const {
        evaluationResults,
        config,
        allFinalAssistantResponses,
    } = data;

    // Extract data for the current prompt
    const promptCoverageScores = React.useMemo(() => {
        return evaluationResults?.llmCoverageScores?.[promptId] || {};
    }, [evaluationResults, promptId]);

    const promptResponses = React.useMemo(() => {
        return allFinalAssistantResponses?.[promptId] || {};
    }, [allFinalAssistantResponses, promptId]);

    const promptSimilarities = React.useMemo(() => {
        return evaluationResults?.perPromptSimilarities?.[promptId] || null;
    }, [evaluationResults, promptId]);

    const idealResponse = promptResponses[IDEAL_MODEL_ID];

    const handleModelSelect = (modelId: string) => {
        setSelectedModelId(modelId);
        setView('detail');
    };

    const handleBackToList = () => {
        setView('list');
        // Don't clear selectedModelId so it stays selected when returning to list
    };

    const handleClose = () => {
        setView('list');
        setSelectedModelId(null);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="w-[100vw] h-[100vh] max-w-none p-0 m-0 rounded-none border-0 bg-background flex flex-col">
                {/* Hidden title for accessibility */}
                <DialogTitle className="sr-only">Key Point Coverage Analysis - Mobile View</DialogTitle>
                
                {/* Content container */}
                <div className="flex-1 min-h-0">{/* Let content use full available space */}
                    {view === 'list' && (
                        <MobileModelList
                            displayedModels={displayedModels}
                            promptCoverageScores={promptCoverageScores}
                            promptSimilarities={promptSimilarities}
                            systemPrompts={config.systems}
                            onModelSelect={handleModelSelect}
                            onClose={handleClose}
                            selectedModelId={selectedModelId}
                        />
                    )}
                    
                    {view === 'detail' && selectedModelId && (
                        <MobileModelDetail
                            modelId={selectedModelId}
                            coverageResult={promptCoverageScores[selectedModelId]}
                            response={promptResponses[selectedModelId] || ''}
                            idealResponse={idealResponse}
                            onBack={handleBackToList}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}; 