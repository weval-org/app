'use client';

import dynamic from 'next/dynamic';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { APP_REPO_URL } from '@/lib/configConstants';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

const BarChartHorizontalBig = dynamic(() => import('lucide-react').then(mod => mod.BarChartHorizontalBig));
const Award = dynamic(() => import('lucide-react').then(mod => mod.Award));
const InfoIcon = dynamic(() => import('lucide-react').then(mod => mod.Info));
const FlaskConical = dynamic(() => import('lucide-react').then(mod => mod.FlaskConical));
const BrainCircuit = dynamic(() => import('lucide-react').then(mod => mod.BrainCircuit));

export interface HeadlineStatInfo {
  configId: string;
  configTitle: string;
  value: number;
  description?: string;
  latestRunLabel?: string;
  latestRunTimestamp?: string;
}

export interface TopModelStatInfo {
  modelId: string;
  overallAverageHybridScore: number;
  overallAverageSimilarityScore?: number;
  overallAverageCoverageScore?: number;
  runsParticipatedIn: number;
}

export interface DimensionChampionInfo {
  dimension: string;
  modelId: string;
  averageScore: number;
  runsCount: number;
}

export interface AggregateStatsData {
  bestPerformingConfig: HeadlineStatInfo | null;
  worstPerformingConfig: HeadlineStatInfo | null;
  leastConsistentConfig: HeadlineStatInfo | null;
  rankedOverallModels: TopModelStatInfo[] | null;
  dimensionChampions?: DimensionChampionInfo[] | null;
}

type StatStatusType = 'best' | 'worst' | 'mostConsistent' | 'mostDifferentiating' | 'neutral' | 'error';

interface AggregateStatsDisplayProps {
  stats: AggregateStatsData | null;
}

const StatCard: React.FC<{
  title: string;
  data: HeadlineStatInfo | null;
  unit?: string;
  icon?: React.ElementType;
  statusType?: StatStatusType;
  blurb?: string;
}> = ({ title, data, unit, icon: Icon, statusType = 'neutral', blurb }) => {
  let iconColorClass = 'text-muted-foreground/70';
  switch (statusType) {
    case 'best':
      iconColorClass = 'text-emerald-500 dark:text-emerald-400';
      break;
    case 'worst':
      iconColorClass = 'text-red-500 dark:text-red-400';
      break;
    case 'mostConsistent':
      iconColorClass = 'text-primary';
      break;
    case 'mostDifferentiating':
      iconColorClass = 'text-purple-500 dark:text-purple-400';
      break;
    case 'error':
      iconColorClass = 'text-red-500 dark:text-red-400';
      break;
    default:
      iconColorClass = 'text-primary';
      break;
  }

  const cardLink = useMemo(() => {
    if (!data) return '#';
    if (data.latestRunLabel && data.latestRunTimestamp) {
      return `/analysis/${data.configId}/${data.latestRunLabel}/${data.latestRunTimestamp}`;
    }
    return `/analysis/${data.configId}`;
  }, [data]);

  const cardContent = (
    <div className="flex flex-col justify-between flex-grow">
      <div>
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-sm font-medium text-muted-foreground leading-tight pr-2">{title}</h3>
          {Icon && <Icon className={`w-5 h-5 flex-shrink-0 ${iconColorClass}`} />}
        </div>
        {data ? (
          <>
            <p className="text-lg font-semibold text-card-foreground truncate" title={data.configTitle}>{data.configTitle}</p>
            <p className="text-xs text-muted-foreground">
              {data.description || (unit ? 'Score' : '')}: <span className="font-medium">{data.value.toFixed(3)}</span> {unit}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground mt-auto">Not available</p>
        )}
      </div>
      {blurb && (
        <p className="text-[11px] text-muted-foreground/80 pt-2 border-t border-border/50">
          {blurb}
        </p>
      )}
    </div>
  );

  return (
    <div 
      className="bg-card p-4 rounded-lg border border-border/70 dark:border-slate-700/50 flex flex-col min-h-[140px] hover:shadow-md transition-shadow"
    >
      {data && data.configId ? (
        <Link href={cardLink} className="flex flex-col justify-between flex-grow">
          {cardContent}
        </Link>
      ) : (
        <div className="flex flex-col justify-between flex-grow">
         {cardContent}
        </div>
      )}
    </div>
  );
};

