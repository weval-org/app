'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CriterionScores {
  trust: number;
  fluency: number;
  complexity: number;
  code_switching: number;
}

interface RubricOverviewProps {
  opus: CriterionScores;
  sonnet: CriterionScores;
  totalRatings: number;
  byLanguage: Record<string, {
    opus: CriterionScores;
    sonnet: CriterionScores;
    count: number;
  }>;
}

const criteriaInfo = [
  {
    key: 'trust' as const,
    label: 'Trust',
    question: 'Do you trust this response?',
    description: 'Whether the worker believes the information is accurate and reliable.',
  },
  {
    key: 'fluency' as const,
    label: 'Fluency',
    question: 'Does the language flow naturally?',
    description: 'How natural and readable the response sounds to a native speaker.',
  },
  {
    key: 'complexity' as const,
    label: 'Complexity',
    question: 'Is the language appropriately simple?',
    description: 'Whether the vocabulary and sentence structure match the question\'s needs.',
  },
  {
    key: 'code_switching' as const,
    label: 'Code-Switching',
    question: 'Is the English mixing appropriate?',
    description: 'Whether borrowed English terms help or hurt understanding.',
  },
];

export function RubricOverview({ opus, sonnet, totalRatings, byLanguage }: RubricOverviewProps) {
  const languageOrder = ['Hindi', 'Bengali', 'Telugu', 'Kannada', 'Malayalam', 'Assamese', 'Marathi'];

  return (
    <section className="py-16 sm:py-24 border-t border-border" aria-labelledby="rubric-title">
      {/* Section header */}
      <div className="mb-8 sm:mb-12">
        <div className="text-xs sm:text-sm uppercase tracking-wide text-muted-foreground mb-2">
          Part 2: Rubric-Based Ratings
        </div>
        <h2
          id="rubric-title"
          className="text-2xl sm:text-3xl font-semibold text-foreground mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Beyond Preferences: Measuring Quality
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground">
          In addition to A/B comparisons, workers rated each response on four specific criteria.
          Here&apos;s how Opus and Sonnet scored across {totalRatings.toLocaleString()} ratings.
        </p>
      </div>

      {/* Criterion cards */}
      <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 mb-10">
        {criteriaInfo.map((criterion) => {
          const opusScore = opus[criterion.key];
          const sonnetScore = sonnet[criterion.key];
          const diff = opusScore - sonnetScore;
          const winner = Math.abs(diff) < 0.01 ? 'tie' : diff > 0 ? 'opus' : 'sonnet';

          return (
            <div
              key={criterion.key}
              className="bg-muted/30 rounded-xl p-4 sm:p-6 border border-border"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-base sm:text-lg">{criterion.label}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    {criterion.question}
                  </p>
                </div>
                {winner !== 'tie' && (
                  <span className={cn(
                    "text-xs px-2 py-1 rounded-full",
                    winner === 'opus' ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-600"
                  )}>
                    {winner === 'opus' ? 'Opus' : 'Sonnet'} +{Math.abs(diff * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              {/* Score comparison */}
              <div className="space-y-2">
                {/* Opus bar */}
                <div className="flex items-center gap-3">
                  <span className="text-xs w-14 text-muted-foreground">Opus</span>
                  <div className="flex-1 h-6 bg-muted/50 rounded overflow-hidden">
                    <div
                      className="h-full bg-primary/80 flex items-center justify-end pr-2"
                      style={{ width: `${opusScore * 100}%` }}
                    >
                      <span className="text-xs font-medium text-primary-foreground">
                        {Math.round(opusScore * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
                {/* Sonnet bar */}
                <div className="flex items-center gap-3">
                  <span className="text-xs w-14 text-muted-foreground">Sonnet</span>
                  <div className="flex-1 h-6 bg-muted/50 rounded overflow-hidden">
                    <div
                      className="h-full bg-amber-500/80 flex items-center justify-end pr-2"
                      style={{ width: `${sonnetScore * 100}%` }}
                    >
                      <span className="text-xs font-medium text-white">
                        {Math.round(sonnetScore * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* The paradox callout */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 sm:p-6 mb-10">
        <h3 className="font-semibold text-base sm:text-lg mb-2">
          The Paradox
        </h3>
        <p className="text-sm sm:text-base text-muted-foreground">
          Workers preferred Opus 63% of the time in head-to-head comparisons, yet Sonnet scores
          slightly higher on individual criteria. This suggests preference isn&apos;t just about
          measurable quality — it may reflect harder-to-quantify factors like tone, confidence,
          or cultural resonance.
        </p>
      </div>

      {/* By language breakdown */}
      <div>
        <h3 className="font-semibold text-base sm:text-lg mb-3">Scores by Language</h3>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 mb-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-primary font-medium">Opus 4.5</span>
            <span className="text-muted-foreground">vs</span>
            <span className="text-amber-600 font-medium">Sonnet 4.5</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary" /> Opus higher
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> Sonnet higher
            </span>
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 pr-4 font-medium text-muted-foreground">Language</th>
                {criteriaInfo.map((c) => (
                  <th key={c.key} className="text-center py-3 px-3 font-medium text-muted-foreground whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {languageOrder
                .filter((lang) => byLanguage[lang])
                .map((lang) => {
                  const data = byLanguage[lang];
                  return (
                    <tr key={lang} className="border-b border-border/50">
                      <td className="py-4 pr-4 font-medium whitespace-nowrap">{lang}</td>
                      {criteriaInfo.map((c) => {
                        const o = data.opus[c.key];
                        const s = data.sonnet[c.key];
                        const diff = o - s;
                        return (
                          <td key={c.key} className="py-4 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span className={cn(
                                "inline-block w-2.5 h-2.5 rounded-full flex-shrink-0",
                                diff > 0.02 ? "bg-primary" : diff < -0.02 ? "bg-amber-500" : "bg-muted-foreground"
                              )} />
                              <span className="whitespace-nowrap">
                                <span className="text-xs sm:text-sm text-primary">{Math.round(o * 100)}</span>
                                <span className="text-xs text-muted-foreground mx-0.5">/</span>
                                <span className="text-xs sm:text-sm text-amber-600">{Math.round(s * 100)}</span>
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
