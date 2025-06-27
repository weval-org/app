'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getGradedCoverageColor } from '../utils/colorUtils';
import { getModelDisplayLabel, parseEffectiveModelId as globalParseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { CoverageResult as ImportedCoverageResult, PointAssessment as ImportedPointAssessment } from '@/types/shared';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });
const CheckCircle2 = dynamic(() => import("lucide-react").then((mod) => mod.CheckCircle2));
const XCircle = dynamic(() => import("lucide-react").then((mod) => mod.XCircle));
const TrendingUp = dynamic(() => import("lucide-react").then((mod) => mod.TrendingUp));
const TrendingDown = dynamic(() => import("lucide-react").then((mod) => mod.TrendingDown));

// Use shared types
export type PointAssessment = ImportedPointAssessment;
export type CoverageResult = ImportedCoverageResult;

interface KeyPointCoverageComparisonDisplayProps {
    coverageScores: Record<string, CoverageResult> | undefined | null; // ModelId -> CoverageResult
    models: string[]; // All non-ideal model IDs
    promptResponses: Record<string, string> | undefined | null; // ModelId -> Response Text
    idealModelId: string; // e.g., IDEAL_BENCHMARK
    promptId: string; // Current prompt ID
    onModelClick?: (modelId: string) => void;
}

