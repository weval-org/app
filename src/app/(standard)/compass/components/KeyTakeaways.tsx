"use client";
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, ArrowUp, ArrowDown } from 'lucide-react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';

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

interface KeyTakeawaysProps {
  compass: CompassIndex;
  traitDefinitions: Record<string, TraitDefinition>;
  profiles: PersonalityProfile[];
}

type LeaderboardData = {
  traitId: string;
  definition: TraitDefinition;
  positivePole: string;
  negativePole: string;
  top: Array<{ modelId: string; displayName: string; score: number }>;
  bottom: Array<{ modelId: string; displayName: string; score: number }>;
};

const LeaderboardCard = React.memo(function LeaderboardCard({ data }: { data: LeaderboardData }) {
  const { definition, top, bottom, positivePole, negativePole } = data;
  const colors = ['#FFD700', '#C0C0C0', '#CD7F32']; // Gold, Silver, Bronze
  
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
          <definition.icon className="w-4 h-4" style={{ color: definition.color }} />
          {definition.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col gap-2 pt-2 text-sm">
        <div className="bg-muted/50 p-2 rounded-md border-l-4 flex items-start gap-2" style={{ borderColor: definition.color }}>
          <ArrowUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <p className="text-sm font-semibold text-muted-foreground leading-tight">Most {positivePole.toLowerCase()}</p>
            <div className="space-y-1 mt-1 font-medium">
              {top.map((model, i) => (
                <div key={model.modelId} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[i] }} />
                  <p className="truncate">{model.displayName}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-muted/50 p-2 rounded-md border-l-4 flex items-start gap-2" style={{ borderColor: definition.color }}>
          <ArrowDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <p className="text-sm font-semibold text-muted-foreground leading-tight">Most {negativePole.toLowerCase()}</p>
            <div className="space-y-1 font-medium mt-1">
              {bottom.map((model, i) => (
                <div key={model.modelId} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[2 - i] }} />
                  <p className="truncate">{model.displayName}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

const KeyTakeaways = React.memo(function KeyTakeaways({ compass, traitDefinitions, profiles }: KeyTakeawaysProps) {
  const leaderboardData = React.useMemo<LeaderboardData[]>(() => {
    if (!compass?.axes || !compass.axisMetadata) return [];

    const profileMap = new Map(profiles.map(p => [p.modelId, p]));
    const bipolarAxes = Object.values(compass.axisMetadata);

    const results: LeaderboardData[] = [];

    for (const axis of bipolarAxes) {
      const traitId = axis.id;
      const definition = traitDefinitions[traitId];
      const axisData = compass.axes[traitId];

      if (!definition || !axisData) continue;

      const models: Array<{ modelId: string; displayName: string; score: number }> = [];

      for (const [modelId, data] of Object.entries(axisData)) {
        if (data.value === null) continue;

        const profile = profileMap.get(modelId);
        models.push({
          modelId,
          displayName: getModelDisplayLabel(modelId, { hideProvider: true, prettifyModelName: true }),
          score: data.value,
        });
      }

      if (models.length < 1) continue;

      models.sort((a, b) => b.score - a.score);

      results.push({
        traitId,
        definition,
        positivePole: axis.positivePole,
        negativePole: axis.negativePole,
        top: models.slice(0, 3),
        bottom: models.slice(-3),
      });
    }

    return results;
  }, [compass, traitDefinitions, profiles]);

  if (leaderboardData.length === 0) {
    return null;
  }

  return (
    <Card className="border-0 shadow-lg bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Trophy className="w-6 h-6 text-primary" />
          </div>
          <div>
            <CardTitle>Key Takeaways</CardTitle>
            <CardDescription>At a glance, which models lead in each personality trait.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {leaderboardData.map(data => (
            <LeaderboardCard key={data.traitId} data={data} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

export default KeyTakeaways;
