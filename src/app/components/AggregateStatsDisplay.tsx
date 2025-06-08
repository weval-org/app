'use client';

import dynamic from 'next/dynamic';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const TrendingUp = dynamic(() => import('lucide-react').then(mod => mod.TrendingUp));
const TrendingDown = dynamic(() => import('lucide-react').then(mod => mod.TrendingDown));
const CheckCircle2 = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle2));
const AlertCircle = dynamic(() => import('lucide-react').then(mod => mod.AlertCircle));
const Award = dynamic(() => import('lucide-react').then(mod => mod.Award));
const BarChartHorizontalBig = dynamic(() => import('lucide-react').then(mod => mod.BarChartHorizontalBig));
const InfoIcon = dynamic(() => import('lucide-react').then(mod => mod.Info));

export interface HeadlineStatInfo {
  configId: string;
  configTitle: string;
  value: number;
  description?: string;
}

export interface TopModelStatInfo {
  modelId: string;
  overallAverageScore: number;
  runsParticipatedIn: number;
}

export interface AggregateStatsData {
  bestPerformingConfig: HeadlineStatInfo | null;
  worstPerformingConfig: HeadlineStatInfo | null;
  mostConsistentConfig: HeadlineStatInfo | null;
  leastConsistentConfig: HeadlineStatInfo | null;
  rankedOverallModels: TopModelStatInfo[] | null;
}

type StatStatusType = 'best' | 'worst' | 'mostConsistent' | 'leastConsistent' | 'neutral';

interface AggregateStatsDisplayProps {
  stats: AggregateStatsData | null;
}

const StatCard: React.FC<{
  title: string;
  data: HeadlineStatInfo | null;
  unit?: string;
  icon?: React.ElementType;
  statusType?: StatStatusType;
}> = ({ title, data, unit, icon: Icon, statusType = 'neutral' }) => {
  let iconColorClass = 'text-muted-foreground/70';
  switch (statusType) {
    case 'best':
      iconColorClass = 'text-emerald-500 dark:text-emerald-400';
      break;
    case 'worst':
      iconColorClass = 'text-red-500 dark:text-red-400';
      break;
    case 'mostConsistent':
      iconColorClass = 'text-sky-500 dark:text-sky-400';
      break;
    case 'leastConsistent':
      iconColorClass = 'text-amber-500 dark:text-amber-400';
      break;
  }

  const cardContent = (
    <>
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
    </>
  );

  return (
    <div className="bg-card p-4 rounded-lg border border-border/70 dark:border-slate-700/50 flex flex-col justify-between min-h-[110px] hover:shadow-md transition-shadow">
      {data && data.configId ? (
        <Link href={`/analysis/${data.configId}`} className="flex flex-col justify-between flex-grow">
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
          <BarChartHorizontalBig className="w-5 h-5 flex-shrink-0 text-primary dark:text-sky-400" />
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
        <BarChartHorizontalBig className="w-5 h-5 flex-shrink-0 text-primary dark:text-sky-400" />
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
              <span className="font-semibold text-primary dark:text-sky-300">{(model.overallAverageScore * 100).toFixed(1)}%</span>
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
            className="text-muted-foreground hover:text-primary dark:hover:text-sky-400 h-auto p-1 text-xs"
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
    <div className="my-8 pt-2">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="Best Performing Eval"
          data={stats.bestPerformingConfig ? { ...stats.bestPerformingConfig, description: "Avg. Hybrid Score" } : null} 
          icon={TrendingUp}
          statusType="best"
        />
        <StatCard 
          title="Worst Performing Eval"
          data={stats.worstPerformingConfig ? { ...stats.worstPerformingConfig, description: "Avg. Hybrid Score" } : null} 
          icon={TrendingDown}
          statusType="worst"
        />
        <StatCard 
          title="Most Consistent Eval" 
          data={stats.mostConsistentConfig ? { ...stats.mostConsistentConfig, description: "Score StdDev (Lower is better)" } : null} 
          icon={CheckCircle2}
          statusType="mostConsistent"
        />
        <StatCard 
          title="Least Consistent Eval" 
          data={stats.leastConsistentConfig ? { ...stats.leastConsistentConfig, description: "Score StdDev (Higher is more variance)" } : null} 
          icon={AlertCircle}
          statusType="leastConsistent"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-4 p-3 mb-3 text-xs text-muted-foreground bg-card border border-border/70 dark:border-slate-700/50 rounded-lg flex items-start">
          {InfoIcon && <InfoIcon className="w-4 h-4 mr-2 mt-0.5 text-sky-500 flex-shrink-0" />}
          <span>
            <strong>Note on Leaderboard:</strong> This leaderboard reflects models evaluated based on available resources. Only models that have participated in at least {MIN_RUNS_FOR_LEADERBOARD} evaluation runs are shown. Due to API costs, we cannot currently include all models or run evaluations at the scale we aspire to. 
            Your support can help expand our coverage. <Link href="https://github.com/sponsors/civiceval" target="_blank" rel="noopener noreferrer" className="underline text-primary dark:text-sky-400 hover:text-primary/80 dark:hover:text-sky-300 font-medium">Contribute here</Link>.
          </span>
        </div>
        <OverallModelLeaderboard
          models={filteredRankedModels || null}
          title="Overall Model Leaderboard (Avg. Hybrid Score)"
        />
      </div>
    </div>
  );
};

export default AggregateStatsDisplay; 