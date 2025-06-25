'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ResponseComparisonModal } from '@/app/(full)/analysis/components/ResponseComparisonModal'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ActiveHighlight } from '@/app/(full)/analysis/components/CoverageTableLegend'
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
    CoverageResult as ImportedCoverageResult,
} from '@/app/utils/types';
import {
    IDEAL_MODEL_ID,
    calculateStandardDeviation,
    calculateAverageSimilarity,
} from '@/app/utils/calculationUtils';
import { useTheme } from 'next-themes';
import DownloadResultsButton from '@/app/(full)/analysis/components/DownloadResultsButton';
import AnalysisPageHeader from '@/app/(full)/analysis/components/AnalysisPageHeader';
import type { AnalysisPageHeaderProps } from '@/app/(full)/analysis/components/AnalysisPageHeader';
import { fromSafeTimestamp, formatTimestampForDisplay } from '@/lib/timestampUtils';
import ModelEvaluationDetailModal from '@/app/(full)/analysis/components/ModelEvaluationDetailModal';
import DebugPanel from '@/app/(full)/analysis/components/DebugPanel';
import CoverageHeatmapCanvas from '@/app/(full)/analysis/components/CoverageHeatmapCanvas';
import { parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import { useComparisonData } from '@/app/(full)/analysis/hooks/useComparisonData';
import { useAnalysisStats } from '@/app/(full)/analysis/hooks/useAnalysisStats';
import { useModelFiltering } from '@/app/(full)/analysis/hooks/useModelFiltering';
import { usePageInteraction } from '@/app/(full)/analysis/hooks/usePageInteraction';
import { SinglePromptView } from './SinglePromptView';
import { AggregateAnalysisView } from './AggregateAnalysisView';
import ExecutiveSummary from '@/app/(full)/analysis/components/ExecutiveSummary';

const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle))
const Loader2 = dynamic(() => import("lucide-react").then((mod) => mod.Loader2))
const GitCommit = dynamic(() => import("lucide-react").then((mod) => mod.GitCommit))
const AlertTriangle = dynamic(() => import("lucide-react").then((mod) => mod.AlertTriangle))

