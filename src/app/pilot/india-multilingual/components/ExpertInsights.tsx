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
}

// Categorize feedback into types
function categorizeInsights(samples: FeedbackSample[]): Record<string, FeedbackSample[]> {
  const categories: Record<string, FeedbackSample[]> = {
    'Missing Legal Citations': [],
    'Outdated Information': [],
    'Unwarranted Assumptions': [],
    'Language & Grammar Issues': [],
    'Factual Errors': [],
    'Other Quality Issues': [],
  };

  for (const sample of samples) {
    const feedback = sample.feedback.toLowerCase();

    if (feedback.includes('section') || feedback.includes('act') || feedback.includes('case law') ||
        feedback.includes('citation') || feedback.includes('specific') && feedback.includes('law')) {
      categories['Missing Legal Citations'].push(sample);
    } else if (feedback.includes('outdated') || feedback.includes('replaced') || feedback.includes('old') ||
               feedback.includes('crpc') || feedback.includes('bnss')) {
      categories['Outdated Information'].push(sample);
    } else if (feedback.includes('assume') || feedback.includes('gender') || feedback.includes('religion') ||
               feedback.includes('question does not mention')) {
      categories['Unwarranted Assumptions'].push(sample);
    } else if (feedback.includes('grammar') || feedback.includes('spelling') || feedback.includes('tense') ||
               feedback.includes('sentence') || feedback.includes('word') || feedback.includes('fluent') ||
               feedback.includes('code switch') || feedback.includes('transliterat')) {
      categories['Language & Grammar Issues'].push(sample);
    } else if (feedback.includes('wrong') || feedback.includes('incorrect') || feedback.includes('error') ||
               feedback.includes('mistake')) {
      categories['Factual Errors'].push(sample);
    } else {
      categories['Other Quality Issues'].push(sample);
    }
  }

  // Filter out empty categories
  return Object.fromEntries(
    Object.entries(categories).filter(([_, samples]) => samples.length > 0)
  );
}

const categoryIcons: Record<string, React.ReactNode> = {
  'Missing Legal Citations': <FileText className="w-4 h-4" />,
  'Outdated Information': <Clock className="w-4 h-4" />,
  'Unwarranted Assumptions': <UserX className="w-4 h-4" />,
  'Language & Grammar Issues': <Languages className="w-4 h-4" />,
  'Factual Errors': <FileText className="w-4 h-4" />,
  'Other Quality Issues': <Lightbulb className="w-4 h-4" />,
};

const categoryColors: Record<string, string> = {
  'Missing Legal Citations': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  'Outdated Information': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  'Unwarranted Assumptions': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  'Language & Grammar Issues': 'bg-red-500/10 text-red-600 border-red-500/20',
  'Factual Errors': 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  'Other Quality Issues': 'bg-gray-500/10 text-gray-600 border-gray-500/20',
};

export function ExpertInsights({ data }: ExpertInsightsProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Missing Legal Citations');
  const [showCitations, setShowCitations] = useState(false);

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
        Expert feedback reveals specific issues that non-experts often miss. Here are the
        patterns in what domain experts flag as problematic.
      </p>

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
            >
              <div className="flex items-center gap-3">
                {categoryIcons[category]}
                <span className="font-medium">{category}</span>
                <span className="text-sm opacity-70">({samples.length} cases)</span>
              </div>
              {expandedCategory === category ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>

            {expandedCategory === category && (
              <div className="px-4 pb-4 space-y-3">
                {samples.slice(0, 4).map((sample, i) => (
                  <div
                    key={`${sample.unique_id}-${i}`}
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
                  </div>
                ))}
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
            <Link2 className="w-5 h-5 text-emerald-600" />
            <h4 className="font-semibold text-base text-emerald-700">Experts Sometimes Cite Sources</h4>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Some experts included URLs in their feedback to back up their assessments.
          </p>

          <div className="space-y-3">
            {data.withCitations.samples.slice(0, showCitations ? 6 : 2).map((sample, i) => (
              <div
                key={`citation-${i}`}
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
              </div>
            ))}
          </div>

          {data.withCitations.samples.length > 2 && (
            <button
              onClick={() => setShowCitations(!showCitations)}
              className="mt-3 text-sm text-emerald-600 hover:underline flex items-center gap-1"
            >
              {showCitations ? (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Show fewer
                </>
              ) : (
                <>
                  <ChevronRight className="w-4 h-4" />
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
          <p className="pt-2 text-foreground">
            This explains why 97% of distrusted responses come from the <strong>Legal</strong> domain:
            legal advice requires precise, verifiable, current information that experts can validate.
          </p>
        </div>
      </div>
    </div>
  );
}
