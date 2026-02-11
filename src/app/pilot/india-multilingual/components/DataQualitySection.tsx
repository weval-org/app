'use client';

import React from 'react';
import { cn } from '@/lib/utils';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

interface DataQualitySectionProps {
  dataQuality: {
    workerReliability?: {
      total_workers?: number;
      high_reliability?: number;
      medium_reliability?: number;
      low_reliability?: number;
      thresholds?: {
        high?: number;
        medium?: number;
      };
    };
    methodology?: {
      variance_weight?: number;
      consistency_weight?: number;
      model_diff_weight?: number;
      domain_diff_weight?: number;
      description?: string;
    };
    ratingsByTier?: {
      high?: number;
      all?: number;
    };
  };
}

export function DataQualitySection({ dataQuality }: DataQualitySectionProps) {
  const { workerReliability, methodology, ratingsByTier } = dataQuality;

  const totalWorkers = workerReliability?.total_workers || 0;
  const highWorkers = workerReliability?.high_reliability || 0;
  const mediumWorkers = workerReliability?.medium_reliability || 0;
  const lowWorkers = workerReliability?.low_reliability || 0;

  const highPct = totalWorkers > 0 ? (highWorkers / totalWorkers) * 100 : 0;
  const mediumPct = totalWorkers > 0 ? (mediumWorkers / totalWorkers) * 100 : 0;
  const lowPct = totalWorkers > 0 ? (lowWorkers / totalWorkers) * 100 : 0;

  const highRatings = ratingsByTier?.high || 0;
  const allRatings = ratingsByTier?.all || 0;
  const highRatingsPct = allRatings > 0 ? (highRatings / allRatings) * 100 : 0;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold"
          style={headingStyles}
        >
          Data Quality
        </h2>
        <p className="text-muted-foreground">
          Each response was rated by a single native speaker. We compute worker reliability
          scores to identify the most discerning evaluators.
        </p>
      </div>

      {/* Worker reliability breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-5 bg-muted/30 dark:bg-slate-900/40 rounded-lg space-y-4">
          <h3 className="font-semibold" style={headingStyles}>Worker Reliability Tiers</h3>

          <div className="space-y-3">
            {/* High reliability */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  High Reliability
                </span>
                <span className="font-mono">{highWorkers} workers ({highPct.toFixed(0)}%)</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${highPct}%` }}
                />
              </div>
            </div>

            {/* Medium reliability */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Medium Reliability
                </span>
                <span className="font-mono">{mediumWorkers} workers ({mediumPct.toFixed(0)}%)</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${mediumPct}%` }}
                />
              </div>
            </div>

            {/* Low reliability */}
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  Low Reliability
                </span>
                <span className="font-mono">{lowWorkers} workers ({lowPct.toFixed(0)}%)</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-400 rounded-full"
                  style={{ width: `${lowPct}%` }}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            High-reliability workers contributed {highRatings.toLocaleString()} of {allRatings.toLocaleString()} ratings ({highRatingsPct.toFixed(0)}%).
          </p>
        </div>

        <div className="p-5 bg-muted/30 dark:bg-slate-900/40 rounded-lg space-y-4">
          <h3 className="font-semibold" style={headingStyles}>Reliability Scoring</h3>

          <p className="text-sm text-muted-foreground">
            We compute a composite reliability score for each worker based on four signals:
          </p>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Rating Variance</span>
              <span className="text-muted-foreground">40%</span>
            </div>
            <p className="text-xs text-muted-foreground pl-4 -mt-1">
              Does the worker use the full rating scale, or give the same score to everything?
            </p>

            <div className="flex justify-between pt-2">
              <span>Cross-Criterion Consistency</span>
              <span className="text-muted-foreground">30%</span>
            </div>
            <p className="text-xs text-muted-foreground pl-4 -mt-1">
              Do their ratings correlate sensibly? (e.g., low fluency → low trust)
            </p>

            <div className="flex justify-between pt-2">
              <span>Model Differentiation</span>
              <span className="text-muted-foreground">15%</span>
            </div>
            <p className="text-xs text-muted-foreground pl-4 -mt-1">
              Do they rate Opus and Sonnet differently?
            </p>

            <div className="flex justify-between pt-2">
              <span>Domain Sensitivity</span>
              <span className="text-muted-foreground">15%</span>
            </div>
            <p className="text-xs text-muted-foreground pl-4 -mt-1">
              Do they differentiate between Legal and Agriculture content?
            </p>
          </div>
        </div>
      </div>

      {/* Key insight callout */}
      <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-amber-500/10 border border-emerald-500/20 rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Why this matters:</strong> Low-reliability workers
          (std=0 on ratings) inflate agreement statistics by always giving the same score. By filtering
          to high-reliability workers, we see the <em>validated</em> human-LLM gaps — disagreements
          that come from evaluators who demonstrably differentiate between responses.
        </p>
      </div>
    </section>
  );
}
