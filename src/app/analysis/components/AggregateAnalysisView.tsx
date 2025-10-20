'use client';

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import MacroCoverageTable from './MacroCoverageTable';
import MacroSemanticTable from './MacroSemanticTable';
import DatasetStatistics from './DatasetStatistics';
import DendrogramChart from './DendrogramChart';
import SystemPromptsDisplay from './SystemPromptsDisplay';
import PromptContextDisplay from './PromptContextDisplay';
import {
    Tabs,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { getHybridScoreColorClass } from '@/app/analysis/utils/colorUtils';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import KeyPointCoverageTable from '@/app/analysis/components/KeyPointCoverageTable';
import Icon from '@/components/ui/icon';
import { usePreloadIcons } from '@/components/ui/use-preload-icons';
import { RenderAsType } from '@/app/components/ResponseRenderer';

const CitationInline: React.FC<{ citation: any }> = ({ citation }) => {
    if (!citation) return null;
    if (typeof citation === 'string') return <span>Source: {citation}</span>;
    if (typeof citation === 'object') {
        const title = citation.title || citation.name || '';
        const url = citation.url as string | undefined;
        const content = <span>Source: {title}</span>;
        return url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{content}</a>
        ) : content;
    }
    return null;
};

const RenderPromptDetails: React.FC<{ promptId: string }> = ({ promptId }) => {
    const { data } = useAnalysis();
    if (!data) return null;

    const context = data.promptContexts?.[promptId];
    const promptConfig = data.config.prompts.find(p => p.id === promptId);

    const renderContent = () => {
        if (!context) {
            return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{promptId}</div>;
        }
        if (typeof context === 'string') {
            return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{context}</div>;
        }

        if (Array.isArray(context)) {
            if (context.length === 1 && context[0].role === 'user') {
                return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{context[0].content}</div>;
            }
            if (context.length > 0) {
                return (
                    <>
                        <p className="text-xs font-semibold text-muted-foreground mt-4">Conversation:</p>
                        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar p-1 rounded bg-muted/30 dark:bg-muted/20">
                            <PromptContextDisplay promptContext={context} />
                        </div>
                    </>
                );
            }
        }
        return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{promptId}</div>;
    }

    return (
        <div className="space-y-4">
            {promptConfig?.description && (
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1">
                    <p>{promptConfig.description}</p>
                </div>
            )}
            
            {promptConfig?.citation && (
                <div className="flex items-start space-x-1.5 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-3 py-2">
                    <CitationInline citation={promptConfig.citation as any} />
                </div>
            )}
            
            {renderContent()}
        </div>
    )
};

