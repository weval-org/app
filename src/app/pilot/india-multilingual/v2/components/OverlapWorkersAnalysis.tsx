'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, User, AlertTriangle } from 'lucide-react';

interface WorkerData {
  workerId: string;
  languages: string[];
  ab: {
    opus: number;
    sonnet: number;
    equalGood: number;
    total: number;
    opusRate: number;
  };
  rubric: {
    opus: { trust: number; fluency: number; complexity: number; code_switching: number };
    sonnet: { trust: number; fluency: number; complexity: number; code_switching: number };
    opusOverall: number;
    sonnetOverall: number;
    count: number;
  };
  isParadox: boolean;
}

interface OverlapData {
  summary: {
    totalWorkers: number;
    paradoxicalCount: number;
    consistentCount: number;
    abOpusRate: number;
    rubricOpusAvg: number;
    rubricSonnetAvg: number;
  };
  workers: WorkerData[];
  featuredCase: WorkerData;
}

interface OverlapWorkersAnalysisProps {
  data: OverlapData;
}

export function OverlapWorkersAnalysis({ data }: OverlapWorkersAnalysisProps) {
  const [showAllWorkers, setShowAllWorkers] = useState(false);
  const { summary, workers, featuredCase } = data;

  const criteria = ['trust', 'fluency', 'complexity', 'code_switching'] as const;
  const criteriaLabels: Record<string, string> = {
    trust: 'Trust',
    fluency: 'Fluency',
    complexity: 'Complexity',
    code_switching: 'Code-Switch'
  };

  return (
    <section className="py-16 sm:py-24 border-t border-border" aria-labelledby="overlap-title">
      {/* Section header */}
      <div className="mb-8 sm:mb-12">
        <div className="text-xs sm:text-sm uppercase tracking-wide text-primary mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Deep Dive
        </div>
        <h2
          id="overlap-title"
          className="text-2xl sm:text-3xl font-semibold text-foreground mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          The Same Workers, Two Different Answers
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground">
          {summary.totalWorkers} workers completed <em>both</em> tasks: A/B comparisons and individual rubric ratings.
          Their data reveals the paradox at the individual level.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <div className="bg-primary/10 rounded-xl p-4 sm:p-6 text-center">
          <div className="text-3xl sm:text-4xl font-bold text-primary">
            {Math.round(summary.abOpusRate * 100)}%
          </div>
          <div className="text-sm text-muted-foreground mt-1">chose Opus in A/B</div>
        </div>
        <div className="bg-amber-500/10 rounded-xl p-4 sm:p-6 text-center">
          <div className="text-3xl sm:text-4xl font-bold text-amber-600">
            {Math.round(summary.rubricSonnetAvg * 100)}%
          </div>
          <div className="text-sm text-muted-foreground mt-1">Sonnet rubric score</div>
          <div className="text-xs text-muted-foreground">(vs {Math.round(summary.rubricOpusAvg * 100)}% Opus)</div>
        </div>
        <div className="bg-purple-500/10 rounded-xl p-4 sm:p-6 text-center">
          <div className="text-3xl sm:text-4xl font-bold text-purple-600">
            {summary.paradoxicalCount}/{summary.totalWorkers}
          </div>
          <div className="text-sm text-muted-foreground mt-1">show the paradox</div>
          <div className="text-xs text-muted-foreground">({Math.round(summary.paradoxicalCount / summary.totalWorkers * 100)}%)</div>
        </div>
      </div>

      {/* Featured case study */}
      <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-6 sm:p-8 mb-10">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Case Study: Worker #{featuredCase.workerId}</h3>
            <p className="text-sm text-muted-foreground">{featuredCase.languages.join(', ')} speaker · {featuredCase.ab.total} A/B comparisons · {featuredCase.rubric.count} rubric ratings</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* A/B results */}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              A/B Comparison Results
            </div>
            <div className="bg-background/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium">Chose Opus</span>
                <span className="text-2xl font-bold text-primary">{Math.round(featuredCase.ab.opusRate * 100)}%</span>
              </div>
              <div className="h-3 bg-muted/50 rounded-full overflow-hidden flex">
                <div
                  className="bg-primary h-full"
                  style={{ width: `${featuredCase.ab.opusRate * 100}%` }}
                />
                <div
                  className="bg-amber-500 h-full"
                  style={{ width: `${(1 - featuredCase.ab.opusRate) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>Opus: {featuredCase.ab.opus}</span>
                <span>Sonnet: {featuredCase.ab.sonnet}</span>
              </div>
            </div>
          </div>

          {/* Rubric results */}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Individual Rubric Ratings
            </div>
            <div className="bg-background/50 rounded-lg p-4 space-y-2">
              {criteria.map((c) => {
                const opusScore = featuredCase.rubric.opus[c] * 100;
                const sonnetScore = featuredCase.rubric.sonnet[c] * 100;
                const diff = opusScore - sonnetScore;
                return (
                  <div key={c} className="flex items-center gap-2">
                    <span className="text-xs w-20 text-muted-foreground">{criteriaLabels[c]}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-mono w-10 text-right",
                        diff > 0 ? "text-primary" : "text-muted-foreground"
                      )}>
                        {opusScore.toFixed(0)}%
                      </span>
                      <div className="flex-1 h-1.5 bg-muted/30 rounded relative">
                        <div
                          className="absolute left-0 top-0 h-full bg-primary/60 rounded"
                          style={{ width: `${opusScore}%` }}
                        />
                        <div
                          className="absolute left-0 top-0 h-full bg-amber-500/60 rounded"
                          style={{ width: `${sonnetScore}%`, opacity: 0.7 }}
                        />
                      </div>
                      <span className={cn(
                        "text-xs font-mono w-10",
                        diff < 0 ? "text-amber-600" : "text-muted-foreground"
                      )}>
                        {sonnetScore.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* The paradox callout */}
        <div className="mt-6 p-4 bg-background/80 rounded-lg border border-purple-500/20">
          <p className="text-sm">
            <strong className="text-purple-600">The paradox:</strong> This worker chose Opus {Math.round(featuredCase.ab.opusRate * 100)}%
            of the time in direct comparisons, yet rated Sonnet <strong>{Math.round(featuredCase.rubric.sonnet.fluency * 100 - featuredCase.rubric.opus.fluency * 100)} points higher</strong> on
            fluency and <strong>{Math.round(featuredCase.rubric.sonnet.trust * 100 - featuredCase.rubric.opus.trust * 100)} points higher</strong> on
            trust when evaluating individually.
          </p>
        </div>
      </div>

      {/* Visualization: All overlap workers */}
      <div className="mb-8">
        <h3 className="font-semibold text-base sm:text-lg mb-4">All {summary.totalWorkers} Overlap Workers</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Each row shows one worker. Left side: A/B preference. Right side: rubric score difference.
          <span className="text-purple-600 font-medium"> Purple rows</span> show the paradox.
        </p>

        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-2 pb-2 border-b border-border">
            <div className="col-span-2">Worker</div>
            <div className="col-span-5 text-center">A/B Preference</div>
            <div className="col-span-5 text-center">Rubric Scores</div>
          </div>

          {(showAllWorkers ? workers : workers.slice(0, 8)).map((worker) => {
            const rubricDiff = worker.rubric.opusOverall - worker.rubric.sonnetOverall;
            return (
              <div
                key={worker.workerId}
                className={cn(
                  "grid grid-cols-12 gap-2 items-center py-2 px-2 rounded text-sm",
                  worker.isParadox ? "bg-purple-500/10" : "bg-muted/20"
                )}
              >
                {/* Worker ID */}
                <div className="col-span-2 text-xs text-muted-foreground font-mono">
                  #{worker.workerId.slice(0, 5)}
                </div>

                {/* A/B preference bar */}
                <div className="col-span-5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden flex">
                      <div
                        className="bg-primary h-full"
                        style={{ width: `${worker.ab.opusRate * 100}%` }}
                      />
                      <div
                        className="bg-amber-500 h-full"
                        style={{ width: `${(1 - worker.ab.opusRate) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-8 text-right">
                      {Math.round(worker.ab.opusRate * 100)}%
                    </span>
                  </div>
                </div>

                {/* Rubric difference bar (centered at 0) */}
                <div className="col-span-5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden relative">
                      {/* Center line */}
                      <div className="absolute left-1/2 top-0 w-px h-full bg-border" />
                      {/* Difference bar */}
                      {rubricDiff > 0 ? (
                        <div
                          className="absolute left-1/2 top-0 h-full bg-primary"
                          style={{ width: `${Math.abs(rubricDiff) * 50}%` }}
                        />
                      ) : (
                        <div
                          className="absolute right-1/2 top-0 h-full bg-amber-500"
                          style={{ width: `${Math.abs(rubricDiff) * 50}%` }}
                        />
                      )}
                    </div>
                    <span className={cn(
                      "text-xs font-mono w-10 text-right",
                      rubricDiff > 0 ? "text-primary" : "text-amber-600"
                    )}>
                      {rubricDiff > 0 ? '+' : ''}{(rubricDiff * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {workers.length > 8 && (
          <button
            onClick={() => setShowAllWorkers(!showAllWorkers)}
            className="mt-3 text-sm text-primary hover:underline flex items-center gap-1"
          >
            {showAllWorkers ? (
              <>
                <ChevronDown className="w-4 h-4" />
                Show fewer
              </>
            ) : (
              <>
                <ChevronRight className="w-4 h-4" />
                Show all {workers.length} workers
              </>
            )}
          </button>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-primary" />
            <span>Opus</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-amber-500" />
            <span>Sonnet</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-purple-500/30" />
            <span>Paradoxical worker</span>
          </div>
        </div>
      </div>

      {/* Interpretation */}
      <div className="bg-muted/30 rounded-xl p-6 border border-border">
        <h3 className="font-semibold mb-3">What This Means</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Comparative judgment activates different criteria than absolute judgment.</strong> When
            workers see both responses side-by-side, they pick Opus. When rating each response alone on specific criteria,
            they give Sonnet slightly higher scores.
          </p>
          <p>
            This suggests Opus may excel at qualities not captured by trust, fluency, complexity, or code-switching — perhaps
            <strong className="text-foreground"> confidence, completeness, or cultural resonance</strong> that only becomes
            apparent in direct comparison.
          </p>
          <p>
            This is a well-documented phenomenon in psychology: <em>comparative</em> and <em>absolute</em> judgments can yield
            systematically different results, even from the same person evaluating the same items.
          </p>
        </div>
      </div>
    </section>
  );
}
