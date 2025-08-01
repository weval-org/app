'use client';

import React from 'react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import Icon from '@/components/ui/icon';
import { CapabilityLeaderboard } from './types';
import { CAPABILITY_BUCKETS } from '@/lib/capabilities';

const CapabilityLeaderboardDisplay: React.FC<{ leaderboards: CapabilityLeaderboard[] | null }> = ({ leaderboards }) => {
  if (!leaderboards || leaderboards.length === 0) {
    return null;
  }

  // Helper function to get bucket details for explanations
  const getBucketDetails = (bucketId: string) => {
    return CAPABILITY_BUCKETS.find(bucket => bucket.id === bucketId);
  };

  return (
    <div className="mt-8">
      <div className="text-center mb-6">
        <h3 className="text-xl font-semibold tracking-tight flex items-center justify-center">
          <Icon name="award" className="w-6 h-6 mr-3 text-primary" />
          Capability Leaderboards
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="ml-2 text-muted-foreground/80 hover:text-primary">
                <Icon name="info" className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              <p>
                Models grouped by broad capability areas. Each capability combines multiple dimensions (1-10 grading) and topic performance scores using weighted averages. Only models with ≥10 runs across ≥5 configs shown.
              </p>
            </TooltipContent>
          </Tooltip>
        </h3>
        <p className="text-sm text-muted-foreground mt-2">
          Broad capability areas that combine qualitative grading and topic performance
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {leaderboards.map((bucket) => {
          const bucketDetails = getBucketDetails(bucket.id);
          return (
            <div key={bucket.id} className="border rounded-lg p-4 bg-card">
              <div className="flex items-start justify-between mb-3">
                <h4 className="text-sm font-medium text-muted-foreground leading-tight pr-2">{bucket.label}</h4>
                <Icon name={bucket.icon as any} className="w-5 h-5 flex-shrink-0 text-primary" />
              </div>
              
              {/* Detailed explanation section */}
              <div className="mb-4 p-3 bg-muted/30 rounded-md border">
                <p className="text-xs text-muted-foreground mb-2">
                  <strong>What's included:</strong> {bucket.description}
                </p>
                
                {bucketDetails && (
                  <div className="space-y-2">
                    {bucketDetails.dimensions.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-foreground">Dimensions (1-10 grading):</p>
                        <p className="text-xs text-muted-foreground">
                          {bucketDetails.dimensions.map(d => `${d.key} (${d.weight}x weight)`).join(', ')}
                        </p>
                      </div>
                    )}
                    
                    {bucketDetails.topics.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-foreground">Topics (hybrid scores):</p>
                        <p className="text-xs text-muted-foreground">
                          {bucketDetails.topics.map(t => `${t.key} (${t.weight}x weight)`).join(', ')}
                        </p>
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground italic">
                      Min. requirements: ≥10 runs across ≥5 evaluation configs
                    </p>
                  </div>
                )}
              </div>
              
              <ul className="space-y-2">
                {bucket.leaderboard.map((model, index) => (
                  <li key={model.modelId} className="flex justify-between items-center text-sm">
                    <div className="flex items-center">
                      <span className="font-mono text-xs text-muted-foreground mr-2 w-4">
                        {index + 1}.
                      </span>
                      <span className="font-medium">
                        {getModelDisplayLabel(model.modelId)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold">
                        {(model.averageScore * 100).toFixed(1)}%
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="text-muted-foreground/70 hover:text-primary">
                            <Icon name="info" className="w-3 h-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            Based on {model.contributingRuns} runs 
                            {model.contributingDimensions > 0 && ` with ${model.contributingDimensions} dimension scores`}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CapabilityLeaderboardDisplay; 