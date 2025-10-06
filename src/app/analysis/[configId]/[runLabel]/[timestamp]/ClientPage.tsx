'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    IDEAL_MODEL_ID,
} from '@/app/utils/calculationUtils';
import DownloadResultsButton from '@/app/analysis/components/DownloadResultsButton';
import SpecificEvaluationModal from '@/app/analysis/components/SpecificEvaluationModal';
import DebugPanel from '@/app/analysis/components/DebugPanel';
import CoverageHeatmapCanvas from '@/app/analysis/components/CoverageHeatmapCanvas';
import { getBlueprintPathFromId } from '@/app/utils/blueprintIdUtils';
import { BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import { SinglePromptView } from '@/app/analysis/components/SinglePromptView';
import { AggregateAnalysisView } from '@/app/analysis/components/AggregateAnalysisView';
import { useToast } from '@/components/ui/use-toast';
import { generateMinimalBlueprintYaml } from '@/app/sandbox/utils/yaml-generator';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import AnalysisPageHeader from '@/app/analysis/components/AnalysisPageHeader';
import { fromSafeTimestamp, formatTimestampForDisplay } from '@/lib/timestampUtils';
import ModelPerformanceModal from '@/app/analysis/components/ModelPerformanceModal';
import ModelSimilarityModal from '@/app/analysis/components/ModelSimilarityModal';
import PromptSimilarityModal from '@/app/analysis/components/PromptSimilarityModal';
import { PromptSelector } from '@/app/analysis/components/PromptSelector';
import PromptPerformanceModal from '@/app/analysis/components/PromptPerformanceModal';
import Icon from '@/components/ui/icon';
// import { usePreloadIcons } from '@/components/ui/use-preload-icons';
// import { usePreloadMarkdown } from '@/app/analysis/components/PreloadMarkdown';

export const ClientPage: React.FC = () => {
    const router = useRouter();
    const { toast } = useToast();

    // Preload icons used in this page
    // usePreloadIcons([
    //     'loader-2', 'alert-circle', 'git-commit', 'alert-triangle', 
    //     'file-text', 'flask-conical'
    // ]);

    // Preload markdown dependencies to prevent loading states when modals open
    // usePreloadMarkdown();

    const { 
        data, 
        loading, 
        error, 
        promptNotFound,
        displayedModels,
        configId,
        runLabel,
        timestamp,
        pageTitle,
        currentPromptId,
    } = useAnalysis();

    useEffect(() => {
        if (pageTitle) {
            document.title = pageTitle;
        }
    }, [pageTitle]);

    const headerWidgetContent = useMemo(() => {
        if (currentPromptId || !data?.evaluationResults?.llmCoverageScores || !data.promptIds || displayedModels.filter(m => m !== IDEAL_MODEL_ID).length === 0) {
          return null;
        }
        const approach = (data as any)?.generationApproach as { mode?: string; bulkMode?: boolean } | undefined;
        return (
          <div className="flex items-center gap-3">
            <CoverageHeatmapCanvas
              allCoverageScores={data.evaluationResults.llmCoverageScores as any} 
              promptIds={data.promptIds}
              models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
              width={100}
              height={40}
              className="rounded-md border border-border dark:border-border shadow-sm"
            />
            {approach && (
              <div className="text-xs text-muted-foreground border rounded px-2 py-1">
                <span className="font-semibold">Deck Mode:</span> {approach.mode || (approach.bulkMode ? 'deck' : 'per_prompt')}
              </div>
            )}
          </div>
        );
    }, [currentPromptId, data, displayedModels]);

    const handleExploreInSandbox = () => {
        try {
          if (!configId || !runLabel || !timestamp) {
            throw new Error('Missing identifiers to construct sandbox import URL.');
          }

          const param = encodeURIComponent(`${configId}/${runLabel}/${timestamp}`);

          toast({
            title: "Opening Sandbox...",
            description: "Preparing import from selected analysis run.",
          });

          window.open(`/sandbox?config=${param}`, '_blank');

        } catch (error) {
          console.error("Failed to open Sandbox:", error);
          toast({
            variant: 'destructive',
            title: 'Operation Failed',
            description: 'Could not open the Sandbox Studio.',
          });
        }
    };
     
    if (loading) {
        return (
          <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
            <Icon name="loader-2" className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg text-muted-foreground">Loading analysis data...</p>
          </div>
        )
    }

    if (error) {
        return (
            <Alert variant="destructive" className="max-w-2xl mx-auto my-10">
                <Icon name="alert-circle" className="h-4 w-4" />
                <AlertTitle>Error Loading Data</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }
      
    if (promptNotFound) {
        return (
          <Alert variant="destructive" className="max-w-2xl mx-auto my-10">
            <Icon name="alert-circle" className="h-4 w-4" />
            <AlertTitle>Prompt Not Found</AlertTitle>
            <AlertDescription>
              The prompt ID <code className="font-mono bg-muted px-1 py-0.5 rounded">{currentPromptId}</code> was not found in this evaluation run.
              <Link href={`/analysis/${configId}/${runLabel}/${timestamp}`}>
                <Button variant="link" className="p-0 h-auto ml-1">Clear prompt selection</Button>
              </Link>
            </AlertDescription>
          </Alert>
        )
    }

    if (!data) {
        return null; 
    }

    const headerActions = (
        <div className="flex flex-wrap items-center justify-end gap-2">
            {data.sourceCommitSha ? (
                <Button asChild variant="outline" size="sm" className="px-3 py-1.5 text-xs">
                    <Link href={`${BLUEPRINT_CONFIG_REPO_URL}/blob/${data.sourceCommitSha}/blueprints/${data.sourceBlueprintFileName || getBlueprintPathFromId(data.configId) + '.yml'}`} target="_blank" rel="noopener noreferrer" title={`View blueprint at commit ${data.sourceCommitSha.substring(0, 7)}`}>
                        <Icon name="git-commit" className="w-4 h-4 mr-2" />
                        See Blueprint
                    </Link>
                </Button>
            ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button asChild variant="outline">
                          <Link href={`${BLUEPRINT_CONFIG_REPO_URL}/blob/main/blueprints/${data.sourceBlueprintFileName || getBlueprintPathFromId(data.configId) + '.yml'}`} target="_blank" rel="noopener noreferrer">
                              <Icon name="git-commit" className="w-4 h-4 mr-2" />
                              View Latest Blueprint
                          </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex items-center">
                        <Icon name="alert-triangle" className="w-4 h-4 mr-2 text-amber-500" />
                        <p>Links to latest version, not the exact one from this run.</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
            )}
            <Button asChild variant="outline" size="sm" className="px-3 py-1.5 text-xs">
                <Link href={`/analysis/${configId}/${runLabel}/${timestamp}/thread`}>
                    <Icon name="git-merge" className="w-4 h-4 mr-2" />
                    Dialog Tree
                </Link>
            </Button>
            <DownloadResultsButton data={data} label={`${data.configTitle || configId} - ${data.runLabel || runLabel}${timestamp ? ' (' + formatTimestampForDisplay(fromSafeTimestamp(timestamp)) + ')' : ''}`} />
            <Button asChild variant="outline" size="sm" className="text-green-600 dark:text-green-400 border-green-600/70 dark:border-green-700/70 hover:bg-green-600/10 dark:hover:bg-green-700/30 hover:text-green-700 dark:hover:text-green-300 px-3 py-1.5 text-xs">
                <Link href={`/api/comparison/${configId}/${runLabel}/${timestamp}/markdown`} download>
                    <Icon name="file-text" className="w-3.5 h-3.5 mr-1.5" />
                    Download Markdown
                </Link>
            </Button>
            <Button onClick={handleExploreInSandbox} variant="outline" size="sm" className="bg-exciting text-exciting-foreground border-exciting hover:bg-exciting/90 hover:text-exciting-foreground text-xs">
              <Icon name="flask-conical" className="w-4 h-4 mr-2" />
              Run in Sandbox
            </Button>
        </div>
    );

    return (
        <div className="mx-auto p-4 md:p-6 lg:p-8 space-y-8">
            <AnalysisPageHeader
                actions={headerActions}
                headerWidget={headerWidgetContent}
            />

            <PromptSelector />

            {currentPromptId ? (
                <SinglePromptView />
            ) : (
                <AggregateAnalysisView />
            )}

            <DebugPanel 
                data={data} 
                configId={configId}
                runLabel={runLabel}
                timestamp={timestamp}
            />


            <SpecificEvaluationModal />
            <ModelPerformanceModal />
            <PromptPerformanceModal />
            <ModelSimilarityModal />
            <PromptSimilarityModal />
        </div>
    )
} 