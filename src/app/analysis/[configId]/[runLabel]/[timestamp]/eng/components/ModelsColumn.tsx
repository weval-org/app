import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { TextualBar } from './TextualBar';
import { formatPercentage } from '../utils/textualUtils';
import { ModelsColumnProps } from '../types/engTypes';
import { parseModelIdForDisplay, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { createClientLogger } from '@/app/utils/clientLogger';

const debug = createClientLogger('ModelsColumn');

/**
 * Middle column showing models for the selected scenario
 * Allows toggling models for comparison
 * Supports keyboard navigation (arrow keys + enter/space)
 */
export const ModelsColumn = React.memo<ModelsColumnProps>(function ModelsColumn({
  promptId,
  models,
  allCoverageScores,
  comparisonItems,
  toggleModel,
  clearAllComparisons,
  hasMultipleSystemPrompts,
}) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Group models by baseId
  const baseModels = useMemo(() => {
    const baseModelMap = new Map<string, {
      baseId: string;
      displayName: string;
      variants: string[];
      avgScore: number | null;
    }>();

    models.forEach(modelId => {
      const parsed = parseModelIdForDisplay(modelId);
      const baseId = parsed.baseId;

      if (!baseModelMap.has(baseId)) {
        const displayName = getModelDisplayLabel(parsed, {
          hideProvider: true,
          prettifyModelName: true,
          hideTemperature: true,
          hideSystemPrompt: !hasMultipleSystemPrompts,
        });
        baseModelMap.set(baseId, {
          baseId,
          displayName,
          variants: [],
          avgScore: null,
        });
      }

      const baseModel = baseModelMap.get(baseId)!;
      baseModel.variants.push(modelId);
    });

    // Calculate average scores (may be null if no scores available)
    baseModelMap.forEach(baseModel => {
      const scores = baseModel.variants.map(variantId => {
        const result = allCoverageScores?.[promptId]?.[variantId];
        return result && !('error' in result) ? result.avgCoverageExtent : null;
      }).filter((s): s is number => s !== null);

      baseModel.avgScore = scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : null;
    });

    // Sort by score if available, otherwise alphabetically
    return Array.from(baseModelMap.values()).sort((a, b) => {
      if (a.avgScore !== null && b.avgScore !== null) {
        return b.avgScore - a.avgScore;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }, [models, promptId, allCoverageScores, hasMultipleSystemPrompts]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (baseModels.length === 0) return;

    const currentFocus = focusedIndex ?? -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentFocus === -1 ? 0 : Math.min(currentFocus + 1, baseModels.length - 1);
      setFocusedIndex(nextIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = Math.max(currentFocus - 1, 0);
      setFocusedIndex(prevIndex);
    } else if (e.key === 'Enter' && focusedIndex !== null && focusedIndex >= 0) {
      e.preventDefault();
      const model = baseModels[focusedIndex];
      if (model) {
        toggleModel(model.baseId);
      }
    } else if (e.key === ' ' && focusedIndex !== null && focusedIndex >= 0) {
      // Spacebar also toggles
      e.preventDefault();
      const model = baseModels[focusedIndex];
      if (model) {
        toggleModel(model.baseId);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="p-2 font-mono text-sm animate-in fade-in slide-in-from-left-2 duration-200 focus-within:outline-none"
      style={{ touchAction: 'pan-y pinch-zoom' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={() => setFocusedIndex(null)}
      onBlur={() => setFocusedIndex(null)}
    >
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="text-xs font-semibold text-muted-foreground">
          MODELS
          {comparisonItems.length > 0 && (
            <span className="ml-1.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              {comparisonItems.length} selected
            </span>
          )}
        </div>
        {comparisonItems.length > 0 && (
          <button
            onClick={clearAllComparisons}
            className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </div>

      <div className="space-y-1 sm:space-y-0.5">
        {baseModels.map((baseModel, idx) => {
          // Check if this model is selected
          const variantKeys = baseModel.variants.map(v => `${promptId}::${v}`);
          const isSelected = variantKeys.some(key => comparisonItems.includes(key));
          const score = baseModel.avgScore;
          const hasScore = score !== null;
          const isFocused = focusedIndex === idx;

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
              key={baseModel.baseId}
              role="checkbox"
              tabIndex={-1}
              aria-checked={isSelected}
              aria-label={`${baseModel.displayName}${baseModel.variants.length > 1 ? ` (${baseModel.variants.length} variants)` : ''}${hasScore ? `, score ${formatPercentage(score, 0)}` : ''}`}
              className={cn(
                "grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 px-3 py-2.5 sm:px-2 sm:py-1 rounded cursor-pointer transition-all duration-200 touch-manipulation",
                isSelected
                  ? "bg-primary/10 shadow-sm scale-[1.01]"
                  : "hover:bg-muted/30 hover:shadow-sm hover:scale-[1.005] active:bg-muted/50",
                isFocused && "ring-2 ring-primary/50"
              )}
              onClick={() => {
                debug.log('ModelsColumn onClick - CLICK EVENT', { baseId: baseModel.baseId, timestamp: performance.now() });
                toggleModel(baseModel.baseId);
              }}
            >
              {/* Checkbox - vertically centered across both rows */}
              <div className="row-span-2 flex items-center">
                <div className={cn(
                  "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150",
                  isSelected
                    ? "bg-primary border-primary"
                    : "border-muted-foreground/40 hover:border-muted-foreground"
                )} aria-hidden="true">
                  {isSelected && (
                    <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>

              {/* First row: Name and score */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex-1 truncate text-xs min-w-0">
                  {baseModel.displayName}
                  {baseModel.variants.length > 1 && (
                    <span className="text-muted-foreground ml-1 text-[10px]">
                      ({baseModel.variants.length})
                    </span>
                  )}
                </span>

                {hasScore && (
                  <span className={cn("text-right text-xs min-w-[3ch] font-mono flex-shrink-0", scoreColor)} aria-hidden="true">
                    {formatPercentage(score, 0)}
                  </span>
                )}
              </div>

              {/* Second row: Score bar */}
              {hasScore && (
                <div className="h-[0.35rem] overflow-hidden" aria-hidden="true">
                  <TextualBar score={score} length={16} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
