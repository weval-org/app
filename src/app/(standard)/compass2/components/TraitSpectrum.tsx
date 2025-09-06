"use client";
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart3, TrendingUp, Users } from 'lucide-react';
import { extractMakerFromModelId } from '@/app/utils/modelIdUtils';
import { MAKER_COLORS } from '@/app/utils/makerColors';

type CompassIndex = {
  axes: Record<string, Record<string, { value: number | null; runs: number }>>;
  axisMetadata?: Record<string, { id: string; positivePole: string; negativePole: string }>;
  exemplars?: Record<string, any>;
  generatedAt: string;
};

type PersonalityProfile = {
  modelId: string;
  maker: string;
  displayName: string;
  dominantTraits: Array<{ trait: string; score: number; confidence: number }>;
  overallScore: number;
  dataQuality: 'high' | 'medium' | 'low';
  totalRuns: number;
};

type TraitDefinition = {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  examples: { high: string; low: string };
  color: string;
};

interface TraitSpectrumProps {
  compass: CompassIndex;
  traitDefinitions: Record<string, TraitDefinition>;
  profiles: PersonalityProfile[];
}

type SpectrumData = {
  trait: string;
  definition: TraitDefinition;
  models: Array<{
    modelId: string;
    displayName: string;
    maker: string;
    score: number;
    runs: number;
    valid: boolean;
  }>;
  makerAverages: Array<{
    maker: string;
    avgScore: number;
    count: number;
    models: string[];
  }>;
  variance: number;
  range: { min: number; max: number };
};

