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
import ModelEvaluationDetailModalV2 from '@/app/(full)/analysis/components/ModelEvaluationDetailModalV2';
import DebugPanel from '@/app/(full)/analysis/components/DebugPanel';
import CoverageHeatmapCanvas from '@/app/(full)/analysis/components/CoverageHeatmapCanvas';
import { parseEffectiveModelId, getCanonicalModels } from '@/app/utils/modelIdUtils';
import { BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import { useComparisonData } from '@/app/(full)/analysis/hooks/useComparisonData';
import { useAnalysisStats } from '@/app/(full)/analysis/hooks/useAnalysisStats';
import { useModelFiltering } from '@/app/(full)/analysis/hooks/useModelFiltering';
import { usePageInteraction } from '@/app/(full)/analysis/hooks/usePageInteraction';
import { SinglePromptView } from './SinglePromptView';
import { AggregateAnalysisView } from './AggregateAnalysisView';
import { SandboxAggregateView } from './SandboxAggregateView';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import { useToast } from '@/components/ui/use-toast';
import { generateMinimalBlueprintYaml } from '@/app/sandbox/utils/yaml-generator';

const FlaskConical = dynamic(() => import('lucide-react').then(mod => mod.FlaskConical));
const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle))
const Loader2 = dynamic(() => import("lucide-react").then((mod) => mod.Loader2))
const GitCommit = dynamic(() => import("lucide-react").then((mod) => mod.GitCommit))
const AlertTriangle = dynamic(() => import("lucide-react").then((mod) => mod.AlertTriangle))
const ArrowLeft = dynamic(() => import("lucide-react").then(mod => mod.ArrowLeft));
const Download = dynamic(() => import("lucide-react").then((mod) => mod.Download));
const FileCode2 = dynamic(() => import("lucide-react").then((mod) => mod.FileCode2));
const FileText = dynamic(() => import("lucide-react").then((mod) => mod.FileText));

export interface BetaComparisonClientPageProps {
  data: ImportedComparisonDataV2;
  isSandbox?: boolean;
}

