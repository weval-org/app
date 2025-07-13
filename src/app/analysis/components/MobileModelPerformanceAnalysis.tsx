'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MobilePromptList } from './MobilePromptList';
import { MobilePromptDetail } from './MobilePromptDetail';
import { AllCoverageScores, AllFinalAssistantResponses } from '@/app/analysis/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

export interface PromptPerformance {
    promptId: string;
    promptText: string;
    coverageResult: any; // CoverageResult | undefined
    response: string | undefined;
    score: number | null;
    rank: 'excellent' | 'good' | 'poor' | 'error';
}

interface MobileModelPerformanceAnalysisProps {
    modelId: string;
    modelDisplayName: string;
    promptPerformances: PromptPerformance[];
    allCoverageScores: AllCoverageScores;
    allFinalAssistantResponses: AllFinalAssistantResponses;
    isOpen: boolean;
    onClose: () => void;
}

export const MobileModelPerformanceAnalysis: React.FC<MobileModelPerformanceAnalysisProps> = ({
    modelId,
    modelDisplayName,
    promptPerformances,
    allCoverageScores,
    allFinalAssistantResponses,
    isOpen,
    onClose
}) => {
    const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
    const [view, setView] = useState<'list' | 'detail'>('list');

    const handlePromptSelect = (promptId: string) => {
        setSelectedPromptId(promptId);
        setView('detail');
    };

    const handleBackToList = () => {
        setView('list');
        // Don't clear selectedPromptId so it stays selected when returning to list
    };

    const handleClose = () => {
        setView('list');
        setSelectedPromptId(null);
        onClose();
    };

    const selectedPromptPerformance = selectedPromptId 
        ? promptPerformances.find(p => p.promptId === selectedPromptId)
        : null;

    const idealResponse = selectedPromptId 
        ? allFinalAssistantResponses?.[selectedPromptId]?.[IDEAL_MODEL_ID]
        : undefined;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="w-[100vw] h-[100vh] max-w-none p-0 m-0 rounded-none border-0 bg-background flex flex-col overflow-hidden">
                {/* Hidden title for accessibility */}
                <DialogTitle className="sr-only">Model Performance Analysis - Mobile View</DialogTitle>
                
                {/* Content container */}
                <div className="flex-1 min-h-0">
                    {view === 'list' && (
                        <MobilePromptList
                            modelDisplayName={modelDisplayName}
                            promptPerformances={promptPerformances}
                            onPromptSelect={handlePromptSelect}
                            onClose={handleClose}
                            selectedPromptId={selectedPromptId}
                        />
                    )}
                    
                    {view === 'detail' && selectedPromptPerformance && (
                        <MobilePromptDetail
                            promptId={selectedPromptPerformance.promptId}
                            promptText={selectedPromptPerformance.promptText}
                            modelId={modelId}
                            modelDisplayName={modelDisplayName}
                            coverageResult={selectedPromptPerformance.coverageResult}
                            response={selectedPromptPerformance.response || ''}
                            idealResponse={idealResponse}
                            score={selectedPromptPerformance.score}
                            rank={selectedPromptPerformance.rank}
                            onBack={handleBackToList}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}; 