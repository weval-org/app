'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';

interface ExecutiveSummarySectionProps {
  executiveSummary: any;
}

function cleanModelProviders(text: string): string {
  // Remove provider prefixes from text but not from URLs
  return text.replace(/(?<!#model-perf:)(?:openrouter|openai|anthropic|together|xai|google):(?=[\w-.]+\/[\w-.]+)/ig, '');
}

export function ExecutiveSummarySection({ executiveSummary }: ExecutiveSummarySectionProps) {
  const { openModelPerformanceModal, openPromptDetailModal } = useAnalysis();

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A') {
      const anchor = target as HTMLAnchorElement;
      const href = anchor.getAttribute('href');
      if (href && href.startsWith('#model-perf:')) {
        e.preventDefault();
        const modelId = decodeURIComponent(href.substring('#model-perf:'.length));
        openModelPerformanceModal(modelId);
      } else if (href && href.startsWith('#prompt-detail:')) {
        e.preventDefault();
        const promptId = href.substring('#prompt-detail:'.length);
        openPromptDetailModal(promptId);
      }
    }
  };

  // Check if we have structured insights
  const hasStructuredInsights = executiveSummary?.isStructured && executiveSummary?.structured;

  if (hasStructuredInsights) {
    const { keyFindings, strengths, weaknesses, patterns } = executiveSummary.structured;

    // Take top 3 items from each category
    const topFindings = keyFindings?.slice(0, 3) || [];
    const topStrengths = strengths?.slice(0, 3) || [];
    const topWeaknesses = weaknesses?.slice(0, 3) || [];

    const hasContent = topFindings.length > 0 || topStrengths.length > 0 || topWeaknesses.length > 0;

    if (!hasContent) return null;

    return (
      <div className="border border-border rounded-lg p-6 bg-card/30" onClick={handleClick}>
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Executive Summary</h2>

        <div className="space-y-4 text-sm">
          {topFindings.length > 0 && (
            <div>
              <h3 className="font-medium mb-2 text-foreground">Key Findings</h3>
              <ul className="space-y-1.5 list-disc list-inside text-muted-foreground">
                {topFindings.map((finding: string, i: number) => (
                  <li key={i} className="leading-relaxed">
                    <span className="inline prose prose-sm dark:prose-invert">
                      <ReactMarkdown
                        remarkPlugins={[RemarkGfmPlugin]}
                        components={{
                          p: ({ children }) => <span>{children}</span>,
                        }}
                      >
                        {cleanModelProviders(finding)}
                      </ReactMarkdown>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {topStrengths.length > 0 && (
            <div>
              <h3 className="font-medium mb-2 text-foreground">Strengths</h3>
              <ul className="space-y-1.5 list-disc list-inside text-muted-foreground">
                {topStrengths.map((strength: string, i: number) => (
                  <li key={i} className="leading-relaxed">
                    <span className="inline prose prose-sm dark:prose-invert">
                      <ReactMarkdown
                        remarkPlugins={[RemarkGfmPlugin]}
                        components={{
                          p: ({ children }) => <span>{children}</span>,
                        }}
                      >
                        {cleanModelProviders(strength)}
                      </ReactMarkdown>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {topWeaknesses.length > 0 && (
            <div>
              <h3 className="font-medium mb-2 text-foreground">Weaknesses</h3>
              <ul className="space-y-1.5 list-disc list-inside text-muted-foreground">
                {topWeaknesses.map((weakness: string, i: number) => (
                  <li key={i} className="leading-relaxed">
                    <span className="inline prose prose-sm dark:prose-invert">
                      <ReactMarkdown
                        remarkPlugins={[RemarkGfmPlugin]}
                        components={{
                          p: ({ children }) => <span>{children}</span>,
                        }}
                      >
                        {cleanModelProviders(weakness)}
                      </ReactMarkdown>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback to plain markdown summary
  if (executiveSummary?.content) {
    return (
      <div className="border border-border rounded-lg p-6 bg-card/30" onClick={handleClick}>
        <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Executive Summary</h2>
        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
          <ReactMarkdown remarkPlugins={[RemarkGfmPlugin]}>
            {cleanModelProviders(executiveSummary.content)}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return null;
}
