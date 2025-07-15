'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import Link from 'next/link';
import { MarkdownAccordion } from '@/app/analysis/components/MarkdownAccordion';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { prettifyTag, normalizeTag } from '@/app/utils/tagUtils';
import { Badge } from '@/components/ui/badge';
import { useUnifiedAnalysis } from '../hooks/useUnifiedAnalysis';
import { cn } from '@/lib/utils';
import PromptContextDisplay from './PromptContextDisplay';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });
const Sparkles = dynamic(() => import("lucide-react").then(mod => mod.Sparkles));
const InfoIcon = dynamic(() => import("lucide-react").then(mod => mod.Info));
const MessageSquare = dynamic(() => import("lucide-react").then(mod => mod.MessageSquare));

export interface AnalysisPageHeaderProps {
  actions?: React.ReactNode;
  headerWidget?: React.ReactNode;
  children?: React.ReactNode;
  isSticky?: boolean;
}

// Component for overall summary stats (aggregate view)
const SummaryStatsTable = () => {
  const { summaryStats, isSandbox, openModelPerformanceModal, openPromptDetailModal } = useUnifiedAnalysis();

  if (!summaryStats) return null;

  const { bestPerformingModel, worstPerformingModel, mostDifferentiatingPrompt, mostSimilarPair } = summaryStats;

  const performerTooltipText = isSandbox
    ? 'Based on highest average key point coverage score.'
    : 'Based on highest average hybrid score (coverage + similarity to ideal).';
  
  const worstPerformerTooltipText = isSandbox
    ? 'Based on lowest average key point coverage score.'
    : 'Based on lowest average hybrid score (coverage + similarity to ideal).';

  const rows = [
    {
      label: (
        <span className="flex items-center gap-1.5">
          🏆 Best Hybrid Score
          {isSandbox && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><InfoIcon className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent><p>In Sandbox, this is based on Key Point Coverage.</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </span>
      ),
      item: bestPerformingModel ? <span className="underline cursor-pointer" onClick={() => openModelPerformanceModal(bestPerformingModel!.id)}>{getModelDisplayLabel(bestPerformingModel.id, { hideProvider: true })}</span> : 'N/A',
      value: bestPerformingModel ? `${(bestPerformingModel.score * 100).toFixed(1)}%` : 'N/A',
      tooltip: `${performerTooltipText} Model: ${bestPerformingModel ? getModelDisplayLabel(bestPerformingModel.id) : 'N/A'}`,
    },
    { 
      label: '📉 Worst Hybrid Score', 
      item: worstPerformingModel ? <span className="underline cursor-pointer" onClick={() => openModelPerformanceModal(worstPerformingModel!.id)}>{getModelDisplayLabel(worstPerformingModel.id, { hideProvider: true })}</span> : 'N/A',
      value: worstPerformingModel ? `${(worstPerformingModel.score * 100).toFixed(1)}%` : 'N/A', 
      tooltip: `${worstPerformerTooltipText} Model: ${worstPerformingModel ? getModelDisplayLabel(worstPerformingModel.id) : 'N/A'}` 
    },
    {
        label: '🤔 Most Differentiating Prompt',
        item: mostDifferentiatingPrompt ? <span className="underline cursor-pointer" onClick={() => openPromptDetailModal(mostDifferentiatingPrompt.id)}>{mostDifferentiatingPrompt.text || mostDifferentiatingPrompt.id}</span> : 'N/A',
        value: mostDifferentiatingPrompt ? `σ = ${(mostDifferentiatingPrompt.score).toFixed(2)}` : 'N/A',
        tooltip: `The prompt with the highest standard deviation of scores across models. Prompt ID: ${mostDifferentiatingPrompt?.id}`
    },
    {
        label: '👯 Most Semantically Similar Pair',
        item: mostSimilarPair ? <><span className="underline cursor-pointer" onClick={() => openModelPerformanceModal(mostSimilarPair!.pair[0])}>{getModelDisplayLabel(mostSimilarPair.pair[0], { hideProvider: true })}</span> vs <span className="underline cursor-pointer" onClick={() => openModelPerformanceModal(mostSimilarPair!.pair[1])}>{getModelDisplayLabel(mostSimilarPair.pair[1], { hideProvider: true })}</span></> : 'N/A',
        value: mostSimilarPair ? `${(mostSimilarPair.value * 100).toFixed(1)}%` : 'N/A',
        tooltip: `The two models with the highest semantic similarity score. Pair: ${mostSimilarPair ? `${getModelDisplayLabel(mostSimilarPair.pair[0])} & ${getModelDisplayLabel(mostSimilarPair.pair[1])}` : 'N/A'}`
    }
  ];

  const validRows = rows.filter(row => row.item !== 'N/A');

  return (
    <div className="mb-2">
      {/* Mobile: Card-based layout */}
      <div className="block sm:hidden space-y-3">
        {validRows.map((row, index) => (
          <div key={index} className="bg-card/50 dark:bg-slate-800/30 rounded-lg p-3 border border-border/50">
            <div className="flex flex-col space-y-2">
              <div className="text-sm font-medium text-muted-foreground">{row.label}</div>
              <div className="text-foreground font-medium">{row.item}</div>
              <div className="text-right font-semibold text-foreground text-sm">{row.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <tbody>
            {validRows.map((row, index) => (
              <tr key={index} className="border-b border-border/30 last:border-b-0">
                <td className="py-1.5 pr-2 font-medium text-muted-foreground whitespace-nowrap">{row.label}</td>
                <td className="py-1.5 px-2 text-foreground truncate max-w-[200px]" title={row.tooltip}>{row.item}</td>
                <td className="py-1.5 pl-2 text-right font-semibold text-foreground whitespace-nowrap">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Component for prompt-specific stats (single prompt view)
const PromptSpecificStatsTable = () => {
  const { data, currentPromptId, displayedModels, isSandbox, openModelPerformanceModal } = useUnifiedAnalysis();

  const promptStats = useMemo(() => {
    if (!data || !currentPromptId || !data.evaluationResults?.llmCoverageScores) return null;

    const promptCoverageScores = data.evaluationResults.llmCoverageScores[currentPromptId];
    const promptSimilarities = data.evaluationResults.perPromptSimilarities?.[currentPromptId];
    
    if (!promptCoverageScores) return null;

    const nonIdealModels = displayedModels.filter(m => m !== IDEAL_MODEL_ID);
    const modelScores: { modelId: string; coverageScore: number | null; similarityScore: number | null; hybridScore: number | null }[] = [];

    nonIdealModels.forEach(modelId => {
      const coverageResult = promptCoverageScores[modelId];
      const coverageScore = (coverageResult && !('error' in coverageResult) && typeof coverageResult.avgCoverageExtent === 'number' && !isNaN(coverageResult.avgCoverageExtent))
        ? coverageResult.avgCoverageExtent
        : null;

      const similarityEntry = promptSimilarities?.[modelId]?.[IDEAL_MODEL_ID] ?? promptSimilarities?.[IDEAL_MODEL_ID]?.[modelId];
      const similarityScore = (typeof similarityEntry === 'number' && !isNaN(similarityEntry)) ? similarityEntry : null;

      let hybridScore: number | null = null;
      if (coverageScore !== null && similarityScore !== null) {
        hybridScore = (coverageScore + similarityScore) / 2;
      } else if (coverageScore !== null && isSandbox) {
        // In sandbox mode, use coverage score as the primary metric
        hybridScore = coverageScore;
      }

      modelScores.push({ modelId, coverageScore, similarityScore, hybridScore });
    });

    // Find best and worst performers
    const validHybridScores = modelScores.filter(m => m.hybridScore !== null);
    let bestPerformer: { modelId: string; score: number } | null = null;
    let worstPerformer: { modelId: string; score: number } | null = null;

    if (validHybridScores.length > 0) {
      const sortedByHybrid = [...validHybridScores].sort((a, b) => b.hybridScore! - a.hybridScore!);
      bestPerformer = { modelId: sortedByHybrid[0].modelId, score: sortedByHybrid[0].hybridScore! };
      worstPerformer = { modelId: sortedByHybrid[sortedByHybrid.length - 1].modelId, score: sortedByHybrid[sortedByHybrid.length - 1].hybridScore! };
    }

    // Calculate standard deviation of scores for this prompt
    const hybridScores = validHybridScores.map(m => m.hybridScore!);
    let scoreStdDev: number | null = null;
    if (hybridScores.length >= 2) {
      const mean = hybridScores.reduce((sum, score) => sum + score, 0) / hybridScores.length;
      const variance = hybridScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / hybridScores.length;
      scoreStdDev = Math.sqrt(variance);
    }

    return {
      bestPerformer,
      worstPerformer,
      scoreStdDev,
      totalModels: nonIdealModels.length,
      validModels: validHybridScores.length
    };
  }, [data, currentPromptId, displayedModels, isSandbox]);

  if (!promptStats) return null;

  const { bestPerformer, worstPerformer, scoreStdDev, totalModels, validModels } = promptStats;

  const rows: Array<{
    label: React.ReactNode;
    item: React.ReactNode;
    value: string;
    tooltip: string;
  }> = [];

  if (bestPerformer) {
    rows.push({
      label: (
        <span className="flex items-center gap-1.5">
          🏆 Best for this prompt
          {isSandbox && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><InfoIcon className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent><p>Based on Key Point Coverage for this specific prompt.</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </span>
      ),
      item: <span className="underline cursor-pointer" onClick={() => openModelPerformanceModal(bestPerformer.modelId)}>{getModelDisplayLabel(bestPerformer.modelId, { hideProvider: true })}</span>,
      value: `${(bestPerformer.score * 100).toFixed(1)}%`,
      tooltip: `Best performing model for this prompt: ${getModelDisplayLabel(bestPerformer.modelId)}`
    });
  }

  if (worstPerformer && bestPerformer && worstPerformer.modelId !== bestPerformer.modelId) {
    rows.push({
      label: '📉 Worst for this prompt',
      item: <span className="underline cursor-pointer" onClick={() => openModelPerformanceModal(worstPerformer.modelId)}>{getModelDisplayLabel(worstPerformer.modelId, { hideProvider: true })}</span>,
      value: `${(worstPerformer.score * 100).toFixed(1)}%`,
      tooltip: `Worst performing model for this prompt: ${getModelDisplayLabel(worstPerformer.modelId)}`
    });
  }

  if (scoreStdDev !== null) {
    rows.push({
      label: '📊 Score Spread',
      item: `${validModels} of ${totalModels} models`,
      value: `σ = ${scoreStdDev.toFixed(3)}`,
      tooltip: `Standard deviation of scores shows how much models disagree on this prompt`
    });
  }

  return (
    <div className="mb-2">
      {/* Mobile: Card-based layout */}
      <div className="block sm:hidden space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="bg-card/50 dark:bg-slate-800/30 rounded-lg p-3 border border-border/50">
            <div className="flex flex-col space-y-2">
              <div className="text-sm font-medium text-muted-foreground">{row.label}</div>
              <div className="text-foreground font-medium">{row.item}</div>
              <div className="text-right font-semibold text-foreground text-sm">{row.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-border/30 last:border-b-0">
                <td className="py-1.5 pr-2 font-medium text-muted-foreground whitespace-nowrap">{row.label}</td>
                <td className="py-1.5 px-2 text-foreground truncate max-w-[200px]" title={row.tooltip}>{row.item}</td>
                <td className="py-1.5 pl-2 text-right font-semibold text-foreground whitespace-nowrap">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AnalysisPageHeader: React.FC<AnalysisPageHeaderProps> = ({
  actions,
  headerWidget,
  children,
  isSticky = false,
}) => {
  const {
    data,
    pageTitle,
    breadcrumbItems,
    isSandbox,
    normalizedExecutiveSummary,
    currentPromptId,
  } = useUnifiedAnalysis();

  if (!data) return null;

  const { configTitle, description, tags } = data.config;
  const hasDescription = description && description.trim() !== '';

  // Get prompt-specific data when in single prompt view
  const promptData = useMemo(() => {
    if (!currentPromptId || !data.promptContexts) return null;
    
    const promptContext = data.promptContexts[currentPromptId];
    const promptConfig = data.config.prompts?.find(p => p.id === currentPromptId);
    
    return {
      promptContext,
      promptDescription: promptConfig?.description,
      promptCitation: promptConfig?.citation
    };
  }, [currentPromptId, data.promptContexts, data.config.prompts]);

  const isInSinglePromptView = !!currentPromptId;

  return (
    <header
      className={`bg-card/60 dark:bg-slate-800/50 backdrop-blur-md p-4 sm:p-5 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700/60 relative ${
        isSticky ? 'sticky top-4 z-40' : ''
      }`}
    >
      {!isSandbox && breadcrumbItems && breadcrumbItems.length > 0 && (
        <div className="mb-3 px-1 sm:px-0">
          <Breadcrumbs items={breadcrumbItems} className="text-xs sm:text-sm" />
        </div>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start gap-x-8 gap-y-4">
        <div className={cn(
          "w-full",
          !isInSinglePromptView && normalizedExecutiveSummary && "lg:w-[50%] lg:flex-shrink-0"
        )}>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <h1
              className="text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl"
              title={pageTitle}
            >
              {pageTitle}
            </h1>
            {headerWidget}
          </div>

          {/* Prompt-specific content for single prompt view */}
          {isInSinglePromptView && promptData && (
            <div className="mt-4 space-y-4">
              {promptData.promptDescription && (
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1">
                  <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                    {promptData.promptDescription}
                  </ReactMarkdown>
                </div>
              )}
              
              {promptData.promptCitation && (
                <div className="flex items-start space-x-1.5 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-3 py-2">
                  <span>Source: {promptData.promptCitation}</span>
                </div>
              )}
              
              <div className="bg-muted/50 dark:bg-slate-900/40 p-4 rounded-lg">
                <h3 className="text-sm font-semibold text-foreground dark:text-slate-200 mb-3 flex items-center">
                  <MessageSquare className="w-4 h-4 mr-2 text-primary" />
                  Prompt Content
                </h3>
                <PromptContextDisplay promptContext={promptData.promptContext} />
              </div>
            </div>
          )}

          {/* General description and config info for both views */}
          {!isInSinglePromptView && hasDescription && (
            <div className="mt-2 text-sm text-muted-foreground dark:text-slate-400 prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                {description!}
              </ReactMarkdown>
            </div>
          )}

          {configTitle && pageTitle && !pageTitle.includes(configTitle) && (
             <p className="text-sm text-muted-foreground dark:text-slate-400 mt-1">
               Blueprint: <span className="font-medium text-foreground dark:text-slate-300">{configTitle}</span>
             </p>
          )}

          {tags && tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-xs font-semibold text-muted-foreground dark:text-slate-400">TAGS:</span>
              {tags.map(tag => (
                <Link href={`/tags/${normalizeTag(tag)}`} key={tag}>
                  <Badge variant="secondary" className="hover:bg-primary/20 transition-colors">{prettifyTag(tag)}</Badge>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-border/60">
            <h3 className="text-base font-semibold text-foreground dark:text-slate-200 mb-2 flex items-center">
              <Sparkles className="w-4 h-4 mr-2 text-primary" />
              {isInSinglePromptView ? 'Results for this prompt' : 'Summary of results'}
            </h3>
            {isInSinglePromptView ? (
              <PromptSpecificStatsTable />
            ) : (
              <SummaryStatsTable />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
            {actions && <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">{actions}</div>}
          </div>
        </div>

        {/* Executive summary only shown in aggregate view */}
        {!isInSinglePromptView && normalizedExecutiveSummary && (
          <div
            className="w-full lg:flex-1 bg-muted/50 dark:bg-slate-900/40 pb-4 px-4 rounded-lg flex flex-col"
          >
            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground dark:text-slate-300">
                <MarkdownAccordion content={normalizedExecutiveSummary} />
            </div>
          </div>
        )}
      </div>
      
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
};

export default AnalysisPageHeader; 