const BetaComparisonClientPage: React.FC<BetaComparisonClientPageProps> = ({ data, isSandbox = false }) => {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  
  const configIdFromUrl = params.configId as string;
  const runLabel = params.runLabel as string;
  const timestampFromUrl = params.timestamp as string;
  const sandboxId = params.sandboxId as string;

  const currentPromptId = searchParams.get('prompt');

  // The hook now takes the initial data directly.
  const { data: comparisonData, loading, error, promptNotFound, excludedModelsList } = useComparisonData({
    initialData: data,
    currentPromptId,
  });

  const [forceIncludeExcludedModels, setForceIncludeExcludedModels] = useState<boolean>(false);
  const [selectedTemperatures, setSelectedTemperatures] = useState<number[]>([]);
  const [activeSysPromptIndex, setActiveSysPromptIndex] = useState(0);
  const [activeHighlights, setActiveHighlights] = useState<Set<ActiveHighlight>>(new Set());
  const { resolvedTheme } = useTheme();

  const { toast } = useToast();

  useEffect(() => {
    if (comparisonData?.config?.temperatures) {
      setSelectedTemperatures(comparisonData.config.temperatures);
    } else {
      setSelectedTemperatures([]);
    }
  }, [comparisonData]);

  const { displayedModels, modelsForMacroTable, modelsForAggregateView } = useModelFiltering({
    data: comparisonData,
    currentPromptId,
    forceIncludeExcludedModels,
    excludedModelsList,
    activeSysPromptIndex,
    selectedTemperatures,
  });
  
  const analysisStats = useAnalysisStats(comparisonData);

  const canonicalModelsForSinglePrompt = useMemo(() => {
    if (!comparisonData || !currentPromptId) return displayedModels;
    return getCanonicalModels(displayedModels, comparisonData.config);
  }, [comparisonData, currentPromptId, displayedModels]);

  const {
    responseComparisonModal,
    closeResponseComparisonModal,
    modelEvaluationModal,
    openModelEvaluationDetailModal,
    closeModelEvaluationDetailModal,
    handleSimilarityCellClick,
    handleCoverageCellClick,
    handleSemanticExtremesClick,
    prepareResponseComparisonModalData,
    prepareModelEvaluationModalData,
  } = usePageInteraction(comparisonData);

  const handleMostDifferentiatingClick = useCallback(() => {
    if (analysisStats?.mostDifferentiatingPrompt?.id) {
        const promptId = analysisStats.mostDifferentiatingPrompt.id;
        router.push(`/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}?prompt=${promptId}`);
    }
  }, [analysisStats?.mostDifferentiatingPrompt?.id, router, configIdFromUrl, runLabel, timestampFromUrl]);

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
    if (!comparisonData || !comparisonData.effectiveModels || !comparisonData.evaluationResults?.llmCoverageScores) return sensitivityMap;

    const { effectiveModels, promptIds, evaluationResults, config } = comparisonData;
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
  }, [comparisonData]);

  const normalizedExecutiveSummary = useMemo(() => {
    if (!comparisonData?.executiveSummary) return null;
    const content = typeof comparisonData.executiveSummary === 'string' ? comparisonData.executiveSummary : comparisonData.executiveSummary.content;
    // Replace all headings (h1, h3, h4, etc.) with h2 headings.
    return content.replace(/^#+\s/gm, '## ');
  }, [comparisonData?.executiveSummary]);

  const getPromptContextDisplayString = useMemo(() => (promptId: string): string => {
    if (!comparisonData || !comparisonData.promptContexts) return promptId;
    const context = comparisonData.promptContexts[promptId];
    if (typeof context === 'string') {
      return context;
    }
    if (Array.isArray(context) && context.length > 0) {
      const lastUserMessage = [...context].reverse().find(msg => msg.role === 'user');
      if (lastUserMessage) {
        return `User: ${lastUserMessage.content.substring(0, 300)}${lastUserMessage.content.length > 300 ? '...' : ''}`;
      }
      return `Multi-turn context (${context.length} messages)`;
    }
    return promptId;
  }, [comparisonData]);

  const summaryStats = useMemo(() => {
    if (!comparisonData || !analysisStats) return undefined;

    const mdpFromStats = analysisStats.mostDifferentiatingPrompt;

    const mostDifferentiatingPrompt = mdpFromStats
        ? {
            id: mdpFromStats.id,
            score: mdpFromStats.score,
            text: getPromptContextDisplayString(mdpFromStats.id),
          }
        : null;
        
    let bestPerformer = null;
    let worstPerformer = null;

    if (isSandbox) {
        // In sandbox mode, Hybrid score is not applicable as there's no IDEAL_MODEL.
        // We use coverage extremes as the primary performance indicator.
        if (analysisStats.overallCoverageExtremes?.bestCoverage) {
            bestPerformer = {
                id: analysisStats.overallCoverageExtremes.bestCoverage.modelId,
                score: analysisStats.overallCoverageExtremes.bestCoverage.avgScore,
            };
        }
        if (analysisStats.overallCoverageExtremes?.worstCoverage) {
            worstPerformer = {
                id: analysisStats.overallCoverageExtremes.worstCoverage.modelId,
                score: analysisStats.overallCoverageExtremes.worstCoverage.avgScore,
            };
        }
    } else if (analysisStats.overallHybridExtremes) {
        // For regular runs, we use the hybrid score.
        if (analysisStats.overallHybridExtremes.bestHybrid) {
            bestPerformer = {
                id: analysisStats.overallHybridExtremes.bestHybrid.modelId,
                score: analysisStats.overallHybridExtremes.bestHybrid.avgScore,
            };
        }
        if (analysisStats.overallHybridExtremes.worstHybrid) {
            worstPerformer = {
                id: analysisStats.overallHybridExtremes.worstHybrid.modelId,
                score: analysisStats.overallHybridExtremes.worstHybrid.avgScore,
            };
        }
    }

    return {
      bestPerformingModel: bestPerformer,
      worstPerformingModel: worstPerformer,
      mostDifferentiatingPrompt,
    };
  }, [isSandbox, comparisonData, analysisStats, getPromptContextDisplayString]);

  const headerWidgetContent = useMemo(() => {
    if (currentPromptId || !comparisonData?.evaluationResults?.llmCoverageScores || !comparisonData.promptIds || displayedModels.filter(m => m !== IDEAL_MODEL_ID).length === 0) {
      return null;
    }
    return (
      <CoverageHeatmapCanvas
        allCoverageScores={comparisonData.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>} 
        promptIds={comparisonData.promptIds}
        models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
        width={100}
        height={50}
        className="rounded-md border border-border dark:border-border shadow-sm"
      />
    );
  }, [currentPromptId, comparisonData, displayedModels]);

  const currentPromptDisplayText = useMemo(() => currentPromptId ? getPromptContextDisplayString(currentPromptId) : 'All Prompts', [currentPromptId, getPromptContextDisplayString]);
  
  const pageTitle = useMemo(() => {
    let title = "Analysis";
    if (comparisonData) {
      title = `${comparisonData.configTitle || configIdFromUrl}`;
    } else if (configIdFromUrl && runLabel && timestampFromUrl) {
      title = `${configIdFromUrl} - ${runLabel}`;
      title += ` (${formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl))})`;
    }
    if (currentPromptId) {
      title += ` - Prompt: ${currentPromptDisplayText}`;
    }
    return title;
  }, [comparisonData, configIdFromUrl, runLabel, timestampFromUrl, currentPromptId, currentPromptDisplayText]);

  const breadcrumbItems = useMemo(() => {
    const items: AnalysisPageHeaderProps['breadcrumbs'] = [
      { label: 'Home', href: '/' },
      {
        label: comparisonData?.configTitle || configIdFromUrl,
        href: `/analysis/${configIdFromUrl}`,
      },
      {
        label: comparisonData?.runLabel || runLabel,
        href: `/analysis/${configIdFromUrl}/${runLabel}`,
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
  }, [comparisonData, configIdFromUrl, runLabel, timestampFromUrl, currentPromptId, currentPromptDisplayText]);

  const promptTextsForMacroTable = useMemo(() => {
    if (!comparisonData?.promptContexts) return {};
    return Object.fromEntries(
      Object.entries(comparisonData.promptContexts).map(([promptId, context]) => [
        promptId,
        typeof context === 'string' ? context : getPromptContextDisplayString(promptId)
      ])
    );
  }, [comparisonData?.promptContexts, getPromptContextDisplayString]);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  const renderPromptSelector = () => {
    if (!comparisonData || !comparisonData.promptIds) return null;

    const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedPromptId = event.target.value;
      const basePath = isSandbox 
        ? `/sandbox/results/${sandboxId}`
        : `/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}`;

      if (selectedPromptId === '__ALL__') {
        router.push(basePath);
      } else {
        router.push(`${basePath}?prompt=${selectedPromptId}`);
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
          {comparisonData.promptIds.map(promptId => (
            <option key={promptId} value={promptId} title={getPromptContextDisplayString(promptId)} className="bg-background text-foreground dark:bg-background dark:text-foreground">
              {promptId} - {getPromptContextDisplayString(promptId)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const handleExploreInSandbox = () => {
    try {
      if (!comparisonData?.config) {
        throw new Error('Blueprint configuration is not available in the results data.');
      }

      const yamlContent = generateMinimalBlueprintYaml(comparisonData.config);
      const blueprintName = `Copy of ${comparisonData.configTitle || 'Untitled Blueprint'}.yml`;

      const importData = {
        name: blueprintName,
        content: yamlContent,
      };

      localStorage.setItem('weval_sandbox_import_v2', JSON.stringify(importData));
      
      toast({
        title: "Blueprint prepared!",
        description: `Opening "${blueprintName}" in the Sandbox Studio...`,
      });

      window.open('/sandbox', '_blank');

    } catch (error) {
      console.error("Failed to prepare blueprint for Sandbox:", error);
      toast({
        variant: 'destructive',
        title: 'Operation Failed',
        description: 'Could not prepare the blueprint for the Sandbox Studio.',
      });
    }
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
  if (!comparisonData) return null; 

  const headerActions = comparisonData ? (
    <div className="flex items-center gap-2">
        {isSandbox ? (
            <Button asChild variant="outline" size="sm" className="text-green-600 dark:text-green-400 border-green-600/70 dark:border-green-700/70 hover:bg-green-600/10 dark:hover:bg-green-700/30 hover:text-green-700 dark:hover:text-green-300 px-3 py-1.5 text-xs">
                <Link href={`/api/sandbox/blueprint/${sandboxId}`} download>
                    <FileCode2 className="w-3.5 h-3.5 mr-1.5" />
                    Download Blueprint
                </Link>
            </Button>
        ) : comparisonData.sourceCommitSha ? (
            <Button asChild variant="outline">
                <Link href={`${BLUEPRINT_CONFIG_REPO_URL}/blob/${comparisonData.sourceCommitSha}/blueprints/${comparisonData.configId}.yml`} target="_blank" rel="noopener noreferrer" title={`View blueprint at commit ${comparisonData.sourceCommitSha.substring(0, 7)}`}>
                    <GitCommit className="w-4 h-4 mr-2" />
                    View Blueprint on GitHub
                </Link>
            </Button>
        ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="outline">
                      <Link href={`${BLUEPRINT_CONFIG_REPO_URL}/blob/main/blueprints/${comparisonData.configId}.json`} target="_blank" rel="noopener noreferrer">
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
        <DownloadResultsButton data={comparisonData} label={`${comparisonData.configTitle || configIdFromUrl} - ${comparisonData.runLabel || runLabel}${timestampFromUrl ? ' (' + formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl)) + ')' : ''}`} />
        <Button asChild variant="outline" size="sm" className="text-green-600 dark:text-green-400 border-green-600/70 dark:border-green-700/70 hover:bg-green-600/10 dark:hover:bg-green-700/30 hover:text-green-700 dark:hover:text-green-300 px-3 py-1.5 text-xs">
            <Link href={`/api/comparison/${configIdFromUrl}/${runLabel}/${timestampFromUrl}/markdown`} download>
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Download Results as Markdown
            </Link>
        </Button>
        <Button onClick={handleExploreInSandbox} variant="outline" size="sm" className="bg-exciting text-exciting-foreground border-exciting hover:bg-exciting/90 hover:text-exciting-foreground">
          <FlaskConical className="w-4 h-4 mr-2" />
          Run in Sandbox Studio
        </Button>
    </div>
  ) : null;

  return (
    <div className="mx-auto p-4 md:p-6 lg:p-8 space-y-8">
        {isSandbox && (
          <Alert className="border-primary/50 bg-primary/5">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary font-semibold">Sandbox Studio Test Results</AlertTitle>
            <AlertDescription className="text-sm">
                <p>This is a temporary result page for your test run. These results will be automatically deleted after one week.</p>
                <Button asChild variant="link" className="p-0 h-auto mt-2 text-primary font-semibold text-sm">
                    <Link href="/sandbox">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Return to Sandbox Studio
                    </Link>
                </Button>
            </AlertDescription>
          </Alert>
        )}
        {currentPromptId ? (
            <Breadcrumbs items={breadcrumbItems} />
        ) : (
            <AnalysisPageHeader 
                breadcrumbs={breadcrumbItems}
                pageTitle={pageTitle}
                contextualInfo={{
                configTitle: comparisonData.configTitle,
                runLabel: comparisonData.runLabel,
                timestamp: comparisonData.timestamp,
                description: comparisonData.description,
                tags: comparisonData.config?.tags
                }}
                actions={headerActions}
                headerWidget={headerWidgetContent}
                executiveSummary={normalizedExecutiveSummary}
                summaryStats={summaryStats}
                isSandbox={isSandbox}
                onMostDifferentiatingClick={handleMostDifferentiatingClick}
            />
        )}

        {!isSandbox && renderPromptSelector()}

        {currentPromptId ? (
            <SinglePromptView
                data={comparisonData}
                currentPromptId={currentPromptId}
                currentPromptDisplayText={currentPromptDisplayText}
                displayedModels={displayedModels}
                canonicalModels={canonicalModelsForSinglePrompt}
                prepareResponseComparisonModalData={prepareResponseComparisonModalData}
                prepareModelEvaluationModalData={prepareModelEvaluationModalData}
                resolvedTheme={resolvedTheme}
            />
        ) : isSandbox ? (
            <SandboxAggregateView
                data={comparisonData}
                displayedModels={displayedModels}
                openModelEvaluationDetailModal={openModelEvaluationDetailModal}
                activeHighlights={activeHighlights}
                handleActiveHighlightsChange={handleActiveHighlightsChange}
                promptTextsForMacroTable={promptTextsForMacroTable}
                permutationSensitivityMap={permutationSensitivityMap}
                isSandbox={isSandbox}
                sandboxId={sandboxId}
            />
        ) : (
            <AggregateAnalysisView
                data={comparisonData}
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

        {!isSandbox && (
            <DebugPanel 
                data={comparisonData} 
                configId={configIdFromUrl}
                runLabel={runLabel}
                timestamp={timestampFromUrl}
            />
        )}

        {isSandbox && (
            <div className="mt-12 text-center border-t border-border pt-8">
                <Button asChild size="lg">
                    <Link href="/sandbox">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Return to Sandbox Studio
                    </Link>
                </Button>
            </div>
        )}

      {responseComparisonModal && (
        <ResponseComparisonModal 
          isOpen={true} 
          onClose={closeResponseComparisonModal} 
          {...responseComparisonModal}
        />
      )}
      {modelEvaluationModal && (
        <ModelEvaluationDetailModalV2
          isOpen={true}
          onClose={closeModelEvaluationDetailModal}
          data={modelEvaluationModal}
        />
      )}
    </div>
  );
}

export default BetaComparisonClientPage; 