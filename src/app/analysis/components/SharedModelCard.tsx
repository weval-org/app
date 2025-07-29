'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import Icon from '@/components/ui/icon';

export interface ModelSummary {
    total: number;
    passed: number;
    criticalFailures: number;
    majorGaps: number;
    avgCoverage: number;
}

export interface SharedModelCardProps {
    displayText: string;
    summary: ModelSummary;
    similarityScore: number | null;
    onClick: () => void;
    isSelected: boolean;
    fullModelName?: string;
}

export const SharedModelCard: React.FC<SharedModelCardProps> = ({ 
    displayText, 
    summary, 
    similarityScore, 
    onClick, 
    isSelected, 
    fullModelName 
}) => {
    const getAvgCoverageColor = () => {
        if (summary.avgCoverage >= 80) return 'text-green-600 dark:text-green-400';
        if (summary.avgCoverage >= 60) return 'text-orange-600 dark:text-orange-400';
        return 'text-red-600 dark:text-red-400';
    };

    const borderClass = isSelected ? 'border-primary/80' : 'border-border/50';
    const bgClass = isSelected ? 'bg-muted' : 'bg-card hover:bg-muted/50';

    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full p-2 rounded-lg border transition-colors duration-150",
                "flex items-center justify-between gap-3 text-sm group",
                borderClass,
                bgClass,
            )}
            title={fullModelName}
        >
            <span className="font-medium text-foreground truncate flex-1 text-left">
                {displayText}
            </span>
            
            <div className="flex items-center gap-3 flex-shrink-0">
                {summary.criticalFailures > 0 && (
                    <span className="flex items-center gap-1 text-red-500 font-semibold" title="Critical Failures">
                        <Icon name="x-circle" className="h-4 w-4" />
                        <span>{summary.criticalFailures}</span>
                    </span>
                )}
                {summary.majorGaps > 0 && (
                     <span className="flex items-center gap-1 text-orange-500 font-semibold" title="Major Gaps">
                        <Icon name="alert-triangle" className="h-4 w-4" />
                         <span>{summary.majorGaps}</span>
                    </span>
                )}
                <div className="flex items-center gap-2">
                    <span className={cn("font-bold text-base", getAvgCoverageColor())} title={`Avg. Coverage: ${summary.avgCoverage}%`}>
                        {summary.avgCoverage}%
                    </span>
                    {similarityScore !== null && (
                        <>
                            <div className="h-4 w-px bg-border" />
                            <span className="flex items-center gap-1 font-semibold text-sky-600 dark:text-sky-400" title={`Similarity to Ideal: ${(similarityScore * 100).toFixed(0)}%`}>
                                <Icon name="git-compare-arrows" className="h-3 w-3" />
                                <span className='text-base'>{Math.round(similarityScore * 100)}</span>
                            </span>
                        </>
                    )}
                </div>
            </div>
        </button>
    );
}; 