export const AggregateAnalysisView: React.FC = () => {
    const {
        data,
        configId,
        runLabel,
        timestamp,
        excludedModelsList,
        openModelEvaluationDetailModal,
        displayedModels,
        modelsForMacroTable,
        modelsForAggregateView,
        forceIncludeExcludedModels,
        activeSysPromptIndex,
        setActiveSysPromptIndex,
        handleActiveHighlightsChange,
        analysisStats,
        permutationSensitivityMap,
        promptTextsForMacroTable,
        isSandbox,
    } = useAnalysis();
    
    const [showMacroTable, setShowMacroTable] = useState(false);

    // Preload icons used in this component
    usePreloadIcons(['alert-triangle', 'help-circle']);

    if (!data || !analysisStats) return null;

    const {
        perSystemVariantHybridScores
    } = analysisStats;
    
    const hasValidSimilarityData = useMemo(() => {
        const matrix = data?.evaluationResults?.similarityMatrix;
        if (!matrix) return false;

        const models = Object.keys(matrix);
        for (let i = 0; i < models.length; i++) {
            for (let j = i + 1; j < models.length; j++) {
                const modelA = models[i];
                const modelB = models[j];
                const score = matrix[modelA]?.[modelB] ?? matrix[modelB]?.[modelA];
                if (typeof score === 'number' && !isNaN(score)) {
                    return true; // Found at least one valid score
                }
            }
        }
        return false; // No valid scores found
    }, [data?.evaluationResults?.similarityMatrix]);
    
    const { promptIds, evalMethodsUsed, allFinalAssistantResponses } = data;

    // Check if there's meaningful coverage data (i.e., actual key points to evaluate)
    const hasMeaningfulCoverageData = useMemo(() => {
        if (!data.evaluationResults?.llmCoverageScores) return false;

        const scores = data.evaluationResults.llmCoverageScores;

        // Check if ANY prompt has ANY model with a valid coverage result with key points
        for (const promptId of Object.keys(scores)) {
            const promptScores = scores[promptId];
            if (!promptScores) continue;

            for (const modelId of Object.keys(promptScores)) {
                const result = promptScores[modelId];
                if (result && !('error' in result) &&
                    typeof result.keyPointsCount === 'number' &&
                    result.keyPointsCount > 0) {
                    return true; // Found at least one model with actual key points
                }
            }
        }

        return false; // No meaningful coverage data found
    }, [data.evaluationResults?.llmCoverageScores]);

    if (!promptIds || promptIds.length === 0) {
        return (
            <div className="text-center py-4 text-muted-foreground text-sm">
                No prompts available for this analysis.
            </div>
        );
    }
    
    if (isSandbox) {
        return (
            <div className="space-y-8">
                <SystemPromptsDisplay />

                {hasMeaningfulCoverageData && (
                    <>
                        <div className="flex items-center space-x-2 justify-end">
                          <Label htmlFor="macro-table-toggle">Show Macro Coverage Table</Label>
                          <Switch
                            id="macro-table-toggle"
                            checked={showMacroTable}
                            onCheckedChange={setShowMacroTable}
                          />
                        </div>

                        {showMacroTable ? (
                            <Card className="shadow-lg border-border dark:border-border">
                                <CardHeader>
                                    <CardTitle className="text-primary">Macro Coverage Overview</CardTitle>
                                    <CardDescription>
                                        Average key point coverage extent for each model across all prompts.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <MacroCoverageTable />
                                </CardContent>
                            </Card>
                        ) : (
                            promptIds.map(promptId => (
                                <Card key={promptId} className="shadow-lg border-border dark:border-border">
                                    <CardHeader>
                                        <div className="w-full">
                                            <CardTitle className="text-primary text-base font-semibold mb-2">
                                                <span className="text-muted-foreground">Prompt: </span>
                                                <code className="text-foreground">{promptId}</code>
                                            </CardTitle>
                                            <RenderPromptDetails
                                                promptId={promptId}
                                            />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                         {data.evaluationResults?.llmCoverageScores?.[promptId] ? (
                                            <KeyPointCoverageTable
                                                data={data}
                                                promptId={promptId}
                                                displayedModels={displayedModels}
                                                renderAs={data.config.prompts?.find(p => p.id === promptId)?.render_as as RenderAsType}
                                            />
                                        ) : (
                                            <div className="text-center py-4 text-muted-foreground text-sm">
                                                No coverage data available for this prompt.
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </>
                )}

                {!hasMeaningfulCoverageData && (
                    <Alert variant="default" className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10">
                        <Icon name="info" className="h-4 w-4 text-blue-600" />
                        <AlertTitle>No Coverage Data Available</AlertTitle>
                        <AlertDescription>
                            This sandbox run has no rubric criteria (should/should_not) defined.
                            Coverage analysis is not available.
                        </AlertDescription>
                    </Alert>
                )}
            </div>
        );
    }

    return (
        <>
            <SystemPromptsDisplay />

            {excludedModelsList.length > 0 && !forceIncludeExcludedModels && (
                <Alert variant="destructive">
                    <Icon name="alert-triangle" className="h-4 w-4" />
                    <AlertTitle>Models Automatically Excluded</AlertTitle>
                    <AlertDescription>
                        <div className="flex justify-between items-start gap-4">
                            <div>
                                The following models returned at least one empty response. Their results are still available below.
                                <ul className="list-disc pl-6 mt-2 space-y-1">
                                    {excludedModelsList.map(modelId => (
                                        <li key={modelId}>
                                            <code className="font-mono text-sm bg-muted text-foreground px-1.5 py-1 rounded">
                                                {getModelDisplayLabel(parseModelIdForDisplay(modelId))}
                                            </code>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </AlertDescription>
                </Alert>
            )}


            {/* <DatasetStatistics /> */}

            {!hasMeaningfulCoverageData && hasValidSimilarityData && (
                <>
                    <div className="my-6">
                        <Alert variant="default" className="border-green-500/50 dark:border-green-400/30 bg-green-50/50 dark:bg-green-900/10">
                            <Icon name="git-compare" className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-800 dark:text-green-300">Embeddings-Based Analysis</AlertTitle>
                            <AlertDescription className="text-green-900 dark:text-green-200">
                                This run used embeddings to measure semantic similarity between model responses.
                                The table and dendrogram below show how models clustered based on their response content.
                                {evalMethodsUsed.includes('llm-coverage') && (
                                    <span className="block mt-2 italic">
                                        Note: No rubric criteria (should/should_not) were defined in this blueprint, so coverage scoring was not performed.
                                    </span>
                                )}
                                {!evalMethodsUsed.includes('llm-coverage') && (
                                    <span className="block mt-2">
                                        To also see rubric-based coverage analysis, add <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">should</code> or <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">should_not</code> criteria to your blueprint prompts.
                                    </span>
                                )}
                            </AlertDescription>
                        </Alert>
                    </div>

                    <Card className="shadow-lg border-border dark:border-border">
                        <CardHeader>
                            <CardTitle className="text-primary flex items-center gap-2">
                                <Icon name="git-compare" className="w-5 h-5 text-green-600" />
                                Semantic Clustering Overview
                            </CardTitle>
                            <CardDescription>
                                Models are grouped by response similarity for each prompt. Same colors indicate similar responses.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <MacroSemanticTable />
                        </CardContent>
                    </Card>
                </>
            )}

            {!hasMeaningfulCoverageData && !hasValidSimilarityData && (
                <div className="my-6">
                    <Alert variant="default" className="border-sky-500/50 dark:border-sky-400/30 bg-sky-50/50 dark:bg-sky-900/10">
                        <Icon name="help-circle" className="h-4 w-4 text-sky-600 text-primary" />
                        <AlertTitle className="text-sky-800 dark:text-sky-300">No Evaluation Data Available</AlertTitle>
                        <AlertDescription className="text-sky-900 text-primary/90">
                            {evalMethodsUsed.length === 0 ? (
                                <>
                                    This run did not include any evaluation methods. To enable analysis, run with <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">--eval-method embedding</code> for similarity analysis
                                    or <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">--eval-method llm-coverage</code> for rubric-based evaluation.
                                </>
                            ) : (
                                <>
                                    No meaningful evaluation data was generated. To enable rubric-based analysis, add <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">should</code> or <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">should_not</code> criteria to your blueprint prompts.
                                </>
                            )}
                        </AlertDescription>
                    </Alert>
                </div>
            )}

            {hasMeaningfulCoverageData && (
                <>
                    <Card className="shadow-lg border-border dark:border-border">
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-primary text-primary">Macro Coverage Overview</CardTitle>
                            </div>
                            <CardDescription className="text-muted-foreground dark:text-muted-foreground pt-1 text-sm">
                                {data.config.systems && data.config.systems.length > 1
                                    ? "Average key point coverage, broken down by system prompt variant. Select a tab to view its results."
                                    : "Average key point coverage extent for each model across all prompts."
                                }
                            </CardDescription>
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
                                        <MacroCoverageTable />
                                    </div>
                                </Tabs>
                            ) : (
                                <MacroCoverageTable />
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            {/* Show dendrogram for any run with valid similarity data (embeddings or both) */}
            {hasValidSimilarityData && modelsForAggregateView && modelsForAggregateView.length > 1 && (
                <Card className="hidden md:block shadow-lg border-border dark:border-border">
                    <CardHeader>
                        <CardTitle className="text-primary text-primary">
                            Model Similarity Dendrogram
                            {!hasMeaningfulCoverageData && (
                                <Icon name="git-compare" className="inline-block w-5 h-5 ml-2 text-green-600" title="Based on embeddings" />
                            )}
                        </CardTitle>
                        <CardDescription>
                            Hierarchical clustering of models based on response similarity. Models grouped closer are more similar.
                            {!hasMeaningfulCoverageData && (
                                <span className="block mt-1 text-green-700 dark:text-green-400">
                                    This visualization is based on semantic embeddings of model responses.
                                </span>
                            )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[600px] w-full">
                            <DendrogramChart />
                        </div>
                    </CardContent>
                </Card>
            )}
        </>
    );
}; 