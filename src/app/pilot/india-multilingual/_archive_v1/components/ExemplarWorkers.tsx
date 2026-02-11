'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, User, Mic } from 'lucide-react';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

export interface WorkerProfile {
  workerId: string;
  comparisons: number;
  opus: number;
  sonnet: number;
  equalGood: number;
  equalBad: number;
  languages: string[];
  domains: string[];
  opusRate: number;
  samples: Array<{
    question: string;
    choice: string;
    language: string;
    domain: string;
  }>;
}

interface ExemplarWorkersProps {
  workers: WorkerProfile[];
}

function WorkerCard({ worker, rank }: { worker: WorkerProfile; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const decided = worker.opus + worker.sonnet;
  const preference = worker.opusRate > 0.6 ? 'Opus' : worker.opusRate < 0.4 ? 'Sonnet' : 'Balanced';

  return (
    <div className={cn(
      "border border-border rounded-lg overflow-hidden transition-all",
      expanded && "border-primary/30"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
            {rank}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">Worker {worker.workerId}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {worker.languages.join(', ')}
              </span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {worker.comparisons} comparisons · {worker.domains.join(' & ')}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className={cn(
                "text-lg font-bold",
                preference === 'Opus' ? 'text-primary' :
                preference === 'Sonnet' ? 'text-amber-500' : 'text-muted-foreground'
              )}>
                {(worker.opusRate * 100).toFixed(0)}% Opus
              </div>
              <div className="text-xs text-muted-foreground">
                {worker.opus} vs {worker.sonnet}
              </div>
            </div>
            {expanded ? (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/20 space-y-4">
          {/* Stats breakdown */}
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="p-3 bg-primary/10 rounded-lg">
              <div className="text-2xl font-bold text-primary">{worker.opus}</div>
              <div className="text-xs text-muted-foreground">Chose Opus</div>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="text-2xl font-bold">{worker.sonnet}</div>
              <div className="text-xs text-muted-foreground">Chose Sonnet</div>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-lg">
              <div className="text-2xl font-bold text-emerald-600">{worker.equalGood}</div>
              <div className="text-xs text-muted-foreground">Equal (good)</div>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg">
              <div className="text-2xl font-bold text-red-500">{worker.equalBad}</div>
              <div className="text-xs text-muted-foreground">Equal (bad)</div>
            </div>
          </div>

          {/* Preference bar */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground uppercase font-medium">
              Preference Distribution (when decided)
            </div>
            <div className="h-4 bg-muted/30 rounded-full overflow-hidden flex">
              <div
                className="bg-primary h-full"
                style={{ width: `${worker.opusRate * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Opus {(worker.opusRate * 100).toFixed(0)}%</span>
              <span>Sonnet {((1 - worker.opusRate) * 100).toFixed(0)}%</span>
            </div>
          </div>

          {/* Sample questions */}
          {worker.samples.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground uppercase font-medium">
                Sample Comparisons
              </div>
              <div className="space-y-2">
                {worker.samples.map((sample, i) => (
                  <div key={i} className="p-3 bg-background/50 rounded-lg border border-border/50">
                    <div className="flex items-start gap-2">
                      <div className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium shrink-0",
                        sample.choice === 'opus' ? 'bg-primary/20 text-primary' :
                        sample.choice === 'sonnet' ? 'bg-amber-500/20 text-amber-600' :
                        'bg-muted text-muted-foreground'
                      )}>
                        {sample.choice === 'opus' ? 'Opus' :
                         sample.choice === 'sonnet' ? 'Sonnet' :
                         sample.choice === 'equal_good' ? 'Equal ✓' : 'Equal ✗'}
                      </div>
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {sample.question}...
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audio note */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
            <Mic className="w-3 h-3" />
            <span>Audio explanations recorded for each comparison (not yet accessible)</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ExemplarWorkers({ workers }: ExemplarWorkersProps) {
  // Filter out workers who made no actual decisions (all "unknown")
  const workersWithDecisions = workers.filter(w => (w.opus + w.sonnet) > 0);

  // Show top 10 workers with decisions, sorted by comparisons
  const displayWorkers = workersWithDecisions.slice(0, 10);

  // Calculate some aggregate stats (only from workers with decisions)
  const strongOpusPreference = workersWithDecisions.filter(w => w.opusRate > 0.7).length;
  const strongSonnetPreference = workersWithDecisions.filter(w => w.opusRate < 0.3).length;
  const balanced = workersWithDecisions.filter(w => w.opusRate >= 0.4 && w.opusRate <= 0.6).length;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold"
          style={headingStyles}
        >
          Exemplar Workers
        </h2>
        <p className="text-muted-foreground">
          Deep dives into individual evaluators who performed the most head-to-head comparisons.
          Each worker saw both Opus and Sonnet responses to the same questions.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-primary/10 rounded-lg text-center">
          <div className="text-2xl font-bold text-primary">{strongOpusPreference}</div>
          <div className="text-sm text-muted-foreground">Strong Opus preference (&gt;70%)</div>
        </div>
        <div className="p-4 bg-muted/30 rounded-lg text-center">
          <div className="text-2xl font-bold">{balanced}</div>
          <div className="text-sm text-muted-foreground">Balanced (40-60%)</div>
        </div>
        <div className="p-4 bg-amber-500/10 rounded-lg text-center">
          <div className="text-2xl font-bold text-amber-600">{strongSonnetPreference}</div>
          <div className="text-sm text-muted-foreground">Strong Sonnet preference (&lt;30%)</div>
        </div>
      </div>

      {/* Worker cards */}
      <div className="space-y-3">
        {displayWorkers.map((worker, i) => (
          <WorkerCard key={worker.workerId} worker={worker} rank={i + 1} />
        ))}
      </div>

      <div className="text-center text-sm text-muted-foreground">
        Showing top {displayWorkers.length} of {workersWithDecisions.length} workers who expressed preferences
        {workers.length !== workersWithDecisions.length && (
          <span className="block text-xs mt-1">
            ({workers.length - workersWithDecisions.length} Bengali workers excluded — all responses marked unknown)
          </span>
        )}
      </div>
    </section>
  );
}
