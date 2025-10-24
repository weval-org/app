'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    IDEAL_MODEL_ID,
} from '@/app/utils/calculationUtils';
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
import SemanticCellModal from '@/app/analysis/components/SemanticCellModal';
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
                        <Icon name="git-commit" className="w-4 h-4 mr-2" aria-hidden="true" />
                        View Blueprint
                    </Link>
                </Button>
            ) : (
                <Button asChild variant="outline" size="sm" className="px-3 py-1.5 text-xs" title="Links to latest version, not the exact one from this run">
                    <Link href={`${BLUEPRINT_CONFIG_REPO_URL}/blob/main/blueprints/${data.sourceBlueprintFileName || getBlueprintPathFromId(data.configId) + '.yml'}`} target="_blank" rel="noopener noreferrer">
                        <Icon name="git-commit" className="w-4 h-4 mr-2" aria-hidden="true" />
                        View Blueprint
                    </Link>
                </Button>
            )}

            {/* Alternative Views Dropdown */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="px-3 py-1.5 text-xs" aria-label="Alternative analysis views">
                        <Icon name="wand-2" className="w-4 h-4 mr-2" aria-hidden="true" />
                        Alternative Views
                        <Icon name="chevron-down" className="w-3 h-3 ml-1" aria-hidden="true" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                        <Link href={`/analysis/${configId}/${runLabel}/${timestamp}/simple`} className="cursor-pointer">
                            <Icon name="eye" className="w-4 h-4 mr-2" aria-hidden="true" />
                            Simple View
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href={`/analysis/${configId}/${runLabel}/${timestamp}/inspector`} className="cursor-pointer">
                            <Icon name="search" className="w-4 h-4 mr-2" aria-hidden="true" />
                            Inspector
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href={`/analysis/${configId}/${runLabel}/${timestamp}/compare`} className="cursor-pointer">
                            <Icon name="layout-grid" className="w-4 h-4 mr-2" aria-hidden="true" />
                            Compare View
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href={`/analysis/${configId}/${runLabel}/${timestamp}/thread`} className="cursor-pointer">
                            <Icon name="git-branch" className="w-4 h-4 mr-2" aria-hidden="true" />
                            Dialog Tree
                        </Link>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Download Dropdown */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="px-3 py-1.5 text-xs" aria-label="Download analysis data">
                        <Icon name="download" className="w-4 h-4 mr-2" aria-hidden="true" />
                        Download
                        <Icon name="chevron-down" className="w-3 h-3 ml-1" aria-hidden="true" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem
                        onSelect={() => {
                            const dataStr = JSON.stringify(data, null, 2);
                            const blob = new Blob([dataStr], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            const label = `${data.configTitle || configId} - ${data.runLabel || runLabel}`;
                            const dataTimestamp = data.timestamp || timestamp || new Date().toISOString();
                            a.download = `${label}_analysis_export_${dataTimestamp}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }}
                    >
                        <Icon name="file-code-2" className="w-4 h-4 mr-2" aria-hidden="true" />
                        Download JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href={`/api/comparison/${configId}/${runLabel}/${timestamp}/markdown`} download className="cursor-pointer">
                            <Icon name="file-text" className="w-4 h-4 mr-2" aria-hidden="true" />
                            Download Markdown
                        </Link>
                    </DropdownMenuItem>
                    {data.executiveSummary && (
                        <DropdownMenuItem
                            onSelect={() => {
                                const summaryText = typeof data.executiveSummary === 'string'
                                    ? data.executiveSummary
                                    : data.executiveSummary?.content || JSON.stringify(data.executiveSummary, null, 2);
                                const blob = new Blob([summaryText], { type: 'text/markdown' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${data.configTitle || configId} - Executive Summary.md`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            }}
                        >
                            <Icon name="sparkles" className="w-4 h-4 mr-2" aria-hidden="true" />
                            Executive Summary
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <Button onClick={handleExploreInSandbox} variant="outline" size="sm" className="bg-exciting text-exciting-foreground border-exciting hover:bg-exciting/90 hover:text-exciting-foreground text-xs" aria-label="Open in Sandbox Studio">
              <Icon name="flask-conical" className="w-4 h-4 mr-2" aria-hidden="true" />
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
            <SemanticCellModal />
        </div>
    )
} 