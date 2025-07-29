'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PromptPerformance } from './MobileModelPerformanceAnalysis';
import Icon from '@/components/ui/icon';

interface MobilePromptListProps {
    modelDisplayName: string;
    promptPerformances: PromptPerformance[];
    onPromptSelect: (promptId: string) => void;
    onClose: () => void;
    selectedPromptId: string | null;
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

const MobilePromptCard: React.FC<{
    performance: PromptPerformance;
    onSelect: (promptId: string) => void;
    isSelected: boolean;
}> = ({ performance, onSelect, isSelected }) => (
    <Card 
        className={`cursor-pointer transition-colors hover:bg-muted/50 ${
            isSelected ? 'ring-2 ring-primary bg-primary/5' : ''
        }`}
        onClick={() => onSelect(performance.promptId)}
    >
        <CardHeader className="p-4 min-h-[60px]">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-medium line-clamp-2 mb-1">
                        {performance.promptText}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Tap to view detailed analysis
                    </p>
                </div>
                {getPerformanceBadge(performance.rank, performance.score)}
            </div>
        </CardHeader>
    </Card>
);

export const MobilePromptList: React.FC<MobilePromptListProps> = ({
    modelDisplayName,
    promptPerformances,
    onPromptSelect,
    onClose,
    selectedPromptId
}) => {
    return (
        <div className="h-full flex flex-col min-h-0">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b bg-card flex-shrink-0">
                <button 
                    onClick={onClose}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-lg transition-colors min-h-[44px]"
                    title="Back to macro table"
                >
                    <Icon name="arrow-left" className="h-5 w-5" />
                    <span className="font-medium">Back to Analysis</span>
                </button>
                <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-lg truncate">{modelDisplayName}</h2>
                    <p className="text-sm text-muted-foreground">
                        Performance across {promptPerformances.length} prompts
                    </p>
                </div>
            </div>

            {/* Prompt List */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-3">
                {promptPerformances.length > 0 ? (
                    promptPerformances.map(performance => (
                        <MobilePromptCard
                            key={performance.promptId}
                            performance={performance}
                            onSelect={onPromptSelect}
                            isSelected={selectedPromptId === performance.promptId}
                        />
                    ))
                ) : (
                    <div className="flex items-center justify-center h-full p-8">
                        <div className="text-center">
                            <p className="text-muted-foreground text-lg">No prompts available</p>
                            <p className="text-muted-foreground text-sm mt-2">
                                This model has no evaluation data.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}; 