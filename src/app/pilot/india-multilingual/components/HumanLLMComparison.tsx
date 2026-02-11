'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { HumanRatings } from '@/types/shared';

interface HumanLLMComparisonProps {
  humanRatings: HumanRatings;
  llmCriterionScores: Record<string, number>;
}

const CRITERIA_LABELS: Record<string, string> = {
  fluency: 'Fluency',
  complexity: 'Complexity',
  code_switching: 'Code-switching',
  trust: 'Trust',
};

const CRITERIA_ORDER = ['fluency', 'complexity', 'code_switching', 'trust'];

export function HumanLLMComparison({
  humanRatings,
  llmCriterionScores,
}: HumanLLMComparisonProps) {
  const criteria = CRITERIA_ORDER.filter(
    (c) => humanRatings[c as keyof HumanRatings] !== undefined
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Human Ratings Column */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Human Ratings
          </div>
          <div className="space-y-2">
            {criteria.map((criterion) => {
              const humanValue = humanRatings[criterion as keyof HumanRatings] as number | undefined;
              const llmValue = llmCriterionScores[criterion];
              const diff = humanValue !== undefined && llmValue !== undefined
                ? llmValue - humanValue
                : null;

              return (
                <div key={criterion} className="flex items-center justify-between">
                  <span className="text-sm capitalize">
                    {CRITERIA_LABELS[criterion] || criterion}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-emerald-500">
                      {humanValue !== undefined ? `${Math.round(humanValue * 100)}%` : '—'}
                    </span>
                    {diff !== null && Math.abs(diff) > 0.1 && (
                      <span className={cn(
                        'text-xs font-mono',
                        diff > 0 ? 'text-blue-400' : 'text-amber-400'
                      )}>
                        {diff > 0 ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* LLM Ratings Column */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            LLM Ratings
          </div>
          <div className="space-y-2">
            {criteria.map((criterion) => {
              const llmValue = llmCriterionScores[criterion];
              const humanValue = humanRatings[criterion as keyof HumanRatings] as number | undefined;
              const diff = humanValue !== undefined && llmValue !== undefined
                ? llmValue - humanValue
                : null;

              return (
                <div key={criterion} className="flex items-center justify-between">
                  <span className="text-sm capitalize">
                    {CRITERIA_LABELS[criterion] || criterion}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-blue-500">
                      {llmValue !== undefined ? `${Math.round(llmValue * 100)}%` : '—'}
                    </span>
                    {diff !== null && Math.abs(diff) > 0.3 && (
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded font-mono',
                        diff > 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
                      )}>
                        {diff > 0 ? '+' : ''}{Math.round(diff * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Raw human feedback if available */}
      {humanRatings.raw && Object.keys(humanRatings.raw).length > 0 && (
        <div className="pt-3 border-t border-border/50">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Raw Human Feedback
          </div>
          <div className="space-y-1.5 text-sm">
            {Object.entries(humanRatings.raw).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="text-muted-foreground capitalize whitespace-nowrap">
                  {CRITERIA_LABELS[key] || key}:
                </span>
                <span className="text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
