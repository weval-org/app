'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import MacroCoverageTable from '@/app/analysis/components/MacroCoverageTable';
import DatasetStatistics from '@/app/analysis/components/DatasetStatistics';
import CoverageTableLegend, { ActiveHighlight } from '@/app/analysis/components/CoverageTableLegend';
import PerModelHybridScoresCard from '@/app/analysis/components/PerModelHybridScoresCard';
import DendrogramChart from '@/app/analysis/components/DendrogramChart';
import SystemPromptsDisplay from '@/app/analysis/components/SystemPromptsDisplay';
import {
    Tabs,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
    CoverageResult as ImportedCoverageResult,
} from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { getHybridScoreColorClass } from '@/app/analysis/utils/colorUtils';

const hclust = require('ml-hclust');

const AlertTriangle = dynamic(() => import("lucide-react").then((mod) => mod.AlertTriangle));
const HelpCircle = dynamic(() => import("lucide-react").then(mod => mod.HelpCircle));

export interface AggregateAnalysisViewProps {
    data: ImportedComparisonDataV2;
    configId: string;
    runLabel: string;
    timestamp: string;
    excludedModelsList: string[];
    openModelEvaluationDetailModal: (args: { promptId: string; modelId: string; }) => void;
    resolvedTheme?: string;
    displayedModels: string[];
    modelsForMacroTable: string[];
    modelsForAggregateView: string[];
    forceIncludeExcludedModels: boolean;
    setForceIncludeExcludedModels: (value: boolean) => void;
    selectedTemperatures: number[];
    setSelectedTemperatures: React.Dispatch<React.SetStateAction<number[]>>;
    activeSysPromptIndex: number;
    setActiveSysPromptIndex: (value: number) => void;
    activeHighlights: Set<ActiveHighlight>;
    handleActiveHighlightsChange: (newHighlights: Set<ActiveHighlight>) => void;
    analysisStats: any;
    permutationSensitivityMap: Map<string, 'temp' | 'sys' | 'both'>;
    promptTextsForMacroTable: Record<string, string>;
}

