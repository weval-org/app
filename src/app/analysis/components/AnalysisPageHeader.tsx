'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import type { BreadcrumbItem } from '@/app/components/Breadcrumbs'; // Using type import

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

interface AnalysisPageHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  pageTitle: string;
  contextualInfo?: {
    configTitle?: string | null;
    runLabel?: string | null;
    timestamp?: string | null; // Full ISO string
    description?: string | null;
    tags?: string[] | null;
  };
  actions?: React.ReactNode; // For buttons like "Download Results" or "Back to Blueprint"
  isSticky?: boolean;
  children?: React.ReactNode; // For any additional content that needs to be slotted in
  headerWidget?: React.ReactNode; // For a custom widget like the heatmap
}

const AnalysisPageHeader: React.FC<AnalysisPageHeaderProps> = ({
  breadcrumbs,
  pageTitle,
  contextualInfo,
  actions,
  isSticky = false,
  children,
  headerWidget,
}) => {
  return (
    <header
      className={`bg-card/60 dark:bg-slate-800/50 backdrop-blur-md p-4 sm:p-5 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700/60 relative ${
        isSticky ? 'sticky top-4 z-40' : ''
      }`}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="mb-3 px-1 sm:px-0">
          <Breadcrumbs items={breadcrumbs} className="text-xs sm:text-sm" />
        </div>
      )}

      {headerWidget && (
        <div className="absolute top-4 right-4 z-10">
          {headerWidget}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
        <h1
          className="text-lg md:text-xl lg:text-2xl font-semibold text-foreground dark:text-slate-100 truncate max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl"
          title={pageTitle}
        >
          {pageTitle}
        </h1>

      </div>

      {contextualInfo?.configTitle && !pageTitle.includes(contextualInfo.configTitle) && (
         <p className="text-sm text-muted-foreground dark:text-slate-400 mt-1">
           Blueprint: <span className="font-medium text-foreground dark:text-slate-300">{contextualInfo.configTitle}</span>
         </p>
      )}
      {contextualInfo?.runLabel && !pageTitle.includes(contextualInfo.runLabel) && (
         <p className="text-sm text-muted-foreground dark:text-slate-400 mt-0.5">
           Run Label: <span className="font-medium text-foreground dark:text-slate-300">{contextualInfo.runLabel}</span>
         </p>
      )}

      {contextualInfo?.description && ReactMarkdown && RemarkGfmPlugin && (
        <div className="mt-3.5 prose prose-xs sm:prose-sm dark:prose-invert max-w-none bg-card/30 dark:bg-slate-800/30 p-3 rounded-md ring-1 ring-border/50 dark:ring-slate-600/50 shadow-sm">
          <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
            {contextualInfo.description}
          </ReactMarkdown>
        </div>
      )}

      {contextualInfo?.tags && contextualInfo.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground dark:text-slate-400">TAGS:</span>
          {contextualInfo.tags.map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 text-[10px] sm:text-xs bg-primary/10 text-primary dark:bg-sky-500/20 dark:text-sky-300 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {actions && <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">{actions}</div>}
      
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
};

export default AnalysisPageHeader; 