'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface LanguageData {
  language: string;
  decided: number;
  opusRate: number;
  equalGood: number;
}

interface LanguageBreakdownProps {
  data: LanguageData[];
}

export function LanguageBreakdown({ data }: LanguageBreakdownProps) {
  return (
    <section className="py-16 sm:py-24" aria-labelledby="language-title">
      <h2
        id="language-title"
        className="text-2xl sm:text-3xl font-semibold text-foreground mb-4"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        By Language
      </h2>

      <p className="text-base sm:text-lg text-muted-foreground mb-6">
        Opus was preferred across all 7 languages, but the margin varied significantly.
      </p>

      {/* Legend - moved to top for clarity */}
      <div className="flex items-center gap-6 sm:gap-8 mb-6 sm:mb-8 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-primary/80" />
          <span className="font-medium">Opus 4.5</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-500/80" />
          <span className="font-medium">Sonnet 4.5</span>
        </div>
      </div>

      <div className="space-y-4 sm:space-y-6" role="list" aria-label="Preference by language">
        {data.map((item) => {
          const opusPercent = Math.round(item.opusRate * 100);
          const sonnetPercent = 100 - opusPercent;
          const lead = opusPercent - 50;

          return (
            <div key={item.language} className="space-y-2" role="listitem">
              {/* Language label and stats */}
              <div className="flex items-baseline justify-between flex-wrap gap-1">
                <div className="flex items-baseline gap-2 sm:gap-3">
                  <span className="font-medium text-base sm:text-lg">{item.language}</span>
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {item.decided.toLocaleString()} comparisons
                  </span>
                </div>
                <span className={cn(
                  "font-mono text-xs sm:text-sm",
                  lead > 15 ? "text-primary font-medium" : "text-muted-foreground"
                )}>
                  +{lead}pp
                </span>
              </div>

              {/* Bar - shows full width with Opus and Sonnet proportions */}
              <div
                className="relative h-10 sm:h-12 bg-muted/20 rounded-lg overflow-hidden flex"
                role="meter"
                aria-label={`${item.language}: ${opusPercent}% Opus, ${sonnetPercent}% Sonnet`}
                aria-valuenow={opusPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                {/* Opus portion */}
                <div
                  className="bg-primary/80 flex items-center justify-end pr-2 sm:pr-3 gap-1.5"
                  style={{ width: `${opusPercent}%` }}
                >
                  {opusPercent > 35 && (
                    <span className="text-xs font-medium text-primary-foreground/70 hidden sm:inline">Opus</span>
                  )}
                  {opusPercent > 18 && (
                    <span className="text-xs sm:text-sm font-medium text-primary-foreground">
                      {opusPercent}%
                    </span>
                  )}
                </div>
                {/* Sonnet portion */}
                <div
                  className="bg-amber-500/80 flex items-center justify-start pl-2 sm:pl-3 gap-1.5"
                  style={{ width: `${sonnetPercent}%` }}
                >
                  {sonnetPercent > 18 && (
                    <span className="text-xs sm:text-sm font-medium text-white">
                      {sonnetPercent}%
                    </span>
                  )}
                  {sonnetPercent > 35 && (
                    <span className="text-xs font-medium text-white/70 hidden sm:inline">Sonnet</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Insight */}
      <div className="mt-8 p-4 bg-muted/30 border border-border rounded-lg">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Key insight: </span>
          Hindi speakers showed the strongest Opus preference (+{Math.round((data[0]?.opusRate || 0.5) * 100 - 50)}pp).
          Kannada was closest to even (+{Math.round((data[data.length - 1]?.opusRate || 0.5) * 100 - 50)}pp).
        </p>
      </div>
    </section>
  );
}
