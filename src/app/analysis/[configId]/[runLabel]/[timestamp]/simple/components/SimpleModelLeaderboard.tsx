'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { calculateSemanticLeaderboard } from '../utils/semanticScoring';
import Icon from '@/components/ui/icon';

export const SimpleModelLeaderboard: React.FC = () => {
    const { summaryStats, data, displayedModels, openModelPerformanceModal } = useAnalysis();
    const [showAll, setShowAll] = useState(false);

    // Determine what data we have
    const hasCoverage = !!summaryStats?.modelLeaderboard && summaryStats.modelLeaderboard.length > 0;
    const hasSimilarity = !!data?.evaluationResults?.perPromptSimilarities;

    // Try coverage first, fallback to similarity
    const leaderboardData = useMemo(() => {
        if (hasCoverage) {
            return { data: summaryStats.modelLeaderboard, type: 'coverage' as const };
        } else if (hasSimilarity && data) {
            const models = displayedModels.filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase());
            const semanticLeaderboard = calculateSemanticLeaderboard(data, models);
            return semanticLeaderboard
                ? { data: semanticLeaderboard, type: 'similarity' as const }
                : null;
        }
        return null;
    }, [hasCoverage, hasSimilarity, summaryStats, data, displayedModels]);

    if (!leaderboardData) {
        return (
            <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                <CardContent className="py-6">
                    <Alert variant="default" className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10">
                        <Icon name="info" className="h-4 w-4 text-blue-600" />
                        <AlertTitle>Model Rankings Unavailable</AlertTitle>
                        <AlertDescription>
                            Rankings require either <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">llm-coverage</code> or <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">embedding</code> evaluation methods.
                            This run was executed without evaluation methods.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        );
    }

    const { data: modelLeaderboard, type } = leaderboardData;

    // TypeScript safety check
    if (!modelLeaderboard || modelLeaderboard.length === 0) {
        return (
            <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                <CardContent className="py-6">
                    <Alert variant="default" className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10">
                        <Icon name="info" className="h-4 w-4 text-blue-600" />
                        <AlertTitle>Model Rankings Unavailable</AlertTitle>
                        <AlertDescription>
                            No model performance data available.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        );
    }

    const displayedLeaderboard = showAll ? modelLeaderboard : modelLeaderboard.slice(0, 6);

    const getRankIcon = (rank: number) => {
        switch (rank) {
            case 1: return <Icon name="trophy" className="w-5 h-5 text-yellow-500" />;
            case 2: return <Icon name="medal" className="w-5 h-5 text-gray-400" />;
            case 3: return <Icon name="award" className="w-5 h-5 text-amber-600" />;
            default: return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-muted-foreground">{rank}</span>;
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 0.8) return 'text-green-600 dark:text-green-400';
        if (score >= 0.6) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-red-600 dark:text-red-400';
    };

    return (
        <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
                <div className="flex items-center justify-center gap-2 mb-1 flex-wrap">
                    <CardTitle className="text-2xl font-bold flex items-center gap-2">
                        <Icon name="trophy" className="w-6 h-6 text-primary" />
                        Model Rankings
                    </CardTitle>
                    <Badge variant={type === 'coverage' ? 'default' : 'outline'} className="text-xs">
                        {type === 'coverage' ? 'By Coverage Score' : 'By Similarity to Ideal'}
                    </Badge>
                </div>
                <p className="text-muted-foreground">
                    {type === 'coverage'
                        ? 'How well each AI model performed across all test scenarios'
                        : 'How similar each model\'s responses are to the ideal responses'
                    }
                </p>
            </CardHeader>
            <CardContent>
                <div className="grid gap-3">
                    {displayedLeaderboard.map((model, index) => {
                        const rank = modelLeaderboard.findIndex(m => m.id === model.id) + 1;
                        const isTopThree = rank <= 3;
                        
                        return (
                            <div
                                key={model.id}
                                className={`flex items-center justify-between p-4 rounded-xl transition-all duration-200 cursor-pointer group ${
                                    isTopThree 
                                        ? 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border border-yellow-200 dark:border-yellow-800/50 hover:shadow-md'
                                        : 'bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-border'
                                }`}
                                onClick={() => openModelPerformanceModal(model.id)}
                            >
                                <div className="flex items-center gap-4">
                                    {getRankIcon(rank)}
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                            {getModelDisplayLabel(model.id, {
                                                hideProvider: true,
                                                hideModelMaker: true,
                                                hideSystemPrompt: true,
                                                hideTemperature: true,
                                                prettifyModelName: true
                                            })}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {model.count} test{model.count !== 1 ? 's' : ''} completed • Click for details
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-xl font-bold ${getScoreColor(model.score)}`}>
                                        {(model.score * 100).toFixed(0)}%
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        overall score
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {modelLeaderboard.length > 6 && (
                    <div className="mt-4 text-center">
                        <Button
                            variant="ghost"
                            onClick={() => setShowAll(!showAll)}
                            className="gap-2"
                        >
                            {showAll ? (
                                <>
                                    <Icon name="chevron-up" className="w-4 h-4" />
                                    Show less
                                </>
                            ) : (
                                <>
                                    <Icon name="chevron-down" className="w-4 h-4" />
                                    Show all {modelLeaderboard.length} models
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
