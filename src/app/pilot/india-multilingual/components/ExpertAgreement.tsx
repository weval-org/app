'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Scale, Leaf } from 'lucide-react';

interface ExpertVsNonExpertData {
  overlap: {
    totalResponses: number;
    strongAgreement: number;
    strongDivergence: number;
    agreementRate: number;
  };
  divergencePattern: {
    expertsMoreSkeptical: number;
    expertsMoreTrusting: number;
    skepticalRatio: number;
  };
  byModel: Record<string, { skeptical: number; trusting: number }>;
  byLanguage: Record<string, { skeptical: number; trusting: number }>;
  byDomain: Record<string, { skeptical: number; trusting: number }>;
  byModelDomain: Record<string, Record<string, { skeptical: number; trusting: number }>>;
}

interface ExpertAgreementProps {
  data: ExpertVsNonExpertData;
}

export function ExpertAgreement({ data }: ExpertAgreementProps) {
  const { overlap, byDomain, byModelDomain } = data;

  // Helper to calculate ratio
  const getRatio = (skeptical: number, trusting: number) => {
    if (trusting === 0) return skeptical > 0 ? Infinity : 1;
    if (skeptical === 0) return 0;
    return skeptical / trusting;
  };

  // Domain stats
  const legalStats = byDomain['Legal'] || { skeptical: 0, trusting: 0 };
  const agriStats = byDomain['Agriculture'] || { skeptical: 0, trusting: 0 };

  const legalTotal = legalStats.skeptical + legalStats.trusting;
  const agriTotal = agriStats.skeptical + agriStats.trusting;

  const legalSkepticalPct = legalTotal > 0 ? (legalStats.skeptical / legalTotal) * 100 : 0;
  const agriSkepticalPct = agriTotal > 0 ? (agriStats.skeptical / agriTotal) * 100 : 0;

  // Model-specific Legal ratios for Key Insight
  const opusLegalData = byModelDomain['opus']?.['Legal'] || { skeptical: 0, trusting: 0 };
  const sonnetLegalData = byModelDomain['sonnet']?.['Legal'] || { skeptical: 0, trusting: 0 };
  const opusLegalRatio = getRatio(opusLegalData.skeptical, opusLegalData.trusting);
  const sonnetLegalRatio = getRatio(sonnetLegalData.skeptical, sonnetLegalData.trusting);

  return (
    <div className="mb-12">
      <h3
        className="text-xl font-semibold text-foreground mb-4"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        Do Experts Agree with Non-Experts?
      </h3>

      <p className="text-base text-muted-foreground mb-6">
        We compared expert and non-expert ratings on {overlap.totalResponses.toLocaleString()} overlapping
        responses — cases where both groups evaluated the same AI answer.
      </p>

      {/* Hero stats */}
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-emerald-500/10 rounded-xl p-4 sm:p-6 text-center">
          <div className="text-3xl sm:text-4xl font-bold text-emerald-600">
            {Math.round(overlap.agreementRate * 100)}%
          </div>
          <div className="text-sm text-muted-foreground mt-1">Agreement Rate</div>
          <div className="text-xs text-muted-foreground">
            ({overlap.strongAgreement.toLocaleString()} of {overlap.totalResponses.toLocaleString()} responses)
          </div>
        </div>
        <div className="bg-purple-500/10 rounded-xl p-4 sm:p-6 text-center">
          <div className="text-3xl sm:text-4xl font-bold text-purple-600">
            {overlap.strongDivergence}
          </div>
          <div className="text-sm text-muted-foreground mt-1">Disagreements</div>
          <div className="text-xs text-muted-foreground">
            Where expert and non-expert ratings differ significantly
          </div>
        </div>
      </div>

      {/* Domain comparison - the key insight */}
      <div className="bg-gradient-to-br from-blue-500/5 to-emerald-500/5 border border-border rounded-xl p-6 mb-6">
        <h4 className="font-semibold text-base mb-2">The Domain Split</h4>
        <p className="text-sm text-muted-foreground mb-6">
          When experts and non-experts disagree, the pattern is <strong className="text-foreground">completely different</strong> by domain.
        </p>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Legal */}
          <div className="bg-background/60 rounded-lg p-4 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Scale className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-700">Legal</span>
              <span className="text-xs text-muted-foreground">({legalTotal} disagreements)</span>
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span>Expert distrusts</span>
                <span className="font-mono">{Math.round(legalSkepticalPct)}%</span>
              </div>
              <div className="h-4 bg-muted/50 rounded overflow-hidden flex">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${legalSkepticalPct}%` }}
                />
                <div
                  className="h-full bg-emerald-500/50"
                  style={{ width: `${100 - legalSkepticalPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{legalStats.skeptical} distrusted</span>
                <span>{legalStats.trusting} trusted</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Experts <strong className="text-amber-600">distrust</strong> what non-experts trusted
            </p>
          </div>

          {/* Agriculture */}
          <div className="bg-background/60 rounded-lg p-4 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Leaf className="w-5 h-5 text-emerald-600" />
              <span className="font-semibold text-emerald-700">Agriculture</span>
              <span className="text-xs text-muted-foreground">({agriTotal} disagreements)</span>
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span>Expert distrusts</span>
                <span className="font-mono">{Math.round(agriSkepticalPct)}%</span>
              </div>
              <div className="h-4 bg-muted/50 rounded overflow-hidden flex">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${agriSkepticalPct}%` }}
                />
                <div
                  className="h-full bg-emerald-500/50"
                  style={{ width: `${100 - agriSkepticalPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{agriStats.skeptical} distrusted</span>
                <span>{agriStats.trusting} trusted</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Experts <strong className="text-emerald-600">trust</strong> what non-experts distrusted
            </p>
          </div>
        </div>
      </div>

      {/* Model × Domain breakdown */}
      <div className="bg-muted/30 rounded-xl p-6 border border-border">
        <h4 className="font-semibold text-base mb-2">Model × Domain Breakdown</h4>
        <p className="text-sm text-muted-foreground mb-4">
          When experts and non-experts disagree, which way does the expert lean?
        </p>

        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[400px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground"></th>
                <th className="text-center py-2 px-3 font-medium text-muted-foreground">
                  <div className="flex items-center justify-center gap-1">
                    <Scale className="w-3.5 h-3.5" />
                    Legal
                  </div>
                </th>
                <th className="text-center py-2 px-3 font-medium text-muted-foreground">
                  <div className="flex items-center justify-center gap-1">
                    <Leaf className="w-3.5 h-3.5" />
                    Agriculture
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {['opus', 'sonnet'].map((model) => {
                const legalData = byModelDomain[model]?.['Legal'] || { skeptical: 0, trusting: 0 };
                const agriData = byModelDomain[model]?.['Agriculture'] || { skeptical: 0, trusting: 0 };

                const legalTotal = legalData.skeptical + legalData.trusting;
                const agriTotal = agriData.skeptical + agriData.trusting;

                const legalPct = legalTotal > 0 ? (legalData.skeptical / legalTotal) * 100 : 0;
                const agriPct = agriTotal > 0 ? (agriData.skeptical / agriTotal) * 100 : 0;

                const legalRatio = getRatio(legalData.skeptical, legalData.trusting);
                const agriRatio = getRatio(agriData.skeptical, agriData.trusting);

                return (
                  <tr key={model} className="border-b border-border/50">
                    <td className="py-3 pr-4">
                      <span className={cn(
                        "font-medium capitalize",
                        model === 'opus' ? "text-primary" : "text-amber-600"
                      )}>
                        {model}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-3 bg-muted/50 rounded overflow-hidden flex">
                            <div className="h-full bg-amber-500" style={{ width: `${legalPct}%` }} />
                            <div className="h-full bg-emerald-500/50" style={{ width: `${100 - legalPct}%` }} />
                          </div>
                          <span className={cn(
                            "text-xs font-medium",
                            legalPct > 60 ? "text-amber-600" : "text-emerald-600"
                          )}>
                            {Math.round(legalPct)}%
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground mt-1">
                          {legalRatio > 1
                            ? `${legalRatio.toFixed(1)}x distrust`
                            : legalRatio < 1
                            ? `${(1/legalRatio).toFixed(1)}x trust`
                            : 'even'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-3 bg-muted/50 rounded overflow-hidden flex">
                            <div className="h-full bg-amber-500" style={{ width: `${agriPct}%` }} />
                            <div className="h-full bg-emerald-500/50" style={{ width: `${100 - agriPct}%` }} />
                          </div>
                          <span className={cn(
                            "text-xs font-medium",
                            agriPct > 60 ? "text-amber-600" : "text-emerald-600"
                          )}>
                            {Math.round(agriPct)}%
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground mt-1">
                          {agriRatio > 1
                            ? `${agriRatio.toFixed(1)}x distrust`
                            : agriRatio < 1
                            ? `${(1/agriRatio).toFixed(1)}x trust`
                            : 'even'}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500" />
            <span>Expert distrusts (non-expert trusted)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500/50" />
            <span>Expert trusts (non-expert distrusted)</span>
          </div>
        </div>
      </div>

      {/* Key insight callout */}
      {opusLegalRatio > 1.5 && (
        <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-6">
          <h4 className="font-semibold text-amber-800 mb-2">Key Insight: Legal + Opus</h4>
          <p className="text-sm text-muted-foreground">
            In legal content, when experts and non-experts disagree about <strong className="text-foreground">Opus</strong>,
            experts distrust the response <strong className="text-foreground">{opusLegalRatio.toFixed(1)}x</strong> more often than they trust it.
            {sonnetLegalRatio > 1 ? (
              <> This pattern is weaker for Sonnet ({sonnetLegalRatio.toFixed(1)}x).</>
            ) : (
              <> Sonnet shows the opposite pattern ({(1/sonnetLegalRatio).toFixed(1)}x trust).</>
            )}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            This suggests Opus may produce legal responses that <em>sound</em> authoritative to non-experts
            but have issues that domain experts catch — a potential &ldquo;deceptive fluency&rdquo; pattern
            specific to legal content.
          </p>
        </div>
      )}
    </div>
  );
}
