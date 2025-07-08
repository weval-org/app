'use client';

import dynamic from 'next/dynamic';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const BarChartHorizontalBig = dynamic(() => import('lucide-react').then(mod => mod.BarChartHorizontalBig));

const TrendingUp = dynamic(() => import('lucide-react').then(mod => mod.TrendingUp));
const TrendingDown = dynamic(() => import('lucide-react').then(mod => mod.TrendingDown));
const CheckCircle2 = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle2));
const AlertCircle = dynamic(() => import('lucide-react').then(mod => mod.AlertCircle));
const Award = dynamic(() => import('lucide-react').then(mod => mod.Award));
const InfoIcon = dynamic(() => import('lucide-react').then(mod => mod.Info));
const Zap = dynamic(() => import('lucide-react').then(mod => mod.Zap));
const FlaskConical = dynamic(() => import('lucide-react').then(mod => mod.FlaskConical));

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
  overallAverageScore: number;
  runsParticipatedIn: number;
}

export interface AggregateStatsData {
  bestPerformingConfig: HeadlineStatInfo | null;
  worstPerformingConfig: HeadlineStatInfo | null;
  leastConsistentConfig: HeadlineStatInfo | null;
  rankedOverallModels: TopModelStatInfo[] | null;
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
}> = ({ 
  models,
  title,
  initialCount = 10,
  incrementCount = 10,
  seeMoreMinRemaining = 5
}) => {

  const shouldShowAllInitially = useMemo(() => {
    if (!models) return false;
    return models.length <= initialCount + seeMoreMinRemaining -1;
  }, [models, initialCount, seeMoreMinRemaining]);

  const [visibleCount, setVisibleCount] = useState(() => 
    shouldShowAllInitially && models ? models.length : initialCount
  );

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

  const visibleModels = models.slice(0, visibleCount);
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
              <span className="font-medium text-card-foreground" title={model.modelId}>{getModelDisplayLabel(model.modelId, { hideProvider: true })}</span>
            </div>
            <div className="text-right">
              <span className="font-semibold text-primary">{(model.overallAverageScore * 100).toFixed(1)}%</span>
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

const AggregateStatsDisplay: React.FC<AggregateStatsDisplayProps> = ({ stats }) => {
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
    <div className="my-2 pt-2">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <OverallModelLeaderboard
          models={filteredRankedModels || null}
          title="Overall Model Leaderboard (Avg. Hybrid Score)"
        />
        <div className="p-3 text-xs text-muted-foreground bg-card border border-border/70 dark:border-slate-700/50 rounded-lg md:col-span-2 lg:col-span-4">
          <p className="flex items-start">
            {InfoIcon && <InfoIcon className="w-4 h-4 mr-2 text-primary flex-shrink-0" />}
            <span>
              <strong>Note on Leaderboard:</strong> Only models that have participated in at least {MIN_RUNS_FOR_LEADERBOARD} evaluation runs are shown. This leaderboard serves ONLY as a commentary on the types of competencies expressed in the blueprints on <strong style={{ textDecoration: 'underline' }}>this deployment</strong> of Weval. It is not a comprehensive or representative sample of all models or skills.
            </span>
          </p>
          <p className="mt-2 flex items-start">
            {FlaskConical && <FlaskConical className="w-4 h-4 mr-2 text-primary flex-shrink-0" />}
            <span>
              The Hybrid Score is a weighted average combining semantic similarity (35% weight) and key point coverage (65% weight). This emphasizes rubric adherence while still valuing overall response quality. <span className="mt-1 font-mono text-primary/80 text-[0.7rem]">Formula: (0.35 * sim_score) + (0.65 * cov_score)</span>
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AggregateStatsDisplay; 