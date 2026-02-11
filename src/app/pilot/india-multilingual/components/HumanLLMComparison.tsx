'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { ExternalLink, AlertTriangle } from 'lucide-react';

interface CriterionData {
  correlation: number;
  meanDiff: number;
  humanMean: number;
  llmMean: number;
  n: number;
}

interface HumanLLMAgreementData {
  perCriterion: {
    trust: CriterionData;
    fluency: CriterionData;
    complexity: CriterionData;
    code_switching: CriterionData;
  };
  overall: {
    correlation: number;
    meanDiff: number;
    totalComparisons: number;
    disagreementCount: number;
    disagreementRate: number;
  };
  perCriterionHighReliability?: {
    trust: CriterionData;
    fluency: CriterionData;
    complexity: CriterionData;
    code_switching: CriterionData;
  };
  overallHighReliability?: {
    correlation: number;
    meanDiff: number;
    totalComparisons: number;
    disagreementCount: number;
    disagreementRate: number;
  };
  wevalRunUrl: string;
}

interface HumanLLMComparisonProps {
  data: HumanLLMAgreementData;
}

const criteriaLabels: Record<string, string> = {
  trust: 'Trustworthiness',
  fluency: 'Fluency',
  complexity: 'Complexity',
  code_switching: 'Code-Switching',
};

