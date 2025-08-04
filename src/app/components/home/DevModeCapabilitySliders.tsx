'use client';

import React, { useState, useMemo } from 'react';
import { CapabilityRawData, CapabilityLeaderboard, CapabilityScoreInfo } from './types';
import { CAPABILITY_BUCKETS, CapabilityConfig } from '@/lib/capabilities';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface DevModeCapabilitySlidersProps {
  rawData: CapabilityRawData;
}

interface SliderWeights {
  [capabilityId: string]: {
    dimensions: Record<string, number>;
    topics: Record<string, number>;
    configs: Record<string, number>;
  };
}

const DevModeCapabilitySliders: React.FC<DevModeCapabilitySlidersProps> = ({ rawData }) => {
  const [showDevMode, setShowDevMode] = useState(false);
  
  // Initialize weights from current capability definitions
  const [weights, setWeights] = useState<SliderWeights>(() => {
    const capabilityWeights: SliderWeights = {};
    
    CAPABILITY_BUCKETS.forEach(bucket => {
      const dimensions: Record<string, number> = {};
      const topics: Record<string, number> = {};
      const configs: Record<string, number> = {};
      
      bucket.dimensions.forEach(dim => {
        dimensions[dim.key] = dim.weight;
      });
      
      bucket.topics.forEach(topic => {
        topics[topic.key] = topic.weight;
      });
      
      bucket.configs?.forEach(config => {
        configs[config.key] = config.weight;
      });
      
      capabilityWeights[bucket.id] = { dimensions, topics, configs };
    });
    
    return capabilityWeights;
  });

  // Calculate dynamic leaderboards based on current weights
  const dynamicLeaderboards = useMemo((): CapabilityLeaderboard[] => {
    return CAPABILITY_BUCKETS.map(bucket => {
      const modelScores: CapabilityScoreInfo[] = [];
      
      // Use per-capability qualifying models if available, otherwise fall back to global list
      const capabilityQualifyingModels = rawData.capabilityQualifyingModels?.[bucket.id] || rawData.qualifyingModels;
      

      
      capabilityQualifyingModels.forEach(modelId => {
        let totalScore = 0;
        let totalWeight = 0;
        let contributingDimensions = 0;
        
        // Add dimension scores
        bucket.dimensions.forEach(dim => {
          const modelDimScore = rawData.modelDimensions[modelId]?.[dim.key];
          if (modelDimScore !== undefined) {
            const weight = weights[bucket.id]?.dimensions[dim.key] || dim.weight;
            totalScore += modelDimScore * weight;
            totalWeight += weight;
            contributingDimensions++;
          }
        });
        
        // Add topic scores
        bucket.topics.forEach(topic => {
          const modelTopicScore = rawData.modelTopics[modelId]?.[topic.key];
          if (modelTopicScore !== undefined) {
            const weight = weights[bucket.id]?.topics[topic.key] || topic.weight;
            totalScore += modelTopicScore * weight;
            totalWeight += weight;
          }
        });
        
        // Add config scores
        bucket.configs?.forEach(config => {
          const modelConfigScore = rawData.modelConfigs[modelId]?.[config.key];
          if (modelConfigScore !== undefined) {
            const weight = weights[bucket.id]?.configs[config.key] || config.weight;
            totalScore += modelConfigScore * weight;
            totalWeight += weight;
          }
        });
        
        if (totalWeight > 0) {
          const finalScore = totalScore / totalWeight;
          
          // Trust the qualification from backfill - no need to re-check thresholds!
          // rawData.qualifyingModels already contains only the models that passed
          
          modelScores.push({
            modelId,
            averageScore: finalScore,
            contributingRuns: Math.round(totalWeight * 4), // Rough estimate for display
            contributingDimensions,
          });
        }
      });
      
      // Sort by score and take top 10
      modelScores.sort((a, b) => b.averageScore - a.averageScore);
      

      
      return {
        ...bucket,
        leaderboard: modelScores.slice(0, 10),
      };
    });
  }, [rawData, weights]);

  const resetWeights = () => {
    const capabilityWeights: SliderWeights = {};
    
    CAPABILITY_BUCKETS.forEach(bucket => {
      const dimensions: Record<string, number> = {};
      const topics: Record<string, number> = {};
      const configs: Record<string, number> = {};
      
      bucket.dimensions.forEach(dim => {
        dimensions[dim.key] = dim.weight;
      });
      
      bucket.topics.forEach(topic => {
        topics[topic.key] = topic.weight;
      });
      
      bucket.configs?.forEach(config => {
        configs[config.key] = config.weight;
      });
      
      capabilityWeights[bucket.id] = { dimensions, topics, configs };
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
      
      <Collapsible open={showDevMode} onOpenChange={setShowDevMode}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="mb-4">
            <Icon name={showDevMode ? "chevron-up" : "chevron-down"} className="w-4 h-4 mr-2" />
            {showDevMode ? 'Hide' : 'Show'} Weight Sliders
          </Button>
        </CollapsibleTrigger>
        
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
                     
                     {/* Configs for this capability */}
                     {bucket.configs && bucket.configs.length > 0 && (
                       <div>
                         <h6 className="text-xs font-medium text-muted-foreground mb-2">Specific Evaluations</h6>
                         <div className="space-y-2">
                           {bucket.configs.map(config => {
                             const weight = weights[bucket.id]?.configs[config.key] || config.weight;
                             
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
                                       configs: {
                                         ...prev[bucket.id]?.configs,
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
            <div className="space-y-4">
              <h4 className="font-semibold text-sm">Live Results</h4>
              <div className="grid grid-cols-1 gap-4">
                {dynamicLeaderboards.map((bucket) => (
                  <div key={bucket.id} className="border rounded-lg p-3 bg-background">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name={bucket.icon as any} className="w-4 h-4 text-primary" />
                      <h5 className="font-medium text-sm">{bucket.label}</h5>
                    </div>
                    <ol className="space-y-1 list-decimal list-inside">
                      {bucket.leaderboard.slice(0, 5).map((model) => (
                        <li key={model.modelId} className="text-xs">
                          <div className="inline-flex justify-between items-center w-full">
                            <span className="font-medium truncate">
                              {getModelDisplayLabel(model.modelId, {
                                hideProvider: true,
                                hideModelMaker: true,
                                prettifyModelName: true,
                              })}
                            </span>
                            <span className="font-semibold ml-2">
                              {(model.averageScore * 100).toFixed(0)}%
                            </span>
                          </div>
                        </li>
                      ))}
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