const TraitSpectrum = React.memo(function TraitSpectrum({ compass, traitDefinitions, profiles }: TraitSpectrumProps) {
  const [selectedTrait, setSelectedTrait] = React.useState<string>('epistemic-humility');
  const [viewMode, setViewMode] = React.useState<'models' | 'makers'>('makers');

  const spectrumData = React.useMemo<SpectrumData[]>(() => {
    if (!compass?.axes) return [];

    // Create profile lookup map for O(1) access
    const profileMap = new Map(profiles.map(p => [p.modelId, p]));
    const traitEntries = Object.entries(traitDefinitions);
    const results: SpectrumData[] = [];

    for (const [traitId, definition] of traitEntries) {
      const axisData = compass.axes[traitId];
      if (!axisData) continue;

      // Process individual models more efficiently
      const models: SpectrumData['models'] = [];
      const makerScores = new Map<string, { scores: number[]; models: string[] }>();
      const scores: number[] = [];

      for (const [modelId, data] of Object.entries(axisData)) {
        if ((data.runs || 0) < 3 || data.value === null) continue;

        const profile = profileMap.get(modelId);
        const maker = extractMakerFromModelId(modelId);
        const score = data.value;
        
        const model = {
          modelId,
          displayName: profile?.displayName || modelId,
          maker,
          score,
          runs: data.runs || 0,
          valid: true
        };

        models.push(model);
        scores.push(score);

        // Accumulate maker data
        if (!makerScores.has(maker)) {
          makerScores.set(maker, { scores: [], models: [] });
        }
        const makerData = makerScores.get(maker)!;
        makerData.scores.push(score);
        makerData.models.push(model.displayName);
      }

      if (models.length === 0) continue;

      // Sort models once
      models.sort((a, b) => b.score - a.score);

      // Calculate maker averages
      const makerAverages = Array.from(makerScores.entries()).map(([maker, data]) => ({
        maker,
        avgScore: data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length,
        count: data.scores.length,
        models: data.models
      })).sort((a, b) => b.avgScore - a.avgScore);

      // Calculate statistics more efficiently
      let variance = 0;
      if (scores.length > 1) {
        const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        let sumSquaredDiffs = 0;
        for (const score of scores) {
          sumSquaredDiffs += Math.pow(score - mean, 2);
        }
        variance = Math.sqrt(sumSquaredDiffs / scores.length);
      }

      // Calculate range more efficiently
      let min = scores[0], max = scores[0];
      for (let i = 1; i < scores.length; i++) {
        if (scores[i] < min) min = scores[i];
        if (scores[i] > max) max = scores[i];
      }

      results.push({
        trait: traitId,
        definition,
        models,
        makerAverages,
        variance,
        range: { min, max }
      });
    }

    return results;
  }, [compass, traitDefinitions, profiles]);

  const selectedSpectrumData = spectrumData.find(d => d.trait === selectedTrait);

  const SpectrumVisualization = ({ data }: { data: SpectrumData }) => {
    const items = viewMode === 'models' ? data.models : data.makerAverages;
    const { min, max } = data.range;

    const normalizeScore = (score: number) => {
      if (max - min < 1e-6) return 0.5; // Avoid division by zero if all scores are the same
      return (score - min) / (max - min);
    };

    return (
      <div className="space-y-3">
        {/* Spectrum Header */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="flex items-center space-x-2">
            <span>{data.definition.name}</span>
            <Badge variant="outline" className="text-xs">
              σ = {data.variance.toFixed(2)}
            </Badge>
          </span>
          <span>Range: {(data.range.min * 100).toFixed(0)}% - {(data.range.max * 100).toFixed(0)}%</span>
        </div>

        {/* Spectrum Bars */}
        <div className="space-y-2">
          {items.map((item, index) => {
            const score = 'avgScore' in item ? item.avgScore : item.score;
            const name = 'avgScore' in item ? item.maker : item.displayName;
            const maker = 'avgScore' in item ? item.maker : item.maker;
            const color = MAKER_COLORS[maker] || MAKER_COLORS.UNKNOWN;
            const isTop3 = index < 3;
            
            return (
              <Tooltip key={viewMode === 'models' ? (item as any).modelId : (item as any).maker}>
                <TooltipTrigger asChild>
                  <div className={`group cursor-pointer transition-all hover:shadow-sm ${
                    isTop3 ? 'ring-1 ring-primary/20' : ''
                  }`}>
                    <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50">
                      <div className="w-20 text-sm font-medium truncate capitalize">
                        {name.toLowerCase()}
                      </div>
                      
                      <div className="flex-1 relative">
                        <div className="w-full bg-muted rounded-full h-6 relative overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                            style={{
                              width: `${normalizeScore(score) * 100}%`,
                              backgroundColor: color,
                              opacity: 0.8
                            }}
                          >
                            <span className="text-xs font-medium text-white">
                              {(score * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="w-16 text-xs text-muted-foreground text-right">
                        {'count' in item ? `${item.count} models` : `${item.runs} runs`}
                      </div>
                      
                      {isTop3 && (
                        <Badge variant="secondary" className="text-xs">
                          #{index + 1}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TooltipTrigger>
                
                <TooltipContent side="left" className="max-w-xs">
                  <div>
                    <p className="font-semibold">{name}</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {data.definition.description}
                    </p>
                    
                    {viewMode === 'makers' && 'models' in item && (
                      <div className="space-y-1 text-xs">
                        <p className="font-medium">Models:</p>
                        {item.models.slice(0, 5).map(model => (
                          <p key={model} className="text-muted-foreground">• {model}</p>
                        ))}
                        {item.models.length > 5 && (
                          <p className="text-muted-foreground">... and {item.models.length - 5} more</p>
                        )}
                      </div>
                    )}
                    
                    <div className="mt-2 pt-2 border-t text-xs">
                      <p><span className="font-medium">Score:</span> {(score * 100).toFixed(1)}%</p>
                      <p><span className="font-medium">Rank:</span> #{index + 1} of {items.length}</p>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
          
        </div>

      </div>
    );
  };

  return (
    <Card className="border-0 shadow-lg bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <span>Personality Spectrums</span>
            </CardTitle>
            <CardDescription>
              See how models and makers rank across different personality traits
            </CardDescription>
          </div>
          
          <div className="flex items-center space-x-2">
            <select
              value={selectedTrait}
              onChange={(e) => setSelectedTrait(e.target.value)}
              className="px-3 py-1 border border-input bg-background rounded-md text-sm"
            >
              {spectrumData.map(data => (
                <option key={data.trait} value={data.trait}>
                  {data.definition.name}
                </option>
              ))}
            </select>
            
            <div className="flex border border-input rounded-md">
              <button
                onClick={() => setViewMode('makers')}
                className={`px-3 py-1 text-sm rounded-l-md transition-colors ${
                  viewMode === 'makers' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'hover:bg-muted'
                }`}
              >
                <Users className="w-4 h-4 mr-1 inline" />
                Makers
              </button>
              <button
                onClick={() => setViewMode('models')}
                className={`px-3 py-1 text-sm rounded-r-md transition-colors ${
                  viewMode === 'models' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'hover:bg-muted'
                }`}
              >
                <TrendingUp className="w-4 h-4 mr-1 inline" />
                Models
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {selectedSpectrumData ? (
          <SpectrumVisualization data={selectedSpectrumData} />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No data available for this trait</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default TraitSpectrum;
