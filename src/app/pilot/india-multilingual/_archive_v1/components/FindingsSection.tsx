import React from 'react';
import { HumanLLMAgreement } from '@/types/shared';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

interface FindingsSectionProps {
  humanLLMAgreement: HumanLLMAgreement;
}

export function FindingsSection({ humanLLMAgreement }: FindingsSectionProps) {
  const { overall, perCriterion } = humanLLMAgreement;

  // Calculate key findings from the data
  const disagreementPercent = (overall.disagreementRate * 100).toFixed(1);

  // Find fluency comparison
  const fluency = perCriterion['fluency'];
  const codeSwitching = perCriterion['code_switching'];

  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold"
          style={headingStyles}
        >
          Judge Calibration Findings
        </h2>
        <p className="text-muted-foreground">
          How well do LLM judges align with native speaker evaluations? The results reveal significant gaps.
        </p>
      </div>

      {/* Main callout cards */}
      <div className="grid gap-6">
        {/* Disagreement Rate */}
        <div className="p-6 bg-gradient-to-br from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20 border border-amber-500/20 rounded-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold" style={headingStyles}>
                {disagreementPercent}% Disagreement Rate
              </h3>
              <p className="text-muted-foreground">
                Nearly half of all judgments had meaningful differences (&gt;0.3 on a 0-1 scale)
                between human evaluators and LLM judges.
              </p>
            </div>
            <div className="text-5xl font-bold text-amber-500/80">
              {Math.round(overall.disagreementRate * 100)}%
            </div>
          </div>
        </div>

        {/* Fluency Over-rating */}
        {fluency && (
          <div className="p-6 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:to-cyan-500/20 border border-blue-500/20 rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold" style={headingStyles}>
                  LLMs Over-Rate Fluency
                </h3>
                <p className="text-muted-foreground">
                  Human: {(fluency.humanMean * 100).toFixed(0)}% vs LLM: {(fluency.llmMean * 100).toFixed(0)}%.
                  LLMs think everything sounds great; native speakers are more critical of actual fluency.
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-500/80">
                  +{((fluency.llmMean - fluency.humanMean) * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">LLM bias</div>
              </div>
            </div>
          </div>
        )}

        {/* Code-switching */}
        {codeSwitching && (
          <div className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 dark:from-purple-500/20 dark:to-pink-500/20 border border-purple-500/20 rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold" style={headingStyles}>
                  LLMs Penalize Code-Switching
                </h3>
                <p className="text-muted-foreground">
                  Human: {(codeSwitching.humanMean * 100).toFixed(0)}% vs LLM: {(codeSwitching.llmMean * 100).toFixed(0)}%.
                  Mixing English terms into Hindi/Bengali is natural and helpful to speakers,
                  but LLMs treat it as a flaw.
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-purple-500/80">
                  {((codeSwitching.llmMean - codeSwitching.humanMean) * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">LLM bias</div>
              </div>
            </div>
          </div>
        )}

        {/* Correlation */}
        <div className="p-6 bg-gradient-to-br from-slate-500/10 to-gray-500/10 dark:from-slate-500/20 dark:to-gray-500/20 border border-slate-500/20 rounded-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold" style={headingStyles}>
                Low Overall Correlation
              </h3>
              <p className="text-muted-foreground">
                Even when average scores match, LLMs and humans are often rating different things as good or bad.
                The correlation of {overall.correlation?.toFixed(2) ?? 'N/A'} suggests they&apos;re measuring different constructs.
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-500">
                {overall.correlation?.toFixed(2) ?? 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">correlation</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
