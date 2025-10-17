import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import Icon from '@/components/ui/icon';
import { TextualBar } from './TextualBar';
import { formatPercentage, truncateText } from '../utils/textualUtils';
import { ScenariosColumnProps } from '../types/engTypes';
import { createClientLogger } from '@/app/utils/clientLogger';

const debug = createClientLogger('ScenariosColumn');

/**
 * Left column showing scenarios, executive summary, and leaderboard navigation
 * Supports keyboard navigation (arrow keys + enter)
 */
export const ScenariosColumn = React.memo<ScenariosColumnProps>(function ScenariosColumn({
  scenarios,
  selectedScenario,
  selectScenario,
  executiveSummary,
  showExecutiveSummary,
  selectExecutiveSummary,
  showLeaderboard,
  selectLeaderboard,
}) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Total items including Overview and Leaderboard
    const hasOverview = !!executiveSummary;
    const totalSpecialItems = hasOverview ? 2 : 1; // Overview (-1) + Leaderboard (-2), or just Leaderboard
    const totalItems = totalSpecialItems + scenarios.length;
    if (totalItems === 0) return;

    // focusedIndex: null = no focus, -1 = Overview, -2 = Leaderboard, 0+ = scenarios
    const currentFocus = focusedIndex ?? -3; // -3 = no focus (outside range)

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentFocus === -3 || currentFocus < -2) {
        // Start at Overview if it exists, otherwise Leaderboard
        setFocusedIndex(hasOverview ? -1 : -2);
      } else {
        const nextIndex = Math.min(currentFocus + 1, scenarios.length - 1);
        setFocusedIndex(nextIndex);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const minIndex = hasOverview ? -1 : -2;
      const prevIndex = Math.max(currentFocus - 1, minIndex);
      setFocusedIndex(prevIndex);
    } else if (e.key === 'Enter' && focusedIndex !== null) {
      e.preventDefault();
      if (focusedIndex === -1 && hasOverview) {
        selectExecutiveSummary();
      } else if (focusedIndex === -2) {
        selectLeaderboard();
      } else if (focusedIndex >= 0) {
        const scenario = scenarios[focusedIndex];
        if (scenario) {
          selectScenario(scenario.promptId);
        }
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="p-2 font-mono text-sm animate-in fade-in duration-200 focus-within:outline-none"
      style={{ touchAction: 'pan-y pinch-zoom' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={() => setFocusedIndex(null)}
      onBlur={() => setFocusedIndex(null)}
    >
      {/* Overview Option */}
      {executiveSummary && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Overview"
          aria-pressed={showExecutiveSummary}
          className={cn(
            "flex items-center gap-2 px-3 py-3 sm:px-2.5 sm:py-2 mb-2 rounded-md cursor-pointer transition-all duration-200 touch-manipulation border",
            showExecutiveSummary
              ? "bg-primary/15 border-primary/30 shadow-md"
              : "bg-muted/60 border-border hover:bg-muted hover:border-primary/20 hover:shadow-sm active:bg-muted",
            focusedIndex === -1 && "ring-2 ring-primary/50"
          )}
          onClick={selectExecutiveSummary}
        >
          <Icon name="file-text" className={cn("w-4 h-4 flex-shrink-0", showExecutiveSummary ? "text-primary" : "text-muted-foreground")} />
          <span className={cn("flex-1 font-semibold text-sm", showExecutiveSummary && "text-primary")}>Overview</span>
          {showExecutiveSummary && (
            <Icon name="chevron-right" className="w-3.5 h-3.5 text-primary flex-shrink-0" aria-hidden="true" />
          )}
        </div>
      )}

      {/* Leaderboard Option */}
      <div
        role="button"
        tabIndex={-1}
        aria-label="Leaderboard"
        aria-pressed={showLeaderboard}
        className={cn(
          "flex items-center gap-2 px-3 py-3 sm:px-2.5 sm:py-2 mb-2 rounded-md cursor-pointer transition-all duration-200 touch-manipulation border",
          showLeaderboard
            ? "bg-primary/15 border-primary/30 shadow-md"
            : "bg-muted/60 border-border hover:bg-muted hover:border-primary/20 hover:shadow-sm active:bg-muted",
          focusedIndex === -2 && "ring-2 ring-primary/50"
        )}
        onClick={selectLeaderboard}
      >
        <Icon name="bar-chart-3" className={cn("w-4 h-4 flex-shrink-0", showLeaderboard ? "text-primary" : "text-muted-foreground")} />
        <span className={cn("flex-1 font-semibold text-sm", showLeaderboard && "text-primary")}>Leaderboard</span>
        {showLeaderboard && (
          <Icon name="chevron-right" className="w-3.5 h-3.5 text-primary flex-shrink-0" aria-hidden="true" />
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-border my-2" />

      <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
        SCENARIOS
      </div>

      {/* Scenario List */}
      <div className="space-y-1 sm:space-y-0.5">
        {scenarios.map((scenario, idx) => {
          const isSelected = selectedScenario === scenario.promptId;
          const score = scenario.avgScore;
          const hasScore = score > 0;
          const isFocused = focusedIndex === (executiveSummary ? idx : idx);

          // Color based on score
          const scoreColor = hasScore && score >= 0.8
            ? 'text-green-600 dark:text-green-400'
            : hasScore && score >= 0.5
            ? 'text-amber-600 dark:text-amber-400'
            : hasScore
            ? 'text-red-600 dark:text-red-400'
            : 'text-muted-foreground';

          return (
            <div
              key={scenario.promptId}
              role="button"
              tabIndex={-1}
              aria-label={`Scenario ${scenario.index + 1}: ${scenario.promptText}`}
              aria-pressed={isSelected}
              className={cn(
                "flex flex-col gap-0.5 px-3 py-2.5 sm:px-2 sm:py-1 rounded cursor-pointer transition-all duration-200 touch-manipulation",
                isSelected
                  ? "bg-primary/10 shadow-sm scale-[1.01]"
                  : "hover:bg-muted/30 hover:shadow-sm hover:scale-[1.005] active:bg-muted/50",
                isFocused && "ring-2 ring-primary/50"
              )}
              onClick={() => {
                debug.log('ScenariosColumn onClick - CLICK EVENT', {
                  promptId: scenario.promptId,
                  timestamp: performance.now()
                });
                selectScenario(scenario.promptId);
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs min-w-[2ch]" aria-hidden="true">
                  {String(scenario.index + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 truncate text-xs sm:text-xs">
                  {truncateText(scenario.promptText, 30)}
                </span>
                {isSelected && (
                  <span className="text-primary text-xs animate-pulse" aria-hidden="true">●</span>
                )}
                {hasScore && !isSelected && (
                  <span className={cn("text-right text-xs min-w-[3ch] font-mono", scoreColor)} aria-hidden="true">
                    {formatPercentage(score, 0)}
                  </span>
                )}
              </div>
              {hasScore && (
                <div className="ml-6 h-[0.35rem] overflow-hidden" aria-hidden="true">
                  <TextualBar score={score} length={18} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
