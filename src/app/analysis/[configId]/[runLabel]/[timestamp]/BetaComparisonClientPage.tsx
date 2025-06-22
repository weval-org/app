'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import SimilarityHeatmap from '@/app/analysis/components/SimilarityHeatmap'
import SimilarityGraph from '@/app/analysis/components/SimilarityGraph'
import DendrogramChart from '@/app/analysis/components/DendrogramChart'
import { ResponseComparisonModal } from '@/app/analysis/components/ResponseComparisonModal'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import KeyPointCoverageTable from '@/app/analysis/components/KeyPointCoverageTable'
import MacroCoverageTable from '@/app/analysis/components/MacroCoverageTable'
import DatasetStatistics from '@/app/analysis/components/DatasetStatistics'
import KeyPointCoverageComparisonDisplay from '@/app/analysis/components/KeyPointCoverageComparisonDisplay'
import SemanticExtremesDisplay from '@/app/analysis/components/SemanticExtremesDisplay'
import CoverageTableLegend, { ActiveHighlight } from '@/app/analysis/components/CoverageTableLegend'
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
    CoverageResult as ImportedCoverageResult,
} from '@/app/utils/types';
import {
    IDEAL_MODEL_ID,
    calculateStandardDeviation,
} from '@/app/utils/calculationUtils';

import { useTheme } from 'next-themes';
import DownloadResultsButton from '@/app/analysis/components/DownloadResultsButton';
import PerModelHybridScoresCard from '@/app/analysis/components/PerModelHybridScoresCard';
import AnalysisPageHeader from '@/app/analysis/components/AnalysisPageHeader';
import type { AnalysisPageHeaderProps } from '@/app/analysis/components/AnalysisPageHeader';
import { fromSafeTimestamp, formatTimestampForDisplay } from '@/lib/timestampUtils';
import ModelEvaluationDetailModal from '@/app/analysis/components/ModelEvaluationDetailModal';
import DebugPanel from '@/app/analysis/components/DebugPanel';
import CoverageHeatmapCanvas from '@/app/analysis/components/CoverageHeatmapCanvas';
import { Badge } from '@/components/ui/badge';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import { useComparisonData } from '@/app/analysis/hooks/useComparisonData';
import { useAnalysisStats } from '@/app/analysis/hooks/useAnalysisStats';
import { useModelFiltering } from '@/app/analysis/hooks/useModelFiltering';
import { usePageInteraction } from '@/app/analysis/hooks/usePageInteraction';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"

const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle))
const XCircle = dynamic(() => import("lucide-react").then((mod) => mod.XCircle))
const Loader2 = dynamic(() => import("lucide-react").then((mod) => mod.Loader2))
const HelpCircle = dynamic(() => import("lucide-react").then(mod => mod.HelpCircle))
const CheckCircle2 = dynamic(() => import("lucide-react").then((mod) => mod.CheckCircle2))
const GitCommit = dynamic(() => import("lucide-react").then((mod) => mod.GitCommit))
const AlertTriangle = dynamic(() => import("lucide-react").then((mod) => mod.AlertTriangle))

const getHybridScoreColorClass = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return 'bg-muted/30 text-muted-foreground dark:text-muted-foreground';
    if (score >= 0.75) return 'bg-highlight-success/80 text-white dark:text-foreground';
    if (score >= 0.50) return 'bg-highlight-warning/80 text-white dark:text-foreground';
    if (score > 0) return 'bg-highlight-error/80 text-white dark:text-foreground';
    return 'bg-muted/80 text-white dark:text-foreground';
};