const OverallModelLeaderboard: React.FC<{
  models: TopModelStatInfo[] | null;
  title: string;
  initialCount?: number;
  incrementCount?: number;
  seeMoreMinRemaining?: number;
  coverageWeight: number;
}> = ({ 
  models,
  title,
  initialCount = 5,
  incrementCount = 10,
  seeMoreMinRemaining = 5,
  coverageWeight,
}) => {

  const shouldShowAllInitially = useMemo(() => {
    if (!models) return false;
    return models.length <= initialCount + seeMoreMinRemaining -1;
  }, [models, initialCount, seeMoreMinRemaining]);

  const [visibleCount, setVisibleCount] = useState(() => 
    shouldShowAllInitially && models ? models.length : initialCount
  );

  const processedModels = useMemo(() => {
    if (!models) return [];
    
    return models.map(model => {
      // If the new scores aren't available, fall back to the pre-calculated hybrid score.
      if (model.overallAverageCoverageScore === undefined || model.overallAverageSimilarityScore === undefined) {
        return { ...model, displayScore: model.overallAverageHybridScore };
      }
      const similarityWeight = 1 - coverageWeight;
      const hybridScore = (model.overallAverageCoverageScore * coverageWeight) + (model.overallAverageSimilarityScore * similarityWeight);
      return { ...model, displayScore: hybridScore };
    }).sort((a, b) => b.displayScore - a.displayScore);

  }, [models, coverageWeight]);

  if (!models || models.length === 0) {
    return (
      <div className="bg-card p-4 rounded-lg border border-border/70 dark:border-slate-700/50 lg:col-span-4">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-sm font-medium text-muted-foreground leading-tight pr-2">{title}</h3>
          <BarChartHorizontalBig className="w-5 h-5 flex-shrink-0 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground mt-auto">Not enough data to display leaderboard.</p>
      </div>
    );
  }

  const visibleModels = processedModels.slice(0, visibleCount);
  const showSeeMoreButton = !shouldShowAllInitially && models.length > visibleCount;

  return (
    <div className="bg-card p-4 rounded-lg border border-border/70 dark:border-slate-700/50 lg:col-span-4">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground leading-tight pr-2">{title}</h3>
        <BarChartHorizontalBig className="w-5 h-5 flex-shrink-0 text-primary" />
      </div>
      <ul className="space-y-2">
        {visibleModels.map((model, index) => (
          <li key={model.modelId} className="flex items-center justify-between text-sm border-b border-border/50 dark:border-slate-700/30 pb-1.5 last:border-b-0 last:pb-0">
            <div className="flex items-center">
              <span className="mr-2.5 w-6 text-right text-muted-foreground">{index + 1}.</span>
              {index < 3 && Award && <Award className={`w-3.5 h-3.5 mr-1.5 ${index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-400' : 'text-amber-700/80'}`} />}
              <span className="font-medium text-card-foreground" title={model.modelId}>{
                getModelDisplayLabel(model.modelId, {
                  hideProvider: true,
                  hideModelMaker: true,
                  hideSystemPrompt: true,
                  hideTemperature: true,
                  prettifyModelName: true
                })
              }</span>
            </div>
            <div className="text-right">
              <span className="font-semibold text-primary">{(model.displayScore * 100).toFixed(1)}%</span>
              <span className="ml-1.5 text-muted-foreground/80 text-[11px]">(in {model.runsParticipatedIn} runs)</span>
            </div>
          </li>
        ))}
      </ul>
      {showSeeMoreButton && (
        <div className="mt-4 text-center">
          <Button 
            variant="link"
            size="sm"
            onClick={() => setVisibleCount(prev => Math.min(prev + incrementCount, models.length))}
            className="text-muted-foreground hover:text-primary h-auto p-1 text-xs"
          >
            See More ({models.length - visibleCount} remaining)
          </Button>
        </div>
      )}
    </div>
  );
};

const DimensionChampionsDisplay: React.FC<{ champions: DimensionChampionInfo[] | null }> = ({ champions }) => {
  if (!champions || champions.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <h3 className="text-xl font-semibold tracking-tight text-center mb-6 flex items-center justify-center">
        <BrainCircuit className="w-6 h-6 mr-3 text-primary" />
        Dimension Champions
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {champions.map((champion) => (
          <div key={champion.dimension} className="bg-card p-3 rounded-lg border border-border/70 dark:border-slate-700/50 text-center hover:shadow-md transition-shadow">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{champion.dimension}</p>
            <p className="text-sm font-bold text-card-foreground truncate mt-1" title={champion.modelId}>
              {getModelDisplayLabel(champion.modelId, { hideProvider: true, hideModelMaker: true, hideSystemPrompt: true, hideTemperature: true, prettifyModelName: true })}
            </p>
            <p className="text-xs text-primary font-mono bg-muted/50 dark:bg-slate-700/30 rounded px-1.5 py-0.5 mt-1.5 inline-block">
              {(champion.averageScore).toFixed(1)}/10
            </p>
          </div>
        ))}
      </div>
       <p className="text-xs text-muted-foreground mt-4 text-center">
        Highest average score for each dimension, based on Executive Summary grades from models with at least 3 graded runs.
      </p>
    </div>
  );
};