export default function BetaComparisonClientPage({ data: initialData, isPlayground = false }: { data?: ImportedComparisonDataV2, isPlayground?: boolean }) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  
  const configIdFromUrl = params.configId as string;
  const runLabel = params.runLabel as string;
  const timestampFromUrl = params.timestamp as string;

  const currentPromptId = searchParams.get('prompt');

  // Use initialData if provided, otherwise fetch it.
  const { data: fetchedData, loading, error, promptNotFound, excludedModelsList } = useComparisonData({
    configId: configIdFromUrl,
    runLabel,
    timestamp: timestampFromUrl,
    currentPromptId,
    // Disable fetching if data is already provided
    enabled: !initialData,
  });

  const data = initialData || fetchedData;

  const [forceIncludeExcludedModels, setForceIncludeExcludedModels] = useState<boolean>(false);
  const [selectedTemperatures, setSelectedTemperatures] = useState<number[]>([]);
  const [activeSysPromptIndex, setActiveSysPromptIndex] = useState(0);
  const [activeHighlights, setActiveHighlights] = useState<Set<ActiveHighlight>>(new Set());
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (data?.config?.temperatures) {
      setSelectedTemperatures(data.config.temperatures);
    } else {
      setSelectedTemperatures([]);
    }
  }, [data]);

  const { displayedModels, modelsForMacroTable, modelsForAggregateView } = useModelFiltering({
    data,
    currentPromptId,
    forceIncludeExcludedModels,
    excludedModelsList,
    activeSysPromptIndex,
    selectedTemperatures,
  });
  
  const analysisStats = useAnalysisStats(data);

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

  const normalizedExecutiveSummary = useMemo(() => {
    if (!data?.executiveSummary) return null;
    const content = typeof data.executiveSummary === 'string' ? data.executiveSummary : data.executiveSummary.content;
    // Replace all headings (h1, h3, h4, etc.) with h2 headings.
    return content.replace(/^#+\s/gm, '## ');
  }, [data?.executiveSummary]);

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

  const summaryStats = useMemo(() => {
    if (!data || !analysisStats || !analysisStats.overallHybridExtremes) return undefined;

    const mdpFromStats = analysisStats.mostDifferentiatingPrompt;

    const mostDifferentiatingPrompt = mdpFromStats
        ? {
            id: mdpFromStats.id,
            score: mdpFromStats.score,
            text: getPromptContextDisplayString(mdpFromStats.id),
          }
        : null;

    return {
      bestPerformingModel: analysisStats.overallHybridExtremes.bestHybrid
        ? {
            id: analysisStats.overallHybridExtremes.bestHybrid.modelId,
            score: analysisStats.overallHybridExtremes.bestHybrid.avgScore,
          }
        : null,
      worstPerformingModel: analysisStats.overallHybridExtremes.worstHybrid
        ? {
            id: analysisStats.overallHybridExtremes.worstHybrid.modelId,
            score: analysisStats.overallHybridExtremes.worstHybrid.avgScore,
          }
        : null,
      mostDifferentiatingPrompt,
    };
  }, [data, analysisStats, getPromptContextDisplayString]);

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

  const currentPromptDisplayText = useMemo(() => currentPromptId ? getPromptContextDisplayString(currentPromptId) : 'All Prompts', [currentPromptId, getPromptContextDisplayString]);
  
  const pageTitle = useMemo(() => {
    let title = "Analysis";
    if (data) {
      title = `${data.configTitle || configIdFromUrl}`;
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
        href: `/analysis/${configIdFromUrl}`,
        isCurrent: !currentPromptId,
      },
      {
        label: data?.runLabel || runLabel,
        href: `/analysis/${configIdFromUrl}/${runLabel}`,
        isCurrent: !currentPromptId,
      },
      {
        label: timestampFromUrl ? formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl)) : "Instance",
        ...(currentPromptId ? { href: `/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}` } : {}),
        isCurrent: !currentPromptId,
      }
    ];
    if (currentPromptId) {
      items.push({
        label: `Prompt: ${currentPromptDisplayText}`,
        isCurrent: true,
      });
    }
    return items;
  }, [data, configIdFromUrl, runLabel, timestampFromUrl, currentPromptId, currentPromptDisplayText]);

  const promptTextsForMacroTable = useMemo(() => {
    if (!data?.promptContexts) return {};
    return Object.fromEntries(
      Object.entries(data.promptContexts).map(([promptId, context]) => [
        promptId,
        typeof context === 'string' ? context : getPromptContextDisplayString(promptId)
      ])
    );
  }, [data?.promptContexts, getPromptContextDisplayString]);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

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
    <div className="mx-auto p-4 md:p-6 lg:p-8 space-y-8">
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
            executiveSummary={normalizedExecutiveSummary}
            summaryStats={summaryStats}
            isPlayground={isPlayground}
        />

        {renderPromptSelector()}

        {currentPromptId ? (
            <SinglePromptView
                data={data}
                currentPromptId={currentPromptId}
                currentPromptDisplayText={currentPromptDisplayText}
                displayedModels={displayedModels}
                handleSimilarityCellClick={handleSimilarityCellClick}
                handleCoverageCellClick={handleCoverageCellClick}
                handleSemanticExtremesClick={handleSemanticExtremesClick}
                openModelEvaluationDetailModal={openModelEvaluationDetailModal}
                resolvedTheme={resolvedTheme}
            />
        ) : (
            <AggregateAnalysisView
                data={data}
                configId={configIdFromUrl}
                runLabel={runLabel}
                timestamp={timestampFromUrl}
                excludedModelsList={excludedModelsList}
                openModelEvaluationDetailModal={openModelEvaluationDetailModal}
                resolvedTheme={resolvedTheme}
                displayedModels={displayedModels}
                modelsForMacroTable={modelsForMacroTable}
                modelsForAggregateView={modelsForAggregateView}
                forceIncludeExcludedModels={forceIncludeExcludedModels}
                setForceIncludeExcludedModels={setForceIncludeExcludedModels}
                selectedTemperatures={selectedTemperatures}
                setSelectedTemperatures={setSelectedTemperatures}
                activeSysPromptIndex={activeSysPromptIndex}
                setActiveSysPromptIndex={setActiveSysPromptIndex}
                activeHighlights={activeHighlights}
                handleActiveHighlightsChange={handleActiveHighlightsChange}
                analysisStats={analysisStats}
                permutationSensitivityMap={permutationSensitivityMap}
                promptTextsForMacroTable={promptTextsForMacroTable}
            />
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