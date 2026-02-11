'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { LLMCoverageScores } from '@/types/shared';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

interface ModelPerformanceSectionProps {
  llmCoverageScores: LLMCoverageScores;
}

const LANGUAGE_NAMES: Record<string, string> = {
  hi: 'Hindi',
  be: 'Bengali',
  te: 'Telugu',
  ka: 'Kannada',
  ma: 'Malayalam',
  as: 'Assamese',
  mr: 'Marathi',
};

export function ModelPerformanceSection({ llmCoverageScores }: ModelPerformanceSectionProps) {
  // Compute performance data from raw scores
  const data = React.useMemo(() => {
    const entries = Object.entries(llmCoverageScores);

    const getScore = (scores: Record<string, { avgCoverageExtent?: number } | null>, model: string) => {
      const key = Object.keys(scores).find(k => k.includes(model));
      return key && scores[key] ? scores[key]?.avgCoverageExtent ?? 0 : 0;
    };

    // Overall
    let opusSum = 0, sonnetSum = 0, count = 0;
    entries.forEach(([, scores]) => {
      opusSum += getScore(scores, 'opus');
      sonnetSum += getScore(scores, 'sonnet');
      count++;
    });

    // By domain
    const agriEntries = entries.filter(([id]) => id.includes('-agri-'));
    const legaEntries = entries.filter(([id]) => id.includes('-lega-'));

    const avgDomain = (entries: typeof agriEntries, model: string) => {
      if (entries.length === 0) return 0;
      return entries.reduce((sum, [, scores]) => sum + getScore(scores, model), 0) / entries.length;
    };

    // By language
    const langCodes = [...new Set(entries.map(([id]) => id.split('-')[0]))];
    const byLanguage = langCodes.map(code => {
      const langEntries = entries.filter(([id]) => id.startsWith(code + '-'));
      return {
        code,
        name: LANGUAGE_NAMES[code] || code.toUpperCase(),
        opus: langEntries.reduce((sum, [, scores]) => sum + getScore(scores, 'opus'), 0) / langEntries.length,
        sonnet: langEntries.reduce((sum, [, scores]) => sum + getScore(scores, 'sonnet'), 0) / langEntries.length,
      };
    }).sort((a, b) => b.opus - a.opus); // Sort by Opus performance

    return {
      overall: {
        opus: opusSum / count,
        sonnet: sonnetSum / count,
      },
      byDomain: {
        agricultural: { opus: avgDomain(agriEntries, 'opus'), sonnet: avgDomain(agriEntries, 'sonnet') },
        legal: { opus: avgDomain(legaEntries, 'opus'), sonnet: avgDomain(legaEntries, 'sonnet') },
      },
      byLanguage,
    };
  }, [llmCoverageScores]);

  const ScoreBar = ({ value, color, label }: { value: number; color: string; label: string }) => (
    <div className="flex items-center gap-2">
      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-sm font-mono min-w-[3rem] text-right">
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  );

  const opusBetter = data.overall.opus > data.overall.sonnet;
  const diff = Math.abs(data.overall.opus - data.overall.sonnet) * 100;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold"
          style={headingStyles}
        >
          Model Performance
        </h2>
        <p className="text-muted-foreground">
          Comparing Claude Opus 4.5 and Claude Sonnet 4.5 across languages and domains.
        </p>
      </div>

      {/* Overall comparison */}
      <div className="p-6 bg-muted/30 dark:bg-slate-900/40 rounded-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={headingStyles}>Overall Performance</h3>
          <span className="text-sm text-muted-foreground">
            {opusBetter ? 'Opus' : 'Sonnet'} leads by {diff.toFixed(1)}%
          </span>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Claude Opus 4.5</span>
            </div>
            <ScoreBar value={data.overall.opus} color="bg-violet-500" label="Opus" />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Claude Sonnet 4.5</span>
            </div>
            <ScoreBar value={data.overall.sonnet} color="bg-sky-500" label="Sonnet" />
          </div>
        </div>
      </div>

      {/* Domain comparison */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-5 bg-muted/30 dark:bg-slate-900/40 rounded-lg space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <span className="text-lg">🌾</span> Agricultural Domain
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Opus 4.5</span>
              <span className="font-mono text-violet-500">{(data.byDomain.agricultural.opus * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Sonnet 4.5</span>
              <span className="font-mono text-sky-500">{(data.byDomain.agricultural.sonnet * 100).toFixed(1)}%</span>
            </div>
          </div>
          {data.byDomain.agricultural.opus > data.byDomain.agricultural.sonnet && (
            <div className="text-xs text-violet-500">
              Opus +{((data.byDomain.agricultural.opus - data.byDomain.agricultural.sonnet) * 100).toFixed(1)}%
            </div>
          )}
        </div>

        <div className="p-5 bg-muted/30 dark:bg-slate-900/40 rounded-lg space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <span className="text-lg">⚖️</span> Legal Domain
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Opus 4.5</span>
              <span className="font-mono text-violet-500">{(data.byDomain.legal.opus * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Sonnet 4.5</span>
              <span className="font-mono text-sky-500">{(data.byDomain.legal.sonnet * 100).toFixed(1)}%</span>
            </div>
          </div>
          {Math.abs(data.byDomain.legal.opus - data.byDomain.legal.sonnet) < 0.02 && (
            <div className="text-xs text-muted-foreground">
              Near parity
            </div>
          )}
        </div>
      </div>

      {/* By language */}
      <div className="space-y-4">
        <h3 className="font-semibold" style={headingStyles}>Performance by Language</h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 dark:bg-slate-900/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Language</th>
                <th className="text-center px-4 py-3 font-medium">
                  <span className="text-violet-500">Opus 4.5</span>
                </th>
                <th className="text-center px-4 py-3 font-medium">
                  <span className="text-sky-500">Sonnet 4.5</span>
                </th>
                <th className="text-center px-4 py-3 font-medium">Winner</th>
              </tr>
            </thead>
            <tbody>
              {data.byLanguage.map((lang) => {
                const diff = lang.opus - lang.sonnet;
                const winner = Math.abs(diff) < 0.02 ? 'tie' : diff > 0 ? 'opus' : 'sonnet';

                return (
                  <tr key={lang.code} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{lang.name}</td>
                    <td className="px-4 py-3 text-center font-mono text-violet-500">
                      {(lang.opus * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-sky-500">
                      {(lang.sonnet * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      {winner === 'tie' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : winner === 'opus' ? (
                        <span className="text-violet-500 font-medium">
                          Opus +{(Math.abs(diff) * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-sky-500 font-medium">
                          Sonnet +{(Math.abs(diff) * 100).toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insight callout */}
      <div className="p-4 bg-gradient-to-r from-violet-500/10 to-sky-500/10 border border-violet-500/20 rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Key insight:</strong> While Opus leads overall,
          performance varies significantly by language. Sonnet outperforms in Hindi,
          while Opus shows stronger results in Bengali and Kannada. Both models
          perform similarly on legal content but diverge on agricultural guidance.
        </p>
      </div>
    </section>
  );
}
