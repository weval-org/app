"use client";
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart3, TrendingUp, Users, ArrowUpDown } from 'lucide-react';
import { extractMakerFromModelId } from '@/app/utils/modelIdUtils';
import { MAKER_COLORS } from '@/app/utils/makerColors';
import { Button } from '@/components/ui/button';

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
  positivePole: string;
  negativePole: string;
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
  const [sortOrder, setSortOrder] = React.useState<'desc' | 'asc'>('desc');

  const spectrumData = React.useMemo<SpectrumData[]>(() => {
    if (!compass?.axes || !compass?.axisMetadata) return [];

    // Create profile lookup map for O(1) access
    const profileMap = new Map(profiles.map(p => [p.modelId, p]));
    const traitEntries = Object.entries(traitDefinitions);
    const results: SpectrumData[] = [];

    for (const [traitId, definition] of traitEntries) {
      const axisData = compass.axes[traitId];
      const axisMetadata = compass.axisMetadata[traitId];
      if (!axisData || !axisMetadata) continue;

      const models: SpectrumData['models'] = [];
      const makerScores = new Map<string, { scores: number[]; models: string[] }>();
      
      let sum = 0;
      let sumSq = 0;
      let min = Infinity;
      let max = -Infinity;
      let count = 0;

      for (const [modelId, data] of Object.entries(axisData)) {
        if (data.value === null) continue;

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

        sum += score;
        sumSq += score * score;
        if (score < min) min = score;
        if (score > max) max = score;
        count++;

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

      let variance = 0;
      if (count > 1) {
          const mean = sum / count;
          variance = Math.sqrt((sumSq / count) - (mean * mean));
      }

      results.push({
        trait: traitId,
        definition,
        positivePole: axisMetadata.positivePole,
        negativePole: axisMetadata.negativePole,
        models,
        makerAverages,
        variance,
        range: { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max }
      });
    }

    return results;
  }, [compass, traitDefinitions, profiles]);

  const selectedSpectrumData = spectrumData.find(d => d.trait === selectedTrait);

  const SpectrumVisualization = ({ data }: { data: SpectrumData }) => {
    const rawItems = viewMode === 'models' ? data.models : data.makerAverages;
    const { min, max } = data.range;

    const items = React.useMemo(() => {
      const sorted = [...rawItems].sort((a, b) => {
        const scoreA = 'avgScore' in a ? a.avgScore : a.score;
        const scoreB = 'avgScore' in b ? b.avgScore : b.score;
        return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
      });
      return sorted;
    }, [rawItems, sortOrder]);

    const sortDescription = sortOrder === 'desc'
      ? `sorted by most ${data.positivePole.toLowerCase()} to most ${data.negativePole.toLowerCase()}`
      : `sorted by most ${data.negativePole.toLowerCase()} to most ${data.positivePole.toLowerCase()}`;

    return (
      <div className="space-y-4">
        {/* Spectrum Header */}
        <div className="flex items-center justify-between text-sm text-muted-foreground border-b pb-2">
          <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground">
            <data.definition.icon className="w-5 h-5" style={{ color: data.definition.color }} />
            {data.definition.name}
          </h3>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-xs">
              σ = {data.variance.toFixed(2)}
            </Badge>
            <span>Range: {(data.range.min * 100).toFixed(0)}% - {(data.range.max * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground italic">{data.definition.name}: {sortDescription}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          >
            <ArrowUpDown className="w-4 h-4 mr-2" />
            Sort
          </Button>
        </div>
        
        {/* Spectrum Bars */}
        <table className="w-full border-separate" style={{ borderSpacing: '0 0.25rem' }}>
          <thead>
            <tr className="text-xs font-medium text-muted-foreground">
              <th className="p-2 text-left font-medium w-auto">{viewMode === 'models' ? 'Model' : 'Maker'}</th>
              <th className="p-2 font-medium">
                <div className="flex justify-between">
                  <span className="truncate">{data.negativePole}</span>
                  <span className="truncate text-right">{data.positivePole}</span>
                </div>
              </th>
              <th className="p-2 text-right font-medium w-auto">
                {viewMode === 'models' ? 'Runs' : 'Models'}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const score = 'avgScore' in item ? item.avgScore : item.score;
              const name = 'avgScore' in item ? item.maker : item.displayName;
              const maker = 'avgScore' in item ? item.maker : item.maker;
              const color = MAKER_COLORS[maker] || MAKER_COLORS.UNKNOWN;
              
              return (
                <tr key={viewMode === 'models' ? (item as any).modelId : (item as any).maker} className="group cursor-pointer transition-all">
                  <td className="p-2 rounded-l-lg text-sm font-medium group-hover:bg-muted/50 whitespace-nowrap">
                    {maker} / {name}
                  </td>
                  <td className="p-2 group-hover:bg-muted/50 w-full">
                    <div className="relative pt-4">
                      <div
                        className="absolute text-[10px] font-bold"
                        style={{
                          left: `${score * 100}%`,
                          top: 0,
                          transform: 'translateX(-50%)',
                          color: color,
                        }}
                      >
                        {(score * 100).toFixed(0)}
                      </div>
                      <div className="w-full h-1 relative bg-transparent bg-[repeating-linear-gradient(to_right,hsl(var(--border)),hsl(var(--border))_2px,transparent_2px,transparent_8px)]">
                          <div
                            className="absolute h-4 w-4 rounded-full transition-all duration-500"
                            style={{
                              left: `calc(${score * 100}% - 8px)`,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              backgroundColor: color,
                              borderColor: 'hsl(var(--card))',
                              borderWidth: '3px',
                            }}
                          />
                      </div>
                    </div>
                  </td>
                  <td className="p-2 rounded-r-lg text-xs text-muted-foreground text-right group-hover:bg-muted/50 whitespace-nowrap">
                    {'count' in item ? `${item.count} models` : `${item.runs} runs`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
            <label htmlFor="trait-select" className="text-sm font-medium">Viewing Trait:</label>
            <select
              id="trait-select"
              value={selectedTrait}
              onChange={(e) => setSelectedTrait(e.target.value)}
              className="px-3 py-2 border border-input bg-background rounded-md text-base font-semibold"
            >
              {spectrumData.map(data => (
                <option key={data.trait} value={data.trait}>
                  {data.definition.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* View Mode Toggle */}
        <div className="flex justify-end mb-4">
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
