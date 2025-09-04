'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { CapabilityRawData, CapabilityLeaderboard, CapabilityScoreInfo } from './types';
import { CAPABILITY_BUCKETS, CapabilityConfig } from '@/lib/capabilities';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface DevModeCapabilitySlidersProps {
  rawData: CapabilityRawData;
  hideToggle?: boolean; // when true, always show sliders (no show/hide control)
}

interface SliderWeights {
  [capabilityId: string]: {
    dimensions: Record<string, number>;
    topics: Record<string, number>;
    blueprints: Record<string, number>;
  };
}

const DevModeCapabilitySliders: React.FC<DevModeCapabilitySlidersProps> = ({ rawData, hideToggle }) => {
  const [showDevMode, setShowDevMode] = useState(false);
  const alwaysOpen = !!hideToggle;
  const [expanded, setExpanded] = useState<Record<string, Set<string>>>({}); // bucketId -> set(modelId)

  // Initialize weights from current capability definitions
  const [weights, setWeights] = useState<SliderWeights>(() => {
    const capabilityWeights: SliderWeights = {};
    
    CAPABILITY_BUCKETS.forEach(bucket => {
      const dimensions: Record<string, number> = {};
      const topics: Record<string, number> = {};
      const blueprints: Record<string, number> = {};
      
      bucket.dimensions.forEach(dim => {
        dimensions[dim.key] = dim.weight;
      });
      
      bucket.topics.forEach(topic => {
        topics[topic.key] = topic.weight;
      });
      
      (bucket.blueprints || bucket.configs)?.forEach(config => {
        blueprints[config.key] = config.weight;
      });

      
      capabilityWeights[bucket.id] = { dimensions, topics, blueprints };
    });
    
    return capabilityWeights;
  });

  // Calculate dynamic leaderboards and per-model contribution breakdowns
  const dynamicData = useMemo((): { leaderboards: CapabilityLeaderboard[]; breakdowns: Record<string, Record<string, { items: Array<{ kind: 'dimension' | 'topic' | 'blueprint'; key: string; raw: number; weight: number; effective: number; contribution: number }>; totalWeight: number; finalScore: number }>> } => {
    const leaderboards: CapabilityLeaderboard[] = [];
    const breakdowns: Record<string, Record<string, any>> = {};

    CAPABILITY_BUCKETS.forEach(bucket => {
      const modelScores: CapabilityScoreInfo[] = [];
      const perModel: Record<string, any> = {};

      const capabilityQualifyingModels = rawData.capabilityQualifyingModels?.[bucket.id] || rawData.qualifyingModels;

      capabilityQualifyingModels.forEach(modelId => {
        let totalScore = 0;
        let totalWeight = 0;
        let contributingDimensions = 0;
        const items: Array<{ kind: 'dimension' | 'topic' | 'blueprint'; key: string; raw: number; weight: number; effective: number; contribution: number }> = [];

        // Dimensions
        bucket.dimensions.forEach(dim => {
          const raw = rawData.modelDimensions[modelId]?.[dim.key];
          if (raw !== undefined) {
            const weight = weights[bucket.id]?.dimensions[dim.key] || dim.weight;
            const effective = dim.invert ? (1 - raw) : raw;
            const contribution = effective * weight;
            totalScore += contribution;
            totalWeight += weight;
            contributingDimensions++;
            items.push({ kind: 'dimension', key: dim.key, raw, weight, effective, contribution });
          }
        });

        // Topics
        bucket.topics.forEach(topic => {
          const raw = rawData.modelTopics[modelId]?.[topic.key];
          if (raw !== undefined) {
            const weight = weights[bucket.id]?.topics[topic.key] || topic.weight;
            const effective = topic.invert ? (1 - raw) : raw;
            const contribution = effective * weight;
            totalScore += contribution;
            totalWeight += weight;
            items.push({ kind: 'topic', key: topic.key, raw, weight, effective, contribution });
          }
        });

        // Blueprints
        (bucket.blueprints || bucket.configs)?.forEach(config => {
          const raw = rawData.modelConfigs[modelId]?.[config.key];
          if (raw !== undefined) {
            const weight = weights[bucket.id]?.blueprints[config.key] || config.weight;
            const effective = config.invert ? (1 - raw) : raw;
            const contribution = effective * weight;
            totalScore += contribution;
            totalWeight += weight;
            items.push({ kind: 'blueprint', key: config.key, raw, weight, effective, contribution });
          }
        });

        if (totalWeight > 0) {
          const finalScore = totalScore / totalWeight;
          modelScores.push({
            modelId,
            averageScore: finalScore,
            contributingRuns: Math.round(totalWeight * 4),
            contributingDimensions,
          });
          perModel[modelId] = { items, totalWeight, finalScore };
        }
      });

      modelScores.sort((a, b) => b.averageScore - a.averageScore);
      leaderboards.push({ ...bucket, leaderboard: modelScores.slice(0, 10) });
      breakdowns[bucket.id] = perModel;
    });

    return { leaderboards, breakdowns };
  }, [rawData, weights]);

  const resetWeights = () => {
    const capabilityWeights: SliderWeights = {};
    
    CAPABILITY_BUCKETS.forEach(bucket => {
      const dimensions: Record<string, number> = {};
      const topics: Record<string, number> = {};
      const blueprints: Record<string, number> = {};
      
      bucket.dimensions.forEach(dim => {
        dimensions[dim.key] = dim.weight;
      });
      
      bucket.topics.forEach(topic => {
        topics[topic.key] = topic.weight;
      });
      
      (bucket.blueprints || bucket.configs)?.forEach(config => {
        blueprints[config.key] = config.weight;
      });
      
      capabilityWeights[bucket.id] = { dimensions, topics, blueprints };
    });
    
    setWeights(capabilityWeights);
  };

  if (process.env.NODE_ENV !== 'development') {
    return null; // Only show in development
  }

  return (
    <div className="mt-8 border border-orange-300 bg-orange-50 dark:bg-orange-950/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
        <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-200">
          Dev Mode: Capability Weight Tuning
        </h3>
      </div>
      
      <Collapsible open={alwaysOpen ? true : showDevMode} onOpenChange={alwaysOpen ? undefined : setShowDevMode}>
        {!alwaysOpen && (
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="mb-4">
              <Icon name={showDevMode ? "chevron-up" : "chevron-down"} className="w-4 h-4 mr-2" />
              {showDevMode ? 'Hide' : 'Show'} Weight Sliders
            </Button>
          </CollapsibleTrigger>
        )}
        <CollapsibleContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sliders Panel */}
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-sm">Adjust Weights</h4>
                <Button onClick={resetWeights} variant="ghost" size="sm">
                  Reset to Defaults
                </Button>
              </div>
              
                             {/* Per-Capability Sliders */}
               <div className="space-y-4">
                 {CAPABILITY_BUCKETS.map(bucket => (
                   <div key={bucket.id} className="border rounded-lg p-3">
                                         <div className="flex items-center gap-2 mb-3">
                       <Icon name={bucket.icon as any} className="w-4 h-4 text-primary" />
                       <h5 className="font-medium text-sm">{bucket.label}</h5>
                     </div>
                     
                     {/* Dimensions for this capability */}
                     <div className="mb-3">
                       <h6 className="text-xs font-medium text-muted-foreground mb-2">Dimensions</h6>
                       <div className="space-y-2">
                         {bucket.dimensions.map(dim => {
                           const weight = weights[bucket.id]?.dimensions[dim.key] || dim.weight;
                           
                           // Get top 5 models for this dimension
                           const dimensionScores = Object.entries(rawData.modelDimensions)
                             .map(([modelId, dimensions]) => ({
                               modelId,
                               score: dimensions[dim.key]
                             }))
                             .filter(item => item.score !== undefined)
                             .sort((a, b) => b.score - a.score)
                             .slice(0, 5);
                           
                           return (
                             <div key={dim.key} className="space-y-1">
                               <div className="flex justify-between items-start">
                                 <div className="flex-1">
                                   <label className="text-xs font-medium capitalize">
                                     {dim.key.replace(/([A-Z])/g, ' $1').trim()}
                                   </label>
                                   {/* Raw scores for top 3 models - horizontal */}
                                   <div className="mt-0.5 text-[9px] text-muted-foreground">
                                     {dimensionScores.slice(0, 3).map((item, idx) => (
                                       <span key={item.modelId} className="inline-block mr-2">
                                         {getModelDisplayLabel(item.modelId, {
                                           hideProvider: true,
                                           hideModelMaker: true,
                                           prettifyModelName: true,
                                         }).split(' ')[0]}: {(item.score * 100).toFixed(0)}%
                                         {idx < 2 ? ',' : ''}
                                       </span>
                                     ))}
                                   </div>
                                 </div>
                                 <span className="text-xs text-muted-foreground ml-2">
                                   {weight.toFixed(1)}
                                 </span>
                               </div>
                               <input
                                 type="range"
                                 min="0"
                                 max="3"
                                 step="0.1"
                                 value={weight}
                                 onChange={(e) => setWeights(prev => ({
                                   ...prev,
                                   [bucket.id]: {
                                     ...prev[bucket.id],
                                     dimensions: {
                                       ...prev[bucket.id]?.dimensions,
                                       [dim.key]: parseFloat(e.target.value)
                                     }
                                   }
                                 }))}
                                 className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                               />
                             </div>
                           );
                         })}
                       </div>
                     </div>
                    
                                         {/* Topics for this capability */}
                     <div>
                       <h6 className="text-xs font-medium text-muted-foreground mb-2">Topics</h6>
                       <div className="space-y-2 max-h-48 overflow-y-auto">
                         {bucket.topics.map(topic => {
                           const weight = weights[bucket.id]?.topics[topic.key] || topic.weight;
                           
                           // Get top 5 models for this topic
                           const topicScores = Object.entries(rawData.modelTopics)
                             .map(([modelId, topics]) => ({
                               modelId,
                               score: topics[topic.key]
                             }))
                             .filter(item => item.score !== undefined)
                             .sort((a, b) => b.score - a.score)
                             .slice(0, 5);
                           
                           return (
                             <div key={topic.key} className="space-y-1">
                               <div className="flex justify-between items-start">
                                 <div className="flex-1">
                                   <label className="text-xs font-medium">
                                     {topic.key}
                                   </label>
                                   {/* Raw scores for top 3 models - horizontal */}
                                   <div className="mt-0.5 text-[9px] text-muted-foreground">
                                     {topicScores.slice(0, 3).map((item, idx) => (
                                       <span key={item.modelId} className="inline-block mr-2">
                                         {getModelDisplayLabel(item.modelId, {
                                           hideProvider: true,
                                           hideModelMaker: true,
                                           prettifyModelName: true,
                                         }).split(' ')[0]}: {(item.score * 100).toFixed(0)}%
                                         {idx < 2 ? ',' : ''}
                                       </span>
                                     ))}
                                   </div>
                                 </div>
                                 <span className="text-xs text-muted-foreground ml-2">
                                   {weight.toFixed(1)}
                                 </span>
                               </div>
                               <input
                                 type="range"
                                 min="0"
                                 max="3"
                                 step="0.1"
                                 value={weight}
                                 onChange={(e) => setWeights(prev => ({
                                   ...prev,
                                   [bucket.id]: {
                                     ...prev[bucket.id],
                                     topics: {
                                       ...prev[bucket.id]?.topics,
                                       [topic.key]: parseFloat(e.target.value)
                                     }
                                   }
                                 }))}
                                 className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                               />
                             </div>
                           );
                         })}
                       </div>
                     </div>
                     
                     {/* Blueprints for this capability */}
                     {(bucket.blueprints || bucket.configs) && (bucket.blueprints || bucket.configs)!.length > 0 && (
                       <div>
                         <h6 className="text-xs font-medium text-muted-foreground mb-2">Specific Evaluations (Blueprints)</h6>
                         <div className="space-y-2">
                           {(bucket.blueprints || bucket.configs)!.map(config => {
                             const weight = weights[bucket.id]?.blueprints[config.key] || config.weight;
                             
                             // Get top 3 models for this config
                             const configScores = Object.entries(rawData.modelConfigs)
                               .map(([modelId, configs]) => ({
                                 modelId,
                                 score: configs[config.key]
                               }))
                               .filter(item => item.score !== undefined)
                               .sort((a, b) => b.score - a.score)
                               .slice(0, 3);
                             
                             return (
                               <div key={config.key} className="space-y-1">
                                 <div className="flex justify-between items-start">
                                   <div className="flex-1">
                                     <label className="text-xs font-medium">
                                       {config.key}
                                     </label>
                                     {/* Raw scores for top 3 models - horizontal */}
                                     <div className="mt-0.5 text-[9px] text-muted-foreground">
                                       {configScores.slice(0, 3).map((item, idx) => (
                                         <span key={item.modelId} className="inline-block mr-2">
                                           {getModelDisplayLabel(item.modelId, {
                                             hideProvider: true,
                                             hideModelMaker: true,
                                             prettifyModelName: true,
                                           }).split(' ')[0]}: {(item.score * 100).toFixed(0)}%
                                           {idx < 2 ? ',' : ''}
                                         </span>
                                       ))}
                                     </div>
                                   </div>
                                   <span className="text-xs text-muted-foreground ml-2">
                                     {weight.toFixed(1)}
                                   </span>
                                 </div>
                                 <input
                                   type="range"
                                   min="0"
                                   max="3"
                                   step="0.1"
                                   value={weight}
                                   onChange={(e) => setWeights(prev => ({
                                     ...prev,
                                     [bucket.id]: {
                                       ...prev[bucket.id],
                                       blueprints: {
                                         ...prev[bucket.id]?.blueprints,
                                         [config.key]: parseFloat(e.target.value)
                                       }
                                     }
                                   }))}
                                   className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                 />
                               </div>
                             );
                           })}
                         </div>
                       </div>
                     )}

                  </div>
                ))}
              </div>
            </div>
            
            {/* Live Leaderboards */}
            <div className="space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] overflow-auto pr-1">
              <h4 className="font-semibold text-sm">Live Results</h4>
              <div className="grid grid-cols-1 gap-4">
                {dynamicData.leaderboards.map((bucket) => (
                  <div key={bucket.id} className="border rounded-lg p-3 bg-background">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name={bucket.icon as any} className="w-4 h-4 text-primary" />
                      <h5 className="font-medium text-sm">{bucket.label}</h5>
                    </div>
                    <ol className="space-y-1 list-decimal list-inside">
                      {bucket.leaderboard.slice(0, 5).map((model) => {
                        const breakdown = dynamicData.breakdowns[bucket.id]?.[model.modelId];
                        const isOpen = expanded[bucket.id]?.has(model.modelId) || false;
                        const toggle = () => {
                          setExpanded(prev => {
                            const setForBucket = new Set(prev[bucket.id] || []);
                            if (setForBucket.has(model.modelId)) setForBucket.delete(model.modelId); else setForBucket.add(model.modelId);
                            return { ...prev, [bucket.id]: setForBucket };
                          });
                        };
                        return (
                          <li key={model.modelId} className="text-xs">
                            <button onClick={toggle} className="w-full inline-flex justify-between items-center gap-2 hover:text-foreground">
                              <span className="inline-flex items-center gap-1 min-w-0">
                                <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} className="w-3 h-3 flex-shrink-0" />
                                <span className="font-medium truncate">
                                  {getModelDisplayLabel(model.modelId, {
                                    hideProvider: true,
                                    hideModelMaker: true,
                                    prettifyModelName: true,
                                  })}
                                </span>
                              </span>
                              <span className="font-semibold ml-2">
                                {(model.averageScore * 100).toFixed(0)}%
                              </span>
                            </button>
                            {breakdown && isOpen && (
                              <div className="mt-1 text-[10px] text-muted-foreground border-t pt-1 space-y-0.5">
                                {breakdown.items.map((item: any, idx: number) => {
                                  const pct = breakdown.totalWeight > 0 ? (item.contribution / breakdown.totalWeight) * 100 : 0;
                                  const kindLabel = item.kind === 'blueprint' ? 'bp' : item.kind === 'dimension' ? 'dim' : 'topic';
                                  return (
                                    <div key={idx} className="flex justify-between gap-2">
                                      <span className="truncate">
                                        {kindLabel}:{' '}
                                        <span className="font-mono">{item.key}</span>
                                      </span>
                                      <span className="font-mono">
                                        +{(item.contribution * 100).toFixed(1)}% ({pct.toFixed(0)}%)
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default DevModeCapabilitySliders; 