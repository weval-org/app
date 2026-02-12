'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  FileText,
  Clock,
  UserX,
  Languages,
  Link2,
  ChevronDown,
  ChevronRight,
  Lightbulb
} from 'lucide-react';

interface FeedbackSample {
  unique_id: string;
  model: string;
  language: string;
  domain: string;
  trust: string;
  question: string;
  answer: string;
  feedback: string;
}

interface ExpertFeedbackHighlights {
  withCitations: {
    count: number;
    samples: FeedbackSample[];
  };
  distrustWithExplanation: {
    count: number;
    samples: FeedbackSample[];
  };
  qualityInsights: {
    count: number;
    samples: FeedbackSample[];
  };
}

interface ExpertInsightsProps {
  data: ExpertFeedbackHighlights;
  legalDistrustPct?: number; // Percentage of distrusted responses from Legal domain
}

// Categorize feedback into types using keyword heuristics
// NOTE: This is approximate categorization based on keyword matching in feedback text
function categorizeInsights(samples: FeedbackSample[]): Record<string, FeedbackSample[]> {
  const categories: Record<string, FeedbackSample[]> = {
    'Missing Legal References': [],
    'Outdated Law References': [],
    'Unwarranted Assumptions': [],
    'Language & Style Issues': [],
    'Factual/Domain Errors': [],
    'Other Issues': [],
  };

  for (const sample of samples) {
    const fb = sample.feedback.toLowerCase();

    // Missing legal references: sections, acts, case law, specific legal citations
    if ((fb.includes('section') && (fb.includes('act') || fb.includes('law') || fb.includes('mention'))) ||
        fb.includes('case law') ||
        (fb.includes('specific') && (fb.includes('act') || fb.includes('law') || fb.includes('section')))) {
      categories['Missing Legal References'].push(sample);
    }
    // Outdated law: references to old codes (CrPC, IPC) that have been replaced (BNSS, BNS)
    else if (fb.includes('crpc') || fb.includes('bnss') || fb.includes('ipc') || fb.includes('bns') ||
             fb.includes('replaced') || (fb.includes('old') && fb.includes('law')) ||
             fb.includes('new criminal law')) {
      categories['Outdated Law References'].push(sample);
    }
    // Unwarranted assumptions: gender, religion, or assumptions not in the question
    else if (fb.includes('gender') || fb.includes('religion') || fb.includes('hindu law') ||
             fb.includes('assume') || fb.includes('question does not mention')) {
      categories['Unwarranted Assumptions'].push(sample);
    }
    // Language issues: grammar, spelling, code-switching, translation, awkward phrasing
    else if (fb.includes('spelling') || fb.includes('grammar') || fb.includes('code switch') ||
             fb.includes('translat') || fb.includes('english word') || fb.includes('awkward') ||
             fb.includes('jarring') || fb.includes('formal') || fb.includes('linguistically')) {
      categories['Language & Style Issues'].push(sample);
    }
    // Factual/domain errors: wrong, incorrect, error, inaccurate information
    else if (fb.includes('incorrect') || fb.includes('wrong') || fb.includes('error') ||
             fb.includes('mistake') || fb.includes('inaccurate') || fb.includes('agronomically')) {
      categories['Factual/Domain Errors'].push(sample);
    }
    // Catch-all
    else {
      categories['Other Issues'].push(sample);
    }
  }

  // Filter out empty categories
  return Object.fromEntries(
    Object.entries(categories).filter(([_, samples]) => samples.length > 0)
  );
}

const categoryIcons: Record<string, React.ReactNode> = {
  'Missing Legal References': <FileText className="w-4 h-4" aria-hidden="true" />,
  'Outdated Law References': <Clock className="w-4 h-4" aria-hidden="true" />,
  'Unwarranted Assumptions': <UserX className="w-4 h-4" aria-hidden="true" />,
  'Language & Style Issues': <Languages className="w-4 h-4" aria-hidden="true" />,
  'Factual/Domain Errors': <FileText className="w-4 h-4" aria-hidden="true" />,
  'Other Issues': <Lightbulb className="w-4 h-4" aria-hidden="true" />,
};

const categoryColors: Record<string, string> = {
  'Missing Legal References': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  'Outdated Law References': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  'Unwarranted Assumptions': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  'Language & Style Issues': 'bg-red-500/10 text-red-600 border-red-500/20',
  'Factual/Domain Errors': 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  'Other Issues': 'bg-gray-500/10 text-gray-600 border-gray-500/20',
};

