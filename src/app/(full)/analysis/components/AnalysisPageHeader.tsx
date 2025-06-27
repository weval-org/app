'use client';

import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import type { BreadcrumbItem } from '@/app/components/Breadcrumbs'; // Using type import
import { formatTimestampForDisplay, fromSafeTimestamp } from '@/lib/timestampUtils';
import { BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import Link from 'next/link';
import { MarkdownAccordion } from './MarkdownAccordion';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });
const Sparkles = dynamic(() => import("lucide-react").then(mod => mod.Sparkles));

export interface AnalysisPageHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  pageTitle: string;
  contextualInfo: {
    configTitle: string;
    runLabel: string;
    timestamp: string;
    description?: string;
    tags?: string[];
  };
  actions?: React.ReactNode;
  headerWidget?: React.ReactNode;
  executiveSummary?: string | null;
  summaryStats?: {
    bestPerformingModel: { id: string; score: number } | null;
    worstPerformingModel: { id: string; score: number } | null;
    mostDifferentiatingPrompt: { id: string; score: number; text: string | null } | null;
  };
  isPlayground?: boolean;
  children?: React.ReactNode;
  isSticky?: boolean;
  onMostDifferentiatingClick?: () => void;
}

const SummaryStatsTable = ({ stats, onMostDifferentiatingClick }: { stats: AnalysisPageHeaderProps['summaryStats'], onMostDifferentiatingClick?: () => void }) => {
  if (!stats) return null;

  const { bestPerformingModel, worstPerformingModel, mostDifferentiatingPrompt } = stats;

  const rows: ({
    label: string;
    item: string;
    value: string;
    tooltip: string;
    onClick?: () => void;
  })[] = [
    { label: '🏆 Best Performer', item: bestPerformingModel ? getModelDisplayLabel(bestPerformingModel.id, { hideProvider: true }) : 'N/A', value: bestPerformingModel ? `${(bestPerformingModel.score * 100).toFixed(1)}%` : 'N/A', tooltip: `Based on highest average hybrid score. Model: ${bestPerformingModel ? getModelDisplayLabel(bestPerformingModel.id) : 'N/A'}` },
    { label: '📉 Worst Performer', item: worstPerformingModel ? getModelDisplayLabel(worstPerformingModel.id, { hideProvider: true }) : 'N/A', value: worstPerformingModel ? `${(worstPerformingModel.score * 100).toFixed(1)}%` : 'N/A', tooltip: `Based on lowest average hybrid score. Model: ${worstPerformingModel ? getModelDisplayLabel(worstPerformingModel.id) : 'N/A'}` },
    { label: '🧐 Most Differentiating', item: mostDifferentiatingPrompt ? (mostDifferentiatingPrompt.text || mostDifferentiatingPrompt.id) : 'N/A', value: mostDifferentiatingPrompt ? `~${(mostDifferentiatingPrompt.score).toFixed(3)} sim` : 'N/A', tooltip: `Prompt with the most diverse responses (lowest avg similarity). Prompt: ${mostDifferentiatingPrompt ? (mostDifferentiatingPrompt.text || mostDifferentiatingPrompt.id) : 'N/A'}`, onClick: onMostDifferentiatingClick },
  ];

  return (
    <div className="mb-2">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className={`border-b border-border/30 last:border-b-0 ${row.onClick ? 'cursor-pointer hover:bg-muted/50 dark:hover:bg-slate-800/80 transition-colors' : ''}`} onClick={row.onClick}>
              <td className="py-1.5 pr-2 font-medium text-muted-foreground whitespace-nowrap">{row.label}</td>
              <td className="py-1.5 px-2 text-foreground truncate max-w-[200px]" title={row.tooltip}>{row.item}</td>
              <td className="py-1.5 pl-2 text-right font-semibold text-foreground whitespace-nowrap">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AnalysisPageHeader: React.FC<AnalysisPageHeaderProps> = ({
  breadcrumbs,
  pageTitle,
  contextualInfo,
  actions,
  headerWidget,
  executiveSummary,
  summaryStats,
  isPlayground = false,
  children,
  isSticky = false,
  onMostDifferentiatingClick,
}) => {
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const [maxHeightForSummary, setMaxHeightForSummary] = useState<number | undefined>();

  const hasDescription = contextualInfo?.description && contextualInfo.description.trim() !== '';

  useLayoutEffect(() => {
    const leftColumn = leftColumnRef.current;
    if (!leftColumn) return;

    let resizeObserver: ResizeObserver;

    const setupObserver = () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      if (window.innerWidth < 1024) {
        setMaxHeightForSummary(undefined);
        return;
      }

      resizeObserver = new ResizeObserver(entries => {
        // Use requestAnimationFrame to avoid "ResizeObserver loop limit exceeded" error
        window.requestAnimationFrame(() => {
          if (!Array.isArray(entries) || !entries.length) {
            return;
          }
          setMaxHeightForSummary(entries[0].contentRect.height);
        });
      });
      resizeObserver.observe(leftColumn);
    };

    setupObserver();
    window.addEventListener('resize', setupObserver);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', setupObserver);
    };
  }, []);

  const { configTitle, runLabel, timestamp, description, tags } = contextualInfo;

  return (
    <header
      className={`bg-card/60 dark:bg-slate-800/50 backdrop-blur-md p-4 sm:p-5 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700/60 relative ${
        isSticky ? 'sticky top-4 z-40' : ''
      }`}
    >
      {!isPlayground && breadcrumbs && breadcrumbs.length > 0 && (
        <div className="mb-3 px-1 sm:px-0">
          <Breadcrumbs items={breadcrumbs} className="text-xs sm:text-sm" />
        </div>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start gap-x-8 gap-y-4">
        <div className="lg:flex-1" ref={leftColumnRef}>
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
                {contextualInfo.description!}
              </ReactMarkdown>
            </div>
          ) : null}

          {configTitle && !pageTitle.includes(configTitle) && (
             <p className="text-sm text-muted-foreground dark:text-slate-400 mt-1">
               Blueprint: <span className="font-medium text-foreground dark:text-slate-300">{configTitle}</span>
             </p>
          )}

          {tags && tags.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground dark:text-slate-400">TAGS:</span>
              {tags.map(tag => (
                <Link
                  href={`/tags/${tag}`}
                  key={tag}
                  className="px-2 py-0.5 text-[10px] sm:text-xs bg-primary/10 text-primary dark:bg-sky-500/20 dark:text-sky-300 rounded-full hover:bg-primary/20 dark:hover:bg-sky-500/30 transition-colors"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
            {actions && <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">{actions}</div>}
          </div>
        </div>

        {hasDescription && (executiveSummary || summaryStats) && (
          <div
            className="lg:flex-1 bg-muted/50 dark:bg-slate-900/40 p-4 rounded-lg flex flex-col"
            ref={rightColumnRef}
            style={{
              minHeight: executiveSummary ? '430px' : '200px',
              maxHeight: maxHeightForSummary ? `${maxHeightForSummary}px` : undefined,
            }}
          >
            <h3 className="text-base font-semibold text-foreground dark:text-slate-200 mb-2 flex-shrink-0">Summary of results:</h3>
            {summaryStats && <SummaryStatsTable stats={summaryStats} onMostDifferentiatingClick={onMostDifferentiatingClick} />}

            {executiveSummary && (
                <div
                    className={`prose prose-sm dark:prose-invert max-w-none text-muted-foreground dark:text-slate-300 ${summaryStats ? 'mt-3 pt-3 border-t border-border/40' : ''}`}
                    style={{ overflowY: 'auto', flexGrow: 1, minHeight: 0 }}
                >
                    <MarkdownAccordion content={executiveSummary} />
                </div>
            )}
          </div>
        )}
      </div>
      
      {!hasDescription && (executiveSummary || summaryStats) && (
        <div className="mt-4 pt-4 border-t border-border/60">
          <h2 className="text-lg font-semibold tracking-tight mb-2 flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-primary" />
            Summary of results:
          </h2>
          {summaryStats && <SummaryStatsTable stats={summaryStats} onMostDifferentiatingClick={onMostDifferentiatingClick} />}
          {executiveSummary && (
            <div className={`text-sm ${summaryStats ? 'mt-4' : ''}`}>
              <MarkdownAccordion content={executiveSummary} />
            </div>
          )}
        </div>
      )}
      
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
};

export default AnalysisPageHeader; 