const AggregateStatsDisplay: React.FC<AggregateStatsDisplayProps> = ({ stats }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [coverageWeight, setCoverageWeight] = useState(0.65);

  const supportsDynamicWeighting = useMemo(() => {
    if (!stats?.rankedOverallModels) return false;
    // Check if at least one model has the new detailed scores
    return stats.rankedOverallModels.some(
      model => model.overallAverageCoverageScore !== undefined && model.overallAverageSimilarityScore !== undefined
    );
  }, [stats?.rankedOverallModels]);

  if (!stats) {
    return (
      <div className="mb-8 mt-4 p-4 text-center text-muted-foreground">
        Aggregate statistics are not yet available.
      </div>
    );
  }

  const MIN_RUNS_FOR_LEADERBOARD = 10;
  const filteredRankedModels = stats.rankedOverallModels?.filter(
    (model) => model.runsParticipatedIn >= MIN_RUNS_FOR_LEADERBOARD
  );

  return (
    <div className="my-2">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-foreground mb-2">
          Model Leaderboard
        </h2>
        <p className="text-muted-foreground dark:text-muted-foreground text-sm">
          Measured by average hybrid score across all evaluations.
        </p>
      </div>
      {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard 
          title="Best Performing Eval"
          data={stats.bestPerformingConfig ? { ...stats.bestPerformingConfig, description: "Avg. Hybrid Score" } : null} 
          icon={TrendingUp}
          statusType="best"
          blurb="The evaluation with the highest average hybrid score across all its runs, showing broad competency across models."
        />
        <StatCard 
          title="Worst Performing Eval"
          data={stats.worstPerformingConfig ? { ...stats.worstPerformingConfig, description: "Avg. Hybrid Score" } : null} 
          icon={TrendingDown}
          statusType="worst"
          blurb="The evaluation with the lowest average hybrid score across all its runs, showing less competency across models."
        />
        <StatCard 
          title="Most Differentiating Eval" 
          data={stats.leastConsistentConfig ? { ...stats.leastConsistentConfig, description: "Score StdDev (Higher is better for differentiation)" } : null} 
          icon={Zap}
          statusType="mostDifferentiating"
          blurb="The evaluation that shows the widest range of scores, making it best for telling models apart."
        />
      </div> */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <OverallModelLeaderboard
          models={filteredRankedModels || null}
          title="Overall Model Leaderboard"
          coverageWeight={coverageWeight}
        />
      </div>
      {supportsDynamicWeighting && (
        <div className="mt-6 p-4 bg-card border border-border/70 dark:border-slate-700/50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <Label htmlFor="coverage-weight-slider" className="font-semibold text-sm">
                Adjust Score Weights
              </Label>
              <div className="text-sm font-mono bg-muted/80 dark:bg-slate-700/50 px-2 py-1 rounded-md">
                  <span className="font-bold text-emerald-500">Coverage: {(coverageWeight * 100).toFixed(0)}%</span> / <span className="font-bold text-sky-500">Similarity: {((1 - coverageWeight) * 100).toFixed(0)}%</span>
              </div>
            </div>
            <Slider
              id="coverage-weight-slider"
              min={0}
              max={1}
              step={0.05}
              value={[coverageWeight]}
              onValueChange={(value) => setCoverageWeight(value[0])}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Adjust the slider to change the weighting between Key Point Coverage (rubric adherence) and Semantic Similarity (holistic quality).
            </p>
          </div>
      )}
      <DimensionChampionsDisplay champions={stats.dimensionChampions || null} />
      <div className="mt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          className="h-auto p-1 text-muted-foreground hover:text-primary"
        >
          <InfoIcon className="w-4 h-4 mr-1" />
          <span className="text-xs">{showDetails ? 'Hide Details' : 'More Info'}</span>
        </Button>
        {showDetails && (
          <div className="mt-2 p-3 text-xs text-muted-foreground bg-card border border-border/70 dark:border-slate-700/50 rounded-lg space-y-2">
            <p className="flex items-start">
              {InfoIcon && <InfoIcon className="w-4 h-4 mr-2 text-primary flex-shrink-0" />}
              <span>
                <strong>Note on Leaderboard:</strong> Only models that have participated in at least {MIN_RUNS_FOR_LEADERBOARD} evaluation runs are shown. This leaderboard serves ONLY as a commentary on the types of competencies expressed in the blueprints on <strong style={{ textDecoration: 'underline' }}>this deployment</strong> of Weval. It is not a comprehensive or representative sample of all models or skills.
              </span>
            </p>
            <p className="flex items-start">
              {FlaskConical && <FlaskConical className="w-4 h-4 mr-2 text-primary flex-shrink-0" />}
              <span>
                The Hybrid Score is a weighted average combining semantic similarity (weight: {((1-coverageWeight)*100).toFixed(0)}%) and key point coverage (weight: {(coverageWeight*100).toFixed(0)}%). This emphasizes rubric adherence while still valuing overall response quality. Read more about our methodology <a href={`${APP_REPO_URL}/blob/main/docs/METHODOLOGY.md`} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">here</a>.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AggregateStatsDisplay; 