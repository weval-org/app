'use client';

import React from 'react';
import { Award } from 'lucide-react';
import { ExpertAgreement } from './ExpertAgreement';
import { ExpertDistrust } from './ExpertDistrust';
import { ExpertInsights } from './ExpertInsights';

// Type definitions for expert data
export interface ExpertSummaryData {
  totalEvaluations: number;
  uniqueResponses: number;
  uniqueWorkers: number;
  overall: Record<string, {
    trust: number;
    fluency: number;
    complexity: number;
    code_switching: number;
    count: number;
  }>;
  byLanguage: Record<string, Record<string, {
    trust: number;
    fluency: number;
    complexity: number;
    code_switching: number;
    count: number;
  }>>;
  byDomain: Record<string, Record<string, {
    trust: number;
    fluency: number;
    complexity: number;
    code_switching: number;
    count: number;
  }>>;
  trustDistribution: Record<string, number>;
  distrust: {
    total: number;
    byModel: Record<string, number>;
    byLanguage: Record<string, number>;
    byDomain: Record<string, number>;
  };
  feedback: {
    total: number;
    withCitations: number;
  };
  contentErrors: Record<string, number>;
}

export interface ExpertVsNonExpertData {
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
  sampleCases: {
    expertsMoreSkeptical: Array<{
      unique_id: string;
      language: string;
      domain: string;
      model: string;
      expert_trust: number;
      nonexpert_avg_trust: number;
      nonexpert_count: number;
      trust_diff: number;
      expert_feedback: string | null;
    }>;
    expertsMoreTrusting: Array<{
      unique_id: string;
      language: string;
      domain: string;
      model: string;
      expert_trust: number;
      nonexpert_avg_trust: number;
      nonexpert_count: number;
      trust_diff: number;
      expert_feedback: string | null;
    }>;
  };
}

export interface ExpertDistrustData {
  total: number;
  byModel: Record<string, number>;
  byLanguage: Record<string, number>;
  byDomain: Record<string, number>;
  cases: Array<{
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
  }>;
}

export interface ExpertFeedbackHighlights {
  withCitations: {
    count: number;
    samples: Array<{
      unique_id: string;
      model: string;
      language: string;
      domain: string;
      trust: string;
      feedback: string;
    }>;
  };
  distrustWithExplanation: {
    count: number;
    samples: Array<{
      unique_id: string;
      model: string;
      language: string;
      domain: string;
      trust: string;
      feedback: string;
    }>;
  };
  qualityInsights: {
    count: number;
    samples: Array<{
      unique_id: string;
      model: string;
      language: string;
      domain: string;
      trust: string;
      feedback: string;
    }>;
  };
}

interface ExpertLensSectionProps {
  summary: ExpertSummaryData;
  comparison: ExpertVsNonExpertData;
  distrustCases: ExpertDistrustData;
  feedbackHighlights: ExpertFeedbackHighlights;
}

export function ExpertLensSection({
  summary,
  comparison,
  distrustCases,
  feedbackHighlights,
}: ExpertLensSectionProps) {
  return (
    <section
      id="expert-lens"
      className="py-16 sm:py-24 border-t border-border scroll-mt-8"
      aria-labelledby="expert-lens-title"
    >
      {/* Section header */}
      <div className="mb-8 sm:mb-12">
        <div className="text-xs sm:text-sm uppercase tracking-wide text-emerald-600 mb-2 flex items-center gap-2">
          <Award className="w-4 h-4" />
          Part 5: The Expert Lens
        </div>
        <h2
          id="expert-lens-title"
          className="text-2xl sm:text-3xl font-semibold text-foreground mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          What Domain Experts See Differently
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground">
          In addition to {summary.totalEvaluations > 20000 ? '20,000+' : summary.totalEvaluations.toLocaleString()} non-expert
          evaluations, we collected <strong className="text-foreground">{summary.totalEvaluations.toLocaleString()} ratings
          from {summary.uniqueWorkers} domain experts</strong> — legal professionals and agricultural specialists
          who can assess factual accuracy, not just linguistic quality.
        </p>
      </div>

      {/* Expert intro stats */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 mb-10">
        <div className="grid sm:grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-emerald-600">{summary.uniqueWorkers}</div>
            <div className="text-sm text-muted-foreground">Domain Experts</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{summary.totalEvaluations.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Expert Ratings</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">{summary.feedback.total.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Written Feedback</div>
          </div>
        </div>
      </div>

      {/* Expert vs Non-Expert Agreement */}
      <ExpertAgreement data={comparison} />

      {/* When Experts Distrust */}
      <ExpertDistrust data={distrustCases} />

      {/* What Experts Catch */}
      <ExpertInsights data={feedbackHighlights} />
    </section>
  );
}
