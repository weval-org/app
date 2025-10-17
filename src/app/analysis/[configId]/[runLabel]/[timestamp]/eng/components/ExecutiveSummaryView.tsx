import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Icon from '@/components/ui/icon';
import Link from 'next/link';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import { StructuredSummary } from '@/app/analysis/components/StructuredSummary';
import { prettifyTag, normalizeTag } from '@/app/utils/tagUtils';
import { ExecutiveSummaryViewProps } from '../types/engTypes';

/**
 * Executive Summary view displaying blueprint overview, metadata, and summary content
 * Supports both structured and plain text summaries
 */
export function ExecutiveSummaryView({ executiveSummary, config }: ExecutiveSummaryViewProps) {
  // Check for structured data
  const hasStructured = executiveSummary &&
    typeof executiveSummary === 'object' &&
    'isStructured' in executiveSummary &&
    executiveSummary.isStructured &&
    executiveSummary.structured;

  // Handle different executive summary formats for fallback
  let content: string;
  if (typeof executiveSummary === 'string') {
    content = executiveSummary;
  } else if (executiveSummary && typeof executiveSummary === 'object' && 'content' in executiveSummary) {
    content = executiveSummary.content;
  } else {
    content = 'No executive summary available.';
  }

  const hasDescription = config?.description && config.description.trim() !== '';
  const tags = config?.tags || [];
  const author = config?.author;
  const references = (config as any)?.references;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">

      {/* Metadata section */}
      {(hasDescription || tags.length > 0 || author || (references && references.length > 0)) && (
        <div className="space-y-4 bg-muted/50 dark:bg-slate-900/40 p-4 rounded-lg">
          {/* Author */}
          {author && (
            <div>
              {(() => {
                const a: any = author;
                const name: string = typeof a === 'string' ? a : a.name;
                const url: string | undefined = typeof a === 'string' ? undefined : a.url;
                const imageUrl: string | undefined = typeof a === 'string' ? undefined : a.image_url;
                const content = (
                  <span className="text-sm text-foreground">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={name} className="h-5 w-5 rounded-full border border-border inline mr-1 align-text-bottom" />
                    ) : (
                      <Icon name="user" className="w-4 h-4 text-foreground inline mr-1 align-text-bottom" />
                    )}
                    By: <span className="font-bold">{name}</span>
                  </span>
                );
                return (
                  <span className="inline-flex items-center rounded-full bg-muted/60 px-2.5 py-1 border border-border/60" title="Blueprint author">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {content}
                      </a>
                    ) : content}
                  </span>
                );
              })()}
            </div>
          )}

          {/* References */}
          {references && Array.isArray(references) && references.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center text-sm text-foreground mr-1">
                  <Icon name="book-open" className="w-4 h-4 text-foreground inline mr-1.5 align-text-bottom" />
                  <span>Reference{references.length > 1 ? 's' : ''}:</span>
                </div>
                {references.map((r: any, index: number) => {
                  const title: string = typeof r === 'string' ? r : (r.title || r.name);
                  const url: string | undefined = typeof r === 'string' ? undefined : r.url;
                  const maxLength = 45;
                  const displayTitle = title.length > maxLength ? `${title.substring(0, maxLength)}...` : title;
                  const content = (
                    <span className="font-bold text-sm">{displayTitle}</span>
                  );
                  return (
                    <TooltipProvider key={index}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center rounded-full bg-muted/60 px-2.5 py-1 border border-border/60 cursor-pointer">
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {content}
                              </a>
                            ) : content}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-md">{title}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </div>
          )}

          {/* Description */}
          {hasDescription && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ResponseRenderer content={config.description || ''} />
            </div>
          )}

          {/* Tags */}
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
              <span className="text-xs font-semibold text-muted-foreground">TAGS:</span>
              {tags.map((tag: string) => (
                <Link href={`/tags/${normalizeTag(tag)}`} key={tag}>
                  <Badge variant="secondary" className="hover:bg-primary/20 transition-colors">{prettifyTag(tag)}</Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Executive summary content */}
      <div className="prose prose-sm max-w-none dark:prose-invert font-mono">
        {hasStructured && typeof executiveSummary === 'object' && 'structured' in executiveSummary && executiveSummary.structured ? (
          <StructuredSummary insights={executiveSummary.structured} disableModelLinks={true} />
        ) : (
          <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
        )}
      </div>
    </div>
  );
}
