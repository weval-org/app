'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { parseModelIdForDisplay, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { cn } from '@/lib/utils';
import ResponseRenderer, { RenderAsType } from '@/app/components/ResponseRenderer';
import { createClientLogger } from '@/app/utils/clientLogger';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import CIPLogo from '@/components/icons/CIPLogo';
import Link from 'next/link';
import Icon from '@/components/ui/icon';
import { InspectorMobileClientPage } from './InspectorMobileClientPage';

// Extracted hooks (barrel import)
import { useIsMobile, useOptimisticNavigation, useScenarioStats } from './hooks';

// Extracted components (barrel import)
import {
  ScenariosColumn,
  ModelsColumn,
  LeaderboardView,
  ExecutiveSummaryView,
  ComparisonView,
  TextualBar,
} from './components';

// Extracted UI components (barrel import)
import {
  CriterionText,
  JudgeReflection,
  ResponseSkeleton,
  EvaluationSkeleton,
} from './components/ui';

// Extracted utilities
import { formatPercentage, truncateText } from './utils/textualUtils';
import { PATH_COLORS } from './utils/inspectorConstants';
import { parseTimestampFromPathname } from './utils/dateUtils';

// Debug loggers
const debug = createClientLogger('InspectorClientPage');

export const InspectorClientPage: React.FC = () => {
  const isMobile = useIsMobile();

  // Show nothing while detecting screen size (prevents layout shift)
  if (isMobile === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  // Route to mobile-specific component
  if (isMobile) {
    return <InspectorMobileClientPage />;
  }

  // Desktop version below
  return <InspectorDesktopClientPage />;
};

// Desktop 3-column version (refactored with extracted components)
const InspectorDesktopClientPage: React.FC = () => {
  const {
    data,
    loading,
    error,
    displayedModels,
    promptTextsForMacroTable,
    getCachedResponse,
    getCachedEvaluation,
    fetchModalResponse,
    fetchEvaluationDetails,
    isLoadingResponse,
    isLoadingEvaluation,
    fetchConversationHistory,
    getCachedConversationHistory,
  } = useAnalysis();

  const pathname = usePathname();

  // Get models without IDEAL
  const models = useMemo(() => {
    return displayedModels.filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase());
  }, [displayedModels]);

  // Use extracted navigation hook
  const {
    showExecutiveSummary,
    showLeaderboard,
    selectedScenario,
    comparisonItems,
    selectExecutiveSummary,
    selectLeaderboard,
    selectScenario,
    toggleModel,
    removeFromComparison,
    clearAllComparisons,
  } = useOptimisticNavigation({ models });

  // Detect if we have multiple system prompts (to determine conditional display)
  const hasMultipleSystemPrompts = useMemo(() => {
    if (!data?.config) return false;
    const systems = data.config.systems || (data.config.system ? [data.config.system] : []);
    return systems.length > 1;
  }, [data?.config]);

  // Calculate navigation URLs
  const fullAnalysisUrl = useMemo(() => {
    return pathname.replace(/\/inspector$/, '');
  }, [pathname]);

  const simpleUrl = useMemo(() => {
    return pathname.replace(/\/inspector$/, '/simple');
  }, [pathname]);

  const baseInspectorUrl = useMemo(() => {
    // Base inspector URL without query params (resets state)
    return pathname;
  }, [pathname]);

  // Extract timestamp from pathname with error handling
  const timestamp = useMemo(() => parseTimestampFromPathname(pathname), [pathname]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading evaluation data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-destructive mb-2">Error loading data</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { evaluationResults: { llmCoverageScores: allCoverageScores }, promptIds, config, promptContexts } = data;

  // Use extracted scenario stats hook
  const scenarioStats = useScenarioStats({
    promptIds,
    promptTexts: promptTextsForMacroTable,
    models,
    allCoverageScores,
  });

  // Auto-select first scenario or exec summary on initial load
  const hasAutoSelectedRef = React.useRef(false);
  useEffect(() => {
    // SAFETY: Only run once on mount
    if (hasAutoSelectedRef.current) return;

    // Only run if nothing is selected
    const urlParams = new URLSearchParams(window.location.search);
    const hasSelection = urlParams.get('scenario') || urlParams.get('view');
    if (hasSelection) {
      hasAutoSelectedRef.current = true;
      return;
    }

    // If executive summary exists, select it
    if (data.executiveSummary) {
      debug.log('Auto-selecting executive summary');
      hasAutoSelectedRef.current = true;
      selectExecutiveSummary();
      return;
    }

    // Otherwise, select first scenario if available
    if (scenarioStats.length > 0) {
      debug.log('Auto-selecting first scenario:', scenarioStats[0].promptId);
      hasAutoSelectedRef.current = true;
      selectScenario(scenarioStats[0].promptId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background font-mono">
      {/* Top bar */}
      <div className="border-b border-border px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Logo + Clickable title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Link href="/" className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <CIPLogo className="w-5 h-5 sm:w-6 sm:h-6 text-foreground flex-shrink-0" />
              <h2 className="text-lg sm:text-xl font-bold text-foreground hover:text-primary transition-colors">
                <span style={{ fontWeight: 700 }}>w</span>
                <span style={{ fontWeight: 200 }}>eval</span>
              </h2>
            </Link>

            <div className="h-6 w-px bg-border hidden sm:block flex-shrink-0" />

            <h1 className="text-sm sm:text-base font-bold truncate min-w-0">
              <Link
                href={baseInspectorUrl}
                className="hover:text-primary transition-colors"
                title={config.title || config.configTitle || config.id || 'Unknown config'}
              >
                {config.title || config.configTitle || config.id || 'Unknown config'}
              </Link>
            </h1>
          </div>

          {/* Right: View switcher + timestamp */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {timestamp && (
              <span className="text-xs text-muted-foreground hidden lg:block">
                {timestamp}
              </span>
            )}

            <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5 bg-muted/20">
              <Link href={simpleUrl}>
                <button className="px-2 sm:px-2.5 py-1 text-xs rounded hover:bg-muted transition-colors">
                  Simple
                </button>
              </Link>
              <button className="px-2 sm:px-2.5 py-1 text-xs rounded bg-primary/10 font-medium pointer-events-none">
                Data Explorer
              </button>
              <Link href={fullAnalysisUrl}>
                <button className="px-2 sm:px-2.5 py-1 text-xs rounded hover:bg-muted transition-colors">
                  Advanced
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area: 3-column desktop, stacked mobile */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Scenarios Column - Full width mobile, fixed width desktop */}
        <div
          className="w-full lg:w-[280px] flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border overflow-auto"
          style={{ contain: 'layout style' }}
          role="navigation"
          aria-label="Scenarios"
        >
          <ErrorBoundary
            fallback={
              <div className="p-4 text-center text-sm text-muted-foreground">
                Failed to load scenarios
              </div>
            }
          >
            <ScenariosColumn
              scenarios={scenarioStats}
              selectedScenario={selectedScenario}
              selectScenario={selectScenario}
              executiveSummary={data.executiveSummary}
              showExecutiveSummary={showExecutiveSummary}
              selectExecutiveSummary={selectExecutiveSummary}
              showLeaderboard={showLeaderboard}
              selectLeaderboard={selectLeaderboard}
            />
          </ErrorBoundary>
        </div>

        {/* Middle: Models Column - Full width mobile (when selected), fixed width desktop */}
        {selectedScenario && (
          <div
            className="w-full lg:w-[280px] flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border overflow-auto"
            style={{ contain: 'layout style' }}
            role="navigation"
            aria-label="Models"
          >
            <ErrorBoundary
              fallback={
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Failed to load models
                </div>
              }
            >
              <ModelsColumn
                promptId={selectedScenario}
                models={models}
                allCoverageScores={allCoverageScores}
                comparisonItems={comparisonItems}
                toggleModel={toggleModel}
                clearAllComparisons={clearAllComparisons}
                hasMultipleSystemPrompts={hasMultipleSystemPrompts}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* Right: Comparison View - Full width mobile, flexible desktop */}
        <div className="flex-1 overflow-auto" role="main" aria-label="Comparison view">
          <div className="p-2 sm:p-4">
            <ErrorBoundary>
              {showExecutiveSummary && data.executiveSummary ? (
                <ExecutiveSummaryView executiveSummary={data.executiveSummary} config={config} />
              ) : showLeaderboard ? (
                <LeaderboardView
                  models={models}
                  allCoverageScores={allCoverageScores}
                  promptIds={promptIds}
                  hasMultipleSystemPrompts={hasMultipleSystemPrompts}
                />
              ) : comparisonItems.length > 0 ? (
                <ComparisonView
                  comparisonItems={comparisonItems}
                  removeFromComparison={removeFromComparison}
                  clearAllComparisons={clearAllComparisons}
                  getCachedResponse={getCachedResponse}
                  getCachedEvaluation={getCachedEvaluation}
                  fetchModalResponse={fetchModalResponse}
                  fetchEvaluationDetails={fetchEvaluationDetails}
                  isLoadingResponse={isLoadingResponse}
                  isLoadingEvaluation={isLoadingEvaluation}
                  allCoverageScores={allCoverageScores}
                  promptTexts={promptTextsForMacroTable}
                  promptContexts={promptContexts || {}}
                  config={config}
                  hasMultipleSystemPrompts={hasMultipleSystemPrompts}
                  fetchConversationHistory={fetchConversationHistory}
                  getCachedConversationHistory={getCachedConversationHistory}
                />
              ) : selectedScenario ? (
                <div className="flex items-center justify-center h-full min-h-[200px]">
                  <div className="text-center text-muted-foreground">
                    <p className="mb-2 text-sm sm:text-base">No models selected</p>
                    <p className="text-xs sm:text-sm">Tap on models above to view their details</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full min-h-[200px]">
                  <div className="text-center text-muted-foreground">
                    <p className="mb-2 text-sm sm:text-base">No scenario selected</p>
                    <p className="text-xs sm:text-sm">Select a scenario from above</p>
                  </div>
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
};
