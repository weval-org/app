'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/badge';
import { EvaluationView } from './SharedEvaluationComponents';
import { CoverageResult } from '@/app/utils/types';
import Icon from '@/components/ui/icon';

interface MobilePromptDetailProps {
    promptId: string;
    promptText: string;
    modelId: string;
    modelDisplayName: string;
    coverageResult: CoverageResult | undefined;
    response: string;
    idealResponse?: string;
    score: number | null;
    rank: 'excellent' | 'good' | 'poor' | 'error';
    onBack: () => void;
}

const getPerformanceBadge = (rank: 'excellent' | 'good' | 'poor' | 'error', score: number | null) => {
    const badges = {
        excellent: { color: 'bg-green-500 text-white', icon: '🏆', label: 'Excellent' },
        good: { color: 'bg-blue-500 text-white', icon: '👍', label: 'Good' },
        poor: { color: 'bg-orange-500 text-white', icon: '⚠️', label: 'Needs Work' },
        error: { color: 'bg-red-500 text-white', icon: '❌', label: 'Error' }
    };
    
    const badge = badges[rank];
    
    return (
        <Badge className={badge.color}>
            <span className="mr-1">{badge.icon}</span>
            {score !== null ? `${(score * 100).toFixed(0)}%` : badge.label}
        </Badge>
    );
};

export const MobilePromptDetail: React.FC<MobilePromptDetailProps> = ({
    promptId,
    promptText,
    modelId,
    modelDisplayName,
    coverageResult,
    response,
    idealResponse,
    score,
    rank,
    onBack
}) => {
    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    
    const toggleLogExpansion = (index: number) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };

    if (!coverageResult || 'error' in coverageResult) {
        return (
            <div className="h-full flex flex-col min-h-0">
                <div className="flex items-center gap-3 p-4 border-b bg-card flex-shrink-0">
                    <button 
                        onClick={onBack}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-lg transition-colors min-h-[44px]"
                        title="Back to prompt list"
                    >
                        <Icon name="arrow-left" className="h-5 w-5" />
                        <span className="font-medium">Back to Prompts</span>
                    </button>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-semibold text-lg truncate">{modelDisplayName}</h2>
                        <p className="text-sm text-muted-foreground truncate">{promptText}</p>
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center p-4">
                    <div className="text-center">
                        <Icon name="alert-triangle" className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                        <p className="text-lg font-medium">Error Loading Data</p>
                        <p className="text-muted-foreground mt-2">
                            {coverageResult?.error || 'Unknown error occurred'}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const assessments = coverageResult.pointAssessments || [];
    const hasAnyText = Array.isArray(assessments) && assessments.some(a => !!a.keyPointText);

    return (
        <div className="h-full flex flex-col min-h-0">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b bg-card flex-shrink-0">
                <button 
                    onClick={onBack}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-lg transition-colors min-h-[44px]"
                    title="Back to prompt list"
                >
                    <Icon name="arrow-left" className="h-5 w-5" />
                    <span className="font-medium">Back to Prompts</span>
                </button>
                <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-lg truncate">{modelDisplayName}</h2>
                    <p className="text-sm text-muted-foreground truncate">{promptText}</p>
                </div>
                {getPerformanceBadge(rank, score)}
            </div>

            {/* Mobile-optimized content */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
                <EvaluationView 
                    assessments={assessments}
                    modelResponse={response}
                    idealResponse={idealResponse}
                    expandedLogs={expandedLogs}
                    toggleLogExpansion={toggleLogExpansion}
                    isMobile={true}
                />
                {!hasAnyText && (
                    <div className="mt-2 text-xs text-muted-foreground">
                        Loading detailed criteria…
                    </div>
                )}
            </div>
        </div>
    );
}; 