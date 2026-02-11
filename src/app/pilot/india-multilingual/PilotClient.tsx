'use client';

import React from 'react';
import { ConversationMessage, DataQuality, HumanLLMAgreement, LLMCoverageScores } from '@/types/shared';
import { HeroSection } from './components/HeroSection';
import { MethodologySection } from './components/MethodologySection';
import { HeadToHeadResults, ComparativeResults } from './components/HeadToHeadResults';
import { ExemplarWorkers, WorkerProfile } from './components/ExemplarWorkers';
import { FindingsSection } from './components/FindingsSection';
import { BreakdownTable } from './components/BreakdownTable';
import { DisagreementExplorer } from './components/DisagreementExplorer';
import { PromptExplorer } from './components/PromptExplorer';
import { DataQualitySection } from './components/DataQualitySection';
import { ImplicationsSection } from './components/ImplicationsSection';
import { PilotFooter } from './components/PilotFooter';

export interface PilotData {
  configId: string;
  runLabel: string;
  timestamp: string;
  title: string;
  description?: string;
  promptIds: string[];
  models: string[];
  humanLLMAgreement: HumanLLMAgreement | null;
  humanLLMAgreementHighReliability: HumanLLMAgreement | null;
  dataQuality: DataQuality | null;
  executiveSummary?: string;
  llmCoverageScores: LLMCoverageScores | null;
  promptContexts: Record<string, string | ConversationMessage[]>;
  comparativeResults: {
    totalComparisons: number;
    totalWorkers: number;
    opusWinRate: number;
    overall: ComparativeResults['overall'];
    byLanguage: ComparativeResults['byLanguage'];
    byDomain: ComparativeResults['byDomain'];
    topWorkers: WorkerProfile[];
  } | null;
}

interface PilotClientProps {
  data: PilotData;
}

export function PilotClient({ data }: PilotClientProps) {
  const { humanLLMAgreement, humanLLMAgreementHighReliability, dataQuality, comparativeResults } = data;

  // Use high-reliability data for disagreement explorer when available
  const displayDisagreements = humanLLMAgreementHighReliability?.disagreements || humanLLMAgreement?.disagreements || [];

  // Scoped font styles for this pilot page
  const fontStyles = {
    fontFamily: 'aktiv-grotesk, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  };

  return (
    <>
      {/* Load Google Font for this page */}
      <link
        href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&display=swap"
        rel="stylesheet"
      />

      <div
        className="min-h-screen bg-background text-foreground"
        style={fontStyles}
      >
        <main className="max-w-4xl mx-auto px-6 py-12 space-y-16">
          {/* Hero / Introduction */}
          <HeroSection />

          {/* The Questions */}
          <section className="space-y-6">
            <h2
              className="text-2xl font-semibold"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              The Questions
            </h2>
            <div className="prose prose-slate dark:prose-invert max-w-none space-y-4">
              <p className="text-lg text-muted-foreground leading-relaxed">
                This evaluation explores multiple dimensions of AI performance in multilingual, domain-specific contexts:
              </p>
              <ul className="text-muted-foreground space-y-2 list-none p-0">
                <li className="flex gap-3">
                  <span className="text-primary">1.</span>
                  <span><strong className="text-foreground">Model comparison:</strong> When native speakers directly compare Opus 4.5 and Sonnet 4.5 responses to the same question, which do they prefer?</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary">2.</span>
                  <span><strong className="text-foreground">Domain expertise:</strong> Can models provide accurate, actionable guidance on legal rights and agricultural practices specific to India?</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary">3.</span>
                  <span><strong className="text-foreground">Judge calibration:</strong> Are LLM judges reliable for evaluating non-English content, or do they miss nuances that native speakers recognize?</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary">4.</span>
                  <span><strong className="text-foreground">Cultural context:</strong> How do models and judges handle code-switching, regional fluency norms, and domain-specific terminology?</span>
                </li>
              </ul>
              <p className="text-lg text-muted-foreground leading-relaxed">
                We answer these with two complementary datasets: <strong>10,629 head-to-head comparisons</strong> where
                native speakers chose between Opus and Sonnet, plus <strong>10,562 rubric-based ratings</strong> measuring
                trust, fluency, and language quality.
              </p>
            </div>
          </section>

          {/* Methodology */}
          <MethodologySection models={data.models} promptCount={data.promptIds.length} />

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* THE MAIN EVENT: Head-to-Head Results */}
          {/* ═══════════════════════════════════════════════════════════════════ */}

          {comparativeResults && (
            <HeadToHeadResults data={comparativeResults} />
          )}

          {/* Exemplar Workers */}
          {comparativeResults?.topWorkers && (
            <ExemplarWorkers workers={comparativeResults.topWorkers} />
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* LLM JUDGE CALIBRATION */}
          {/* ═══════════════════════════════════════════════════════════════════ */}

          {/* Section header for judge calibration */}
          {humanLLMAgreement && (
            <div className="pt-8 border-t border-border">
              <div className="text-sm uppercase tracking-wide text-muted-foreground mb-2">
                LLM Judge Calibration
              </div>
              <p className="text-muted-foreground">
                Beyond head-to-head comparisons, we also collected rubric-based ratings (trust, fluency, complexity,
                code-switching) from native speakers and compared them to LLM judge assessments.
              </p>
            </div>
          )}

          {/* Human vs LLM Judge Findings */}
          {humanLLMAgreement && (
            <FindingsSection humanLLMAgreement={humanLLMAgreement} />
          )}

          {/* Detailed Breakdown */}
          {humanLLMAgreement && (
            <BreakdownTable humanLLMAgreement={humanLLMAgreement} />
          )}

          {/* Data Quality Section */}
          {dataQuality && (
            <DataQualitySection dataQuality={dataQuality} />
          )}

          {/* Notable Disagreements - from high-reliability workers when available */}
          {displayDisagreements.length > 0 && (
            <DisagreementExplorer
              disagreements={displayDisagreements}
              configId={data.configId}
              runLabel={data.runLabel}
              timestamp={data.timestamp}
              isHighReliabilityFiltered={!!humanLLMAgreementHighReliability}
              promptContexts={data.promptContexts}
            />
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* EXPLORATION */}
          {/* ═══════════════════════════════════════════════════════════════════ */}

          {/* Full Prompt Explorer */}
          {data.llmCoverageScores && data.promptContexts && (
            <PromptExplorer
              promptIds={data.promptIds}
              promptContexts={data.promptContexts}
              llmCoverageScores={data.llmCoverageScores}
              models={data.models}
              configId={data.configId}
              runLabel={data.runLabel}
              timestamp={data.timestamp}
            />
          )}

          {/* Implications */}
          <ImplicationsSection />

          {/* Footer */}
          <PilotFooter />
        </main>
      </div>
    </>
  );
}
