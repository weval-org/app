'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { StructuredSummary } from '@/app/analysis/components/StructuredSummary';
import { MarkdownAccordion } from '@/app/analysis/components/MarkdownAccordion';
import Icon from '@/components/ui/icon';

const getInsightStyles = (type: 'info' | 'warning' | 'success') => {
    switch (type) {
        case 'warning':
            return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20';
        case 'success':
            return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20';
        default:
            return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20';
    }
};

const getIconColor = (type: 'info' | 'warning' | 'success') => {
    switch (type) {
        case 'warning': return 'text-yellow-600 dark:text-yellow-400';
        case 'success': return 'text-green-600 dark:text-green-400';
        default: return 'text-blue-600 dark:text-blue-400';
    }
};

export const SimpleInsights: React.FC = () => {
    const {
        summaryStats,
        data,
        configId,
        openModelPerformanceModal,
        openPromptDetailModal,
        openSimilarityModal,
        normalizedExecutiveSummary
    } = useAnalysis();

    // Check if this is a workshop run (ephemeral, different storage pattern)
    const isWorkshopRun = configId?.startsWith('workshop_');

    // Check what eval methods are available
    const hasCoverage = data?.evalMethodsUsed?.includes('llm-coverage');
    const hasSimilarity = data?.evalMethodsUsed?.includes('embedding');

    if (!summaryStats && !normalizedExecutiveSummary) {
        return null;
    }

    const insights = useMemo(() => {
        const result = [];

        // Add coverage-based performance insights (requires llm-coverage)
        if (hasCoverage && summaryStats?.bestPerformingModel && summaryStats?.worstPerformingModel) {
            const best = summaryStats.bestPerformingModel;
            const worst = summaryStats.worstPerformingModel;
            const gap = (best.score - worst.score) * 100;

            result.push({
                id: 'performance-gap',
                icon: 'trending-up',
                title: 'Performance Range',
                description: `There's a ${gap.toFixed(0)}% performance gap between the best and worst models`,
                action: () => openModelPerformanceModal(best.id),
                actionLabel: `View ${getModelDisplayLabel(best.id, { hideProvider: true, prettifyModelName: true })}`,
                type: 'info' as const
            });
        }

        // Add differentiation insight (works with either method)
        if (summaryStats?.mostDifferentiatingPrompt) {
            const prompt = summaryStats.mostDifferentiatingPrompt;
            result.push({
                id: 'most-differentiating',
                icon: 'target',
                title: 'Most Challenging Scenario',
                description: `"${prompt.text?.substring(0, 80)}..." shows the biggest differences between models`,
                action: () => openPromptDetailModal(prompt.id),
                actionLabel: 'Analyze this scenario',
                type: 'warning' as const
            });
        }

        // Add similarity insights (works with embeddings-only)
        if (hasSimilarity && summaryStats?.mostSimilarPair) {
            const pair = summaryStats.mostSimilarPair;
            const similarity = (pair.value * 100).toFixed(0);
            result.push({
                id: 'most-similar',
                title: 'Most Similar Models',
                icon: 'copy',
                description: `${getModelDisplayLabel(pair.pair[0], { hideProvider: true, prettifyModelName: true })} and ${getModelDisplayLabel(pair.pair[1], { hideProvider: true, prettifyModelName: true })} are ${similarity}% similar`,
                action: () => openSimilarityModal(pair.pair[0]),
                actionLabel: 'View similarity analysis',
                type: 'success' as const
            });
        }

        // Add message about missing eval methods if no insights
        if (result.length === 0 && !hasCoverage && !hasSimilarity) {
            result.push({
                id: 'no-evals',
                icon: 'alert-circle',
                title: 'Limited Analysis',
                description: 'This run did not include evaluation methods. Re-run with --eval-method for insights.',
                action: null,
                actionLabel: null,
                type: 'warning' as const
            });
        }

        return result;
    }, [summaryStats, hasCoverage, hasSimilarity, openModelPerformanceModal, openPromptDetailModal, openSimilarityModal]);

    return (
        <div className="space-y-6">
            {/* Key Insights */}
            {insights.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {insights.map(insight => (
                        <Card key={insight.id} className={`shadow-md border ${getInsightStyles(insight.type)}`}>
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    <Icon name={insight.icon} className={`w-5 h-5 flex-shrink-0 ${getIconColor(insight.type)}`} />
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-sm mb-1">{insight.title}</h4>
                                        <p className="text-xs text-muted-foreground mb-3">{insight.description}</p>
                                        {insight.action && insight.actionLabel && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={insight.action}
                                                className="text-xs h-7"
                                            >
                                                {insight.actionLabel}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Executive Summary */}
            {normalizedExecutiveSummary && (
                <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <Icon name="file-text" className="w-5 h-5 text-primary" />
                            Executive Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                            {data?.executiveSummary?.isStructured && data.executiveSummary?.structured ? (
                                <StructuredSummary insights={data.executiveSummary.structured} />
                            ) : (
                                <MarkdownAccordion content={normalizedExecutiveSummary} />
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Advanced Features Notice - Only show for non-workshop runs */}
            {!isWorkshopRun && (
                <Card className="shadow-lg border border-border/30 bg-muted/20">
                    <CardContent className="py-6">
                        <Link href={`/analysis/${data?.configId}/${data?.runLabel}/${data?.timestamp}`} className="block group">
                            <div className="text-center">
                                <Icon name="search" className="w-8 h-8 text-muted-foreground mx-auto mb-3 group-hover:text-primary transition-colors" />
                                <h3 className="font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                                    Want more detailed analysis?
                                </h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    The advanced view includes conversation trees, similarity matrices, system prompt variations, and detailed filtering options.
                                </p>
                                <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                                    <Badge variant="outline" className="text-xs">Temperature Analysis</Badge>
                                    <Badge variant="outline" className="text-xs">System Prompt Variations</Badge>
                                    <Badge variant="outline" className="text-xs">Similarity Dendrograms</Badge>
                                    <Badge variant="outline" className="text-xs">Coverage Breakdowns</Badge>
                                </div>
                                <div className="inline-flex items-center gap-2 text-sm text-primary group-hover:underline">
                                    Open Advanced Analysis
                                    <Icon name="arrow-right" className="w-4 h-4" />
                                </div>
                            </div>
                        </Link>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
