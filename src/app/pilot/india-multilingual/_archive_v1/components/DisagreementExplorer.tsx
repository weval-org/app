'use client';

import React, { useState } from 'react';
import { HumanLLMDisagreement, ConversationMessage } from '@/types/shared';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ResponseRenderer from '@/app/components/ResponseRenderer';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

// Extract prompt text from context
function getPromptText(context: string | ConversationMessage[] | undefined): string {
  if (!context) return '';
  if (typeof context === 'string') return context;
  if (Array.isArray(context)) {
    const userMessage = context.find((m) => m.role === 'user');
    return userMessage?.content || '';
  }
  return '';
}

interface DisagreementExplorerProps {
  disagreements: HumanLLMDisagreement[];
  configId: string;
  runLabel: string;
  timestamp: string;
  isHighReliabilityFiltered?: boolean;
  promptContexts?: Record<string, string | ConversationMessage[]>;
}

export function DisagreementExplorer({
  disagreements,
  configId,
  runLabel,
  timestamp,
  isHighReliabilityFiltered = false,
  promptContexts = {},
}: DisagreementExplorerProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [loadingResponse, setLoadingResponse] = useState<string | null>(null);
  const [loadedResponses, setLoadedResponses] = useState<Record<string, string>>({});

  // Format model name for display
  const formatModelName = (modelId: string) => {
    const name = modelId.split('/').pop() || modelId;
    return name.replace(/\[temp:\d+\.?\d*\]/, '').trim();
  };

  // Lazy-load response text when expanding
  const handleExpand = async (index: number, disagreement: HumanLLMDisagreement) => {
    if (expandedIndex === index) {
      setExpandedIndex(null);
      return;
    }

    setExpandedIndex(index);

    const key = `${disagreement.prompt_id}_${disagreement.model_id}`;
    if (loadedResponses[key]) return; // Already loaded

    setLoadingResponse(key);

    try {
      // Fetch the response from the API using proper nested route pattern
      const response = await fetch(
        `/api/comparison/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(timestamp)}/modal-data/${encodeURIComponent(disagreement.prompt_id)}/${encodeURIComponent(disagreement.model_id)}`
      );

      if (response.ok) {
        const data = await response.json();
        setLoadedResponses((prev) => ({
          ...prev,
          [key]: data.response || 'Response not available',
        }));
      }
    } catch (error) {
      console.error('Failed to load response:', error);
    } finally {
      setLoadingResponse(null);
    }
  };

  // Show top 10 disagreements
  const displayDisagreements = disagreements.slice(0, 10);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold flex items-center gap-3"
          style={headingStyles}
        >
          Notable Disagreements
          {isHighReliabilityFiltered && (
            <span className="text-xs font-normal bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">
              High-reliability workers only
            </span>
          )}
        </h2>
        <p className="text-muted-foreground">
          {isHighReliabilityFiltered
            ? 'Cases where a discerning human evaluator and LLM judges diverged most significantly. Each case was rated by a single worker who shows variance in their ratings and differentiates between responses.'
            : 'Cases where human and LLM scores diverged most significantly (|diff| > 0.3). Click to explore details.'}
        </p>
      </div>

      <div className="space-y-3">
        {displayDisagreements.map((d, i) => {
          const isExpanded = expandedIndex === i;
          const key = `${d.prompt_id}_${d.model_id}`;
          const responseText = loadedResponses[key];
          const isLoading = loadingResponse === key;

          return (
            <div
              key={i}
              className={cn(
                'border border-border rounded-lg overflow-hidden transition-colors',
                isExpanded && 'border-primary/30'
              )}
            >
              {/* Header - always visible */}
              <button
                onClick={() => handleExpand(i, d)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-4">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div className="space-y-1">
                    <div className="font-mono text-xs text-muted-foreground">
                      {d.prompt_id}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium capitalize">
                        {d.criterion.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatModelName(d.model_id)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Human</div>
                    <div className="font-mono text-emerald-500">{(d.human * 100).toFixed(0)}%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">LLM</div>
                    <div className="font-mono text-blue-500">{(d.llm * 100).toFixed(0)}%</div>
                  </div>
                  <div className="text-center min-w-[4rem]">
                    <div className="text-xs text-muted-foreground">Diff</div>
                    <div className={cn(
                      'font-mono font-bold',
                      d.diff > 0.5 ? 'text-red-500' : 'text-amber-500'
                    )}>
                      {d.diff > 0 ? '+' : ''}{(d.diff * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/20 space-y-4">
                  {/* Question/Prompt */}
                  {promptContexts[d.prompt_id] && (
                    <div>
                      <div className="text-xs text-muted-foreground uppercase font-medium mb-2">
                        Question
                      </div>
                      <div className="text-sm bg-background/50 p-3 rounded-lg border border-border/50">
                        <pre className="whitespace-pre-wrap font-sans">{getPromptText(promptContexts[d.prompt_id])}</pre>
                      </div>
                    </div>
                  )}

                  {isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Loading response...
                    </div>
                  ) : responseText ? (
                    <div className="space-y-3">
                      <div className="text-xs text-muted-foreground uppercase font-medium">
                        Model Response
                      </div>
                      <div className="text-sm bg-background/50 p-4 rounded-lg border border-border/50 max-h-64 overflow-y-auto">
                        <ResponseRenderer content={responseText} renderAs="html" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        The human evaluator rated this response significantly
                        {d.human > d.llm ? ' higher ' : ' lower '}
                        than the LLM judges on <span className="capitalize">{d.criterion.replace('_', ' ')}</span>.
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground py-4">
                      Click to load response details.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {disagreements.length > 10 && (
        <div className="text-center text-sm text-muted-foreground">
          Showing top 10 of {disagreements.length} notable disagreements.
        </div>
      )}
    </section>
  );
}
