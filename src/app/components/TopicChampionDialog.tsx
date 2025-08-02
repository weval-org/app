'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import Link from 'next/link';
import Icon from '@/components/ui/icon';
import { TopicChampionInfo, ContributingRunInfo } from './home/types';
import { prettifyTag } from '@/app/utils/tagUtils';
import { fromSafeTimestamp } from '@/lib/timestampUtils';

interface TopicChampionDialogProps {
  champion: TopicChampionInfo | null;
  topic: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const TopicChampionDialog: React.FC<TopicChampionDialogProps> = ({ champion, topic, isOpen, onClose }) => {
  const [showAllRuns, setShowAllRuns] = useState(false);
  const router = useRouter();

  if (!champion) return null;

  const handleRunClick = (configId: string, runLabel: string, timestamp: string) => {
    onClose(); // Close the dialog first
    router.push(`/analysis/${configId}/${runLabel}/${timestamp}`);
  };

  const contributingConfigs = new Map<string, { title: string, runs: ContributingRunInfo[] }>();
  if (champion.contributingRuns) {
    champion.contributingRuns.forEach((run: ContributingRunInfo) => {
      if (!contributingConfigs.has(run.configId)) {
        contributingConfigs.set(run.configId, { title: run.configTitle, runs: [] });
      }
      contributingConfigs.get(run.configId)!.runs.push(run);
    });
  }

  const hasDetailedScores = champion.contributingRuns && champion.contributingRuns.length > 0;

  // De-duplicate runs, showing only the latest run for each unique configId
  const latestRunsByConfig = new Map<string, TopicChampionInfo['contributingRuns'][0]>();
  if (hasDetailedScores) {
    champion.contributingRuns.forEach(run => {
      const existing = latestRunsByConfig.get(run.configId);
      if (!existing || fromSafeTimestamp(run.timestamp) > fromSafeTimestamp(existing.timestamp)) {
        latestRunsByConfig.set(run.configId, run);
      }
    });
  }
  const uniqueLatestRuns = Array.from(latestRunsByConfig.values())
    .sort((a, b) => b.score - a.score); // Re-sort after de-duplication

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl">
            {topic ? (
              <>
                Topic Champion for <span className="text-primary">{prettifyTag(topic)}</span>
              </>
            ) : (
              'Topic Champion'
            )}
          </SheetTitle>
          <SheetDescription>
            <strong className="text-foreground">{getModelDisplayLabel(champion.modelId)}</strong>{' '}
            is among the most dependable models for this topic, with an average score of{' '}
            <strong className="text-foreground">{(champion.averageScore * 100).toFixed(1)}%</strong>{' '}
            across {champion.uniqueConfigsCount} evaluations.
          </SheetDescription>
        </SheetHeader>

        {hasDetailedScores && (
          <div>
            <h3 className="font-semibold text-sm text-card-foreground mb-3">
              Recent Scores Contributing to Average
            </h3>
            <div className="space-y-3">
              {uniqueLatestRuns.map((run, index) => {
                const runUrl = `/analysis/${run.configId}/${run.runLabel}/${run.timestamp}`;
                return (
                  <div key={`${runUrl}-${index}`} className="bg-muted/50 dark:bg-slate-800/40 p-3 rounded-lg border border-border/70">
                    <div className="flex items-center justify-between">
                      <div className="flex-grow truncate pr-4">
                        <Link href={runUrl} className="group">
                          <p className="text-sm font-semibold text-card-foreground truncate group-hover:underline" title={run.configTitle}>
                            {run.configTitle}
                          </p>
                          <p className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                            View Evaluation <Icon name="arrow-right" className="inline-block w-3 h-3 ml-0.5" />
                          </p>
                        </Link>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-semibold text-primary">{(run.score * 100).toFixed(1)}%</p>
                        <p className="text-[11px] text-muted-foreground/80">
                          Score
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default TopicChampionDialog; 