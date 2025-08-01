'use client';

import React, { useState } from 'react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { prettifyTag, normalizeTag } from '@/app/utils/tagUtils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import TopicChampionDialog from '../TopicChampionDialog';
import Icon from '@/components/ui/icon';
import Link from 'next/link';
import { TopicChampionInfo } from './types';

const TopicChampionsDisplay: React.FC<{ champions: Record<string, TopicChampionInfo[]> | null }> = ({ champions }) => {
  const [selectedChampion, setSelectedChampion] = useState<TopicChampionInfo | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  if (!champions) {
    return null;
  }

  const championsWithData = Object.entries(champions).filter(
    ([, championList]) => championList && championList.length > 0
  );

  if (championsWithData.length === 0) {
    return null;
  }

  const handleChampionClick = (champion: TopicChampionInfo, topic: string) => {
    setSelectedChampion(champion);
    setSelectedTopic(topic);
  };

  const handleCloseDialog = () => {
    setSelectedChampion(null);
    setSelectedTopic(null);
  };

  return (
    <>
      <div className="mt-8">
        <div className="text-center mb-6">
          <h3 className="text-xl font-semibold tracking-tight flex items-center justify-center">
            <Icon name="tag" className="w-6 h-6 mr-3 text-primary" />
            Performance by Subject
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="ml-2 text-muted-foreground/80 hover:text-primary">
                  <Icon name="info" className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-center">
                <p>Models are scored based on their average hybrid score (%) across all evaluations within a specific subject area.</p>
              </TooltipContent>
            </Tooltip>
          </h3>
        </div>
        <div className="bg-card p-4 rounded-lg border border-border/70 dark:border-slate-700/50 space-y-3">
          {championsWithData.map(([topic, championList]) => (
            <div key={topic} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-sm border-b border-border/50 dark:border-slate-700/30 pb-2 last:border-b-0 last:pb-0">
              <Link href={`/tags/${normalizeTag(topic)}`} className="w-full sm:w-auto md:w-1/4 font-semibold text-muted-foreground uppercase tracking-wider text-left hover:underline">
                {prettifyTag(topic)}
              </Link>
              <div className="w-full sm:w-auto md:w-3/4 flex flex-wrap justify-start sm:justify-end gap-2">
                {championList.map((champion, index) => (
                  <button
                    key={champion.modelId}
                    className="flex items-center bg-muted dark:bg-slate-700/40 px-2 py-1 rounded-md text-xs hover:bg-primary/10 dark:hover:bg-slate-600/60 disabled:hover:bg-muted disabled:opacity-70"
                    title={`View details for ${champion.modelId}`}
                    onClick={() => handleChampionClick(champion, topic)}
                  >
                    <Icon name="award" className={`w-3.5 h-3.5 mr-1.5 ${index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-400' : 'text-amber-700/80'}`} />
                    <span className="font-medium text-card-foreground mr-2 truncate" title={champion.modelId}>
                      {getModelDisplayLabel(champion.modelId, { hideProvider: true, hideModelMaker: true, hideSystemPrompt: true, hideTemperature: true, prettifyModelName: true })}
                    </span>
                    <span className="font-semibold text-primary">{(champion.averageScore * 100).toFixed(1)}%</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4 text-center">
          Highest average hybrid score for each topic, based on models with at least 5 unique evaluations for that topic.
        </p>
      </div>
      <TopicChampionDialog
        champion={selectedChampion}
        topic={selectedTopic}
        isOpen={!!selectedChampion}
        onClose={handleCloseDialog}
      />
    </>
  );
};

export default TopicChampionsDisplay; 