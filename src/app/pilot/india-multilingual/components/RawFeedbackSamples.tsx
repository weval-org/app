'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';

interface RawSample {
  prompt_id: string;
  language: string;
  model: string;
  scores: {
    trust: number | null;
    fluency: number | null;
    complexity: number | null;
    code_switching: number | null;
  };
  raw: {
    trust?: string;
    fluency?: string;
    complexity?: string;
    code_switching?: string;
    content_errors?: string;
  };
  worker_tier: string;
}

interface RawFeedbackSamplesProps {
  samples: RawSample[];
}

// Clean up the JSON array notation from raw feedback
function cleanFeedback(raw: string | undefined): string | null {
  if (!raw) return null;
  // Remove ["..."] wrapper
  let cleaned = raw.trim();
  if (cleaned.startsWith('["') && cleaned.endsWith('"]')) {
    cleaned = cleaned.slice(2, -2);
  }
  return cleaned || null;
}

export function RawFeedbackSamples({ samples }: RawFeedbackSamplesProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Filter to samples with actual feedback
  const samplesWithFeedback = samples.filter(s =>
    s.raw && (s.raw.trust || s.raw.fluency || s.raw.complexity)
  );

  if (samplesWithFeedback.length === 0) return null;

  const displaySamples = expanded ? samplesWithFeedback.slice(0, 12) : samplesWithFeedback.slice(0, 4);

  return (
    <section className="py-16 sm:py-24 border-t border-border" aria-labelledby="feedback-title">
      <div className="mb-8">
        <h2
          id="feedback-title"
          className="text-2xl sm:text-3xl font-semibold text-foreground mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          In Their Own Words
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground">
          Workers explained their ratings in their native languages. Here are some examples.
        </p>
      </div>

      <div className="space-y-3">
        {displaySamples.map((sample, index) => {
          const isExpanded = expandedIndex === index;
          const trustFeedback = cleanFeedback(sample.raw.trust);
          const fluencyFeedback = cleanFeedback(sample.raw.fluency);
          const complexityFeedback = cleanFeedback(sample.raw.complexity);
          const codeSwitchFeedback = cleanFeedback(sample.raw.code_switching);

          return (
            <div
              key={index}
              className={cn(
                "border rounded-lg overflow-hidden transition-all",
                isExpanded ? "border-primary/30" : "border-border"
              )}
            >
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                className="w-full p-4 text-left hover:bg-muted/30 transition-colors"
                aria-expanded={isExpanded}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        sample.model === 'opus' ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-600"
                      )}>
                        {sample.model === 'opus' ? 'Opus' : 'Sonnet'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {sample.language}
                      </span>
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        sample.worker_tier === 'high' ? "bg-emerald-500/20 text-emerald-600" :
                        sample.worker_tier === 'medium' ? "bg-amber-500/20 text-amber-600" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {sample.worker_tier} reliability
                      </span>
                    </div>
                    {/* Show first available feedback as preview */}
                    <p className="text-sm text-foreground line-clamp-1">
                      {trustFeedback || fluencyFeedback || complexityFeedback || 'View feedback...'}
                    </p>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pl-11 space-y-3">
                  {/* Scores summary */}
                  <div className="flex flex-wrap gap-3 text-xs">
                    {sample.scores.trust !== null && (
                      <span className="text-muted-foreground">
                        Trust: <span className="font-medium text-foreground">{Math.round(sample.scores.trust * 100)}%</span>
                      </span>
                    )}
                    {sample.scores.fluency !== null && (
                      <span className="text-muted-foreground">
                        Fluency: <span className="font-medium text-foreground">{Math.round(sample.scores.fluency * 100)}%</span>
                      </span>
                    )}
                    {sample.scores.complexity !== null && (
                      <span className="text-muted-foreground">
                        Complexity: <span className="font-medium text-foreground">{Math.round(sample.scores.complexity * 100)}%</span>
                      </span>
                    )}
                    {sample.scores.code_switching !== null && (
                      <span className="text-muted-foreground">
                        Code-switch: <span className="font-medium text-foreground">{Math.round(sample.scores.code_switching * 100)}%</span>
                      </span>
                    )}
                  </div>

                  {/* Raw feedback */}
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    {trustFeedback && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">On trust:</span>
                        <p className="text-sm mt-0.5" lang={sample.language.toLowerCase().slice(0, 2)}>
                          <MessageSquare className="inline w-3 h-3 mr-1 text-muted-foreground" />
                          {trustFeedback}
                        </p>
                      </div>
                    )}
                    {fluencyFeedback && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">On fluency:</span>
                        <p className="text-sm mt-0.5" lang={sample.language.toLowerCase().slice(0, 2)}>
                          <MessageSquare className="inline w-3 h-3 mr-1 text-muted-foreground" />
                          {fluencyFeedback}
                        </p>
                      </div>
                    )}
                    {complexityFeedback && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">On complexity:</span>
                        <p className="text-sm mt-0.5" lang={sample.language.toLowerCase().slice(0, 2)}>
                          <MessageSquare className="inline w-3 h-3 mr-1 text-muted-foreground" />
                          {complexityFeedback}
                        </p>
                      </div>
                    )}
                    {codeSwitchFeedback && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">On code-switching:</span>
                        <p className="text-sm mt-0.5" lang={sample.language.toLowerCase().slice(0, 2)}>
                          <MessageSquare className="inline w-3 h-3 mr-1 text-muted-foreground" />
                          {codeSwitchFeedback}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {samplesWithFeedback.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 text-sm text-primary hover:underline"
        >
          {expanded ? 'Show fewer' : `Show ${Math.min(12, samplesWithFeedback.length) - 4} more samples`}
        </button>
      )}
    </section>
  );
}
