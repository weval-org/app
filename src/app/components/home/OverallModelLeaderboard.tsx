'use client';

import React, { useState, useMemo } from 'react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { Button } from '@/components/ui/button';
import ModelRunsDialog from '../ModelRunsDialog';
import { TopModelStatInfo } from './types';
import Icon from '@/components/ui/icon';

const OverallModelLeaderboard: React.FC<{
  models: TopModelStatInfo[] | null;
  title: string;
  initialCount?: number;
  incrementCount?: number;
  seeMoreMinRemaining?: number;
}> = ({ 
  models,
  title,
  initialCount = 5,
  incrementCount = 10,
  seeMoreMinRemaining = 5,
}) => {
  const [selectedModel, setSelectedModel] = useState<TopModelStatInfo & { displayScore: number } | null>(null);

  const shouldShowAllInitially = useMemo(() => {
    if (!models) return false;
    return models.length <= initialCount + seeMoreMinRemaining -1;
  }, [models, initialCount, seeMoreMinRemaining]);

  const [visibleCount, setVisibleCount] = useState(() => 
    shouldShowAllInitially && models ? models.length : initialCount
  );

  const processedModels = useMemo(() => {
    if (!models) return [];
    
    return models.map(model => {
      // Use the pre-calculated hybrid score as the primary display score.
      return { ...model, displayScore: model.overallAverageHybridScore };
    }).sort((a, b) => b.displayScore - a.displayScore);

  }, [models]);

  if (!models || models.length === 0) {
    return (
      <div className="bg-card p-4 rounded-lg border border-border/70 dark:border-slate-700/50 lg:col-span-4">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-sm font-medium text-muted-foreground leading-tight pr-2">{title}</h3>
          <Icon name="bar-chart-horizontal-big" className="w-5 h-5 flex-shrink-0 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground mt-auto">Not enough data to display leaderboard.</p>
      </div>
    );
  }

  const visibleModels = processedModels.slice(0, visibleCount);
  const showSeeMoreButton = !shouldShowAllInitially && models.length > visibleCount;

  return (
    <>
      <div className="bg-card p-4 rounded-lg border border-border/70 dark:border-slate-700/50 lg:col-span-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground leading-tight pr-2">{title}</h3>
          <Icon name="bar-chart-horizontal-big" className="w-5 h-5 flex-shrink-0 text-primary" />
        </div>
        <ul className="space-y-2">
          {visibleModels.map((model, index) => (
            <li key={model.modelId} className="flex items-center justify-between gap-4 text-sm border-b border-border/50 dark:border-slate-700/30 pb-1.5 last:border-b-0 last:pb-0">
              <div className="flex items-center min-w-0">
                <span className="mr-2.5 w-6 text-right text-muted-foreground">{index + 1}.</span>
                {index < 3 && <Icon name="award" className={`w-3.5 h-3.5 mr-1.5 ${index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-400' : 'text-amber-700/80'}`} />}
                <span className="font-medium text-card-foreground truncate" title={model.modelId}>{
                  getModelDisplayLabel(model.modelId, {
                    hideProvider: true,
                    hideModelMaker: true,
                    hideSystemPrompt: true,
                    hideTemperature: true,
                    prettifyModelName: true
                  })
                }</span>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="font-semibold text-primary">{(model.displayScore * 100).toFixed(1)}%</span>
                {model.runs && model.runs.length > 0 ? (
                  <button 
                    className="ml-1.5 text-muted-foreground/80 text-[11px] hover:text-primary hover:underline underline-offset-2"
                    onClick={() => setSelectedModel(model)}
                  >
                    (across {model.uniqueConfigsParticipatedIn} evals)
                  </button>
                ) : (
                  <span className="ml-1.5 text-muted-foreground/80 text-[11px]">(across {model.uniqueConfigsParticipatedIn} evals)</span>
                )}
              </div>
            </li>
          ))}
        </ul>
        {showSeeMoreButton && (
          <div className="mt-4 text-center">
            <Button 
              variant="link"
              size="sm"
              onClick={() => setVisibleCount(prev => Math.min(prev + incrementCount, models.length))}
              className="text-muted-foreground hover:text-primary h-auto p-1 text-xs"
            >
              See More ({models.length - visibleCount} remaining)
            </Button>
          </div>
        )}
      </div>
      <ModelRunsDialog 
        model={selectedModel}
        isOpen={!!selectedModel}
        onClose={() => setSelectedModel(null)}
      />
    </>
  );
};

export default OverallModelLeaderboard; 