export function HumanLLMComparison({ data }: HumanLLMComparisonProps) {
  const { perCriterion, overall, wevalRunUrl } = data;
  const criteria = ['trust', 'fluency', 'complexity', 'code_switching'] as const;

  return (
    <section className="py-16 sm:py-24 border-t border-border" aria-labelledby="human-llm-title">
      {/* Section header */}
      <div className="mb-8 sm:mb-12">
        <div className="text-xs sm:text-sm uppercase tracking-wide text-purple-600 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Human vs. AI Judges
        </div>
        <h2
          id="human-llm-title"
          className="text-2xl sm:text-3xl font-semibold text-foreground mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Do LLM Judges Agree with Native Speakers?
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground">
          We ran the same responses through Weval&apos;s LLM judge pipeline and compared scores.
          The results reveal systematic biases in how AI judges evaluate multilingual content.
        </p>
      </div>

      {/* Overall stats */}
      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <div className="bg-red-500/10 rounded-xl p-4 sm:p-6 text-center">
          <div className="text-3xl sm:text-4xl font-bold text-red-600">
            {Math.round(overall.disagreementRate * 100)}%
          </div>
          <div className="text-sm text-muted-foreground mt-1">Disagreement Rate</div>
          <div className="text-xs text-muted-foreground">
            ({overall.disagreementCount.toLocaleString()} of {overall.totalComparisons.toLocaleString()})
          </div>
        </div>
        <div className="bg-amber-500/10 rounded-xl p-4 sm:p-6 text-center">
          <div className="text-3xl sm:text-4xl font-bold text-amber-600">
            {overall.correlation > 0 ? '+' : ''}{overall.correlation.toFixed(2)}
          </div>
          <div className="text-sm text-muted-foreground mt-1">Overall Correlation</div>
          <div className="text-xs text-muted-foreground">(near-zero = no agreement)</div>
        </div>
        <div className="bg-purple-500/10 rounded-xl p-4 sm:p-6 text-center">
          <div className="text-3xl sm:text-4xl font-bold text-purple-600">
            ±{Math.round(overall.meanDiff * 100)}%
          </div>
          <div className="text-sm text-muted-foreground mt-1">Avg. Score Difference</div>
        </div>
      </div>

      {/* Per-criterion comparison */}
      <div className="bg-muted/30 rounded-xl p-6 border border-border mb-8">
        <h3 className="font-semibold text-base sm:text-lg mb-6">Score Comparison by Criterion</h3>

        <div className="space-y-6">
          {criteria.map((criterion) => {
            const humanScore = perCriterion[criterion].humanMean * 100;
            const llmScore = perCriterion[criterion].llmMean * 100;
            const diff = llmScore - humanScore;
            const correlation = perCriterion[criterion].correlation;

            return (
              <div key={criterion} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{criteriaLabels[criterion]}</span>
                  <div className="flex items-center gap-4 text-sm">
                    <span className={cn(
                      "font-mono",
                      Math.abs(correlation) < 0.1 ? "text-red-600" :
                      Math.abs(correlation) < 0.3 ? "text-amber-600" : "text-green-600"
                    )}>
                      r = {correlation > 0 ? '+' : ''}{correlation.toFixed(2)}
                    </span>
                    <span className={cn(
                      "font-medium",
                      diff > 5 ? "text-blue-600" : diff < -5 ? "text-amber-600" : "text-muted-foreground"
                    )}>
                      {diff > 0 ? 'LLM' : 'Human'} +{Math.abs(diff).toFixed(0)}pt
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  {/* Human bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-16 text-muted-foreground">Human</span>
                    <div className="flex-1 h-3 bg-muted/50 rounded overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${humanScore}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-12 text-right">{humanScore.toFixed(0)}%</span>
                  </div>
                  {/* LLM bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-16 text-muted-foreground">LLM</span>
                    <div className="flex-1 h-3 bg-muted/50 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${llmScore}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-12 text-right">{llmScore.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key findings callout */}
      <div className="bg-gradient-to-br from-red-500/10 to-amber-500/10 border border-red-500/30 rounded-xl p-6 sm:p-8 mb-8">
        <h3 className="font-semibold text-lg mb-4">Key Findings</h3>
        <div className="space-y-3 text-sm">
          <p>
            <strong className="text-red-600">Fluency Overestimation:</strong> LLM judges rate fluency at{' '}
            <strong>{Math.round(perCriterion.fluency.llmMean * 100)}%</strong> while native speakers rate it at{' '}
            <strong>{Math.round(perCriterion.fluency.humanMean * 100)}%</strong> — a{' '}
            <strong>{Math.round((perCriterion.fluency.llmMean - perCriterion.fluency.humanMean) * 100)} point gap</strong>.
          </p>
          <p>
            <strong className="text-amber-600">Code-Switching Underestimation:</strong> LLM judges rate code-switching at{' '}
            <strong>{Math.round(perCriterion.code_switching.llmMean * 100)}%</strong> while native speakers rate it at{' '}
            <strong>{Math.round(perCriterion.code_switching.humanMean * 100)}%</strong> — a{' '}
            <strong>{Math.round((perCriterion.code_switching.humanMean - perCriterion.code_switching.llmMean) * 100)} point gap</strong>.
          </p>
          <p>
            <strong className="text-purple-600">Near-Zero Correlations:</strong> The correlation between human and LLM scores
            is essentially zero across all criteria (ranging from {Math.min(...criteria.map(c => perCriterion[c].correlation)).toFixed(2)} to{' '}
            {Math.max(...criteria.map(c => perCriterion[c].correlation)).toFixed(2)}), meaning LLM judgments have{' '}
            <strong>no predictive relationship</strong> with human judgments.
          </p>
        </div>
      </div>

      {/* Link to full Weval analysis */}
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
        <div>
          <p className="font-medium">Explore the Full LLM Judge Analysis</p>
          <p className="text-sm text-muted-foreground">View detailed coverage scores, judge reasoning, and per-prompt breakdowns</p>
        </div>
        <a
          href={wevalRunUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          View on Weval
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Interpretation */}
      <div className="mt-8 bg-muted/30 rounded-xl p-6 border border-border">
        <h3 className="font-semibold mb-3">What This Means for AI Evaluation</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">LLM judges cannot substitute for native speaker evaluation</strong> in
            multilingual contexts. The systematic biases — overrating fluency, underrating appropriate code-switching —
            suggest LLM judges are applying English-centric evaluation heuristics.
          </p>
          <p>
            This finding has implications for automated evaluation pipelines: quality scores from LLM judges may not
            reflect actual user satisfaction or cultural appropriateness in non-English languages.
          </p>
        </div>
      </div>
    </section>
  );
}