export const AggregateAnalysisView: React.FC<AggregateAnalysisViewProps> = ({
    data,
    configId,
    runLabel,
    timestamp,
    excludedModelsList,
    openModelEvaluationDetailModal,
    resolvedTheme,
    displayedModels,
    modelsForMacroTable,
    modelsForAggregateView,
    forceIncludeExcludedModels,
    setForceIncludeExcludedModels,
    selectedTemperatures,
    setSelectedTemperatures,
    activeSysPromptIndex,
    setActiveSysPromptIndex,
    activeHighlights,
    handleActiveHighlightsChange,
    analysisStats,
    permutationSensitivityMap,
    promptTextsForMacroTable,
}) => {
    
    const {
        overallIdealExtremes,
        overallAvgCoverageStats,
        overallCoverageExtremes,
        overallHybridExtremes,
        overallRunHybridStats,
        calculatedPerModelHybridScores,
        calculatedPerModelSemanticScores,
        perSystemVariantHybridScores,
        perTemperatureVariantHybridScores
    } = analysisStats;
    
    const { promptIds, evalMethodsUsed, allFinalAssistantResponses } = data;

    return (
        <>
            <SystemPromptsDisplay
                systemPrompts={data.config.systems || []}
                scores={perSystemVariantHybridScores}
            />

            {excludedModelsList.length > 0 && !forceIncludeExcludedModels && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Models Automatically Excluded</AlertTitle>
                    <AlertDescription>
                        <div className="flex justify-between items-start gap-4">
                            <div>
                                The following models were excluded from this overall analysis because they returned at least one empty response. This is done to prevent skewed aggregate scores. You can still see their results by selecting an individual prompt.
                                <ul className="list-disc pl-6 mt-2 space-y-1">
                                    {excludedModelsList.map(modelId => (
                                        <li key={modelId}>
                                            <code className="font-mono text-sm bg-muted text-foreground px-1.5 py-1 rounded">
                                                {getModelDisplayLabel(parseEffectiveModelId(modelId))}
                                            </code>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="ml-4 flex-shrink-0"
                                onClick={() => setForceIncludeExcludedModels(true)}
                            >
                                Show Anyway
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {forceIncludeExcludedModels && excludedModelsList.length > 0 && (
                <Alert variant="default" className="border-amber-500/50 dark:border-amber-400/30 bg-amber-50/50 dark:bg-amber-900/10">
                    <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                    <AlertTitle className="text-amber-700 dark:text-amber-300">Displaying Models with Incomplete Data</AlertTitle>
                    <AlertDescription className="text-amber-900 dark:text-amber-400/90">
                        You are viewing models that had empty responses for some prompts.
                        Aggregate scores for these models ({excludedModelsList.map(modelId => `"${getModelDisplayLabel(parseEffectiveModelId(modelId))}"`).join(', ')})
                        are calculated only from the prompts they responded to and may not be directly comparable to other models.
                        <Button variant="link" className="p-0 h-auto ml-2 text-primary text-primary font-semibold" onClick={() => setForceIncludeExcludedModels(false)}>
                            (Re-hide incomplete models)
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            <DatasetStatistics
                promptStats={data.evaluationResults?.promptStatistics}
                overallSimilarityMatrix={data.evaluationResults?.similarityMatrix ?? undefined}
                overallIdealExtremes={overallIdealExtremes || undefined}
                overallCoverageExtremes={overallCoverageExtremes || undefined}
                overallAvgCoverageStats={overallAvgCoverageStats || undefined}
                modelsStrings={displayedModels}
                overallHybridExtremes={overallHybridExtremes || undefined}
                promptTexts={promptTextsForMacroTable}
                allPromptIds={promptIds}
                overallAverageHybridScore={overallRunHybridStats?.average}
                overallHybridScoreStdDev={overallRunHybridStats?.stddev}
                allLlmCoverageScores={data.evaluationResults?.llmCoverageScores}
            />
            
            {!evalMethodsUsed.includes('llm-coverage') && (
                <div className="my-6">
                    <Alert variant="default" className="border-sky-500/50 dark:border-sky-400/30 bg-sky-50/50 dark:bg-sky-900/10">
                        <HelpCircle className="h-4 w-4 text-sky-600 text-primary" />
                        <AlertTitle className="text-sky-800 dark:text-sky-300">Coverage Analysis Not Available</AlertTitle>
                        <AlertDescription className="text-sky-900 text-primary/90">
                            The 'llm-coverage' evaluation method was not included in this run. Therefore, the Macro Coverage Overview and other rubric-based analyses are not available. To enable this analysis, include 'llm-coverage' in the `--eval-method` flag when executing the run.
                        </AlertDescription>
                    </Alert>
                </div>
            )}
            
            {evalMethodsUsed.includes('llm-coverage') && data.evaluationResults?.llmCoverageScores && (
                <>
                    {calculatedPerModelHybridScores.size > 0 && displayedModels.length > 0 && (
                        <PerModelHybridScoresCard
                            perModelHybridScores={calculatedPerModelHybridScores}
                            perModelSemanticSimilarityScores={calculatedPerModelSemanticScores}
                            modelIds={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                        />
                    )}

                    <Card className="shadow-lg border-border dark:border-border">
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-primary text-primary">Macro Coverage Overview</CardTitle>
                                <Button variant="ghost" size="sm" title="Help: Macro Coverage Table" asChild>
                                    <Link href="#macro-coverage-help" scroll={false}><HelpCircle className="w-4 h-4 text-muted-foreground" /></Link>
                                </Button>
                            </div>
                            <CardDescription className="text-muted-foreground dark:text-muted-foreground pt-1 text-sm">
                                {data.config.systems && data.config.systems.length > 1
                                    ? "Average key point coverage, broken down by system prompt variant. Select a tab to view its results."
                                    : "Average key point coverage extent for each model across all prompts."
                                }
                            </CardDescription>
                            <CoverageTableLegend activeHighlights={activeHighlights} className="pt-4 mt-4 border-t border-border/50 dark:border-border/50" />
                        </CardHeader>
                        <CardContent className="pt-0">
                            {data.config.systems && data.config.systems.length > 1 ? (
                                <Tabs defaultValue={"0"} onValueChange={(value) => setActiveSysPromptIndex(parseInt(value, 10))} className="w-full pt-2">
                                    <div className="border-b border-border">
                                        <TabsList className="h-auto -mb-px justify-start bg-transparent p-0 w-full overflow-x-auto custom-scrollbar">
                                            {data.config.systems.map((systemPrompt, index) => {
                                                const truncatedPrompt = systemPrompt
                                                    ? `: "${systemPrompt.substring(0, 30)}${systemPrompt.length > 30 ? '...' : ''}"`
                                                    : ': [No Prompt]';

                                                const score = (perSystemVariantHybridScores as Record<number, number | null>)[index];
                                                const tabLabel = `Sys. Variant ${index}`;

                                                return (
                                                    <TabsTrigger
                                                        key={index}
                                                        value={String(index)}
                                                        className="whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-5 py-3 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-in-out hover:text-foreground/80 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                                                        title={systemPrompt === null ? '[No SystemPrompt]' : systemPrompt}
                                                    >
                                                        <div className="flex items-center gap-2.5">
                                                            {score !== null && score !== undefined && (
                                                                <span className={`px-1.5 py-0.5 rounded-sm text-xs font-semibold ${getHybridScoreColorClass(score)}`}>
                                                                    {(score * 100).toFixed(0)}%
                                                                </span>
                                                            )}
                                                            <div className="flex flex-col items-start text-left">
                                                                <span className="font-semibold leading-tight">{tabLabel}</span>
                                                                <span className="text-xs font-normal leading-tight">{truncatedPrompt}</span>
                                                            </div>
                                                        </div>
                                                    </TabsTrigger>
                                                );
                                            })}
                                        </TabsList>
                                    </div>
                                    <div className="pt-6">
                                        {data.config.temperatures && data.config.temperatures.length > 1 && (
                                            <div className="py-4 border-t border-b mb-4">
                                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                                    <div>
                                                        <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Filter Temperatures</label>
                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                            {data.config.temperatures.map(temp => (
                                                                <Button
                                                                    key={temp}
                                                                    size="sm"
                                                                    variant={selectedTemperatures.includes(temp) ? "default" : "outline"}
                                                                    className="flex items-center gap-2"
                                                                    onClick={() => {
                                                                        setSelectedTemperatures(prev =>
                                                                            prev.includes(temp) ? prev.filter(t => t !== temp) : [...prev, temp]
                                                                        );
                                                                    }}
                                                                >
                                                                    {(() => {
                                                                        const score = (perTemperatureVariantHybridScores as Record<string, number | null>)[temp.toFixed(1)];
                                                                        if (score !== null && score !== undefined) {
                                                                            return (
                                                                                <>
                                                                                    <span className={`px-1.5 py-0.5 rounded-sm text-xs font-semibold ${getHybridScoreColorClass(score)}`}>
                                                                                        {score.toFixed(2)}
                                                                                    </span>
                                                                                    <span>{temp.toFixed(1)}</span>
                                                                                </>
                                                                            );
                                                                        }
                                                                        return temp.toFixed(1);
                                                                    })()}
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {(selectedTemperatures.length > 0 && data.config?.temperatures && selectedTemperatures.length < data.config.temperatures.length) && (
                                                        <Button variant="link" size="sm" className="p-0 h-auto text-xs self-end" onClick={() => setSelectedTemperatures(data.config?.temperatures || [])}>
                                                            Reset
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        <MacroCoverageTable
                                            allCoverageScores={data.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>}
                                            promptIds={promptIds}
                                            promptTexts={promptTextsForMacroTable}
                                            models={modelsForMacroTable.filter(m => m !== IDEAL_MODEL_ID)}
                                            allFinalAssistantResponses={allFinalAssistantResponses}
                                            configId={configId}
                                            runLabel={runLabel}
                                            safeTimestampFromParams={timestamp}
                                            onCellClick={(promptId, modelId) => openModelEvaluationDetailModal({ promptId, modelId })}
                                            onActiveHighlightsChange={handleActiveHighlightsChange}
                                            systemPromptIndex={activeSysPromptIndex}
                                            permutationSensitivityMap={permutationSensitivityMap}
                                        />
                                    </div>
                                </Tabs>
                            ) : (
                                <MacroCoverageTable
                                    allCoverageScores={data.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>}
                                    promptIds={promptIds}
                                    promptTexts={promptTextsForMacroTable}
                                    models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                                    allFinalAssistantResponses={allFinalAssistantResponses}
                                    configId={configId}
                                    runLabel={runLabel}
                                    safeTimestampFromParams={timestamp}
                                    onCellClick={(promptId, modelId) => openModelEvaluationDetailModal({ promptId, modelId })}
                                    onActiveHighlightsChange={handleActiveHighlightsChange}
                                    permutationSensitivityMap={permutationSensitivityMap}
                                />
                            )}
                        </CardContent>
                    </Card>

                    {data?.evaluationResults?.similarityMatrix && modelsForAggregateView && modelsForAggregateView.length > 1 && (
                        <>

                            <Card className="shadow-lg border-border dark:border-border">
                                <CardHeader>
                                    <CardTitle className="text-primary text-primary">Model Similarity Dendrogram</CardTitle>
                                    <CardDescription>
                                        Hierarchical clustering of models based on response similarity. Models grouped closer are more similar.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[600px] w-full">
                                        <DendrogramChart
                                            similarityMatrix={data.evaluationResults.similarityMatrix}
                                            models={modelsForAggregateView}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </>
            )}
        </>
    );
};
 