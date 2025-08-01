'use client';

import React, { useState } from 'react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import DimensionChampionDialog from '../DimensionChampionDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import Icon from '@/components/ui/icon';
import { DimensionLeaderboard, DimensionScoreInfo } from './types';

const DimensionChampionsDisplay: React.FC<{ leaderboards: DimensionLeaderboard[] | null }> = ({ leaderboards }) => {
  const [selectedChampion, setSelectedChampion] = useState<DimensionScoreInfo | null>(null);
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null);
  
  if (!leaderboards || leaderboards.length === 0) {
    return null;
  }

  const handleChampionClick = (champion: DimensionScoreInfo, dimension: string) => {
    setSelectedChampion(champion);
    setSelectedDimension(dimension);
  };

  const handleCloseDialog = () => {
    setSelectedChampion(null);
    setSelectedDimension(null);
  };

  return (
    <>
    <div className="mt-8">
      <div className="text-center mb-6">
        <h3 className="text-xl font-semibold tracking-tight flex items-center justify-center">
          <Icon name="brain-circuit" className="w-6 h-6 mr-3 text-primary" />
          Qualitative Grades
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="ml-2 text-muted-foreground/80 hover:text-primary">
                <Icon name="info" className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-center">
              <p>Models are graded from 1-10 by an AI analyst on behavioral traits like clarity, safety, and adherence to instructions.</p>
            </TooltipContent>
          </Tooltip>
        </h3>
      </div>
      <div className="bg-card p-4 rounded-lg border border-border/70 dark:border-slate-700/50 space-y-3">
        {leaderboards.map((leaderboard) => (
          <div key={leaderboard.dimension} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-sm border-b border-border/50 dark:border-slate-700/30 pb-2 last:border-b-0 last:pb-0">
            <div className="w-full sm:w-auto md:w-1/4 font-semibold text-muted-foreground uppercase tracking-wider text-left">
              {leaderboard.dimension}
            </div>
            <div className="w-full sm:w-auto md:w-3/4 flex flex-wrap justify-start sm:justify-end gap-2">
              {leaderboard.leaderboard.slice(0, 3).map((champion, index) => {
                const hasDetailedScores = champion.latestScores && champion.latestScores.length > 0;
                return (
                  <button
                    key={champion.modelId}
                    className="flex items-center bg-muted dark:bg-slate-700/40 px-2 py-1 rounded-md text-xs hover:bg-primary/10 dark:hover:bg-slate-600/60 disabled:hover:bg-muted disabled:opacity-70"
                    title={hasDetailedScores ? `View details for ${champion.modelId}` : `Details not available`}
                    onClick={() => hasDetailedScores && handleChampionClick(champion, leaderboard.dimension)}
                    disabled={!hasDetailedScores}
                  >
                    <Icon name="award" className={`w-3.5 h-3.5 mr-1.5 ${index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-400' : 'text-amber-700/80'}`} />
                    <span className="font-medium text-card-foreground mr-2 truncate" title={champion.modelId}>
                      {getModelDisplayLabel(champion.modelId, { hideProvider: true, hideModelMaker: true, hideSystemPrompt: true, hideTemperature: true, prettifyModelName: true })}
                    </span>
                    <span className="font-semibold text-primary">{(champion.averageScore).toFixed(1)}/10</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
       <p className="text-xs text-muted-foreground mt-4 text-center">
        Highest average score for each dimension, based on Executive Summary grades from models with at least 10 unique evaluations and <strong>never scoring below 5.0</strong> on that dimension.
      </p>
    </div>
    <DimensionChampionDialog 
      champion={selectedChampion}
      dimension={selectedDimension}
      isOpen={!!selectedChampion}
      onClose={handleCloseDialog}
    />
    </>
  );
};

export default DimensionChampionsDisplay; 