const KeyPointCoverageComparisonDisplay: React.FC<KeyPointCoverageComparisonDisplayProps> = ({
    coverageScores,
    models,
    promptResponses,
    idealModelId,
    promptId,
    onModelClick,
}) => {
    const idealResponseText = useMemo(() => promptResponses?.[idealModelId], [promptResponses, idealModelId]);

    const coverageExtremes = useMemo(() => {
        if (!coverageScores || !models || models.length === 0) {
            return { bestCoverageModel: null, worstCoverageModel: null };
        }

        let bestModel: string | null = null;
        let worstModel: string | null = null;
        let maxCoverage = -1;
        let minCoverage = Infinity;

        models.forEach(modelId => {
            if (modelId === idealModelId) return; // Skip ideal model itself

            const result = coverageScores[modelId];
            if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                const currentCoverage = result.avgCoverageExtent;
                if (currentCoverage > maxCoverage) {
                    maxCoverage = currentCoverage;
                    bestModel = modelId;
                }
                if (currentCoverage < minCoverage) {
                    minCoverage = currentCoverage;
                    worstModel = modelId;
                }
            }
        });
        
        // Handle cases where all models might have errors or no scores
        if (maxCoverage === -1) bestModel = null;
        if (minCoverage === Infinity) worstModel = null;
        // If best and worst are the same, only show best (or one if only one model)
        if (bestModel && bestModel === worstModel && models.length > 1) {
             // If there's more than one model and best is worst, it means all valid models had the same score.
             // We can keep bestModel and set worstModel to null to avoid redundancy if desired,
             // or show it as both if that makes sense. For now, let's prioritize showing 'best'.
             // If there is only one model, bestModel will be that model, and worstModel will be null (as minCoverage would remain Infinity if only one valid model)
        }


        return { 
            bestCoverageModel: bestModel, 
            worstCoverageModel: (bestModel && bestModel === worstModel && models.filter(m => m !== idealModelId).length > 1) ? null : worstModel
        };
    }, [coverageScores, models, idealModelId]);

    const bestCoverageModelInfo = useMemo(() => {
        if (!coverageExtremes.bestCoverageModel || !coverageScores) return null;
        const modelId = coverageExtremes.bestCoverageModel;
        const scoreData = coverageScores[modelId];
        if (scoreData && !('error' in scoreData) && scoreData.avgCoverageExtent !== undefined) {
            return {
                id: modelId,
                displayLabel: getModelDisplayLabel(modelId),
                response: promptResponses?.[modelId] || 'Response not found.',
                score: scoreData.avgCoverageExtent,
            };
        }
        return null;
    }, [coverageExtremes.bestCoverageModel, coverageScores, promptResponses]);

    const worstCoverageModelInfo = useMemo(() => {
        if (!coverageExtremes.worstCoverageModel || !coverageScores) return null;
        const modelId = coverageExtremes.worstCoverageModel;
        const scoreData = coverageScores[modelId];
        if (scoreData && !('error' in scoreData) && scoreData.avgCoverageExtent !== undefined) {
            return {
                id: modelId,
                displayLabel: getModelDisplayLabel(modelId),
                response: promptResponses?.[modelId] || 'Response not found.',
                score: scoreData.avgCoverageExtent,
            };
        }
        return null;
    }, [coverageExtremes.worstCoverageModel, coverageScores, promptResponses]);

    if (!idealResponseText) {
        return (
            <div className="p-4 my-4 text-center text-sm bg-muted/50 dark:bg-slate-800/50 rounded-lg ring-1 ring-border dark:ring-slate-700/70 text-muted-foreground dark:text-slate-400">
                Ideal response text not found for prompt: <span className="font-semibold">{promptId}</span>. Key point coverage comparison cannot be displayed.
            </div>
        );
    }
    
    const availableModelsForComparison = models.filter(m => m !== idealModelId);
    if (availableModelsForComparison.length === 0) {
         return (
            <div className="p-4 my-4 text-center text-sm bg-muted/50 dark:bg-slate-800/50 rounded-lg ring-1 ring-border dark:ring-slate-700/70 text-muted-foreground dark:text-slate-400">
                No models (excluding Ideal) available for key point coverage comparison on prompt: <span className="font-semibold">{promptId}</span>.
            </div>
        );
    }

    if (!bestCoverageModelInfo && !worstCoverageModelInfo && availableModelsForComparison.length > 0) {
         return (
            <div className="p-4 my-4 text-center text-sm bg-muted/50 dark:bg-slate-800/50 rounded-lg ring-1 ring-border dark:ring-slate-700/70 text-muted-foreground dark:text-slate-400">
                No valid key point coverage scores found for any models for prompt: <span className="font-semibold">{promptId}</span>.
            </div>
        );
    }

    const renderModelInfoCard = (title: string, modelInfo: { displayLabel: string; response: string; score: number; id: string } | null, icon?: React.ReactNode, type?: 'best' | 'worst' | 'ideal') => {
        if (!modelInfo && type !== 'ideal') return null;
        
        let cardTitle = title;
        let scoreBadge: React.ReactNode = null;
        let responseText = modelInfo?.response;
        let modelDisplayLabel = modelInfo?.displayLabel;
        let modelId = modelInfo?.id;

        if (type === 'ideal') {
            responseText = idealResponseText;
            modelDisplayLabel = "Ideal Response (Benchmark)";
        } else if (modelInfo) {
            cardTitle = `${title}: ${modelDisplayLabel}`;
            const scoreColorClass = getGradedCoverageColor(true, modelInfo.score);
            scoreBadge = (
                <Badge 
                    variant="outline" 
                    className={`text-xs font-medium border ${scoreColorClass} text-white dark:text-slate-50`}
                    title={`Average Key Point Coverage Extent: ${modelInfo.score.toFixed(3)}`}
                >
                    Avg. Coverage: {modelInfo.score.toFixed(2)}
                </Badge>
            );
        }

        const isClickable = !!onModelClick && modelInfo?.id && type !== 'ideal';
        const cardClasses = `flex-1 min-w-0 bg-card/70 dark:bg-slate-800/60 shadow-md ring-1 ring-border dark:ring-slate-700/80 mb-4 ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-primary dark:hover:ring-sky-500 transition-all duration-150' : ''}`;

        return (
            <Card 
                className={cardClasses}
                onClick={() => {
                    if (isClickable && modelId) {
                        onModelClick(modelId);
                    }
                }}
            >
                <CardHeader className="p-3 border-b border-border dark:border-slate-700/80">
                    <div className="flex items-center justify-between">
                        <CardTitle className={`text-sm font-semibold flex items-center ${type === 'ideal' ? 'text-highlight-success dark:text-green-300' : type === 'best' ? 'text-highlight-success dark:text-green-300' : 'text-highlight-error dark:text-red-300'}`}>
                            {icon && <span className="mr-2">{icon}</span>}
                            {cardTitle}
                        </CardTitle>
                        {scoreBadge}
                    </div>
                </CardHeader>
                <CardContent className="p-3">
                    <div className="prose prose-xs dark:prose-invert max-w-none text-muted-foreground dark:text-slate-300 max-h-48 overflow-y-auto custom-scrollbar p-1 rounded bg-muted/30 dark:bg-slate-700/40 text-[11px]">
                        {responseText && ReactMarkdown && RemarkGfmPlugin ? (
                            <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{responseText}</ReactMarkdown>
                        ) : <p className="italic">Response not available.</p>}
                    </div>
                </CardContent>
            </Card>
        );
    };
    
    const oneModelCase = availableModelsForComparison.length === 1 && bestCoverageModelInfo && !worstCoverageModelInfo;

    return (
        <React.Fragment>
            {/* Ideal Response Card */}
            {renderModelInfoCard(
                "Ideal Response (Benchmark)", 
                null, // No modelInfo needed as it pulls from idealResponseText
                CheckCircle2 && <CheckCircle2 className="w-4 h-4 text-highlight-success dark:text-green-400" />,
                'ideal'
            )}

            {/* Flex container for Best and Worst Coverage Model Cards */}
            <div className="flex flex-col md:flex-row gap-4 mt-4">
                {bestCoverageModelInfo && renderModelInfoCard(
                    oneModelCase ? "Model Coverage" : "Best Key Point Coverage", 
                    bestCoverageModelInfo, 
                    TrendingUp && <TrendingUp className="w-4 h-4 text-highlight-success dark:text-green-400" />,
                    'best'
                )}

                {worstCoverageModelInfo && !oneModelCase && renderModelInfoCard(
                    "Worst Key Point Coverage", 
                    worstCoverageModelInfo, 
                    TrendingDown && <TrendingDown className="w-4 h-4 text-highlight-error dark:text-red-400" />,
                    'worst'
                )}
            </div>
            
            {availableModelsForComparison.length > 0 && !bestCoverageModelInfo && !worstCoverageModelInfo && (
                 <div className="p-4 my-4 text-center text-sm bg-muted/50 dark:bg-slate-800/50 rounded-lg ring-1 ring-border dark:ring-slate-700/70 text-muted-foreground dark:text-slate-400">
                    No models had valid coverage scores to determine best/worst for prompt: <span className="font-semibold">{promptId}</span>.
                </div>
            )}
        </React.Fragment>
    );
};

export default KeyPointCoverageComparisonDisplay; 