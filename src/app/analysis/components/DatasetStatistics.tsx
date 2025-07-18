'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { useAnalysis } from '../context/AnalysisContext';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { IDEAL_MODEL_ID, findSimilarityExtremes as importedFindSimilarityExtremes } from '@/app/utils/calculationUtils';
import dynamic from 'next/dynamic';

const Sparkles = dynamic(() => import('lucide-react').then(mod => mod.Sparkles), { ssr: false });
const BarChartBig = dynamic(() => import('lucide-react').then(mod => mod.BarChartBig), { ssr: false });
const SlidersHorizontal = dynamic(() => import('lucide-react').then(mod => mod.SlidersHorizontal), { ssr: false });
const Info = dynamic(() => import('lucide-react').then(mod => mod.Info), { ssr: false });
const ChevronRight = dynamic(() => import('lucide-react').then(mod => mod.ChevronRight), { ssr: false });

interface StatisticRow {
  statistic: string;
  value: string | number;
  unit?: string;
  models?: string;
}

interface PromptStatisticRow {
  statistic: string;
  value: string | number;
  promptId?: string;
  promptText?: string;
}

interface HeadlineStatRow {
  label: string;
  value: string | number;
  unit?: string;
  tooltip?: string;
}

const DatasetStatistics = () => {
    const { data, analysisStats, displayedModels: modelsStrings, promptTextsForMacroTable: promptTexts } = useAnalysis();

    if (!data || !analysisStats) return null;

    const { evaluationResults, promptIds: allPromptIds } = data;
    const { 
        promptStatistics: promptStats,
        similarityMatrix: overallSimilarityMatrix,
        llmCoverageScores: allLlmCoverageScores
    } = evaluationResults;
    const {
        overallIdealExtremes,
        overallCoverageExtremes,
        overallAvgCoverageStats,
        overallHybridExtremes,
        overallRunHybridStats
    } = analysisStats;

    const overallAverageHybridScore = overallRunHybridStats?.average;
    const overallHybridScoreStdDev = overallRunHybridStats?.stddev;

    const overallPairExtremes = importedFindSimilarityExtremes(overallSimilarityMatrix);

    const headlineStatsTableData: HeadlineStatRow[] = [];
    const modelStatsTableData: StatisticRow[] = [];
    const promptStatsTableData: PromptStatisticRow[] = [];

    let minPerPromptAvgCoverage: number | null = null;
    let maxPerPromptAvgCoverage: number | null = null;
    let stdDevOfPromptAvgs_PercentScale: number | null = null;

    if (allLlmCoverageScores && allPromptIds && modelsStrings) {
        const perPromptAverageCoverageScoresNumeric: number[] = [];
        const nonIdealModels = modelsStrings.filter(m => m !== IDEAL_MODEL_ID);

        if (nonIdealModels.length > 0) {
            allPromptIds.forEach(promptId => {
                const promptScoresData = allLlmCoverageScores[promptId];
                if (promptScoresData) {
                    let currentPromptTotalExtent = 0;
                    let currentPromptValidModels = 0;
                    nonIdealModels.forEach(modelId => {
                        const result = promptScoresData[modelId];
                        if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                            currentPromptTotalExtent += result.avgCoverageExtent;
                            currentPromptValidModels++;
                        }
                    });
                    if (currentPromptValidModels > 0) {
                        perPromptAverageCoverageScoresNumeric.push(currentPromptTotalExtent / currentPromptValidModels);
                    }
                }
            });
        }

        if (perPromptAverageCoverageScoresNumeric.length > 0) {
            minPerPromptAvgCoverage = Math.min(...perPromptAverageCoverageScoresNumeric) * 100;
            maxPerPromptAvgCoverage = Math.max(...perPromptAverageCoverageScoresNumeric) * 100;
            if (perPromptAverageCoverageScoresNumeric.length >= 2) {
                const meanOfPromptAvgs = perPromptAverageCoverageScoresNumeric.reduce((sum, val) => sum + val, 0) / perPromptAverageCoverageScoresNumeric.length;
                const varianceOfPromptAvgs = perPromptAverageCoverageScoresNumeric.reduce((sum, val) => sum + Math.pow(val - meanOfPromptAvgs, 2), 0) / perPromptAverageCoverageScoresNumeric.length;
                stdDevOfPromptAvgs_PercentScale = Math.sqrt(varianceOfPromptAvgs) * 100;
            }
        }
    }

    const getStdDevColor = (stdDev: number | null | undefined, isPercentageScale: boolean = true): string => {
        if (stdDev === null || stdDev === undefined) return '';
        const lowThreshold = isPercentageScale ? 10 : 0.05;
        const highThreshold = isPercentageScale ? 30 : 0.15;
        if (stdDev < lowThreshold) return 'text-emerald-600 dark:text-emerald-400';
        if (stdDev > highThreshold) return 'text-amber-600 dark:text-amber-400';
        return '';
    };

    const getSpreadColor = (spread: number | null | undefined): string => {
        if (spread === null || spread === undefined) return '';
        if (spread < 20) return 'text-emerald-600 dark:text-emerald-400';
        if (spread > 60) return 'text-amber-600 dark:text-amber-400';
        return '';
    };

    const getAvgSimToIdealColor = (avgSim: number | null | undefined): string => {
        if (avgSim === null || avgSim === undefined) return '';
        if (avgSim > 0.9) return 'text-emerald-600 dark:text-emerald-400';
        return '';
    }

    if (overallAvgCoverageStats && typeof overallAvgCoverageStats.average === 'number') {
        let stdDevDisplay = '';
        let stdDevColorClass = '';
        if (typeof overallAvgCoverageStats.stddev === 'number') {
            stdDevDisplay = ` (\u00B1${(overallAvgCoverageStats.stddev).toFixed(1)}%)`;
            stdDevColorClass = getStdDevColor(overallAvgCoverageStats.stddev * 100, true);
        }
        headlineStatsTableData.push({
            label: "Overall Average Key Point Coverage",
            value: `${(overallAvgCoverageStats.average).toFixed(1)}%<span class="${stdDevColorClass}">${stdDevDisplay}</span>`,
            tooltip: "Grand average of all individual model-prompt key point coverage scores. StdDev (±) reflects variability around this grand mean, also in percentage points. A smaller StdDev suggests more consistent coverage scores across all model-prompt pairs; a larger StdDev indicates more diverse performance."
        });
    }

    if (minPerPromptAvgCoverage !== null && maxPerPromptAvgCoverage !== null) {
        const spread = maxPerPromptAvgCoverage - minPerPromptAvgCoverage;
        const spreadColorClass = getSpreadColor(spread);
        headlineStatsTableData.push({
            label: "Avg. Prompt Coverage Range",
            value: `${minPerPromptAvgCoverage.toFixed(0)}% - ${maxPerPromptAvgCoverage.toFixed(0)}% <span class="${spreadColorClass}">(Spread: ${spread.toFixed(0)} pp)</span>`,
            tooltip: "Range of average key point coverage scores across different prompts (from the prompt with the lowest average coverage to the one with the highest). A large spread indicates substantial differences in how challenging prompts were or how models performed on them."
        });
    }

    if (stdDevOfPromptAvgs_PercentScale !== null) {
        const colorClass = getStdDevColor(stdDevOfPromptAvgs_PercentScale, true);
        headlineStatsTableData.push({
            label: "StdDev of Avg. Prompt Coverage",
            value: `<span class="${colorClass}">${stdDevOfPromptAvgs_PercentScale.toFixed(1)}%</span>`,
            tooltip: "Measures how much the average key point coverage score varies from one prompt to another. A high value (e.g., >20-25%) suggests that average performance was quite different across prompts; a low value suggests more consistent average performance from prompt to prompt."
        });
    }

    if (typeof overallAverageHybridScore === 'number') {
        let stdDevDisplay = '';
        let stdDevColorClass = '';
        if (typeof overallHybridScoreStdDev === 'number') {
            stdDevDisplay = ` (\u00B1${(overallHybridScoreStdDev * 100).toFixed(1)}%)`;
            stdDevColorClass = getStdDevColor(overallHybridScoreStdDev * 100, true);
        }
        headlineStatsTableData.push({
            label: "Overall Average Hybrid Score",
            value: `${(overallAverageHybridScore * 100).toFixed(1)}%<span class="${stdDevColorClass}">${stdDevDisplay}</span>`,
            tooltip: "Overall average of hybrid scores (balancing semantic similarity to ideal and key point coverage) for each model-prompt pair. Higher is generally better. A smaller StdDev suggests more consistent hybrid performance across all model-prompt pairs."
        });
    }

    if (modelsStrings) {
        const actualModels = modelsStrings.filter(m => m !== IDEAL_MODEL_ID);
        headlineStatsTableData.push({
            label: "Number of Models Evaluated",
            value: actualModels.length,
            tooltip: actualModels.length > 0 ? `Models: ${actualModels.map(id => getModelDisplayLabel(id)).join(', ')}` : "No models evaluated (excluding IDEAL_MODEL_ID)"
        });
    }

    if (allPromptIds && promptTexts) {
        let promptExample = "No prompts available in this dataset.";
        if (allPromptIds.length > 0) {
            const firstPromptId = allPromptIds[0];
            const firstPromptText = promptTexts[firstPromptId] || "(No text found for this prompt ID)";
            promptExample = `E.g. ${firstPromptId}: ${firstPromptText.substring(0, 100)}${firstPromptText.length > 100 ? '...' : ''}`;
        }
        headlineStatsTableData.push({
            label: "Number of Prompts Analyzed",
            value: allPromptIds.length,
            tooltip: promptExample
        });
    }

    if (overallSimilarityMatrix && modelsStrings && modelsStrings.includes(IDEAL_MODEL_ID)) {
        const actualModels = modelsStrings.filter(m => m !== IDEAL_MODEL_ID);
        let totalSimilarityToIdeal = 0;
        let modelsWithIdealSim = 0;
        const individualSimScoresToIdeal: number[] = [];

        actualModels.forEach(modelId => {
            const simToIdeal = overallSimilarityMatrix[modelId]?.[IDEAL_MODEL_ID] ?? overallSimilarityMatrix[IDEAL_MODEL_ID]?.[modelId];
            if (typeof simToIdeal === 'number' && !isNaN(simToIdeal)) {
                totalSimilarityToIdeal += simToIdeal;
                individualSimScoresToIdeal.push(simToIdeal);
                modelsWithIdealSim++;
            }
        });
        if (modelsWithIdealSim > 0) {
            const avgSimToIdeal = totalSimilarityToIdeal / modelsWithIdealSim;
            let stdDevDisplay = '';
            let stdDevColorClass = '';

            if (individualSimScoresToIdeal.length >= 2) {
                const mean = avgSimToIdeal;
                const variance = individualSimScoresToIdeal.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / individualSimScoresToIdeal.length;
                const stdDevSimToIdeal = Math.sqrt(variance);
                stdDevDisplay = ` (\u00B1${stdDevSimToIdeal.toFixed(3)})`;
                stdDevColorClass = getStdDevColor(stdDevSimToIdeal, false);
            }
          
            const avgSimColorClass = getAvgSimToIdealColor(avgSimToIdeal);

            headlineStatsTableData.push({
                label: "Average Semantic Similarity to Ideal",
                value: `<span class="${avgSimColorClass}">${avgSimToIdeal.toFixed(3)}</span><span class="${stdDevColorClass}">${stdDevDisplay}</span>`,
                tooltip: "Average semantic similarity (0-1 scale) of models to the ideal response; scores closer to 1.0 are better. The StdDev shows how consistently models achieve this. A very low StdDev (e.g., <0.05) often means models performed very similarly on this metric."
            });
        }
    }

    if (overallHybridExtremes?.bestHybrid) {
        modelStatsTableData.push({
            statistic: "Best Hybrid Score",
            value: (overallHybridExtremes.bestHybrid.avgScore * 100).toFixed(1),
            unit: "%",
            models: getModelDisplayLabel(overallHybridExtremes.bestHybrid.modelId),
        });
    }
    if (overallHybridExtremes?.worstHybrid) {
        modelStatsTableData.push({
            statistic: "Worst Hybrid Score",
            value: (overallHybridExtremes.worstHybrid.avgScore * 100).toFixed(1),
            unit: "%",
            models: getModelDisplayLabel(overallHybridExtremes.worstHybrid.modelId),
        });
    }

    if (overallCoverageExtremes?.bestCoverage) {
        modelStatsTableData.push({
            statistic: "Best Avg Coverage (vs Ideal)",
            value: (overallCoverageExtremes.bestCoverage.avgScore * 100).toFixed(1),
            unit: "%",
            models: getModelDisplayLabel(overallCoverageExtremes.bestCoverage.modelId),
        });
    }
    if (overallCoverageExtremes?.worstCoverage) {
        modelStatsTableData.push({
            statistic: "Worst Avg Coverage (vs Ideal)",
            value: (overallCoverageExtremes.worstCoverage.avgScore * 100).toFixed(1),
            unit: "%",
            models: getModelDisplayLabel(overallCoverageExtremes.worstCoverage.modelId),
        });
    }

    if (overallIdealExtremes?.mostSimilar) {
        modelStatsTableData.push({
            statistic: "Closest to Ideal (Semantic)",
            value: overallIdealExtremes.mostSimilar.value.toFixed(3),
            models: getModelDisplayLabel(overallIdealExtremes.mostSimilar.modelId),
        });
    }
    if (overallIdealExtremes?.leastSimilar) {
        modelStatsTableData.push({
            statistic: "Furthest from Ideal (Semantic)",
            value: overallIdealExtremes.leastSimilar.value.toFixed(3),
            models: getModelDisplayLabel(overallIdealExtremes.leastSimilar.modelId),
        });
    }

    if (overallPairExtremes.mostSimilar) {
        modelStatsTableData.push({
            statistic: "Most Similar Pair (Overall)",
            value: overallPairExtremes.mostSimilar.value.toFixed(3),
            models: `${getModelDisplayLabel(overallPairExtremes.mostSimilar.pair[0])} vs ${getModelDisplayLabel(overallPairExtremes.mostSimilar.pair[1])}`,
        });
    }
    if (overallPairExtremes.leastSimilar) {
        modelStatsTableData.push({
            statistic: "Least Similar Pair (Overall)",
            value: overallPairExtremes.leastSimilar.value.toFixed(3),
            models: `${getModelDisplayLabel(overallPairExtremes.leastSimilar.pair[0])} vs ${getModelDisplayLabel(overallPairExtremes.leastSimilar.pair[1])}`,
        });
    }
  
    if (promptStats?.mostConsistentPrompt) {
        promptStatsTableData.push({
            statistic: "Most Consistently Scored Prompt",
            value: promptStats.mostConsistentPrompt.averageSimilarity?.toFixed(3) ?? 'N/A',
            promptId: promptStats.mostConsistentPrompt.promptId,
            promptText: promptTexts?.[promptStats.mostConsistentPrompt.promptId] || 'Unknown Prompt',
        });
    }
    if (promptStats?.mostDiversePrompt) {
        promptStatsTableData.push({
            statistic: "Most Diversely Scored Prompt",
            value: promptStats.mostDiversePrompt.averageSimilarity?.toFixed(3) ?? 'N/A',
            promptId: promptStats.mostDiversePrompt.promptId,
            promptText: promptTexts?.[promptStats.mostDiversePrompt.promptId] || 'Unknown Prompt',
        });
    }

    if (headlineStatsTableData.length === 0 && modelStatsTableData.length === 0 && promptStatsTableData.length === 0) return null;

    return (
        <Card className="bg-card backdrop-blur-md text-card-foreground rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden">
            <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-4 sm:px-6">
                <div className="flex items-center">
                    <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3 text-primary" />
                    <CardTitle className="text-primary text-lg sm:text-xl">Key Dataset Statistics</CardTitle>
                </div>
                <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">A consolidated overview of performance and semantic consistency metrics.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6 space-y-6 sm:space-y-8">
                <Collapsible defaultOpen={true}>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start p-2 sm:p-3 hover:bg-muted/50 dark:hover:bg-slate-800/60">
                            <ChevronRight className="w-4 h-4 mr-2 transition-transform duration-200 ease-in-out group-data-[state=open]:rotate-90" />
                            <h4 className="text-sm sm:text-base font-semibold flex items-center">
                                <Info className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-2.5 text-primary/80" /> Overall Dataset Summary
                            </h4>
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-2 sm:px-4 py-4 space-y-4 border-l-2 border-primary/20 ml-2 sm:ml-4">
                        {headlineStatsTableData.length > 0 && (
                            <>
                                <div className="block lg:hidden space-y-3">
                                    {headlineStatsTableData.map((stat, index) => (
                                        <div key={`headline-stat-card-${index}`} className="bg-card/50 dark:bg-slate-800/30 rounded-lg p-4 border border-border/50 dark:border-slate-600/50">
                                            <div className="flex flex-col space-y-2">
                                                <h5 className="text-sm font-semibold text-primary">{stat.label}</h5>
                                                <div 
                                                    className="text-lg font-bold text-foreground dark:text-slate-100"
                                                    dangerouslySetInnerHTML={{ __html: String(stat.value) + (stat.unit || '') }}
                                                />
                                                <p className="text-xs text-muted-foreground dark:text-slate-400 leading-relaxed">
                                                    {stat.tooltip}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="hidden lg:block overflow-x-auto">
                                    <Table className="min-w-full divide-y divide-border dark:divide-slate-700 mb-8">
                                        <TableHeader>
                                            <TableRow className="hover:bg-muted/50 dark:hover:bg-slate-700/30">
                                                <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary uppercase tracking-wider min-w-[200px]">Metric</TableHead>
                                                <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary uppercase tracking-wider whitespace-nowrap min-w-[100px]">Value</TableHead>
                                                <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary uppercase tracking-wider max-w-[500px]">Explanation</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="divide-y divide-border/70 dark:divide-slate-700/70">
                                            {headlineStatsTableData.map((stat, index) => (
                                                <TableRow key={`headline-stat-${index}`} className="hover:bg-muted/30 dark:hover:bg-slate-750/50 transition-colors duration-150 ease-in-out">
                                                    <TableCell className="px-4 py-3 text-sm text-foreground dark:text-slate-200 font-medium" title={stat.tooltip}>{stat.label}</TableCell>
                                                    <TableCell 
                                                        className="px-4 py-3 text-base text-foreground dark:text-slate-100 font-semibold whitespace-nowrap"
                                                        dangerouslySetInnerHTML={{ __html: String(stat.value) + (stat.unit || '') }}
                                                    />
                                                    <TableCell className="px-4 py-3 text-xs text-muted-foreground dark:text-slate-400">
                                                        {stat.tooltip}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        )}
                    </CollapsibleContent>
                </Collapsible>

                <Collapsible defaultOpen={false}>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start p-2 sm:p-3 hover:bg-muted/50 dark:hover:bg-slate-800/60">
                            <ChevronRight className="w-4 h-4 mr-2 transition-transform duration-200 ease-in-out group-data-[state=open]:rotate-90" />
                            <h4 className="text-sm sm:text-base font-semibold flex items-center">
                                <BarChartBig className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-2.5 text-primary" /> Model Performance & Relationships
                            </h4>
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-2 sm:px-4 py-4 space-y-4 border-l-2 border-primary/20 ml-2 sm:ml-4">
                        {modelStatsTableData.length > 0 && (
                            <>
                                <div className="block lg:hidden space-y-3">
                                    {modelStatsTableData.map((stat, index) => (
                                        <div key={`model-stat-card-${index}`} className="bg-card/50 dark:bg-slate-800/30 rounded-lg p-4 border border-border/50 dark:border-slate-600/50">
                                            <div className="flex flex-col space-y-2">
                                                <h5 className="text-sm font-semibold text-primary">{stat.statistic}</h5>
                                                <div className="text-lg font-bold text-foreground dark:text-slate-100">
                                                    {stat.value}{stat.unit}
                                                </div>
                                                <p className="text-xs text-muted-foreground dark:text-slate-400 leading-relaxed">
                                                    <span className="font-medium">Model:</span> {stat.models || 'N/A'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="hidden lg:block overflow-x-auto">
                                    <Table className="min-w-full divide-y divide-border dark:divide-slate-700">
                                        <TableHeader>
                                            <TableRow className="hover:bg-muted/50 dark:hover:bg-slate-700/30">
                                                <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary uppercase tracking-wider">Statistic</TableHead>
                                                <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary uppercase tracking-wider">Associated Model(s)</TableHead>
                                                <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary uppercase tracking-wider whitespace-nowrap">Value</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="divide-y divide-border/70 dark:divide-slate-700/70">
                                            {modelStatsTableData.map((stat, index) => (
                                                <TableRow key={`model-stat-${index}`} className="hover:bg-muted/30 dark:hover:bg-slate-750/50 transition-colors duration-150 ease-in-out">
                                                    <TableCell className="px-4 py-3 text-sm text-foreground dark:text-slate-200">{stat.statistic}</TableCell>
                                                    <TableCell className="px-4 py-3 text-sm text-foreground dark:text-slate-100 font-semibold truncate max-w-xs" title={stat.models}>
                                                        {stat.models || 'N/A'}
                                                    </TableCell>
                                                    <TableCell className="px-4 py-3 text-base text-foreground dark:text-slate-100 font-bold">
                                                        {stat.value}{stat.unit}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="mt-4 sm:mt-6 text-xs text-muted-foreground dark:text-slate-300 bg-muted/70 dark:bg-slate-700/30 p-3 rounded-md ring-1 ring-border/50 dark:ring-slate-600/50">
                                    <p className="font-semibold mb-1 text-primary">Hybrid Score Explained:</p>
                                    <div className="prose prose-sm max-w-none text-muted-foreground">
                                        <p>The Hybrid Score is a weighted average combining semantic similarity (35% weight) and key point coverage (65% weight). This emphasizes rubric adherence while still valuing overall response quality. <span className="mt-1 block sm:inline font-mono text-primary/80 text-[0.7rem]">Formula: (0.35 * sim_score) + (0.65 * cov_score)</span></p>
                                    </div>
                                </div>
                            </>
                        )}
                    </CollapsibleContent>
                </Collapsible>

                {promptStatsTableData.length > 0 && <Collapsible defaultOpen={false}>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start p-2 sm:p-3 hover:bg-muted/50 dark:hover:bg-slate-800/60">
                            <ChevronRight className="w-4 h-4 mr-2 transition-transform duration-200 ease-in-out group-data-[state=open]:rotate-90" />
                            <h4 className="text-sm sm:text-base font-semibold flex items-center">
                                <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-2.5 text-primary/80" /> Prompt-Specific Variations
                            </h4>
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-2 sm:px-4 py-4 space-y-4 border-l-2 border-primary/20 ml-2 sm:ml-4">
                        {promptStatsTableData.length > 0 && (
                            <>
                                <div className="block lg:hidden space-y-3">
                                    {promptStatsTableData.map((stat, index) => (
                                        <div key={`prompt-stat-card-${index}`} className="bg-card/50 dark:bg-slate-800/30 rounded-lg p-4 border border-border/50 dark:border-slate-600/50">
                                            <div className="flex flex-col space-y-2">
                                                <h5 className="text-sm font-semibold text-primary">{stat.statistic}</h5>
                                                <div className="text-lg font-bold text-foreground dark:text-slate-100">
                                                    ({stat.value})
                                                </div>
                                                <div className="text-xs text-muted-foreground dark:text-slate-400 leading-relaxed">
                                                    <span className="font-medium">Prompt ID:</span> {stat.promptId || 'N/A'}
                                                    {stat.promptText && (
                                                        <div className="mt-1">
                                                            <span className="font-medium">Text:</span> {stat.promptText}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="hidden lg:block overflow-x-auto">
                                    <Table className="min-w-full divide-y divide-border dark:divide-slate-700">
                                        <TableHeader>
                                            <TableRow className="hover:bg-muted/50 dark:hover:bg-slate-700/30">
                                                <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary uppercase tracking-wider">Statistic</TableHead>
                                                <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary uppercase tracking-wider">Associated Prompt ID</TableHead>
                                                <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary uppercase tracking-wider whitespace-nowrap">Value</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="divide-y divide-border/70 dark:divide-slate-700/70">
                                            {promptStatsTableData.map((stat, index) => (
                                                <TableRow key={`prompt-stat-${index}`} className="hover:bg-muted/30 dark:hover:bg-slate-750/50 transition-colors duration-150 ease-in-out">
                                                    <TableCell className="px-4 py-3 text-sm text-foreground dark:text-slate-200">{stat.statistic}</TableCell>
                                                    <TableCell className="px-4 py-3 text-sm text-foreground dark:text-slate-100 font-semibold truncate max-w-md" title={`${stat.promptId} - ${stat.promptText}`}>
                                                        {stat.promptId && stat.promptText ? `ID: ${stat.promptId} - ${stat.promptText}` : (stat.promptId || 'N/A')}
                                                    </TableCell>
                                                    <TableCell className="px-4 py-3 text-sm text-muted-foreground dark:text-slate-400">
                                                        ({stat.value})
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        )}
                    </CollapsibleContent>
                </Collapsible>}
            </CardContent>
        </Card>
    );
};

export default DatasetStatistics; 