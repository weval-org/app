'use client';

import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { getGradingDimension } from '@/lib/grading-criteria';
import Link from 'next/link';
import Icon from '@/components/ui/icon';
import { DimensionScoreInfo } from '@/app/components/home/types';

interface DimensionChampionDialogProps {
  champion: DimensionScoreInfo | null;
  dimension: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const DimensionChampionDialog: React.FC<DimensionChampionDialogProps> = ({ champion, dimension, isOpen, onClose }) => {
  if (!champion || !dimension) return null;

  const dimensionInfo = getGradingDimension(dimension);
  const hasDetailedScores = champion.latestScores && champion.latestScores.length > 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl">
            <span className="text-primary font-semibold">{dimensionInfo?.label || dimension}</span> - Top Dependable Model
          </SheetTitle>
          <SheetDescription>
            <strong className="text-foreground">{getModelDisplayLabel(champion.modelId)}</strong>{' '}
            is among the most dependable models for this dimension, with an average score of{' '}
            <strong className="text-foreground">{champion.averageScore.toFixed(1)}/10</strong>{' '}
            across {champion.runsCount} evaluations and <strong className="text-foreground">never scoring below 5.0</strong>.
          </SheetDescription>
        </SheetHeader>

        {dimensionInfo && (
          <div className="mb-6 p-4 bg-muted/50 dark:bg-slate-800/40 rounded-lg border border-border/70">
            <h3 className="font-semibold text-sm text-card-foreground mb-2">What This Dimension Measures</h3>
            <p className="text-sm text-muted-foreground mb-3">{dimensionInfo.description}</p>
            
            <div className="space-y-2 text-xs">
              <div className="flex items-start">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 w-16 flex-shrink-0">8-10:</span>
                <span className="text-muted-foreground">{dimensionInfo.scoringGuidance.excellent}</span>
              </div>
              <div className="flex items-start">
                <span className="font-semibold text-yellow-600 dark:text-yellow-400 w-16 flex-shrink-0">4-7:</span>
                <span className="text-muted-foreground">{dimensionInfo.scoringGuidance.fair}</span>
              </div>
              <div className="flex items-start">
                <span className="font-semibold text-red-600 dark:text-red-400 w-16 flex-shrink-0">1-3:</span>
                <span className="text-muted-foreground">{dimensionInfo.scoringGuidance.poor}</span>
              </div>
            </div>
          </div>
        )}

        {hasDetailedScores && (
          <div>
            <h3 className="font-semibold text-sm text-card-foreground mb-3">
              Recent Scores Contributing to Average
            </h3>
            <div className="space-y-3">
              {champion.latestScores!.map((scoreInfo, index) => (
                <div key={`${scoreInfo.runUrl}-${index}`} className="bg-muted/50 dark:bg-slate-800/40 p-3 rounded-lg border border-border/70">
                  <div className="flex items-center justify-between">
                    <div className="flex-grow truncate pr-4">
                      <Link href={scoreInfo.runUrl} className="group">
                        <p className="text-sm font-semibold text-card-foreground truncate group-hover:underline" title={scoreInfo.configTitle}>
                          {scoreInfo.configTitle}
                        </p>
                        <p className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                          View Evaluation <Icon name="arrow-right" className="inline-block w-3 h-3 ml-0.5" />
                        </p>
                      </Link>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-semibold text-primary">{scoreInfo.score.toFixed(1)}/10</p>
                      <p className="text-[11px] text-muted-foreground/80">
                        Score
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasDetailedScores && (
          <div className="p-4 bg-muted/30 dark:bg-slate-800/30 rounded-lg border border-border/50 text-center">
            <p className="text-sm text-muted-foreground">
              Detailed score breakdown is not available for this champion. This data is only available after running the latest version of the evaluation pipeline.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default DimensionChampionDialog; 