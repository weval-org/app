'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import Icon from '@/components/ui/icon';
import { CapabilityLeaderboard, CapabilityRawData } from './types';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import DevModeCapabilitySliders from './DevModeCapabilitySliders';
import { APP_REPO_URL } from '@/lib/configConstants';

const CapabilityLeaderboardDisplay: React.FC<{ 
  leaderboards: CapabilityLeaderboard[] | null;
  rawData?: CapabilityRawData | null;
  modelCardMappings?: Record<string, string>;
}> = ({ leaderboards, rawData, modelCardMappings }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  if (!leaderboards || leaderboards.length === 0) {
    return null;
  }

  const toggleCardExpansion = (bucketId: string) => {
    const newExpanded = new Set(expandedCards);
    if (expandedCards.has(bucketId)) {
      newExpanded.delete(bucketId);
    } else {
      newExpanded.add(bucketId);
    }
    setExpandedCards(newExpanded);
  };

  return (
          <div>
        <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-foreground mb-2">
          The Leaderboards
        </h2>
        <div className="text-muted-foreground dark:text-muted-foreground text-sm">
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <p className="inline">
              Broad capability areas that combine qualitative grading and topic performance{' '}
              <CollapsibleTrigger asChild>
                <button className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors duration-200 ml-1">
                  <Icon name="info" className="w-3 h-3" />
                </button>
              </CollapsibleTrigger>
            </p>
            <CollapsibleContent className="mt-4">
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-md border p-3 max-w-3xl mx-auto">
                <p className="mb-2">
                  <strong>Global Qualification:</strong> Models must have ≥10 total evaluation runs across ≥5 different configs platform-wide to be eligible for any capability leaderboard.
                </p>
                <p className="mb-2">
                  <strong>Capability Scoring:</strong> Each capability combines relevant dimensions (1-10 grading), topics (hybrid scores), and specific configs using weighted averages. Only evaluations relevant to that capability contribute to the score.
                </p>
                <p>
                  <strong>Example:</strong> A model needs 10+ global runs to qualify, but their "Safety" score only includes safety-related dimensions, topics, and configs.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
      
      {/* Responsive grid optimized for 3 capabilities */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {leaderboards.map((bucket: any) => {
          const isExpanded = expandedCards.has(bucket.id);
          const displayedModels = isExpanded ? bucket.leaderboard : bucket.leaderboard.slice(0, 5);
          const hasMoreModels = bucket.leaderboard.length > 5;
          
          return (
            <div key={bucket.id} className="border border-[#f2eaea] rounded-[10px] p-6 bg-white dark:bg-card dark:border-border">
              {/* Header */}
              <div className="mb-5">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Leaderboard</p>
                <div className="flex items-start justify-between">
                  <h4 className="text-xl font-bold text-foreground leading-tight pr-2">{bucket.label}</h4>
                  <Icon name={bucket.icon as any} className="w-6 h-6 flex-shrink-0 text-foreground/70 mt-0.5" />
                </div>
              </div>

              {/* Model list */}
              <ul className="space-y-3">
                {displayedModels.map((model: any, index: number) => {
                  const findMatchingCard = (modelId: string, mappings?: Record<string, string>) => {
                    if (!mappings) return null;
                    if (mappings[modelId]) return mappings[modelId];
                    const targetParsed = parseModelIdForDisplay(modelId);
                    const targetDisplayName = getModelDisplayLabel(targetParsed, {
                      hideProvider: true, hideModelMaker: true, prettifyModelName: false,
                    }).toLowerCase();
                    for (const [mappedId, cardPattern] of Object.entries(mappings)) {
                      const mappedParsed = parseModelIdForDisplay(mappedId);
                      const mappedDisplayName = getModelDisplayLabel(mappedParsed, {
                        hideProvider: true, hideModelMaker: true, prettifyModelName: false,
                      }).toLowerCase();
                      if (mappedDisplayName === targetDisplayName ||
                          mappedDisplayName.includes(targetDisplayName) ||
                          targetDisplayName.includes(mappedDisplayName)) {
                        return cardPattern;
                      }
                    }
                    return null;
                  };

                  const cardPattern = findMatchingCard(model.modelId, modelCardMappings);
                  const hasCard = !!cardPattern;
                  const modelDisplayName = getModelDisplayLabel(model.modelId, {
                    hideProvider: true, hideModelMaker: true, prettifyModelName: true,
                  });

                  return (
                    <li key={model.modelId} className="flex justify-between items-center">
                      <div className="flex items-center min-w-0 flex-1 gap-2">
                        <span className="text-sm text-muted-foreground w-5 flex-shrink-0 text-right">
                          {index + 1}.
                        </span>
                        {hasCard ? (
                          <Link
                            href={`/cards/${encodeURIComponent(cardPattern)}`}
                            className="font-semibold text-sm truncate hover:underline transition-colors"
                          >
                            {modelDisplayName}
                          </Link>
                        ) : (
                          <span className="font-semibold text-sm truncate">{modelDisplayName}</span>
                        )}
                      </div>
                      <span className="font-bold text-sm flex-shrink-0 ml-2">
                        {(model.averageScore * 100).toFixed(0)}%
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* Show more/less — immediately after list */}
              {hasMoreModels && (
                <div className="mt-3">
                  <hr className="border-dotted border-muted-foreground/30 mb-2" />
                  <button
                    onClick={() => toggleCardExpansion(bucket.id)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center justify-center gap-1"
                  >
                    {isExpanded ? (
                      <><Icon name="chevron-up" className="w-3 h-3" />Show less</>
                    ) : (
                      <><Icon name="chevron-down" className="w-3 h-3" />Show {bucket.leaderboard.length - 5} more</>
                    )}
                  </button>
                </div>
              )}

              {/* Description + methodology */}
              <p className="text-sm text-muted-foreground leading-relaxed mt-5">
                {bucket.description}
              </p>
              <a
                href={`${APP_REPO_URL}/blob/main/docs/METHODOLOGY.md`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-sm text-foreground hover:underline font-medium"
              >
                View methodology
              </a>
            </div>
          );
        })}
      </div>
      
      {/* Dev Mode link to dedicated tuning page */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 text-center">
          <Link href="/capability-tuning" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground underline">
            <Icon name="sliders-horizontal" className="w-3 h-3" /> Open Capability Tuning
          </Link>
        </div>
      )}
    </div>
  );
};

export default CapabilityLeaderboardDisplay; 