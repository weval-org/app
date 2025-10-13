'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { LeaderboardSection } from './components/LeaderboardSection';
import { ScenarioTable } from './components/ScenarioTable';
import { ExecutiveSummarySection } from './components/ExecutiveSummarySection';
import { getCanonicalModels, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { formatTimestampForDisplay, fromSafeTimestamp } from '@/lib/timestampUtils';
import { useScenarioDisplayMode, ScenarioDisplayMode } from './hooks/useScenarioDisplayMode';

export const TextualClientPage: React.FC = () => {
  const {
    data,
    loading,
    error,
    promptNotFound,
    displayedModels,
    promptTextsForMacroTable,
    configId,
    runLabel,
    timestamp,
    pageTitle,
    currentPromptId,
    openModelPerformanceModal,
  } = useAnalysis();

  const { mode: displayMode, setMode: setDisplayMode } = useScenarioDisplayMode();

  useEffect(() => {
    if (pageTitle) {
      document.title = `${pageTitle} - Textual View`;
    }
  }, [pageTitle]);

  // Get models grouped by baseId + systemPromptIndex (keep sys variants separate, collapse temp variants)
  // Use displayedModels (not modelsForMacroTable) to show ALL system prompt variants
  const modelsForTextualView = useMemo(() => {
    if (!data?.config) return [];
    const filtered = displayedModels.filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase());

    // Group by baseId + systemPromptIndex, pick first temperature variant as representative
    const grouped = new Map<string, string>();
    filtered.forEach(modelId => {
      const parsed = parseModelIdForDisplay(modelId);
      const key = `${parsed.baseId}::${parsed.systemPromptIndex ?? 0}`;
      if (!grouped.has(key)) {
        grouped.set(key, modelId);
      }
    });

    return Array.from(grouped.values());
  }, [displayedModels, data?.config]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <p className="text-lg text-muted-foreground">Loading analysis data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto my-10 p-4 border border-destructive rounded-lg">
        <h3 className="font-semibold text-destructive mb-2">Error Loading Data</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (promptNotFound) {
    return (
      <div className="max-w-2xl mx-auto my-10 p-4 border border-destructive rounded-lg">
        <h3 className="font-semibold text-destructive mb-2">Prompt Not Found</h3>
        <p className="text-sm text-muted-foreground mb-2">
          The prompt ID <code className="font-mono bg-muted px-1 py-0.5 rounded">{currentPromptId}</code> was not
          found in this evaluation run.
        </p>
        <Link href={`/analysis/${configId}/${runLabel}/${timestamp}/textual`}>
          <Button variant="link" className="p-0 h-auto">
            Clear prompt selection
          </Button>
        </Link>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { evaluationResults: { llmCoverageScores: allCoverageScores }, promptIds, config } = data;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-[1600px] space-y-6">
        {/* Page Header */}
        <div className="pb-4 border-b border-border">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {data.configTitle || configId}
            </h1>
            <span className="px-2 py-1 text-xs font-mono text-muted-foreground border border-border rounded">
              Textual View
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium">{data.runLabel || runLabel}</span>
              {timestamp && (
                <>
                  <span>•</span>
                  <span>{formatTimestampForDisplay(fromSafeTimestamp(timestamp))}</span>
                </>
              )}
              <span>•</span>
              <span>
                {modelsForTextualView.length} model{modelsForTextualView.length !== 1 ? 's' : ''} × {promptIds.length} scenario
                {promptIds.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Navigation Links */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Link href={`/analysis/${configId}/${runLabel}/${timestamp}`} className="text-muted-foreground hover:text-foreground underline">
                Full View
              </Link>
              <Link href={`/analysis/${configId}/${runLabel}/${timestamp}/simple`} className="text-muted-foreground hover:text-foreground underline">
                Simple View
              </Link>
              <Link href={`/analysis/${configId}/${runLabel}/${timestamp}/thread`} className="text-muted-foreground hover:text-foreground underline">
                Dialog Tree
              </Link>
            </div>
          </div>
        </div>

        {/* Executive Summary Section */}
        {data.executiveSummary && (
          <ExecutiveSummarySection executiveSummary={data.executiveSummary} />
        )}

        {/* Leaderboard Section */}
        <LeaderboardSection
          allCoverageScores={allCoverageScores}
          promptIds={promptIds}
          models={modelsForTextualView}
          config={config}
          onModelClick={openModelPerformanceModal}
        />

        {/* Display Mode Selector */}
        <div className="flex items-center justify-end gap-2 py-2">
          <span className="text-xs text-muted-foreground">Scenario detail view:</span>
          <div className="inline-flex rounded-lg border border-border bg-card/30 p-1">
            <button
              onClick={() => setDisplayMode('detailed')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                displayMode === 'detailed'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Detailed
            </button>
            <button
              onClick={() => setDisplayMode('compact')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                displayMode === 'compact'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Compact
            </button>
            <button
              onClick={() => setDisplayMode('table')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                displayMode === 'table'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setDisplayMode('engineer')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                displayMode === 'engineer'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Engineer
            </button>
          </div>
        </div>

        {/* Scenario Table */}
        <ScenarioTable
          allCoverageScores={allCoverageScores}
          promptIds={promptIds}
          promptTexts={promptTextsForMacroTable}
          models={modelsForTextualView}
          config={config}
          displayMode={displayMode}
        />

        {/* Footer */}
        <div className="pt-4 border-t border-border text-center text-sm text-muted-foreground">
          <p>
            Simplified view optimized for quick scanning.{' '}
            <Link href={`/analysis/${configId}/${runLabel}/${timestamp}`} className="text-foreground hover:underline">
              Switch to full view
            </Link>
            {' '}for advanced analysis tools.
          </p>
        </div>
      </div>
    </div>
  );
};
