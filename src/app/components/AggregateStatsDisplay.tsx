'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { APP_REPO_URL } from '@/lib/configConstants';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import Icon from '@/components/ui/icon';
import { AggregateStatsData } from './home/types';
import OverallModelLeaderboard from './home/OverallModelLeaderboard';
import DimensionChampionsDisplay from './home/DimensionChampionsDisplay';
import TopicChampionsDisplay from './home/TopicChampionsDisplay';
import CapabilityLeaderboardDisplay from './home/CapabilityLeaderboardDisplay';

interface AggregateStatsDisplayProps {
  stats: AggregateStatsData | null;
}

const AggregateStatsDisplay: React.FC<AggregateStatsDisplayProps> = ({ stats }) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!stats) {
    return (
      <div className="mb-8 mt-4 p-4 text-center text-muted-foreground">
        Aggregate statistics are not yet available.
      </div>
    );
  }

  const MIN_CONFIGS_FOR_LEADERBOARD = 10;
  const filteredRankedModels = stats.rankedOverallModels?.filter(
    (model) => model.uniqueConfigsParticipatedIn >= MIN_CONFIGS_FOR_LEADERBOARD
  );

  return (
    <TooltipProvider>
      <div className="my-2">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-foreground mb-2">
            Model Leaderboard
          </h2>
          <p className="text-muted-foreground dark:text-muted-foreground text-sm">
            Measured by average hybrid score across all evaluations.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <OverallModelLeaderboard
            models={filteredRankedModels || null}
            title="Overall Model Leaderboard"
          />
        </div>
        <CapabilityLeaderboardDisplay leaderboards={stats.capabilityLeaderboards || null} />
        {/* Keeping these components available but not displayed on homepage for now */}
        {/* <DimensionChampionsDisplay leaderboards={stats.dimensionLeaderboards || null} /> */}
        {/* <TopicChampionsDisplay champions={stats.topicChampions || null} /> */}
        <div className="mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="h-auto p-1 text-muted-foreground hover:text-primary"
          >
            <Icon name="info" className="w-4 h-4 mr-1" />
            <span className="text-xs">{showDetails ? 'Hide Details' : 'More Info'}</span>
          </Button>
          {showDetails && (
            <div className="mt-2 p-3 text-xs text-muted-foreground bg-card border border-border/70 dark:border-slate-700/50 rounded-lg space-y-2">
              <p className="flex items-start">
                <Icon name="info" className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                <span>
                  <strong>Note on Leaderboard:</strong> Only models that have participated in at least {MIN_CONFIGS_FOR_LEADERBOARD} unique evaluation blueprints are shown. This leaderboard serves ONLY as a commentary on the types of competencies expressed in the blueprints on <strong style={{ textDecoration: 'underline' }}>this deployment</strong> of Weval. It is not a comprehensive or representative sample of all models or skills.
                </span>
              </p>
              <p className="flex items-start">
                <Icon name="flask-conical" className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                <span>
                  The Hybrid Score is a weighted average combining semantic similarity and key point coverage. This emphasizes rubric adherence while still valuing overall response quality. Read more about our methodology <a href={`${APP_REPO_URL}/blob/main/docs/METHODOLOGY.md`} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">here</a>.
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default AggregateStatsDisplay; 