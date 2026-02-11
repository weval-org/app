import React from 'react';
import { HumanLLMAgreement, CriterionAgreement } from '@/types/shared';
import { cn } from '@/lib/utils';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

interface BreakdownTableProps {
  humanLLMAgreement: HumanLLMAgreement;
}

export function BreakdownTable({ humanLLMAgreement }: BreakdownTableProps) {
  const { perCriterion } = humanLLMAgreement;
  const criteria = Object.keys(perCriterion);

  // Helper to format correlation with color
  const formatCorrelation = (corr: number | null) => {
    if (corr === null) return { text: 'N/A', color: 'text-muted-foreground' };
    const absCorr = Math.abs(corr);
    let color = 'text-red-500';
    if (absCorr >= 0.7) color = 'text-green-500';
    else if (absCorr >= 0.4) color = 'text-yellow-500';
    return { text: corr.toFixed(3), color };
  };

  // Score bar component
  const ScoreBar = ({ value, label, color }: { value: number; label: string; color: string }) => (
    <div className="flex items-center gap-2">
      <div className="w-24 h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-sm font-mono min-w-[3rem]">
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold"
          style={headingStyles}
        >
          Detailed Breakdown
        </h2>
        <p className="text-muted-foreground">
          Per-criterion comparison of human evaluator ratings with LLM judge scores.
        </p>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 dark:bg-slate-900/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Criterion</th>
                <th className="text-left px-4 py-3 font-medium">Human Mean</th>
                <th className="text-left px-4 py-3 font-medium">LLM Mean</th>
                <th className="text-center px-4 py-3 font-medium">Correlation</th>
                <th className="text-center px-4 py-3 font-medium">Mean Diff</th>
                <th className="text-center px-4 py-3 font-medium">N</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((criterion) => {
                const data = perCriterion[criterion];
                const corrFormat = formatCorrelation(data.correlation);
                const diff = data.llmMean - data.humanMean;
                const diffColor = Math.abs(diff) > 0.15
                  ? (diff > 0 ? 'text-blue-500' : 'text-purple-500')
                  : 'text-muted-foreground';

                return (
                  <tr key={criterion} className="border-t border-border">
                    <td className="px-4 py-4 font-medium capitalize">
                      {criterion.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-4">
                      <ScoreBar
                        value={data.humanMean}
                        label="Human"
                        color="bg-emerald-500"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <ScoreBar
                        value={data.llmMean}
                        label="LLM"
                        color="bg-blue-500"
                      />
                    </td>
                    <td className={cn('px-4 py-4 text-center font-mono', corrFormat.color)}>
                      {corrFormat.text}
                    </td>
                    <td className={cn('px-4 py-4 text-center font-mono', diffColor)}>
                      {diff > 0 ? '+' : ''}{(diff * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-4 text-center text-muted-foreground">
                      {data.n}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span>Human evaluator mean</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>LLM judge mean</span>
        </div>
        <div>
          <span className="text-green-500">Correlation &gt; 0.7</span> = strong |{' '}
          <span className="text-yellow-500">0.4-0.7</span> = moderate |{' '}
          <span className="text-red-500">&lt; 0.4</span> = weak
        </div>
      </div>
    </section>
  );
}
