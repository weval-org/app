'use client';

import React from 'react';
import { HeroStat } from './components/HeroStat';
import { ContextSection } from './components/ContextSection';
import { ComparisonGame } from './components/ComparisonGame';
import { LanguageBreakdown } from './components/LanguageBreakdown';
import { EqualVerdicts } from './components/EqualVerdicts';
import { RubricOverview } from './components/RubricOverview';
import { OverlapWorkersAnalysis } from './components/OverlapWorkersAnalysis';
import { EvaluatorProfiles } from './components/EvaluatorProfiles';
import { WorkerReliabilityChart } from './components/WorkerReliabilityChart';
import { MethodologyNotes } from './components/MethodologyNotes';
import { DataExplorer } from './components/DataExplorer';
import { Footer } from './components/Footer';
import { HumanLLMComparison } from './components/HumanLLMComparison';
import { TableOfContents } from './components/TableOfContents';

export interface CriterionAgreement {
  correlation: number;
  meanDiff: number;
  humanMean: number;
  llmMean: number;
  n: number;
}

export interface HumanLLMAgreementData {
  perCriterion: {
    trust: CriterionAgreement;
    fluency: CriterionAgreement;
    complexity: CriterionAgreement;
    code_switching: CriterionAgreement;
  };
  overall: {
    correlation: number;
    meanDiff: number;
    totalComparisons: number;
    disagreementCount: number;
    disagreementRate: number;
  };
  perCriterionHighReliability?: {
    trust: CriterionAgreement;
    fluency: CriterionAgreement;
    complexity: CriterionAgreement;
    code_switching: CriterionAgreement;
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

export interface ComparativeResults {
  totalComparisons: number;
  totalWorkers: number;
  opusWinRate: number;
  overall: {
    opus: number;
    sonnet: number;
    equal_good: number;
    equal_bad: number;
  };
  byLanguage: Record<string, {
    opus: number;
    sonnet: number;
    equal_good?: number;
    equal_bad?: number;
    total: number;
  }>;
  topWorkers: Array<{
    workerId: string;
    comparisons: number;
    opus: number;
    sonnet: number;
    equalGood: number;
    equalBad: number;
    languages: string[];
    domains: string[];
    opusRate: number;
    samples: Array<{
      question: string;
      choice: string;
      language: string;
      domain: string;
    }>;
  }>;
}

export interface SampleComparison {
  language: string;
  domain: string;
  question: string;
  answer1: string;
  answer2: string;
  answer1Model: string;
  answer2Model: string;
  workerChoice: 'opus' | 'sonnet' | 'equal_good' | 'equal_bad' | 'unknown';
}

export interface RubricSummary {
  totalRatings: number;
  overall: {
    opus: { trust: number; fluency: number; complexity: number; code_switching: number };
    sonnet: { trust: number; fluency: number; complexity: number; code_switching: number };
    opus_count: number;
    sonnet_count: number;
  };
  byLanguage: Record<string, {
    opus: { trust: number; fluency: number; complexity: number; code_switching: number };
    sonnet: { trust: number; fluency: number; complexity: number; code_switching: number };
    count: number;
  }>;
  workerReliability: {
    total_workers: number;
    high_reliability: number;
    medium_reliability: number;
    low_reliability: number;
  };
  rawSamples: Array<{
    prompt_id: string;
    language: string;
    model: string;
    scores: { trust: number | null; fluency: number | null; complexity: number | null; code_switching: number | null };
    raw: { trust?: string; fluency?: string; complexity?: string; code_switching?: string };
    worker_tier: string;
  }>;
}

export interface OverlapWorkersData {
  summary: {
    totalWorkers: number;
    paradoxicalCount: number;
    consistentCount: number;
    abOpusRate: number;
    rubricOpusAvg: number;
    rubricSonnetAvg: number;
  };
  workers: Array<{
    workerId: string;
    languages: string[];
    ab: {
      opus: number;
      sonnet: number;
      equalGood: number;
      total: number;
      opusRate: number;
    };
    rubric: {
      opus: { trust: number; fluency: number; complexity: number; code_switching: number };
      sonnet: { trust: number; fluency: number; complexity: number; code_switching: number };
      opusOverall: number;
      sonnetOverall: number;
      count: number;
    };
    isParadox: boolean;
  }>;
  featuredCase: {
    workerId: string;
    languages: string[];
    ab: {
      opus: number;
      sonnet: number;
      equalGood: number;
      total: number;
      opusRate: number;
    };
    rubric: {
      opus: { trust: number; fluency: number; complexity: number; code_switching: number };
      sonnet: { trust: number; fluency: number; complexity: number; code_switching: number };
      opusOverall: number;
      sonnetOverall: number;
      count: number;
    };
    isParadox: boolean;
  };
}

interface V2ClientProps {
  comparativeResults: ComparativeResults;
  sampleComparisons: SampleComparison[];
  rubricSummary: RubricSummary | null;
  overlapWorkers: OverlapWorkersData | null;
  humanLLMAgreement: HumanLLMAgreementData | null;
}

export function V2Client({ comparativeResults, sampleComparisons, rubricSummary, overlapWorkers, humanLLMAgreement }: V2ClientProps) {
  const { overall, byLanguage, topWorkers, opusWinRate, totalComparisons, totalWorkers } = comparativeResults;

  // Calculate stats
  const totalDecided = overall.opus + overall.sonnet;
  const opusPercent = Math.round(opusWinRate * 100);

  // Prepare language data sorted by opus rate
  const languageData = Object.entries(byLanguage)
    .map(([lang, stats]) => {
      const decided = (stats.opus || 0) + (stats.sonnet || 0);
      return {
        language: lang,
        decided,
        total: stats.total,
        opusRate: decided > 0 ? (stats.opus || 0) / decided : 0,
        equalGood: stats.equal_good || 0,
      };
    })
    .filter(l => l.decided > 0)
    .sort((a, b) => b.opusRate - a.opusRate);

  // Curate interesting worker profiles
  const curatedProfiles = getCuratedProfiles(topWorkers);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Load fonts */}
      <link
        href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      {/* Hero */}
      <HeroStat
        percentage={opusPercent}
        totalComparisons={totalComparisons}
        totalRatings={rubricSummary?.totalRatings || 0}
        totalWorkers={rubricSummary?.workerReliability?.total_workers || totalWorkers}
      />

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Context */}
        <ContextSection />

