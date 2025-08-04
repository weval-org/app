'use client';

import React, { useState } from 'react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import Icon from '@/components/ui/icon';
import { CapabilityLeaderboard, CapabilityRawData } from './types';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import DevModeCapabilitySliders from './DevModeCapabilitySliders';

const CapabilityLeaderboardDisplay: React.FC<{ 
  leaderboards: CapabilityLeaderboard[] | null;
  rawData?: CapabilityRawData | null;
}> = ({ leaderboards, rawData }) => {
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
      <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl mx-auto">
        {leaderboards.map((bucket: any) => {
          const isExpanded = expandedCards.has(bucket.id);
          const displayedModels = isExpanded ? bucket.leaderboard : bucket.leaderboard.slice(0, 5);
          const hasMoreModels = bucket.leaderboard.length > 5;
          
          return (
            <div key={bucket.id} className="border rounded-lg p-4 bg-card">
              <div className="mb-4">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="text-lg font-bold text-foreground leading-tight pr-2">{bucket.label}</h4>
                  <Icon name={bucket.icon as any} className="w-6 h-6 flex-shrink-0 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {bucket.description}
                </p>
              </div>
              
              <ul className="space-y-2">
                {displayedModels.map((model: any, index: number) => (
                  <li key={model.modelId} className="flex justify-between items-center text-sm">
                    <div className="flex items-center min-w-0 flex-1">
                      <span className="font-mono text-sm text-muted-foreground mr-2 w-4 flex-shrink-0">
                        {index + 1}.
                      </span>
                      <span className="font-medium truncate">
                        {getModelDisplayLabel(model.modelId, {
                          hideProvider: true,
                          hideModelMaker: true,
                          prettifyModelName: true,
                        })}
                      </span>
                    </div>
                    <span className="font-semibold text-sm flex-shrink-0">
                      {(model.averageScore * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
              
              {hasMoreModels && (
                <div className="mt-3">
                  <hr className="border-dotted border-muted-foreground/30 mb-2" />
                  <button
                    onClick={() => toggleCardExpansion(bucket.id)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center justify-center gap-1"
                  >
                    {isExpanded ? (
                      <>
                        <Icon name="chevron-up" className="w-3 h-3" />
                        Show less
                      </>
                    ) : (
                      <>
                        <Icon name="chevron-down" className="w-3 h-3" />
                        Show {bucket.leaderboard.length - 5} more
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Dev Mode Sliders */}
      {rawData && (
        <DevModeCapabilitySliders rawData={rawData} />
      )}
    </div>
  );
};

export default CapabilityLeaderboardDisplay; 