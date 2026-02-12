'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, AlertTriangle, Scale, Globe } from 'lucide-react';

interface DistrustCase {
  unique_id: string;
  model: string;
  language: string;
  domain: string;
  subdomain: string;
  question: string;
  fluency: string;
  content_errors: string[];
  feedback: string | null;
  has_citation: boolean;
}

interface ExpertDistrustData {
  total: number;
  byModel: Record<string, number>;
  byLanguage: Record<string, number>;
  byDomain: Record<string, number>;
  cases: DistrustCase[];
}

interface ExpertDistrustProps {
  data: ExpertDistrustData;
}

export function ExpertDistrust({ data }: ExpertDistrustProps) {
  const [showCases, setShowCases] = useState(false);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  const { total, byModel, byLanguage, byDomain, cases } = data;

  // Calculate percentages
  const legalPct = Math.round(((byDomain['Legal'] || 0) / total) * 100);
  const topLanguage = Object.entries(byLanguage).sort((a, b) => b[1] - a[1])[0];
  const topLanguagePct = Math.round((topLanguage[1] / total) * 100);

  // Get cases with feedback for display
  const casesWithFeedback = cases.filter(c => c.feedback && c.feedback.length > 20);

  return (
    <div className="mb-12">
      <h3
        className="text-xl font-semibold text-foreground mb-4"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        When Experts Distrust
      </h3>

      <p className="text-base text-muted-foreground mb-6">
        Out of {(total * 37).toLocaleString()}+ expert evaluations, experts flagged{' '}
        <strong className="text-foreground">{total} responses</strong> as untrustworthy.
        The pattern reveals where AI models struggle most.
      </p>

      {/* Key stats */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-red-500/10 rounded-xl p-4 sm:p-5 text-center">
          <div className="text-3xl sm:text-4xl font-bold text-red-600">
            {total}
          </div>
          <div className="text-sm text-muted-foreground mt-1">Distrusted Responses</div>
          <div className="text-xs text-muted-foreground">
            ({(total / 2399 * 100).toFixed(1)}% of expert evaluations)
          </div>
        </div>
        <div className="bg-blue-500/10 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <Scale className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-blue-600">{legalPct}% Legal</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {byDomain['Legal'] || 0} of {total} distrusted responses are from the legal domain
          </div>
        </div>
        <div className="bg-orange-500/10 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-5 h-5 text-orange-600" />
            <span className="font-semibold text-orange-600">{topLanguagePct}% {topLanguage[0]}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {topLanguage[1]} of {total} distrusted responses are in {topLanguage[0]}
          </div>
        </div>
      </div>

      {/* Breakdown visualization */}
      <div className="bg-muted/30 rounded-xl p-6 border border-border mb-6">
        <h4 className="font-semibold text-base mb-4">Breakdown</h4>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* By Model */}
          <div>
            <div className="text-sm text-muted-foreground mb-2">By Model</div>
            <div className="space-y-2">
              {Object.entries(byModel).sort((a, b) => b[1] - a[1]).map(([model, count]) => (
                <div key={model} className="flex items-center gap-2">
                  <span className="w-16 text-sm capitalize">{model}</span>
                  <div className="flex-1 h-5 bg-muted/50 rounded overflow-hidden">
                    <div
                      className={cn(
                        "h-full",
                        model === 'opus' ? "bg-primary" : "bg-amber-500"
                      )}
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono w-8">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Domain */}
          <div>
            <div className="text-sm text-muted-foreground mb-2">By Domain</div>
            <div className="space-y-2">
              {Object.entries(byDomain).sort((a, b) => b[1] - a[1]).map(([domain, count]) => (
                <div key={domain} className="flex items-center gap-2">
                  <span className="w-20 text-sm">{domain}</span>
                  <div className="flex-1 h-5 bg-muted/50 rounded overflow-hidden">
                    <div
                      className={cn(
                        "h-full",
                        domain === 'Legal' ? "bg-blue-500" : "bg-emerald-500"
                      )}
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono w-8">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* By Language */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="text-sm text-muted-foreground mb-2">By Language</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byLanguage)
              .sort((a, b) => b[1] - a[1])
              .map(([lang, count]) => (
                <span
                  key={lang}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm",
                    count > 10 ? "bg-red-500/20 text-red-700" :
                    count > 5 ? "bg-amber-500/20 text-amber-700" :
                    "bg-muted text-muted-foreground"
                  )}
                >
                  {lang}: {count}
                </span>
              ))}
          </div>
        </div>
      </div>

      {/* Sample cases with feedback */}
      <div className="bg-gradient-to-br from-red-500/5 to-orange-500/5 border border-red-500/20 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h4 className="font-semibold text-base">Expert Feedback on Distrusted Responses</h4>
        </div>

        <div className="space-y-4">
          {casesWithFeedback.slice(0, showCases ? 10 : 4).map((case_) => (
            <div
              key={case_.unique_id}
              className="bg-background/60 rounded-lg p-4 border border-border/50"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium",
                    case_.model === 'opus' ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-600"
                  )}>
                    {case_.model}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                    {case_.language}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                    {case_.domain}
                  </span>
                </div>
              </div>

              <p className="text-sm text-foreground italic">
                &ldquo;{case_.feedback}&rdquo;
              </p>

              {case_.content_errors.length > 0 && !case_.content_errors.includes('None of the above') && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {case_.content_errors.map((error, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-600">
                      {error}
                    </span>
                  ))}
                </div>
              )}

              {expandedCase === case_.unique_id && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="text-xs text-muted-foreground">
                    <strong>Question:</strong> {case_.question}
                  </div>
                </div>
              )}

              <button
                onClick={() => setExpandedCase(expandedCase === case_.unique_id ? null : case_.unique_id)}
                className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
              >
                {expandedCase === case_.unique_id ? (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Hide question
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-3 h-3" />
                    Show question
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {casesWithFeedback.length > 4 && (
          <button
            onClick={() => setShowCases(!showCases)}
            className="mt-4 text-sm text-primary hover:underline flex items-center gap-1"
          >
            {showCases ? (
              <>
                <ChevronDown className="w-4 h-4" />
                Show fewer
              </>
            ) : (
              <>
                <ChevronRight className="w-4 h-4" />
                Show {Math.min(casesWithFeedback.length - 4, 6)} more cases
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
