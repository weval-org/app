'use client';

import React, { useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { TopModelStatInfo } from './home/types';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import Link from 'next/link';
import Icon from '@/components/ui/icon';

interface ModelRunsDialogProps {
  model: (TopModelStatInfo & { displayScore: number }) | null;
  isOpen: boolean;
  onClose: () => void;
}

const ModelRunsDialog: React.FC<ModelRunsDialogProps> = ({ model, isOpen, onClose }) => {
  if (!model) return null;

  const runsByBlueprint = useMemo(() => {
    if (!model) return [];
    
    const blueprintMap = new Map<string, {
      title: string;
      scores: number[];
      latestRun: TopModelStatInfo['runs'][0];
    }>();

    for (const run of model.runs) {
      if (run.hybridScore === null || run.hybridScore === undefined) continue;

      const existing = blueprintMap.get(run.configId);
      if (existing) {
        existing.scores.push(run.hybridScore);
        // Update to ensure we keep the latest run for the link
        if (new Date(run.timestamp) > new Date(existing.latestRun.timestamp)) {
          existing.latestRun = run;
        }
      } else {
        blueprintMap.set(run.configId, {
          title: run.configTitle,
          scores: [run.hybridScore],
          latestRun: run,
        });
      }
    }

    const aggregated = Array.from(blueprintMap.entries()).map(([configId, data]) => {
      const averageScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      return {
        configId,
        title: data.title,
        averageScore,
        runCount: data.scores.length,
        latestRun: data.latestRun,
      };
    });
    
    // Sort by the average score for that blueprint, descending
    return aggregated.sort((a, b) => b.averageScore - a.averageScore);

  }, [model]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl">
            Score Details for <span className="text-primary font-semibold">{getModelDisplayLabel(model.modelId)}</span>
          </SheetTitle>
          <SheetDescription>
            The overall score of{' '}
            <strong className="text-foreground">{(model.displayScore * 100).toFixed(1)}%</strong>{' '}
            is the average of the Hybrid Scores from the{' '}
            <strong className="text-foreground">{model.runsParticipatedIn}</strong>{' '}
            evaluation blueprints listed below. 
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-3">
          {runsByBlueprint.map((blueprint) => {
            const runUrl = `/analysis/${blueprint.configId}/${blueprint.latestRun.runLabel}/${blueprint.latestRun.timestamp}`;
            const runDisplayScore = blueprint.averageScore;

            return (
              <div key={blueprint.configId} className="bg-muted/50 dark:bg-slate-800/40 p-3 rounded-lg border border-border/70">
                <div className="flex items-center justify-between">
                  <div className="flex-grow truncate pr-4">
                    <Link href={runUrl} className="group">
                      <p className="text-sm font-semibold text-card-foreground truncate group-hover:underline" title={blueprint.title}>
                        {blueprint.title}
                      </p>
                      <p className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                        View Latest Run ({blueprint.runCount} total runs) <Icon name="arrow-right" className="inline-block w-3 h-3 ml-0.5" />
                      </p>
                    </Link>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-semibold text-primary">{(runDisplayScore * 100).toFixed(1)}%</p>
                    <p className="text-[11px] text-muted-foreground/80">
                      Avg. Hybrid Score
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ModelRunsDialog; 