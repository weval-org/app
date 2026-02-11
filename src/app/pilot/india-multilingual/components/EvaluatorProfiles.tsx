'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, User } from 'lucide-react';
import type { ComparativeResults } from '../V2Client';

interface Profile {
  title: string;
  subtitle: string;
  worker: ComparativeResults['topWorkers'][0];
}

interface EvaluatorProfilesProps {
  profiles: Profile[];
  inline?: boolean;
}

export function EvaluatorProfiles({ profiles, inline = false }: EvaluatorProfilesProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (profiles.length === 0) {
    return null;
  }

  const profileCards = (
    <div className="space-y-3 sm:space-y-4">
      {profiles.map((profile, index) => {
        const worker = profile.worker;
        const isExpanded = expandedIndex === index;
        const decided = worker.opus + worker.sonnet;
        const panelId = `evaluator-panel-${index}`;

        return (
          <div
            key={worker.workerId}
            className={cn(
              "border rounded-xl overflow-hidden transition-all",
              isExpanded ? "border-primary/30" : "border-border"
            )}
          >
            <button
              onClick={() => setExpandedIndex(isExpanded ? null : index)}
              className="w-full p-4 sm:p-5 text-left hover:bg-muted/30 transition-colors"
              aria-expanded={isExpanded}
              aria-controls={panelId}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-base sm:text-lg">{profile.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {worker.languages.join(', ')}
                    </span>
                  </div>
                  <p className="text-sm sm:text-base text-muted-foreground mt-1">{profile.subtitle}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    Worker #{worker.workerId} · {worker.comparisons} comparisons
                  </p>
                </div>

                <div className="flex-shrink-0" aria-hidden="true">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </button>

            {isExpanded && (
              <div id={panelId} className="px-4 sm:px-5 pb-4 sm:pb-5 pt-2 border-t border-border bg-muted/10">
                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
                  <div className="text-center p-2 sm:p-3 bg-primary/10 rounded-lg">
                    <div className="text-lg sm:text-xl font-bold text-primary">{worker.opus}</div>
                    <div className="text-xs text-muted-foreground">Chose Opus</div>
                  </div>
                  <div className="text-center p-2 sm:p-3 bg-amber-500/10 rounded-lg">
                    <div className="text-lg sm:text-xl font-bold text-amber-600">{worker.sonnet}</div>
                    <div className="text-xs text-muted-foreground">Chose Sonnet</div>
                  </div>
                  <div className="text-center p-2 sm:p-3 bg-emerald-500/10 rounded-lg">
                    <div className="text-lg sm:text-xl font-bold text-emerald-600">{worker.equalGood}</div>
                    <div className="text-xs text-muted-foreground">Equal (good)</div>
                  </div>
                  <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-lg">
                    <div className="text-lg sm:text-xl font-bold">{worker.equalBad}</div>
                    <div className="text-xs text-muted-foreground">Equal (bad)</div>
                  </div>
                </div>

                {/* Preference bar */}
                {decided > 0 && (
                  <div className="mb-4 sm:mb-6">
                    <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
                      Preference when decided
                    </div>
                    <div
                      className="h-3 bg-muted/30 rounded-full overflow-hidden flex"
                      role="meter"
                      aria-label={`Opus preference: ${Math.round(worker.opusRate * 100)}%`}
                      aria-valuenow={Math.round(worker.opusRate * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="bg-primary h-full"
                        style={{ width: `${worker.opusRate * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Opus {Math.round(worker.opusRate * 100)}%</span>
                      <span>Sonnet {Math.round((1 - worker.opusRate) * 100)}%</span>
                    </div>
                  </div>
                )}

                {/* Sample comparisons */}
                {worker.samples.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
                      Sample comparisons
                    </div>
                    <div className="space-y-2">
                      {worker.samples.slice(0, 3).map((sample, i) => (
                        <div key={i} className="p-2 sm:p-3 bg-background rounded-lg border border-border/50 text-sm">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded",
                              sample.choice === 'opus' ? "bg-primary/20 text-primary" :
                                sample.choice === 'sonnet' ? "bg-amber-500/20 text-amber-600" :
                                  "bg-muted text-muted-foreground"
                            )}>
                              {sample.choice === 'opus' ? 'Opus' :
                                sample.choice === 'sonnet' ? 'Sonnet' :
                                  sample.choice === 'equal_good' ? 'Equal ✓' : 'Equal ✗'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {sample.language} · {sample.domain}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{sample.question}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // If inline, just return the cards without section wrapper
  if (inline) {
    return profileCards;
  }

  // Full section with header
  return (
    <section className="py-16 sm:py-24" aria-labelledby="evaluators-title">
      <h2
        id="evaluators-title"
        className="text-2xl sm:text-3xl font-semibold text-foreground mb-4"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        The Evaluators
      </h2>

      <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8">
        125 native speakers participated. Here are some notable patterns we observed.
      </p>

      {profileCards}
    </section>
  );
}