export function ExpertInsights({ data, legalDistrustPct }: ExpertInsightsProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Missing Legal References');
  const [showCitations, setShowCitations] = useState(false);
  const [expandedSample, setExpandedSample] = useState<string | null>(null);

  // Combine distrust explanations and quality insights for categorization
  const allInsights = [
    ...data.distrustWithExplanation.samples,
    ...data.qualityInsights.samples,
  ];

  const categorized = categorizeInsights(allInsights);
  const categories = Object.entries(categorized).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="mb-12">
      <h3
        className="text-xl font-semibold text-foreground mb-4"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        What Experts Catch
      </h3>

      <p className="text-base text-muted-foreground mb-6">
        Expert feedback reveals specific issues that non-experts often miss. Below we show
        patterns grouped by keyword matching in the feedback text.
      </p>

      {/* Caveat about heuristic categorization */}
      <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 mb-4">
        <strong>Note:</strong> Categories below are auto-generated by keyword matching in expert feedback.
        Some feedback may be miscategorized. Click &ldquo;Show Q&A&rdquo; to see the full context.
      </div>

      {/* Categorized insights */}
      <div className="space-y-3 mb-8">
        {categories.map(([category, samples]) => (
          <div
            key={category}
            className={cn(
              "rounded-xl border transition-all",
              categoryColors[category] || 'bg-muted/30 border-border'
            )}
          >
            <button
              onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
              aria-expanded={expandedCategory === category}
            >
              <div className="flex items-center gap-3">
                <span aria-hidden="true">{categoryIcons[category]}</span>
                <span className="font-medium">{category}</span>
                <span className="text-sm opacity-70">({samples.length} cases)</span>
              </div>
              {expandedCategory === category ? (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            {expandedCategory === category && (
              <div className="px-4 pb-4 space-y-3">
                {samples.slice(0, 4).map((sample, i) => {
                  const sampleKey = `${category}-${sample.unique_id}-${i}`;
                  const isExpanded = expandedSample === sampleKey;
                  return (
                    <div
                      key={sampleKey}
                      className="bg-background/60 rounded-lg p-3 text-sm"
                    >
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          sample.model === 'opus' ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-600"
                        )}>
                          {sample.model}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs bg-muted/50 text-muted-foreground">
                          {sample.language}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs bg-muted/50 text-muted-foreground">
                          {sample.domain}
                        </span>
                      </div>
                      <p className="text-foreground/90 italic">
                        &ldquo;{sample.feedback.length > 200
                          ? sample.feedback.slice(0, 200) + '...'
                          : sample.feedback}&rdquo;
                      </p>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Question</div>
                            <div className="text-sm bg-muted/30 rounded p-2">
                              {sample.question}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Response</div>
                            <div
                              className="text-sm bg-muted/30 rounded p-2 prose prose-sm dark:prose-invert max-w-none overflow-auto max-h-48"
                              dangerouslySetInnerHTML={{ __html: sample.answer }}
                            />
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => setExpandedSample(isExpanded ? null : sampleKey)}
                        className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronDown className="w-3 h-3" aria-hidden="true" />
                            Hide Q&A
                          </>
                        ) : (
                          <>
                            <ChevronRight className="w-3 h-3" aria-hidden="true" />
                            Show Q&A
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
                {samples.length > 4 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    +{samples.length - 4} more cases in this category
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Expert-verified with citations */}
      {data.withCitations.count > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
            <h4 className="font-semibold text-base text-emerald-700">Experts Sometimes Cite Sources</h4>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Some experts included URLs in their feedback to back up their assessments.
          </p>

          <div className="space-y-3">
            {data.withCitations.samples.slice(0, showCitations ? 6 : 2).map((sample, i) => {
              const citationKey = `citation-${sample.unique_id}-${i}`;
              const isExpanded = expandedSample === citationKey;
              return (
                <div
                  key={citationKey}
                  className="bg-background/60 rounded-lg p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium",
                      sample.trust === 'trust' ? "bg-emerald-500/20 text-emerald-600" :
                      sample.trust === 'partial' ? "bg-amber-500/20 text-amber-600" :
                      "bg-red-500/20 text-red-600"
                    )}>
                      {sample.trust === 'trust' ? 'trust' :
                       sample.trust === 'partial' ? 'somewhat trust' :
                       'distrust'}
                    </span>
                    <span className="text-xs text-muted-foreground">{sample.language} · {sample.domain}</span>
                  </div>
                  <p className="text-sm text-foreground/90">
                    {sample.feedback}
                  </p>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Question</div>
                        <div className="text-sm bg-muted/30 rounded p-2">
                          {sample.question}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Response</div>
                        <div
                          className="text-sm bg-muted/30 rounded p-2 prose prose-sm dark:prose-invert max-w-none overflow-auto max-h-48"
                          dangerouslySetInnerHTML={{ __html: sample.answer }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setExpandedSample(isExpanded ? null : citationKey)}
                    className="mt-2 text-xs text-emerald-600 hover:underline flex items-center gap-1"
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronDown className="w-3 h-3" aria-hidden="true" />
                        Hide Q&A
                      </>
                    ) : (
                      <>
                        <ChevronRight className="w-3 h-3" aria-hidden="true" />
                        Show Q&A
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {data.withCitations.samples.length > 2 && (
            <button
              onClick={() => setShowCitations(!showCitations)}
              className="mt-3 text-sm text-emerald-600 hover:underline flex items-center gap-1"
              aria-expanded={showCitations}
            >
              {showCitations ? (
                <>
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  Show fewer
                </>
              ) : (
                <>
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  Show {Math.min(data.withCitations.samples.length - 2, 4)} more
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Key takeaway */}
      <div className="mt-6 bg-muted/30 rounded-xl p-6 border border-border">
        <h4 className="font-semibold mb-3">The Expert Difference</h4>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Non-experts</strong> evaluate based on how responses
            <em> feel</em> — fluency, tone, perceived helpfulness.
          </p>
          <p>
            <strong className="text-foreground">Domain experts</strong> evaluate based on what responses
            <em> contain</em> — verifiable facts, proper citations, current law, correct assumptions.
          </p>
          {legalDistrustPct !== undefined && legalDistrustPct > 80 && (
            <p className="pt-2 text-foreground">
              This explains why {legalDistrustPct}% of distrusted responses come from the <strong>Legal</strong> domain:
              legal advice requires precise, verifiable, current information that experts can validate.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
