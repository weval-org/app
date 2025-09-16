'use client';

import React from 'react';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import RemarkGfmPlugin from 'remark-gfm';

export function ArticleClient({
  configId,
  runLabel,
  timestamp,
  title,
  deck,
  content,
  readingTimeMin,
}: {
  configId: string;
  runLabel: string;
  timestamp: string;
  title: string;
  deck?: string;
  content: string;
  readingTimeMin?: number;
}) {
  const handleClick = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A') {
      const anchor = target as HTMLAnchorElement;
      const href = anchor.getAttribute('href');
      if (!href) return;
      if (href.startsWith('#model-perf:') || href.startsWith('#system-prompt:') || href.startsWith('#prompt-detail:')) {
        e.preventDefault();
        window.location.href = `/analysis/${configId}/${runLabel}/${timestamp}${href}`;
      }
    }
  }, [configId, runLabel, timestamp]);

  return (
    <article className="px-4 py-6 sm:px-6 prose prose-sm sm:prose lg:prose-lg dark:prose-invert max-w-3xl mx-auto">
      <div className="mb-4 text-xs text-muted-foreground">
        <a
          href={`/analysis/${configId}/${runLabel}/${timestamp}`}
          className="underline underline-offset-2 hover:text-primary"
        >
          View full interactive analysis
        </a>
      </div>
      <header className="mb-6">
        <h1 className="!mb-2">{title}</h1>
        {deck && <p className="text-muted-foreground !mt-0">{deck}</p>}
        {readingTimeMin && (
          <p className="text-xs text-muted-foreground mt-2">~{readingTimeMin} min read</p>
        )}
      </header>
      <div onClick={handleClick}>
        <ResponseRenderer content={content} />
      </div>
    </article>
  );
}