        {/* Table of Contents */}
        <TableOfContents />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PART 1: HEAD-TO-HEAD COMPARISONS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {/* Section header */}
        <div id="head-to-head" className="pt-8 sm:pt-12 pb-4 scroll-mt-8">
          <div className="text-xs sm:text-sm uppercase tracking-wide text-muted-foreground mb-2">
            Part 1: Head-to-Head Comparisons
          </div>
          <h2
            className="text-2xl sm:text-3xl font-semibold text-foreground"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Which Response Did They Prefer?
          </h2>
        </div>

        {/* Interactive comparison game */}
        <ComparisonGame samples={sampleComparisons} />

        {/* Language breakdown */}
        <LanguageBreakdown data={languageData} />

        {/* Equal verdicts */}
        <EqualVerdicts
          opus={overall.opus}
          sonnet={overall.sonnet}
          equalGood={overall.equal_good}
          equalBad={overall.equal_bad}
        />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PART 2: RUBRIC-BASED RATINGS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <div id="rubric-ratings" className="scroll-mt-8">
          {rubricSummary && (
            <RubricOverview
              opus={rubricSummary.overall.opus}
              sonnet={rubricSummary.overall.sonnet}
              totalRatings={rubricSummary.totalRatings}
              byLanguage={rubricSummary.byLanguage}
            />
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* DEEP DIVE: OVERLAP WORKERS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <div id="the-paradox" className="scroll-mt-8">
          {overlapWorkers && (
            <OverlapWorkersAnalysis data={overlapWorkers} />
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PART 3: THE EVALUATORS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <div id="evaluators" className="py-16 sm:py-24 border-t border-border scroll-mt-8">
          <div className="text-xs sm:text-sm uppercase tracking-wide text-muted-foreground mb-2">
            Part 3: The Evaluators
          </div>
          <h2
            className="text-2xl sm:text-3xl font-semibold text-foreground mb-8"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Who Did the Evaluating?
          </h2>

          {/* Worker reliability chart */}
          {rubricSummary?.workerReliability && (
            <div className="mb-10">
              <WorkerReliabilityChart
                high={rubricSummary.workerReliability.high_reliability}
                medium={rubricSummary.workerReliability.medium_reliability}
                low={rubricSummary.workerReliability.low_reliability}
              />
            </div>
          )}

          {/* Curated profiles - render inline without section wrapper */}
          {curatedProfiles.length > 0 && (
            <div>
              <h3 className="font-semibold text-base sm:text-lg mb-4">Notable Evaluator Patterns</h3>
              <p className="text-sm sm:text-base text-muted-foreground mb-6">
                Among the {rubricSummary?.workerReliability?.total_workers || totalWorkers} workers, here are some interesting patterns.
              </p>
              <EvaluatorProfiles profiles={curatedProfiles} inline />
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PART 4: HUMAN VS LLM JUDGES */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <div id="human-vs-llm" className="scroll-mt-8">
          {humanLLMAgreement && (
            <HumanLLMComparison data={humanLLMAgreement} />
          )}
        </div>

        {/* Methodology */}
        <div id="methodology" className="scroll-mt-8">
          <MethodologyNotes />
        </div>

        {/* Data explorer */}
        <div id="data-explorer" className="scroll-mt-8">
          <DataExplorer
            samples={sampleComparisons}
            languageData={languageData}
          />
        </div>

        {/* Footer */}
        <Footer />
      </main>
    </div>
  );
}

// Curate interesting worker profiles rather than just high-volume
function getCuratedProfiles(workers: ComparativeResults['topWorkers']) {
  const profiles: Array<{
    title: string;
    subtitle: string;
    worker: ComparativeResults['topWorkers'][0];
  }> = [];

  // Find workers with decisions
  const withDecisions = workers.filter(w => (w.opus + w.sonnet) > 0);

  // The Opus Advocate - highest opus rate with reasonable sample
  const opusAdvocate = withDecisions
    .filter(w => (w.opus + w.sonnet) >= 50)
    .sort((a, b) => b.opusRate - a.opusRate)[0];
  if (opusAdvocate) {
    profiles.push({
      title: 'The Opus Advocate',
      subtitle: `Chose Opus ${Math.round(opusAdvocate.opusRate * 100)}% of the time`,
      worker: opusAdvocate,
    });
  }

  // The Sonnet Advocate - lowest opus rate (meaning highest sonnet preference)
  const sonnetAdvocate = withDecisions
    .filter(w => (w.opus + w.sonnet) >= 50 && w.opusRate < 0.5)
    .sort((a, b) => a.opusRate - b.opusRate)[0];
  if (sonnetAdvocate) {
    profiles.push({
      title: 'The Sonnet Advocate',
      subtitle: `Chose Sonnet ${Math.round((1 - sonnetAdvocate.opusRate) * 100)}% of the time`,
      worker: sonnetAdvocate,
    });
  }

  // The Diplomat - most "equal good" responses
  const diplomat = workers
    .filter(w => w.comparisons >= 50)
    .sort((a, b) => (b.equalGood / b.comparisons) - (a.equalGood / a.comparisons))[0];
  if (diplomat && diplomat.equalGood > 20) {
    profiles.push({
      title: 'The Diplomat',
      subtitle: `Said "equally good" ${Math.round(diplomat.equalGood / diplomat.comparisons * 100)}% of the time`,
      worker: diplomat,
    });
  }

  // The Polyglot - evaluated in multiple languages
  const polyglot = workers
    .filter(w => w.languages.length >= 2 && (w.opus + w.sonnet) > 0)
    .sort((a, b) => b.comparisons - a.comparisons)[0];
  if (polyglot) {
    profiles.push({
      title: 'The Polyglot',
      subtitle: `Evaluated in ${polyglot.languages.join(' & ')}`,
      worker: polyglot,
    });
  }

  return profiles;
}
