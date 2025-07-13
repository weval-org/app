'use client';

import React from 'react';
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

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });
const Sparkles = dynamic(() => import("lucide-react").then(mod => mod.Sparkles));
const InfoIcon = dynamic(() => import("lucide-react").then(mod => mod.Info));

export interface RefactoredAnalysisPageHeaderProps {
  actions?: React.ReactNode;
  headerWidget?: React.ReactNode;
  children?: React.ReactNode;
  isSticky?: boolean;
}

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
          🏆 Best Performer
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
      label: '📉 Worst Performer', 
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
        label: '👯 Most Similar Pair',
        item: mostSimilarPair ? <><span className="underline cursor-pointer" onClick={() => openModelPerformanceModal(mostSimilarPair!.pair[0])}>{getModelDisplayLabel(mostSimilarPair.pair[0], { hideProvider: true })}</span> vs <span className="underline cursor-pointer" onClick={() => openModelPerformanceModal(mostSimilarPair!.pair[1])}>{getModelDisplayLabel(mostSimilarPair.pair[1], { hideProvider: true })}</span></> : 'N/A',
        value: mostSimilarPair ? `${(mostSimilarPair.value * 100).toFixed(1)}%` : 'N/A',
        tooltip: `The two models with the highest semantic similarity score. Pair: ${mostSimilarPair ? `${getModelDisplayLabel(mostSimilarPair.pair[0])} & ${getModelDisplayLabel(mostSimilarPair.pair[1])}` : 'N/A'}`
    }
  ];

  return (
    <div className="mb-2">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row, index) => {
            if (row.item === 'N/A') return null;
            return <tr key={index} className="border-b border-border/30 last:border-b-0">
              <td className="py-1.5 pr-2 font-medium text-muted-foreground whitespace-nowrap">{row.label}</td>
              <td className="py-1.5 px-2 text-foreground truncate max-w-[200px]" title={row.tooltip}>{row.item}</td>
              <td className="py-1.5 pl-2 text-right font-semibold text-foreground whitespace-nowrap">{row.value}</td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  );
};

const RefactoredAnalysisPageHeader: React.FC<RefactoredAnalysisPageHeaderProps> = ({
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
  } = useUnifiedAnalysis();

  if (!data) return null;

  const { configTitle, description, tags } = data.config;
  const hasDescription = description && description.trim() !== '';

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
          normalizedExecutiveSummary && "lg:w-[50%] lg:flex-shrink-0"
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
          {hasDescription ? (
            <div className="mt-2 text-sm text-muted-foreground dark:text-slate-400 prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                {description!}
              </ReactMarkdown>
            </div>
          ) : null}

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
              Summary of results
            </h3>
            <SummaryStatsTable />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
            {actions && <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">{actions}</div>}
          </div>
        </div>

        {normalizedExecutiveSummary && (
          <div
            className="w-full lg:flex-1 bg-muted/50 dark:bg-slate-900/40 pb-4 px-4 rounded-lg flex flex-col"
          >
            {/* <h3 className="text-base font-semibold text-foreground dark:text-slate-200 mb-2 flex-shrink-0 flex items-center">
                <Sparkles className="w-4 h-4 mr-2 text-primary" />
                Executive Summary
            </h3> */}
            
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

export default RefactoredAnalysisPageHeader; 