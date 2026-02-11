'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ConversationMessage, CoverageResult } from '@/types/shared';
import { getLanguageLabel, getDomainLabel } from './FilterBar';
import { PromptDetails } from './PromptDetails';

interface PromptRowProps {
  promptId: string;
  language: string;
  domain: string;
  modelId: string;
  humanScore: number | null;
  llmScore: number | null;
  promptContext: string | ConversationMessage[];
  coverage: CoverageResult;
  configId: string;
  runLabel: string;
  timestamp: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export function PromptRow({
  promptId,
  language,
  domain,
  modelId,
  humanScore,
  llmScore,
  promptContext,
  coverage,
  configId,
  runLabel,
  timestamp,
  isExpanded,
  onToggle,
}: PromptRowProps) {
  const diff = humanScore !== null && llmScore !== null
    ? llmScore - humanScore
    : null;

  const formatModelName = (id: string) => {
    const name = id.split('/').pop() || id;
    return name.replace(/\[temp:\d+\.?\d*\]/, '').trim();
  };

  return (
    <div
      className={cn(
        'border border-border rounded-lg overflow-hidden transition-colors',
        isExpanded && 'border-primary/30'
      )}
    >
      {/* Header row - clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          <div className="space-y-1 min-w-0">
            <div className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
              {promptId}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs">
                {getLanguageLabel(language)}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-xs">
                {getDomainLabel(domain)}
              </span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {formatModelName(modelId)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
          <div className="text-center">
            <div className="text-xs text-muted-foreground hidden sm:block">Human</div>
            <div className="font-mono text-sm text-emerald-500">
              {humanScore !== null ? `${Math.round(humanScore * 100)}%` : '—'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground hidden sm:block">LLM</div>
            <div className="font-mono text-sm text-blue-500">
              {llmScore !== null ? `${Math.round(llmScore * 100)}%` : '—'}
            </div>
          </div>
          <div className="text-center min-w-[3rem]">
            <div className="text-xs text-muted-foreground hidden sm:block">Diff</div>
            <div
              className={cn(
                'font-mono text-sm font-medium',
                diff !== null && Math.abs(diff) > 0.3
                  ? 'text-red-500'
                  : diff !== null && Math.abs(diff) > 0.15
                  ? 'text-amber-500'
                  : 'text-muted-foreground'
              )}
            >
              {diff !== null
                ? `${diff >= 0 ? '+' : ''}${Math.round(diff * 100)}%`
                : '—'}
            </div>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/20">
          <PromptDetails
            promptId={promptId}
            modelId={modelId}
            promptContext={promptContext}
            configId={configId}
            runLabel={runLabel}
            timestamp={timestamp}
            preloadedCoverage={coverage}
          />
        </div>
      )}
    </div>
  );
}