export default function BetaComparisonClientPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  
  const configIdFromUrl = params.configId as string;
  const runLabel = params.runLabel as string;
  const timestampFromUrl = params.timestamp as string;

  const currentPromptId = searchParams.get('prompt');

  const { data, loading, error, promptNotFound, excludedModelsList } = useComparisonData({
    configId: configIdFromUrl,
    runLabel,
    timestamp: timestampFromUrl,
    currentPromptId,
  });

  const [forceIncludeExcludedModels, setForceIncludeExcludedModels] = useState<boolean>(false);
  const [selectedTemperatures, setSelectedTemperatures] = useState<number[]>([]);
  const [selectedSysPromptIndexes, setSelectedSysPromptIndexes] = useState<number[]>([]);
  const [activeSysPromptIndex, setActiveSysPromptIndex] = useState(0);
  const [activeHighlights, setActiveHighlights] = useState<Set<ActiveHighlight>>(new Set());
  const [ReactMarkdown, setReactMarkdown] = useState<any>(null);
  const [RemarkGfm, setRemarkGfm] = useState<any>(null);
  const { resolvedTheme } = useTheme();

  const { displayedModels, modelsForMacroTable, modelsForAggregateView } = useModelFiltering({
    data,
    currentPromptId,
    forceIncludeExcludedModels,
    excludedModelsList,
    activeSysPromptIndex,
    selectedTemperatures,
  });
  
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
  } = useAnalysisStats(data);

  const {
    responseComparisonModal,
    closeResponseComparisonModal,
    modelEvaluationModal,
    openModelEvaluationDetailModal,
    closeModelEvaluationDetailModal,
    handleSimilarityCellClick,
    handleCoverageCellClick,
    handleSemanticExtremesClick,
  } = usePageInteraction(data);

  const handleActiveHighlightsChange = useCallback((newHighlights: Set<ActiveHighlight>) => {
    setActiveHighlights(prevHighlights => {
        if (prevHighlights.size === newHighlights.size && [...prevHighlights].every(h => newHighlights.has(h))) {
            return prevHighlights;
        }
        return newHighlights;
    });
  }, []);

  const permutationSensitivityMap = useMemo(() => {
    const sensitivityMap = new Map<string, 'temp' | 'sys' | 'both'>();
    if (!data || !data.effectiveModels || !data.evaluationResults?.llmCoverageScores) return sensitivityMap;

    const { effectiveModels, promptIds, evaluationResults, config } = data;
    const llmCoverageScores = evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>;

    const baseModelGroups = new Map<string, string[]>();
    effectiveModels.forEach(modelId => {
        const parsed = parseEffectiveModelId(modelId);
        if (!baseModelGroups.has(parsed.baseId)) {
            baseModelGroups.set(parsed.baseId, []);
        }
        baseModelGroups.get(parsed.baseId)!.push(modelId);
    });

    const PERM_SENSITIVITY_THRESHOLD = 0.2;

    for (const [baseId, modelIdsInGroup] of baseModelGroups.entries()) {
        if (modelIdsInGroup.length < 2) continue;

        const parsedModels = modelIdsInGroup.map(id => parseEffectiveModelId(id));
        const hasTempVariants = new Set(parsedModels.map(p => p.temperature)).size > 1;
        const hasSysVariants = new Set(parsedModels.map(p => p.systemPromptIndex)).size > 1;

        if (!hasTempVariants && !hasSysVariants) continue;

        promptIds.forEach(promptId => {
            let sensitiveToTemp = false;
            let sensitiveToSys = false;

            if (hasTempVariants) {
                const scoresBySysPrompt = new Map<number, number[]>();
                modelIdsInGroup.forEach(modelId => {
                    const parsed = parseEffectiveModelId(modelId);
                    const result = llmCoverageScores[promptId]?.[modelId];
                    if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                         if (parsed.systemPromptIndex !== undefined) {
                            if (!scoresBySysPrompt.has(parsed.systemPromptIndex)) {
                                scoresBySysPrompt.set(parsed.systemPromptIndex, []);
                            }
                            scoresBySysPrompt.get(parsed.systemPromptIndex)!.push(result.avgCoverageExtent);
                         }
                    }
                });

                for (const scores of scoresBySysPrompt.values()) {
                    if (scores.length > 1) {
                        const stdDev = calculateStandardDeviation(scores);
                        if (stdDev !== null && stdDev > PERM_SENSITIVITY_THRESHOLD) {
                            sensitiveToTemp = true;
                            break;
                        }
                    }
                }
            }

            if (hasSysVariants) {
                const scoresByTemp = new Map<number, number[]>();
                 modelIdsInGroup.forEach(modelId => {
                    const parsed = parseEffectiveModelId(modelId);
                    const result = llmCoverageScores[promptId]?.[modelId];
                    if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                         const temp = parsed.temperature ?? config.temperature ?? 0.0;
                        if (!scoresByTemp.has(temp)) {
                            scoresByTemp.set(temp, []);
                        }
                        scoresByTemp.get(temp)!.push(result.avgCoverageExtent);
                    }
                });

                 for (const scores of scoresByTemp.values()) {
                    if (scores.length > 1) {
                        const stdDev = calculateStandardDeviation(scores);
                        if (stdDev !== null && stdDev > PERM_SENSITIVITY_THRESHOLD) {
                            sensitiveToSys = true;
                            break;
                        }
                    }
                }
            }

            const key = `${promptId}:${baseId}`;
            if (sensitiveToTemp && sensitiveToSys) {
                sensitivityMap.set(key, 'both');
            } else if (sensitiveToTemp) {
                sensitivityMap.set(key, 'temp');
            } else if (sensitiveToSys) {
                sensitivityMap.set(key, 'sys');
            }
        });
    }
    return sensitivityMap;
  }, [data]);

  const headerWidgetContent = useMemo(() => {
    if (currentPromptId || !data?.evaluationResults?.llmCoverageScores || !data.promptIds || displayedModels.filter(m => m !== IDEAL_MODEL_ID).length === 0) {
      return null;
    }
    return (
      <CoverageHeatmapCanvas
        allCoverageScores={data.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>} 
        promptIds={data.promptIds}
        models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
        width={100}
        height={50}
        className="rounded-md border border-border dark:border-border shadow-sm"
      />
    );
  }, [currentPromptId, data, displayedModels]);

  useEffect(() => {
    import('react-markdown').then(mod => setReactMarkdown(() => mod.default));
    import('remark-gfm').then(mod => setRemarkGfm(() => mod.default));
  }, []);

  const getPromptContextDisplayString = useMemo(() => (promptId: string): string => {
    if (!data || !data.promptContexts) return promptId;
    const context = data.promptContexts[promptId];
    if (typeof context === 'string') {
      return context;
    }
    if (Array.isArray(context) && context.length > 0) {
      const lastUserMessage = [...context].reverse().find(msg => msg.role === 'user');
      if (lastUserMessage) {
        return `User: ${lastUserMessage.content.substring(0, 100)}${lastUserMessage.content.length > 100 ? '...' : ''}`;
      }
      return `Multi-turn context (${context.length} messages)`;
    }
    return promptId;
  }, [data]);

  const currentPromptDisplayText = useMemo(() => currentPromptId ? getPromptContextDisplayString(currentPromptId) : 'All Prompts', [currentPromptId, getPromptContextDisplayString]);
  
  const pageTitle = useMemo(() => {
    let title = "Analysis";
    if (data) {
      title = `${data.configTitle || configIdFromUrl} - ${data.runLabel || runLabel}`;
      if (timestampFromUrl) {
        title += ` (${formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl))})`;
      }
    } else if (configIdFromUrl && runLabel && timestampFromUrl) {
      title = `${configIdFromUrl} - ${runLabel}`;
      title += ` (${formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl))})`;
    }
    if (currentPromptId) {
      title += ` - Prompt: ${currentPromptDisplayText}`;
    }
    return title;
  }, [data, configIdFromUrl, runLabel, timestampFromUrl, currentPromptId, currentPromptDisplayText]);

  const breadcrumbItems = useMemo(() => {
    const items: AnalysisPageHeaderProps['breadcrumbs'] = [
      { label: 'Home', href: '/' },
      {
        label: data?.configTitle || configIdFromUrl,
        href: `/analysis/${configIdFromUrl}`
      },
      {
        label: data?.runLabel || runLabel,
        href: `/analysis/${configIdFromUrl}/${runLabel}`
      },
      {
        label: timestampFromUrl ? formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl)) : "Instance",
        ...(currentPromptId ? { href: `/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}` } : {})
      }
    ];
    if (currentPromptId) {
      items.push({ label: `Prompt: ${currentPromptDisplayText}` });
    }
    return items;
  }, [data, configIdFromUrl, runLabel, timestampFromUrl, currentPromptId, currentPromptDisplayText]);

  const safeMatrixForCurrentView = useMemo(() => {
    if (!data?.evaluationResults?.similarityMatrix) return null;
    if (!currentPromptId) return data.evaluationResults.similarityMatrix;
    return data.evaluationResults?.perPromptSimilarities?.[currentPromptId] || null;
  }, [currentPromptId, data]);

  const renderPromptDetails = () => {
    if (!currentPromptId || !data || !data.promptContexts) {
      return null;
    }
    const context = data.promptContexts[currentPromptId];
    const promptConfig = data.config.prompts.find(p => p.id === currentPromptId);

    const systemMessages = Array.isArray(context) ? context.filter(msg => msg.role === 'system') : [];
    const conversationMessages = Array.isArray(context) ? context.filter(msg => msg.role !== 'system') : context;

    const renderContent = () => {
        const messagesToRender = conversationMessages;

        if (typeof messagesToRender === 'string') {
          return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{messagesToRender}</div>;
        }

        if (Array.isArray(messagesToRender)) {
          if (messagesToRender.length === 1 && messagesToRender[0].role === 'user') {
            return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{messagesToRender[0].content}</div>;
          }
          if (messagesToRender.length > 0) {
            return (
              <>
                <p className="text-xs font-semibold text-muted-foreground mt-4">Conversation:</p>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar p-1 rounded bg-muted/30 dark:bg-muted/20">
                    {messagesToRender.map((msg, index) => (
                    <div key={index} className={`p-2 rounded-md ${msg.role === 'user' ? 'bg-sky-100 dark:bg-sky-900/50' : 'bg-muted dark:bg-muted/50'}`}>
                        <p className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground capitalize">{msg.role}</p>
                        <p className="text-sm text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    ))}
                </div>
              </>
            );
          }
        }
        return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{currentPromptDisplayText}</div>;
    }

    return (
        <div className="space-y-4">
            {promptConfig?.description && ReactMarkdown && RemarkGfm && (
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1">
                    <ReactMarkdown remarkPlugins={[RemarkGfm]}>{promptConfig.description}</ReactMarkdown>
                </div>
            )}
            
            {systemMessages.length > 0 && (
                <div className="space-y-2 mt-4">
                    {systemMessages.map((sysMsg, index) => (
                        <div key={`sys-${index}`} className="p-3 rounded-md bg-green-50 dark:bg-green-900/40 ring-1 ring-green-200 dark:ring-green-800">
                            <h4 className="text-sm font-semibold text-green-800 dark:text-green-300">System Prompt</h4>
                            <p className="text-sm text-green-900 dark:text-green-200 whitespace-pre-wrap mt-1">{sysMsg.content}</p>
                        </div>
                    ))}
                </div>
            )}

            {renderContent()}
        </div>
    )
  };

  const renderPromptSelector = () => {
    if (!data || !data.promptIds) return null;

    const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedPromptId = event.target.value;
      if (selectedPromptId === '__ALL__') {
        router.push(`/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}`);
      } else {
        router.push(`/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}?prompt=${selectedPromptId}`);
      }
    };

    return (
      <div className="mb-6">
        <label htmlFor="prompt-selector" className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground mb-1">Select Prompt:</label>
        <select
          id="prompt-selector"
          value={currentPromptId || '__ALL__'}
          onChange={handleSelectChange}
          className="block w-full p-2 border border-border dark:border-border rounded-md shadow-sm focus:ring-primary focus:border-primary bg-card dark:bg-card text-card-foreground dark:text-card-foreground text-sm"
        >
          <option value="__ALL__" className="bg-background text-foreground dark:bg-background dark:text-foreground">All Prompts (Overall Analysis)</option>
          {data.promptIds.map(promptId => (
            <option key={promptId} value={promptId} title={getPromptContextDisplayString(promptId)} className="bg-background text-foreground dark:bg-background dark:text-foreground">
              {promptId} - {getPromptContextDisplayString(promptId)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const promptTextsForMacroTable = useMemo(() => {
    if (!data?.promptContexts) return {};
    return Object.fromEntries(
      Object.entries(data.promptContexts).map(([promptId, context]) => [
        promptId,
        typeof context === 'string' ? context : getPromptContextDisplayString(promptId)
      ])
    );
  }, [data?.promptContexts, getPromptContextDisplayString]);

  const currentPromptSystemPrompt = useMemo(() => {
    if (!currentPromptId || !data?.config?.prompts) {
      return null;
    }
    const promptConfig = data.config.prompts.find(p => p.id === currentPromptId);
    return promptConfig?.system ?? null;
  }, [currentPromptId, data?.config?.prompts]);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading analysis data...</p>
      </div>
    )
  }

  if (error) {
    return (
        <Alert variant="destructive" className="max-w-2xl mx-auto my-10">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Data</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
        </Alert>
    );
  }
  
  if (promptNotFound) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Prompt Not Found</AlertTitle>
        <AlertDescription>
          The prompt ID <code className="font-mono bg-muted px-1 py-0.5 rounded">{currentPromptId}</code> was not found in this evaluation run.
          <Link href={`/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}`}>
            <Button variant="link" className="p-0 h-auto ml-1">Clear prompt selection</Button>
          </Link>
        </AlertDescription>
      </Alert>
    )
  }
  if (!data) return null; 

  const { 
      effectiveModels,
      evalMethodsUsed,
      promptIds,
      evaluationResults,
  } = data;

  const promptContexts = data.promptContexts; 
  const allFinalAssistantResponses = data.allFinalAssistantResponses; 

  const headerActions = data ? (
    <div className="flex items-center gap-2">
        {data.sourceCommitSha ? (
            <Button asChild variant="outline">
                <Link href={`${BLUEPRINT_CONFIG_REPO_URL}/blob/${data.sourceCommitSha}/blueprints/${data.configId}.json`} target="_blank" rel="noopener noreferrer" title={`View blueprint at commit ${data.sourceCommitSha.substring(0, 7)}`}>
                    <GitCommit className="w-4 h-4 mr-2" />
                    View Blueprint on GitHub
                </Link>
            </Button>
        ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="outline">
                      <Link href={`${BLUEPRINT_CONFIG_REPO_URL}/blob/main/blueprints/${data.configId}.json`} target="_blank" rel="noopener noreferrer">
                          <GitCommit className="w-4 h-4 mr-2" />
                          View Latest Blueprint
                      </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
                    <p>Links to latest version, not the exact one from this run.</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
        )}
        <DownloadResultsButton data={data} label={`${data.configTitle || configIdFromUrl} - ${data.runLabel || runLabel}${timestampFromUrl ? ' (' + formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl)) + ')' : ''}`} />
        <Button asChild variant="outline">
            <Link href={`/api/comparison/${configIdFromUrl}/${runLabel}/${timestampFromUrl}/markdown`} download>
                Download Markdown
            </Link>
        </Button>
    </div>
  ) : null;

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-8">
        <AnalysisPageHeader 
            breadcrumbs={breadcrumbItems}
            pageTitle={pageTitle}
            contextualInfo={{
              configTitle: data.configTitle,
              runLabel: data.runLabel,
              timestamp: data.timestamp,
              description: data.description,
              tags: data.config?.tags
            }}
            actions={headerActions}
            headerWidget={headerWidgetContent}
        />

        {renderPromptSelector()}

        {data?.config?.systems && (
          data.config.systems.length > 1 ||
          data.config.systems[0] !== null
        ) && (
            <Card className="shadow-lg border-border dark:border-border">
                <CardHeader>
                <CardTitle className="text-primary text-primary">System Prompt Variants</CardTitle>
                <CardDescription>This run was executed against the following system prompt variations.</CardDescription>
                </CardHeader>
                <CardContent>
                <ul className="space-y-3">
                    {data.config.systems.map((systemPrompt, index) => (
                    <li key={index} className="flex items-start gap-3 p-2 rounded-md bg-muted/50 dark:bg-muted/30">
                        <Badge variant="secondary" className="mt-1">{`sp_idx:${index}`}</Badge>
                        <div className="text-sm text-card-foreground dark:text-card-foreground">
                        {systemPrompt === null ? (
                            <em className="text-muted-foreground">[No System Prompt]</em>
                        ) : (
                            <p className="whitespace-pre-wrap font-mono">{systemPrompt}</p>
                        )}
                        </div>
                    </li>
                    ))}
                </ul>
                </CardContent>
            </Card>
        )}

        {excludedModelsList.length > 0 && !currentPromptId && !forceIncludeExcludedModels && (
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

        {forceIncludeExcludedModels && !currentPromptId && excludedModelsList.length > 0 && (
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

        {currentPromptId && (
             <Card className="shadow-lg border-border dark:border-border">
                <CardHeader>
                    <CardTitle className="text-primary text-primary">Current Prompt Context</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                    {renderPromptDetails()}
                </CardContent>
            </Card>
        )}

        {/* show prompt SPECIFIC sys prompt if available */}
        {currentPromptId && currentPromptSystemPrompt && (
            <Card className="shadow-lg border-border dark:border-border">
                <CardHeader>
                    <CardTitle className="text-primary text-primary">Prompt-Specific System Prompt</CardTitle>
                    <CardDescription>
                        This prompt was executed with a specific system prompt, overriding any run-level variants.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/40 ring-1 ring-green-200 dark:ring-green-800">
                        <p className="text-sm text-green-900 dark:text-green-200 whitespace-pre-wrap">{currentPromptSystemPrompt}</p>
                    </div>
                </CardContent>
            </Card>
        )}

        {!currentPromptId && (
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
        )}

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

        {currentPromptId && allFinalAssistantResponses && data.evaluationResults?.llmCoverageScores?.[currentPromptId] && allFinalAssistantResponses?.[currentPromptId]?.[IDEAL_MODEL_ID] && (
            <KeyPointCoverageComparisonDisplay
                coverageScores={data.evaluationResults.llmCoverageScores[currentPromptId] as Record<string, ImportedCoverageResult>}
                models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)} 
                promptResponses={allFinalAssistantResponses[currentPromptId]}
                idealModelId={IDEAL_MODEL_ID}
                promptId={currentPromptId}
                onModelClick={(modelId: string) => openModelEvaluationDetailModal({ promptId: currentPromptId, modelId })}
            />
        )}

        {currentPromptId && allFinalAssistantResponses && data.evaluationResults?.perPromptSimilarities?.[currentPromptId] && promptContexts?.[currentPromptId] && (
            <SemanticExtremesDisplay
                promptSimilarities={data.evaluationResults.perPromptSimilarities[currentPromptId]}
                models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                promptResponses={allFinalAssistantResponses[currentPromptId]}
                idealModelId={IDEAL_MODEL_ID}
                promptId={currentPromptId}
                onModelClick={(modelId: string) => handleSemanticExtremesClick(modelId)}
            />
        )}

        {currentPromptId && evalMethodsUsed.includes('llm-coverage') && data.evaluationResults?.llmCoverageScores?.[currentPromptId] && (
            <Card className="shadow-lg border-border dark:border-border mt-6">
                <CardHeader>
                     <div className="flex justify-between items-center">
                        <CardTitle className="text-primary text-primary">Key Point Coverage Details</CardTitle>
                        <Button variant="ghost" size="sm" title="Help: Key Point Coverage Table" asChild>
                            <Link href="#key-point-coverage-help" scroll={false}><HelpCircle className="w-4 h-4 text-muted-foreground" /></Link>
                        </Button>
                    </div>
                     <CardDescription className="text-muted-foreground dark:text-muted-foreground pt-1 text-sm">
                        Detailed breakdown of how each model response covers the evaluation criteria for prompt: <strong className="text-card-foreground dark:text-card-foreground font-normal">{currentPromptDisplayText}</strong>.
                    </CardDescription>

                    {!currentPromptId && (data?.config.temperatures || data?.config.systems) && (
                        <div className="pt-4 mt-4 border-t border-border/50 dark:border-border/50">
                            <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                                {data.config.temperatures && data.config.temperatures.length > 1 && (
                                    <div>
                                        <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Temperatures</label>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {data.config.temperatures.map(temp => (
                                                <Button
                                                    key={temp}
                                                    size="sm"
                                                    variant={selectedTemperatures.includes(temp) ? "default" : "outline"}
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
                                )}
                                {data.config.systems && data.config.systems.length > 1 && (
                                    <div>
                                        <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">System Prompts</label>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {data.config.systems.map((_, index) => (
                                                <Button
                                                    key={index}
                                                    size="sm"
                                                    variant={selectedSysPromptIndexes.includes(index) ? "default" : "outline"}
                                                    onClick={() => {
                                                        setSelectedSysPromptIndexes(prev =>
                                                            prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
                                                        );
                                                    }}
                                                >
                                                    {`sp_idx:${index}`}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {(selectedTemperatures.length > 0 || selectedSysPromptIndexes.length > 0) && (
                                    <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => {
                                        setSelectedTemperatures([]);
                                        setSelectedSysPromptIndexes([]);
                                    }}>Reset Filters</Button>
                                )}
                            </div>
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    <KeyPointCoverageTable 
                        coverageScores={data.evaluationResults.llmCoverageScores[currentPromptId] as Record<string, ImportedCoverageResult>}
                        models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                        onCellClick={(modelId, assessment) => handleCoverageCellClick(modelId, assessment, currentPromptId)}
                        onModelHeaderClick={(modelId) => openModelEvaluationDetailModal({ promptId: currentPromptId, modelId })}
                    />
                </CardContent>
            </Card>
        )}

      {currentPromptId && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-lg border-border dark:border-border lg:col-span-2">
              <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="text-primary text-primary">Model Similarity Matrix</CardTitle>
                    <Button variant="ghost" size="sm" title="Help: Similarity Matrix">
                        <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </Button>
                </div>
                <CardDescription className="text-muted-foreground dark:text-muted-foreground pt-1 text-sm">
                    Pairwise semantic similarity for prompt: <strong className='text-card-foreground dark:text-card-foreground font-normal'>{currentPromptDisplayText}</strong>. Darker means more similar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {safeMatrixForCurrentView && displayedModels.length > 0 ? (
                    <SimilarityHeatmap 
                        similarityMatrix={safeMatrixForCurrentView} 
                        models={displayedModels}
                        onCellClick={(modelA, modelB, similarity) => handleSimilarityCellClick(modelA, modelB, similarity, currentPromptId)}
                    />
                ) : <p className="text-center text-muted-foreground dark:text-muted-foreground py-4">Not enough data or models to display heatmap for this view.</p>}
              </CardContent>
            </Card>

            <Card className="shadow-lg border-border dark:border-border lg:col-span-2">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-primary text-primary">Model Similarity Graph</CardTitle>
                         <Button variant="ghost" size="sm" title="Help: Similarity Graph">
                            <HelpCircle className="w-4 h-4 text-muted-foreground" />
                        </Button>
                    </div>
                    <CardDescription className="text-muted-foreground dark:text-muted-foreground pt-1 text-sm">
                        Force-directed graph based on semantic similarity for prompt: <strong className='text-card-foreground dark:text-card-foreground font-normal'>{currentPromptDisplayText}</strong>. Closer nodes are more similar.
                    </CardDescription>
                </CardHeader>
                <CardContent className="h-[400px]">
                     {safeMatrixForCurrentView && displayedModels.length > 1 ? (
                        <SimilarityGraph 
                            similarityMatrix={safeMatrixForCurrentView} 
                            models={displayedModels}
                            resolvedTheme={resolvedTheme}
                        />
                    ) : <p className="text-center text-muted-foreground dark:text-muted-foreground py-4">Not enough data or models to display graph for this view.</p>}
                </CardContent>
            </Card>
          </div>

          <Card className="shadow-lg border-border dark:border-border">
              <CardHeader>
                  <div className="flex justify-between items-center">
                      <CardTitle className="text-primary text-primary">Model Similarity Dendrogram</CardTitle>
                      <Button variant="ghost" size="sm" title="Help: Dendrogram">
                          <HelpCircle className="w-4 h-4 text-muted-foreground" />
                      </Button>
                  </div>
                  <CardDescription className="text-muted-foreground dark:text-muted-foreground pt-1 text-sm">
                      Models clustered by semantic similarity for prompt: <strong className='text-card-foreground dark:text-card-foreground font-normal'>{currentPromptDisplayText}</strong>. Shorter branches mean more similar.
                  </CardDescription>
              </CardHeader>
              <CardContent className="h-[450px] overflow-x-auto custom-scrollbar">
                  {safeMatrixForCurrentView && displayedModels.length > 1 ? (
                      <DendrogramChart 
                          similarityMatrix={safeMatrixForCurrentView} 
                          models={displayedModels}
                      />
                  ) : <p className="text-center text-muted-foreground dark:text-muted-foreground py-4">Not enough data or models to display dendrogram.</p>}
              </CardContent>
          </Card>
        </div>
      )}

      {evalMethodsUsed.includes('llm-coverage') && data.evaluationResults?.llmCoverageScores && (
        <>
            { !currentPromptId && calculatedPerModelHybridScores.size > 0 && displayedModels.length > 0 && (
                <PerModelHybridScoresCard
                    perModelHybridScores={calculatedPerModelHybridScores}
                    perModelSemanticSimilarityScores={calculatedPerModelSemanticScores}
                    modelIds={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                />
            )}

            {!currentPromptId && (
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
                                                                {score.toFixed(2)}
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
                                                {(selectedTemperatures.length > 0) && (
                                                    <Button variant="link" size="sm" className="p-0 h-auto text-xs self-end" onClick={() => setSelectedTemperatures([])}>
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
                                        configId={configIdFromUrl}
                                        runLabel={runLabel}
                                        safeTimestampFromParams={timestampFromUrl}
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
                                configId={configIdFromUrl}
                                runLabel={runLabel}
                                safeTimestampFromParams={timestampFromUrl}
                                onCellClick={(promptId, modelId) => openModelEvaluationDetailModal({ promptId, modelId })} 
                                onActiveHighlightsChange={handleActiveHighlightsChange}
                                permutationSensitivityMap={permutationSensitivityMap}
                            />
                        )}
                    </CardContent>
                </Card>
            )}

            {!currentPromptId && data?.evaluationResults?.similarityMatrix && modelsForAggregateView && modelsForAggregateView.length > 1 && (
              <>
                <Card className="shadow-lg border-border dark:border-border">
                  <CardHeader>
                    <CardTitle className="text-primary text-primary">Model Similarity Graph</CardTitle>
                    <CardDescription>
                      Force-directed graph showing relationships based on semantic similarity of model responses across all prompts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[600px] w-full">
                      <SimilarityGraph 
                        similarityMatrix={data.evaluationResults.similarityMatrix}
                        models={modelsForAggregateView}
                        resolvedTheme={resolvedTheme}
                      />
                    </div>
                  </CardContent>
                </Card>

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
        <DebugPanel 
            data={data} 
            configId={configIdFromUrl}
            runLabel={runLabel}
            timestamp={timestampFromUrl}
        />

      {responseComparisonModal && (
        <ResponseComparisonModal 
          isOpen={true} 
          onClose={closeResponseComparisonModal} 
          {...responseComparisonModal}
        />
      )}
      {modelEvaluationModal && (
        <ModelEvaluationDetailModal
          isOpen={true}
          onClose={closeModelEvaluationDetailModal}
          data={modelEvaluationModal}
        />
      )}
    </div>
  );
} 