'use client';

import { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { PromptAnalysisResults, ComparisonDataV2 } from '@/app/utils/types';
import { IDEAL_MODEL_ID, findSimilarityExtremes as importedFindSimilarityExtremes } from '@/app/utils/comparisonUtils';
import { getModelDisplayLabel, parseEffectiveModelId, IDEAL_MODEL_ID_BASE } from '../../utils/modelIdUtils';

// Dynamically import icons
const Sparkles = dynamic(() => import("lucide-react").then(mod => mod.Sparkles));
const Info = dynamic(() => import("lucide-react").then(mod => mod.Info));
const BarChartBig = dynamic(() => import("lucide-react").then(mod => mod.BarChartBig));
const SlidersHorizontal = dynamic(() => import("lucide-react").then(mod => mod.SlidersHorizontal));

interface StatisticRow {
  statistic: string;
  value: string | number;
  unit?: string;
  models?: string; // For model IDs or pairs
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

interface DatasetStatisticsProps {
    promptStats: PromptAnalysisResults | undefined;
    overallSimilarityMatrix: Record<string, Record<string, number>> | undefined;
    overallIdealExtremes: { mostSimilar: { modelId: string; value: number } | null; leastSimilar: { modelId: string; value: number } | null } | undefined;
    overallCoverageExtremes: { bestCoverage: { modelId: string; avgScore: number } | null; worstCoverage: { modelId: string; avgScore: number } | null } | undefined;
    overallAvgCoverageStats: { average: number | null; stddev: number | null } | undefined;
    modelsStrings: string[] | undefined;
    overallHybridExtremes: { bestHybrid: { modelId: string; avgScore: number } | null; worstHybrid: { modelId: string; avgScore: number } | null } | undefined;
    promptTexts: Record<string, string> | undefined;
    allPromptIds: string[] | undefined;
    overallAverageHybridScore?: number | null;
    overallHybridScoreStdDev?: number | null;
    allLlmCoverageScores?: ComparisonDataV2['evaluationResults']['llmCoverageScores'];
}

const renderDatasetStatisticsInternal = (
    promptStats: PromptAnalysisResults | undefined,
    overallSimilarityMatrix: Record<string, Record<string, number>> | undefined,
    overallIdealExtremes: { mostSimilar: { modelId: string; value: number } | null; leastSimilar: { modelId: string; value: number } | null } | undefined,
    overallCoverageExtremes: { bestCoverage: { modelId: string; avgScore: number } | null; worstCoverage: { modelId: string; avgScore: number } | null } | undefined,
    overallAvgCoverageStats: { average: number | null; stddev: number | null } | undefined,
    modelsStrings: string[] | undefined,
    overallHybridExtremes: { bestHybrid: { modelId: string; avgScore: number } | null; worstHybrid: { modelId: string; avgScore: number } | null } | undefined,
    promptTexts: Record<string, string> | undefined,
    allPromptIds: string[] | undefined,
    overallAverageHybridScore?: number | null,
    overallHybridScoreStdDev?: number | null,
    allLlmCoverageScores?: ComparisonDataV2['evaluationResults']['llmCoverageScores']
): ReactNode => {
  if (!promptStats && !overallSimilarityMatrix && !overallCoverageExtremes && !overallHybridExtremes && !overallAvgCoverageStats && overallAverageHybridScore === undefined && !allLlmCoverageScores) return null;

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
            perPromptAverageCoverageScoresNumeric.push(currentPromptTotalExtent / currentPromptValidModels); // Store 0-1 scale
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

  // Overall Average Key Point Coverage - Headline Stat
  if (overallAvgCoverageStats && typeof overallAvgCoverageStats.average === 'number') {
    let stdDevDisplay = '';
    let stdDevColorClass = '';
    if (typeof overallAvgCoverageStats.stddev === 'number') {
      stdDevDisplay = ` (\u00B1${overallAvgCoverageStats.stddev.toFixed(1)}%)`;
      stdDevColorClass = getStdDevColor(overallAvgCoverageStats.stddev, true);
    }
    headlineStatsTableData.push({
      label: "Overall Average Key Point Coverage",
      value: `${overallAvgCoverageStats.average.toFixed(1)}%<span class="${stdDevColorClass}">${stdDevDisplay}</span>`,
      tooltip: "Grand average of all individual model-prompt key point coverage scores. StdDev (±) reflects variability around this grand mean, also in percentage points. A smaller StdDev suggests more consistent coverage scores across all model-prompt pairs; a larger StdDev indicates more diverse performance."
    });
  }

  // NEW: Avg. Prompt Coverage Range
  if (minPerPromptAvgCoverage !== null && maxPerPromptAvgCoverage !== null) {
    const spread = maxPerPromptAvgCoverage - minPerPromptAvgCoverage;
    const spreadColorClass = getSpreadColor(spread);
    headlineStatsTableData.push({
      label: "Avg. Prompt Coverage Range",
      value: `${minPerPromptAvgCoverage.toFixed(0)}% - ${maxPerPromptAvgCoverage.toFixed(0)}% <span class="${spreadColorClass}">(Spread: ${spread.toFixed(0)} pp)</span>`,
      tooltip: "Range of average key point coverage scores across different prompts (from the prompt with the lowest average coverage to the one with the highest). A large spread indicates substantial differences in how challenging prompts were or how models performed on them."
    });
  }

  // NEW: StdDev of Avg. Prompt Coverage
  if (stdDevOfPromptAvgs_PercentScale !== null) {
    const colorClass = getStdDevColor(stdDevOfPromptAvgs_PercentScale, true);
    headlineStatsTableData.push({
      label: "StdDev of Avg. Prompt Coverage",
      value: `<span class="${colorClass}">${stdDevOfPromptAvgs_PercentScale.toFixed(1)}%</span>`,
      tooltip: "Measures how much the average key point coverage score varies from one prompt to another. A high value (e.g., >20-25%) suggests that average performance was quite different across prompts; a low value suggests more consistent average performance from prompt to prompt."
    });
  }

  // Overall Average Hybrid Score - Headline Stat
  if (typeof overallAverageHybridScore === 'number') {
    let stdDevDisplay = '';
    let stdDevColorClass = '';
    if (typeof overallHybridScoreStdDev === 'number') {
        stdDevDisplay = ` (\u00B1${overallHybridScoreStdDev.toFixed(1)}%)`;
        stdDevColorClass = getStdDevColor(overallHybridScoreStdDev, true);
    }
    headlineStatsTableData.push({
        label: "Overall Average Hybrid Score",
        value: `${(overallAverageHybridScore * 100).toFixed(1)}%<span class="${stdDevColorClass}">${stdDevDisplay}</span>`,
        tooltip: "Overall average of hybrid scores (balancing semantic similarity to ideal and key point coverage) for each model-prompt pair. Higher is generally better. A smaller StdDev suggests more consistent hybrid performance across all model-prompt pairs."
    });
  }

  // Number of Models Evaluated
  if (modelsStrings) {
    const actualModels = modelsStrings.filter(m => m !== IDEAL_MODEL_ID);
    headlineStatsTableData.push({
      label: "Number of Models Evaluated",
      value: actualModels.length,
      tooltip: actualModels.length > 0 ? `Models: ${actualModels.map(id => getModelDisplayLabel(id)).join(', ')}` : "No models evaluated (excluding IDEAL_MODEL_ID)"
    });
  }

  // Number of Prompts Analyzed
  if (allPromptIds) {
    let promptExample = "No prompts available in this dataset.";
    if (allPromptIds.length > 0 && promptTexts) {
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

  // Average Semantic Similarity to Ideal
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

  // Hybrid Scores - Model Stats
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

  // Detailed Coverage Extremes (vs Ideal) - Model Stats
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

  // Semantic Similarity to Ideal - Model Stats
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

  // Inter-Model Semantic Similarity - Model Stats
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
  
  // Prompt Consistency & Diversity - Prompt Stats
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
    <Card className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md text-card-foreground rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden">
      <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-6">
        <div className="flex items-center">
            {Sparkles && <Sparkles className="w-6 h-6 mr-3 text-primary dark:text-sky-400" />}
            <CardTitle className="text-primary dark:text-sky-400 text-xl">Key Dataset Statistics</CardTitle>
        </div>
        <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">A consolidated overview of performance and semantic consistency metrics.</CardDescription>
      </CardHeader>
      <CardContent className="pt-6 px-6 pb-6 space-y-8">
        {/* Headline Stats Table */}
        {headlineStatsTableData.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-primary dark:text-sky-300 mb-3 flex items-center">
                {Info && <Info className="w-5 h-5 mr-2.5 text-primary/80 dark:text-sky-400/80" />} Overall Dataset Summary
            </h3>
            <Table className="min-w-full divide-y divide-border dark:divide-slate-700 mb-8">
              <TableHeader>
                <TableRow className="hover:bg-muted/50 dark:hover:bg-slate-700/30">
                  <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary dark:text-sky-300 uppercase tracking-wider min-w-[200px]">Metric</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary dark:text-sky-300 uppercase tracking-wider whitespace-nowrap min-w-[100px]">Value</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary dark:text-sky-300 uppercase tracking-wider max-w-[500px]">Explanation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/70 dark:divide-slate-700/70">
                {headlineStatsTableData.map((stat, index) => (
                  <TableRow key={`headline-stat-${index}`} className="hover:bg-muted/30 dark:hover:bg-slate-750/50 transition-colors duration-150 ease-in-out">
                    <TableCell className="px-4 py-3 text-sm text-foreground dark:text-slate-200 font-medium" title={stat.tooltip}>{stat.label}</TableCell>
                    <TableCell 
                        className="px-4 py-3 text-m text-foreground dark:text-slate-100 font-semibold whitespace-nowrap"
                        dangerouslySetInnerHTML={{ __html: stat.value + (stat.unit || '') }}
                    />
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground dark:text-slate-400">
                        {stat.tooltip}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Model Statistics Table */}
        {modelStatsTableData.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-primary dark:text-sky-300 mb-3 flex items-center">
                {BarChartBig && <BarChartBig className="w-5 h-5 mr-2.5 text-primary dark:text-sky-400" />} Model Performance & Relationships
            </h3>
            <Table className="min-w-full divide-y divide-border dark:divide-slate-700">
              <TableHeader>
                <TableRow className="hover:bg-muted/50 dark:hover:bg-slate-700/30">
                  <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary dark:text-sky-300 uppercase tracking-wider">Statistic</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary dark:text-sky-300 uppercase tracking-wider">Associated Model(s)</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary dark:text-sky-300 uppercase tracking-wider whitespace-nowrap">Value</TableHead>
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
            {/* Moved Hybrid Score Explanation Here */}
            <div className="mt-6 text-xs text-muted-foreground dark:text-slate-300 bg-muted/70 dark:bg-slate-700/30 p-3 rounded-md ring-1 ring-border/50 dark:ring-slate-600/50">
                <p className="font-semibold mb-1 text-primary dark:text-sky-300">Hybrid Score Explained:</p>
                <p>The Hybrid Score is the geometric mean of a model's semantic similarity to the ideal response and its key point coverage score.
                <span className="mt-1 font-mono text-primary/80 dark:text-sky-400/80 text-[0.7rem]"> Formula: sqrt(similarity_to_ideal * coverage_score)</span>
                </p>
                <p className="mt-1.5">It provides a balanced measure of how closely the response matches the ideal meaning and how much ideal content it includes. Higher is better (0-1 scale).</p>
            </div>
          </div>
        )}

        {/* Prompt Statistics Table */}
        {promptStatsTableData.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-primary dark:text-sky-300 mb-3 flex items-center">
                 {SlidersHorizontal && <SlidersHorizontal className="w-5 h-5 mr-2.5 text-primary/80 dark:text-sky-400/80" />} Prompt-Specific Variations
            </h3>
            <Table className="min-w-full divide-y divide-border dark:divide-slate-700">
              <TableHeader>
                <TableRow className="hover:bg-muted/50 dark:hover:bg-slate-700/30">
                  <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary dark:text-sky-300 uppercase tracking-wider">Statistic</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary dark:text-sky-300 uppercase tracking-wider">Associated Prompt ID</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-medium text-primary dark:text-sky-300 uppercase tracking-wider whitespace-nowrap">Value</TableHead>
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
        )}
      </CardContent>
    </Card>
  );
};

const DatasetStatistics: React.FC<DatasetStatisticsProps> = (props) => {
    return renderDatasetStatisticsInternal(
        props.promptStats,
        props.overallSimilarityMatrix,
        props.overallIdealExtremes,
        props.overallCoverageExtremes,
        props.overallAvgCoverageStats,
        props.modelsStrings,
        props.overallHybridExtremes,
        props.promptTexts,
        props.allPromptIds,
        props.overallAverageHybridScore,
        props.overallHybridScoreStdDev,
        props.allLlmCoverageScores
    );
};

export default DatasetStatistics; 