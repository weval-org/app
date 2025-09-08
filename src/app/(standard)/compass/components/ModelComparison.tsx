"use client";
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { X, BarChart3, Radar, Download, Share } from 'lucide-react';
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
  allTraits: Array<{ trait: string; score: number; confidence: number; runs: number }>;
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

type ModelScore = {
  profile: PersonalityProfile;
  score: number;
  runs: number;
  valid: boolean;
};

type ComparisonDataItem = {
  trait: string;
  definition: TraitDefinition;
  modelScores: ModelScore[];
  variance: number;
};

interface ModelComparisonProps {
  selectedModels: string[];
  profiles: PersonalityProfile[];
  compass: CompassIndex | null;
  traitDefinitions: Record<string, TraitDefinition>;
  onRemoveModel: (modelId: string) => void;
}

// Helper function to calculate variance
const calculateVariance = (scores: number[]) => {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  return Math.sqrt(variance);
};

const RadarChart = React.memo(function RadarChart({ comparisonData, selectedProfiles }: {
  comparisonData: ComparisonDataItem[];
  selectedProfiles: PersonalityProfile[];
}) {
  const size = 400;
  const center = size / 2;
  const radius = size * 0.35;
  const traits = comparisonData.filter(d => d.modelScores.some(s => s.valid));
  
  if (traits.length === 0) return null;

  const angleStep = (2 * Math.PI) / traits.length;
  
  return (
    <div className="flex justify-center">
      <svg width={size} height={size} className="border rounded-lg bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-800 dark:to-slate-700">
        {/* Grid circles */}
        {[0.2, 0.4, 0.6, 0.8, 1.0].map(r => (
          <circle
            key={r}
            cx={center}
            cy={center}
            r={radius * r}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={1}
            opacity={0.3}
          />
        ))}
        
        {/* Axis lines */}
        {traits.map((trait, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const x = center + Math.cos(angle) * radius;
          const y = center + Math.sin(angle) * radius;
          
          return (
            <g key={trait.trait}>
              <line
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke="hsl(var(--border))"
                strokeWidth={1}
                opacity={0.5}
              />
              <text
                x={x + Math.cos(angle) * 20}
                y={y + Math.sin(angle) * 20}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-foreground text-xs font-medium"
                transform={`rotate(${(angle * 180 / Math.PI) + (Math.abs(angle) > Math.PI / 2 ? 180 : 0)}, ${x + Math.cos(angle) * 20}, ${y + Math.sin(angle) * 20})`}
              >
                {trait.definition.name}
              </text>
            </g>
          );
        })}
        
        {/* Model polygons */}
        {selectedProfiles.map((profile, profileIndex) => {
          const color = MAKER_COLORS[profile.maker] || MAKER_COLORS.UNKNOWN;
          const points = traits.map((trait, i) => {
            const modelScore = trait.modelScores.find(s => s.profile.modelId === profile.modelId);
            const score = modelScore?.valid ? modelScore.score : 0;
            const angle = i * angleStep - Math.PI / 2;
            const r = radius * score;
            return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
          }).join(' ');
          
          return (
            <g key={profile.modelId}>
              <polygon
                points={points}
                fill={color}
                fillOpacity={0.1}
                stroke={color}
                strokeWidth={2}
              />
              {traits.map((trait, i) => {
                const modelScore = trait.modelScores.find(s => s.profile.modelId === profile.modelId);
                if (!modelScore?.valid) return null;
                
                const angle = i * angleStep - Math.PI / 2;
                const r = radius * modelScore.score;
                const x = center + Math.cos(angle) * r;
                const y = center + Math.sin(angle) * r;
                
                return (
                  <circle
                    key={`${profile.modelId}-${trait.trait}`}
                    cx={x}
                    cy={y}
                    r={4}
                    fill={color}
                    stroke="white"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
});

const BarChart = React.memo(function BarChart({ comparisonData }: {
  comparisonData: ComparisonDataItem[];
}) {
  return (
    <div className="space-y-6">
      {comparisonData.map(trait => (
        <div key={trait.trait} className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold flex items-center space-x-2">
              <trait.definition.icon className="w-4 h-4" color={trait.definition.color} />
              <span>{trait.definition.name}</span>
            </h4>
            <Badge variant="outline" className="text-xs">
              Variance: {trait.variance.toFixed(2)}
            </Badge>
          </div>
          
          <div className="space-y-2">
            {trait.modelScores.map(modelScore => (
              <div key={modelScore.profile.modelId} className="flex items-center space-x-3">
                <div className="w-24 text-sm font-medium truncate">
                  {modelScore.profile.displayName}
                </div>
                <div className="flex-1 relative">
                  <div className="w-full bg-muted rounded-full h-6 relative overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                      style={{
                        width: `${modelScore.score * 100}%`,
                        backgroundColor: MAKER_COLORS[modelScore.profile.maker] || MAKER_COLORS.UNKNOWN,
                        opacity: modelScore.valid ? 0.8 : 0.3
                      }}
                    >
                      <span className="text-xs font-medium text-white">
                        {(modelScore.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  {!modelScore.valid && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">Insufficient data</span>
                    </div>
                  )}
                </div>
                <div className="w-16 text-xs text-muted-foreground text-right">
                  {modelScore.runs} runs
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

const ModelComparison = React.memo(function ModelComparison({ 
  selectedModels, 
  profiles, 
  compass, 
  traitDefinitions, 
  onRemoveModel 
}: ModelComparisonProps) {
  const [viewMode, setViewMode] = React.useState<'radar' | 'bars'>('radar');

  const selectedProfiles = React.useMemo(() => {
    return selectedModels.map(modelId => 
      profiles.find(p => p.modelId === modelId)
    ).filter(Boolean) as PersonalityProfile[];
  }, [selectedModels, profiles]);

  const comparisonData = React.useMemo<ComparisonDataItem[]>(() => {
    if (!compass?.axes || selectedProfiles.length === 0) return [];

    const traits = Object.keys(traitDefinitions);
    
    return traits.map(traitId => {
      const definition = traitDefinitions[traitId];
      const modelScores: ModelScore[] = selectedProfiles.map(profile => {
        const axisData = compass.axes[traitId]?.[profile.modelId];
        return {
          profile,
          score: axisData?.value || 0,
          runs: axisData?.runs || 0,
          valid: axisData?.value !== null
        };
      });

      return {
        trait: traitId,
        definition,
        modelScores,
        variance: calculateVariance(modelScores.filter(s => s.valid).map(s => s.score))
      };
    });
  }, [compass, selectedProfiles, traitDefinitions]);

  return (
    <div className="space-y-6">
      {/* Selected Models Header */}
      <Card className="border-0 shadow-lg bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                <span>Model Comparison</span>
              </CardTitle>
              <CardDescription>
                Compare personality traits across selected models
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant={viewMode === 'radar' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('radar')}
              >
                <Radar className="w-4 h-4 mr-2" />
                Radar
              </Button>
              <Button
                variant={viewMode === 'bars' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('bars')}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Bars
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {selectedProfiles.map(profile => (
              <div
                key={profile.modelId}
                className="flex items-center space-x-2 bg-muted/50 rounded-lg px-3 py-2"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: MAKER_COLORS[profile.maker] || MAKER_COLORS.UNKNOWN }}
                />
                <span className="text-sm font-medium">{profile.displayName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveModel(profile.modelId)}
                  className="h-auto p-1 hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Comparison Visualization */}
      <Card className="border-0 shadow-lg bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
        <CardContent className="p-6">
          {viewMode === 'radar' 
            ? <RadarChart comparisonData={comparisonData} selectedProfiles={selectedProfiles} /> 
            : <BarChart comparisonData={comparisonData} />
          }
        </CardContent>
      </Card>

      {/* Detailed Breakdown */}
      <Card className="border-0 shadow-lg bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Trait Analysis</CardTitle>
          <CardDescription>
            Detailed breakdown of personality differences
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {comparisonData
              .filter(d => d.variance > 0.1) // Only show traits with meaningful differences
              .sort((a, b) => b.variance - a.variance)
              .slice(0, 6)
              .map(trait => (
                <div key={trait.trait} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold flex items-center space-x-2">
                      <trait.definition.icon className="w-4 h-4" color={trait.definition.color} />
                      <span>{trait.definition.name}</span>
                    </h4>
                    <Badge variant="secondary" className="text-xs">
                      High Variance
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {trait.definition.description}
                  </p>
                  
                  <div className="space-y-2">
                    <div className="text-xs">
                      <span className="font-medium">High:</span> {trait.definition.examples.high}
                    </div>
                    <div className="text-xs">
                      <span className="font-medium">Low:</span> {trait.definition.examples.low}
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    {trait.modelScores
                      .filter(s => s.valid)
                      .sort((a, b) => b.score - a.score)
                      .map(modelScore => (
                        <div key={modelScore.profile.modelId} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{modelScore.profile.displayName}</span>
                          <span className="text-muted-foreground">
                            {(modelScore.score * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default ModelComparison;
