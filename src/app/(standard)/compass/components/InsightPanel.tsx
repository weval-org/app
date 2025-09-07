"use client";
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, TrendingUp, AlertTriangle, Target, Users, Sparkles } from 'lucide-react';

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

interface InsightPanelProps {
  profiles: PersonalityProfile[];
  traitDefinitions: Record<string, TraitDefinition>;
}

type Insight = {
  type: 'recommendation' | 'warning' | 'trend' | 'discovery';
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  models?: string[];
  confidence: number;
};

const InsightPanel = React.memo(function InsightPanel({ profiles, traitDefinitions }: InsightPanelProps) {
  const insights = React.useMemo<Insight[]>(() => {
    if (profiles.length === 0) return [];

    const insights: Insight[] = [];
    const traitsData = new Map<string, Array<{ profile: PersonalityProfile; score: number; confidence: number }>>();

    // Group profiles by trait first
    for (const profile of profiles) {
      for (const trait of profile.allTraits) {
        if (trait.confidence > 0.5) {
          if (!traitsData.has(trait.trait)) {
            traitsData.set(trait.trait, []);
          }
          traitsData.get(trait.trait)!.push({
            profile,
            score: trait.score,
            confidence: trait.confidence,
          });
        }
      }
    }

    // Find models with extreme traits from pre-processed data
    traitsData.forEach((traitScores, traitId) => {
      const definition = traitDefinitions[traitId];
      if (!definition || traitScores.length === 0) return;

      // Find highest scoring model for this trait
      const highest = traitScores.reduce((max, curr) =>
        curr.score > max.score ? curr : max
      );

      if (highest.score > 0.8) {
        insights.push({
          type: 'recommendation',
          icon: Target,
          title: `Exceptional ${definition.name}`,
          description: `${highest.profile.displayName} shows outstanding ${definition.name.toLowerCase()} (${(highest.score * 100).toFixed(0)}%). ${definition.examples.high}`,
          models: [highest.profile.displayName],
          confidence: highest.confidence
        });
      }

      // Find lowest scoring model for this trait
      const lowest = traitScores.reduce((min, curr) =>
        curr.score < min.score ? curr : min
      );

      if (lowest.score < 0.2 && highest.score - lowest.score > 0.6) {
        insights.push({
          type: 'discovery',
          icon: Sparkles,
          title: `${definition.name} Spectrum`,
          description: `Wide variation in ${definition.name.toLowerCase()}: ${highest.profile.displayName} (${(highest.score * 100).toFixed(0)}%) vs ${lowest.profile.displayName} (${(lowest.score * 100).toFixed(0)}%)`,
          models: [highest.profile.displayName, lowest.profile.displayName],
          confidence: Math.min(highest.confidence, lowest.confidence)
        });
      }
    });

    // Find maker patterns
    const makerTraits = new Map<string, Array<{ trait: string; avgScore: number; count: number }>>();
    
    profiles.forEach(profile => {
      if (!makerTraits.has(profile.maker)) {
        makerTraits.set(profile.maker, []);
      }
      
      profile.dominantTraits.forEach(trait => {
        const existing = makerTraits.get(profile.maker)!.find(t => t.trait === trait.trait);
        if (existing) {
          existing.avgScore = (existing.avgScore * existing.count + trait.score) / (existing.count + 1);
          existing.count++;
        } else {
          makerTraits.get(profile.maker)!.push({
            trait: trait.trait,
            avgScore: trait.score,
            count: 1
          });
        }
      });
    });

    // Find maker specializations
    makerTraits.forEach((traits, maker) => {
      const strongTraits = traits.filter(t => t.avgScore > 0.7 && t.count >= 2);
      if (strongTraits.length > 0) {
        const trait = strongTraits[0];
        const definition = traitDefinitions[trait.trait];
        if (definition) {
          insights.push({
            type: 'trend',
            icon: TrendingUp,
            title: `${maker} Specialization`,
            description: `${maker} models consistently show high ${definition.name.toLowerCase()} (avg: ${(trait.avgScore * 100).toFixed(0)}%)`,
            confidence: Math.min(trait.count / 5, 1)
          });
        }
      }
    });

    // Data quality warnings
    const lowQualityModels = profiles.filter(p => p.dataQuality === 'low');
    if (lowQualityModels.length > 0) {
      insights.push({
        type: 'warning',
        icon: AlertTriangle,
        title: 'Limited Data Available',
        description: `${lowQualityModels.length} model${lowQualityModels.length > 1 ? 's have' : ' has'} limited evaluation data. Interpret personality traits carefully.`,
        models: lowQualityModels.slice(0, 3).map(p => p.displayName),
        confidence: 0.9
      });
    }

    // Sort by confidence and return top insights
    return insights
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 6);
  }, [profiles, traitDefinitions]);

  const getInsightStyle = (type: Insight['type']) => {
    switch (type) {
      case 'recommendation':
        return {
          bgColor: 'bg-blue-50 dark:bg-blue-950/30',
          borderColor: 'border-blue-200 dark:border-blue-800',
          iconColor: 'text-blue-600 dark:text-blue-400'
        };
      case 'warning':
        return {
          bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          iconColor: 'text-yellow-600 dark:text-yellow-400'
        };
      case 'trend':
        return {
          bgColor: 'bg-green-50 dark:bg-green-950/30',
          borderColor: 'border-green-200 dark:border-green-800',
          iconColor: 'text-green-600 dark:text-green-400'
        };
      case 'discovery':
        return {
          bgColor: 'bg-purple-50 dark:bg-purple-950/30',
          borderColor: 'border-purple-200 dark:border-purple-800',
          iconColor: 'text-purple-600 dark:text-purple-400'
        };
      default:
        return {
          bgColor: 'bg-gray-50 dark:bg-gray-950/30',
          borderColor: 'border-gray-200 dark:border-gray-800',
          iconColor: 'text-gray-600 dark:text-gray-400'
        };
    }
  };

  if (insights.length === 0) {
    return null;
  }

  return (
    <Card className="border-0 shadow-lg bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Lightbulb className="w-5 h-5 text-yellow-500" />
          <span>AI Personality Insights</span>
        </CardTitle>
        <CardDescription>
          Discover patterns and recommendations based on personality analysis
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {insights.map((insight, index) => {
            const style = getInsightStyle(insight.type);
            const InsightIcon = insight.icon;
            
            return (
              <div
                key={index}
                className={`p-4 rounded-lg border-2 ${style.bgColor} ${style.borderColor} transition-all hover:shadow-md`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`p-2 rounded-lg bg-white/50 dark:bg-slate-800/50 ${style.iconColor}`}>
                    <InsightIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm mb-1">{insight.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                      {insight.description}
                    </p>
                    
                    {insight.models && insight.models.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {insight.models.map(model => (
                          <Badge key={model} variant="secondary" className="text-xs">
                            {model}
                          </Badge>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${style.iconColor} border-current`}
                      >
                        {insight.type}
                      </Badge>
                      <div className="flex items-center space-x-1">
                        <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              insight.confidence > 0.8 ? 'bg-green-500' :
                              insight.confidence > 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${insight.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {(insight.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});

export default InsightPanel;
