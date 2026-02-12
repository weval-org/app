'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface CriterionData {
  correlation: number;
  meanDiff: number;
  humanMean: number;
  llmMean: number;
  n: number;
}

interface FluencyExampleCase {
  uniqueId: string;
  domain: string;
  language: string;
  model: string;
  question: string;
  questionEnglish: string;
  answer: string;
  humanFluencyRating: string;
  humanFluencyRatingEnglish: string;
  humanFluencyScore: number;
  llmFluencyScore: number;
  contentErrorsNative: string[];
  contentErrorsEnglish: string[];
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
  fluencyExampleCase?: FluencyExampleCase;
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
  const { perCriterion, overall, fluencyExampleCase } = data;
  const criteria = ['trust', 'fluency', 'complexity', 'code_switching'] as const;
  const [showFullExample, setShowFullExample] = useState(false);

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

                <div className="space-y-2">
                  {/* Human bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm w-14 sm:w-16 text-muted-foreground">Human</span>
                    <div className="flex-1 h-4 sm:h-5 bg-muted/50 rounded overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${humanScore}%` }}
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-mono w-10 sm:w-12 text-right">{humanScore.toFixed(0)}%</span>
                  </div>
                  {/* LLM bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm w-14 sm:w-16 text-muted-foreground">LLM</span>
                    <div className="flex-1 h-4 sm:h-5 bg-muted/50 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${llmScore}%` }}
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-mono w-10 sm:w-12 text-right">{llmScore.toFixed(0)}%</span>
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
            In fact, native speakers rated <strong>226 responses</strong> as having zero fluency (citing spelling errors,
            grammar mistakes, and poor flow) — yet LLM judges rated those same responses near-perfect.
          </p>

          {/* Example case */}
          {fluencyExampleCase && (
            <div className="my-4 p-4 bg-white/50 dark:bg-black/20 rounded-lg border border-red-200 dark:border-red-900/30 text-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-foreground">
                  Example: {fluencyExampleCase.language} {fluencyExampleCase.domain.toLowerCase()} response ({fluencyExampleCase.model})
                </div>
                <button
                  onClick={() => setShowFullExample(!showFullExample)}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showFullExample ? (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      <span>Hide content</span>
                    </>
                  ) : (
                    <>
                      <ChevronRight className="w-4 h-4" />
                      <span>Show actual Q&A</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <div className="text-muted-foreground mb-1">Native speaker</div>
                  <div className="font-mono text-red-600 text-lg">{Math.round(fluencyExampleCase.humanFluencyScore * 100)}%</div>
                  <div className="text-muted-foreground mt-1 italic">
                    &ldquo;{fluencyExampleCase.humanFluencyRatingEnglish}&rdquo;<br />
                    Errors: {fluencyExampleCase.contentErrorsEnglish.join(', ').toLowerCase()}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">LLM judge</div>
                  <div className="font-mono text-blue-600 text-lg">{Math.round(fluencyExampleCase.llmFluencyScore * 100)}%</div>
                  <div className="text-muted-foreground mt-1 italic">
                    No issues detected
                  </div>
                </div>
              </div>

              {showFullExample && (
                <div className="mt-4 pt-4 border-t border-red-200 dark:border-red-900/30 space-y-4">
                  {/* Question */}
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Question</div>
                    <div className="bg-muted/30 rounded p-3 space-y-2">
                      <p className="text-foreground text-sm" style={{ fontFamily: 'system-ui, sans-serif' }}>
                        {fluencyExampleCase.question}
                      </p>
                      <p className="text-muted-foreground text-xs italic">
                        ({fluencyExampleCase.questionEnglish})
                      </p>
                    </div>
                  </div>

                  {/* Response */}
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Model Response (rated 0% fluency by native speaker)
                    </div>
                    <div
                      className="bg-muted/30 rounded p-3 text-sm prose prose-sm dark:prose-invert max-w-none overflow-auto max-h-64"
                      dangerouslySetInnerHTML={{ __html: fluencyExampleCase.answer }}
                    />
                  </div>

                  {/* Native language errors */}
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Errors cited (in Malayalam):</span>{' '}
                    {fluencyExampleCase.contentErrorsNative.join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}

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
