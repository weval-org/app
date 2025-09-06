"use client";
import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Star, Plus, Check, AlertCircle, TrendingUp } from 'lucide-react';
import { MAKER_COLORS } from '@/app/utils/makerColors';

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

interface PersonalityCardProps {
  profile: PersonalityProfile;
  traitDefinitions: Record<string, TraitDefinition>;
  onSelect: () => void;
  isSelected: boolean;
}

const PersonalityCard = React.memo(function PersonalityCard({ 
  profile, 
  traitDefinitions, 
  onSelect, 
  isSelected 
}: PersonalityCardProps) {
  const getDataQualityInfo = (quality: string) => {
    switch (quality) {
      case 'high':
        return { color: 'text-green-600', icon: Check, label: 'High Confidence' };
      case 'medium':
        return { color: 'text-yellow-600', icon: AlertCircle, label: 'Medium Confidence' };
      case 'low':
        return { color: 'text-red-600', icon: AlertCircle, label: 'Low Confidence' };
      default:
        return { color: 'text-gray-600', icon: AlertCircle, label: 'Unknown' };
    }
  };

  const getTraitBadgeVariant = (score: number) => {
    if (score > 0.7) return 'default';
    if (score > 0.3) return 'secondary';
    return 'outline';
  };

  const getTraitIntensity = (score: number) => {
    if (score > 0.8) return 'Very High';
    if (score > 0.6) return 'High';
    if (score > 0.4) return 'Moderate';
    if (score > 0.2) return 'Low';
    return 'Very Low';
  };

  const dataQualityInfo = getDataQualityInfo(profile.dataQuality);
  const DataQualityIcon = dataQualityInfo.icon;

  return (
    <Card className={`group cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 ${
      isSelected 
        ? 'border-primary shadow-lg ring-2 ring-primary/20' 
        : 'border-transparent hover:border-primary/30'
    } bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div 
              className="w-4 h-4 rounded-full ring-2 ring-white dark:ring-slate-900" 
              style={{ backgroundColor: MAKER_COLORS[profile.maker] || MAKER_COLORS.UNKNOWN }}
            />
            <div>
              <h3 className="font-semibold text-lg leading-tight">{profile.displayName}</h3>
              <p className="text-sm text-muted-foreground capitalize">{profile.maker.toLowerCase()}</p>
            </div>
          </div>
          
          <Tooltip>
            <TooltipTrigger>
              <div className={`flex items-center space-x-1 ${dataQualityInfo.color}`}>
                <DataQualityIcon className="w-4 h-4" />
                <span className="text-xs font-medium">{profile.totalRuns}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-center">
                <p className="font-semibold">{dataQualityInfo.label}</p>
                <p className="text-xs">{profile.totalRuns} evaluation runs</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Overall Score */}
        <div className="flex items-center space-x-2 mt-2">
          <div className="flex items-center space-x-1">
            <Star className="w-4 h-4 text-yellow-500 fill-current" />
            <span className="font-semibold">{(profile.overallScore * 10).toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">/10</span>
          </div>
          <div className="flex-1 bg-muted rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-yellow-400 to-yellow-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${profile.overallScore * 100}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Dominant Traits */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center">
            <TrendingUp className="w-3 h-3 mr-1" />
            Dominant Traits
          </h4>
          <div className="space-y-2">
            {profile.dominantTraits.map((trait, index) => {
              const definition = traitDefinitions[trait.trait];
              if (!definition) return null;

              const TraitIcon = definition.icon;
              const intensity = getTraitIntensity(trait.score);
              
              return (
                <Tooltip key={trait.trait}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center space-x-2">
                        <TraitIcon className="w-4 h-4" color={definition.color} />
                        <span className="text-sm font-medium">{definition.name}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={getTraitBadgeVariant(trait.score)} className="text-xs">
                          {intensity}
                        </Badge>
                        <div className="w-12 bg-background rounded-full h-1.5">
                          <div 
                            className="h-1.5 rounded-full transition-all duration-500"
                            style={{ 
                              width: `${trait.score * 100}%`,
                              backgroundColor: definition.color 
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <div>
                      <p className="font-semibold">{definition.name}</p>
                      <p className="text-xs text-muted-foreground mb-2">{definition.description}</p>
                      <div className="space-y-1 text-xs">
                        <p><span className="font-medium">High:</span> {definition.examples.high}</p>
                        <p><span className="font-medium">Low:</span> {definition.examples.low}</p>
                      </div>
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-xs">
                          <span className="font-medium">Score:</span> {(trait.score * 100).toFixed(0)}% 
                          <span className="text-muted-foreground ml-1">
                            (confidence: {(trait.confidence * 100).toFixed(0)}%)
                          </span>
                        </p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Action Button */}
        <Button
          onClick={onSelect}
          variant={isSelected ? "default" : "outline"}
          className="w-full group-hover:shadow-md transition-all"
          size="sm"
        >
          {isSelected ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Selected
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Compare
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
});

export default PersonalityCard;
