'use client';

import React from 'react';
import { cn } from '@/lib/utils';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

export interface ComparativeResults {
  totalComparisons: number;
  totalWorkers: number;
  opusWinRate: number;
  overall: {
    opus: number;
    sonnet: number;
    equal_good: number;
    equal_bad: number;
    unknown: number;
  };
  byLanguage: Record<string, {
    opus: number;
    sonnet: number;
    equal_good: number;
    equal_bad: number;
    total: number;
  }>;
  byDomain: Record<string, {
    opus: number;
    sonnet: number;
    total: number;
  }>;
}

interface HeadToHeadResultsProps {
  data: ComparativeResults;
}

export function HeadToHeadResults({ data }: HeadToHeadResultsProps) {
  const { overall, byLanguage, opusWinRate } = data;
  const decided = overall.opus + overall.sonnet;

  // Sort languages by Opus lead, filtering out languages with no decisions
  const languageStats = Object.entries(byLanguage)
    .map(([lang, stats]) => {
      const langDecided = (stats.opus || 0) + (stats.sonnet || 0);
      const opusRate = langDecided > 0 ? (stats.opus || 0) / langDecided : null;
      return {
        language: lang,
        opusRate,
        opusLead: opusRate !== null ? (opusRate - 0.5) * 100 : null,
        decided: langDecided,
        total: stats.total,
        unknown: (stats as any).unknown || 0,
      };
    })
    .filter(s => s.decided > 0) // Only show languages with actual decisions
    .sort((a, b) => (b.opusLead || 0) - (a.opusLead || 0));

  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold"
          style={headingStyles}
        >
          Head-to-Head Results
        </h2>
        <p className="text-muted-foreground">
          {data.totalComparisons.toLocaleString()} direct comparisons where native speakers chose between
          Opus and Sonnet responses to the same question.
        </p>
      </div>

      {/* Main Result */}
      <div className="p-8 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 rounded-2xl border border-primary/20">
        <div className="text-center space-y-4">
          <div className="text-sm uppercase tracking-wide text-muted-foreground">
            When native speakers expressed a preference
          </div>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <div className="text-5xl font-bold text-primary">
                {(opusWinRate * 100).toFixed(1)}%
              </div>
              <div className="text-lg font-medium mt-1">Opus 4.5</div>
            </div>
            <div className="text-3xl text-muted-foreground">vs</div>
            <div className="text-center">
              <div className="text-5xl font-bold text-muted-foreground">
                {((1 - opusWinRate) * 100).toFixed(1)}%
              </div>
              <div className="text-lg font-medium mt-1">Sonnet 4.5</div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground pt-2">
            Based on {decided.toLocaleString()} decided comparisons
            ({overall.equal_good.toLocaleString()} rated equally good, {overall.equal_bad.toLocaleString()} equally bad)
          </div>
        </div>
      </div>

      {/* By Language */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold" style={headingStyles}>
          By Language
        </h3>
        <div className="space-y-3">
          {languageStats.map(({ language, opusRate, opusLead, decided }) => {
            // Skip rendering if no decisions (shouldn't happen after filter, but safe)
            if (opusRate === null || opusLead === null) return null;
            return (
              <div key={language} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{language}</span>
                  <span className="text-muted-foreground">
                    {decided.toLocaleString()} comparisons
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {/* Bar */}
                  <div className="flex-1 h-8 bg-muted/30 rounded-lg overflow-hidden flex">
                    <div
                      className="bg-primary/80 flex items-center justify-end pr-2"
                      style={{ width: `${opusRate * 100}%` }}
                    >
                      {opusRate > 0.3 && (
                        <span className="text-xs font-medium text-primary-foreground">
                          {(opusRate * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div
                      className="bg-muted/50 flex items-center justify-start pl-2"
                      style={{ width: `${(1 - opusRate) * 100}%` }}
                    >
                      {(1 - opusRate) > 0.3 && (
                        <span className="text-xs font-medium text-muted-foreground">
                          {((1 - opusRate) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Lead indicator */}
                  <div className={cn(
                    "w-20 text-right text-sm font-mono",
                    opusLead > 10 ? "text-primary" : "text-muted-foreground"
                  )}>
                    {opusLead > 0 ? '+' : ''}{opusLead.toFixed(0)}pp
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-xs text-muted-foreground pt-2">
          pp = percentage points lead over 50/50. Bengali excluded (all responses marked as unknown).
        </div>
      </div>

      {/* Key Insight */}
      {languageStats.length >= 2 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="flex gap-3">
            <div className="text-amber-500 text-lg">💡</div>
            <div className="space-y-1">
              <div className="font-medium text-amber-700 dark:text-amber-400">
                {languageStats[0].language} shows strongest Opus preference
              </div>
              <div className="text-sm text-muted-foreground">
                With a +{languageStats[0].opusLead?.toFixed(0)}pp lead, {languageStats[0].language} speakers showed the clearest
                preference for Opus responses. {languageStats[languageStats.length - 1].language} showed the smallest gap at +{languageStats[languageStats.length - 1].opusLead?.toFixed(0)}pp.
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
