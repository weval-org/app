import nextDynamic from 'next/dynamic';
import AggregateStatsDisplay, { AggregateStatsData } from '@/app/components/AggregateStatsDisplay';
import ModelDriftIndicator, { PotentialDriftInfo } from '@/app/components/ModelDriftIndicator';
import HomePageBanner from "@/app/components/HomePageBanner";
import CivicEvalLogo from '@/components/icons/CivicEvalLogo';
import {
  getComparisonRunInfo,
  EnhancedComparisonConfigInfo,
  EnhancedRunInfo,
  getCachedHomepageHeadlineStats,
  getCachedHomepageDriftDetectionResult
} from '@/app/utils/homepageDataUtils';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/comparisonUtils';
import { toSafeTimestamp, fromSafeTimestamp } from '@/app/utils/timestampUtils';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import React from 'react';
import type { Metadata } from 'next';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:8888' : 'https://civiceval.org');

export const metadata: Metadata = {
  title: 'CivicEval - AI evaluations for civic good',
  description: 'Open-source, independent evaluations of large language models on human rights, law, and civic topics. Track AI model accuracy and consistency.',
  openGraph: {
    title: 'CivicEval - AI Model Evaluations for Civic Topics',
    description: 'Explore how accurately and consistently AI models understand human rights, law, and global civic issues. Public, open-source, and continuously updated.',
    url: appUrl,
    siteName: 'CivicEval',
    images: [
      {
        url: `${appUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: 'CivicEval - AI evaluations for the issues that matter to us.',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CivicEval - AI Model Evaluations for Civic Good',
    description: 'Track AI model accuracy on human rights, law, and civic topics. Open, independent, and continuously updated evaluations.',
    images: [`${appUrl}/opengraph-image`],
  },
};

export const revalidate = 600;

interface DisplayableRunInstanceInfo extends EnhancedRunInfo {
  configId: string;
  configTitle?: string;
}

interface BlueprintSummaryInfo extends EnhancedComparisonConfigInfo {
  latestInstanceTimestamp?: string | null;
  latestInstanceDisplayDate?: string;
  uniqueRunLabelCount?: number;
  latestRunActualLabel?: string | null;
  latestRunSafeTimestamp?: string | null;
  bestOverallModel?: { name: string; score: number; displayName: string; } | null;
}

const LatestEvaluationRunsSection = ({ latestRuns }: { latestRuns: DisplayableRunInstanceInfo[] }) => {
  const ExternalLink = nextDynamic(() => import('lucide-react').then(mod => mod.ExternalLink));
  const History = nextDynamic(() => import('lucide-react').then(mod => mod.History));
  const Layers = nextDynamic(() => import('lucide-react').then(mod => mod.Layers));
  const Hash = nextDynamic(() => import('lucide-react').then(mod => mod.Hash));
  const Trophy = nextDynamic(() => import('lucide-react').then(mod => mod.Trophy));

  const getHybridScoreColor = (score: number | null | undefined): string => {
    if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-slate-400';
    if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
    if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <section id="latest-runs" className="mb-12 md:mb-16">
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-slate-100 mb-6 md:mb-8 text-center">
        Latest Evaluation Runs
      </h2>
      {latestRuns.length === 0 ? (
        <div className="text-center py-10 bg-card/50 dark:bg-slate-800/40 rounded-lg shadow-md">
          {History && <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground dark:text-slate-500" />}
          <p className="text-lg text-muted-foreground dark:text-slate-400">No recent evaluation runs found.</p>
          <p className="text-sm text-muted-foreground dark:text-slate-500 mt-1">Run evaluations using the CLI, and they will appear here.</p>
        </div>
      ) : (
        <div className="bg-card/70 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg shadow-lg ring-1 ring-border dark:ring-slate-700/60 overflow-x-auto">
          <table className="min-w-full divide-y divide-border dark:divide-slate-700/50">
            <thead className="bg-muted/30 dark:bg-slate-700/30">
              <tr>
                <th scope="col" className="px-4 py-3.5 text-left text-sm font-semibold text-foreground dark:text-slate-200">
                  <div className="flex items-center">
                    {Layers && <Layers className="w-4 h-4 mr-1.5 opacity-80" />}
                    Blueprint
                  </div>
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-sm font-semibold text-foreground dark:text-slate-200">
                  <div className="flex items-center">
                    {Hash && <Hash className="w-4 h-4 mr-1.5 opacity-80" />}
                    Version
                  </div>
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-sm font-semibold text-foreground dark:text-slate-200">
                  Executed
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-sm font-semibold text-foreground dark:text-slate-200">
                  Hybrid Score
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-sm font-semibold text-foreground dark:text-slate-200">
                  <div className="flex items-center">
                    {Trophy && <Trophy className="w-4 h-4 mr-1.5 opacity-80" />}
                    Top Model
                  </div>
                </th>
                <th scope="col" className="px-4 py-3.5 text-center text-sm font-semibold text-foreground dark:text-slate-200">
                  Analysis
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-slate-700/40 bg-card dark:bg-slate-800/50">
              {latestRuns.map(run => {
                const runTimestampForUrl = run.timestamp ? toSafeTimestamp(run.timestamp) : '_';
                const analysisUrl = `/analysis/${run.configId}/${encodeURIComponent(run.runLabel)}/${runTimestampForUrl}`;
                const blueprintUrl = `/analysis/${run.configId}`;
                const runLabelUrl = `/analysis/${run.configId}/${encodeURIComponent(run.runLabel)}`;
                
                let displayDate = "Invalid Date";
                if (run.timestamp) {
                    const dateObj = new Date(fromSafeTimestamp(run.timestamp));
                    if (!isNaN(dateObj.getTime())) {
                        displayDate = dateObj.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                    }
                }

                let topModelDisplay: React.ReactNode = <span className={`font-normal ${getHybridScoreColor(null)}`}>N/A</span>;
                if (run.perModelHybridScores) {
                  let bestScore = -Infinity;
                  let bestModelId: string | null = null;
                  const scoresMap = run.perModelHybridScores instanceof Map
                    ? run.perModelHybridScores
                    : new Map(Object.entries(run.perModelHybridScores || {}) as [string, { average: number | null; stddev: number | null }][]);

                  scoresMap.forEach((scoreData, modelId) => {
                    if (modelId !== IDEAL_MODEL_ID && scoreData.average !== null && scoreData.average !== undefined && scoreData.average > bestScore) {
                      bestScore = scoreData.average;
                      bestModelId = modelId;
                    }
                  });

                  if (bestModelId) {
                    topModelDisplay = (
                      <>
                        <span className="block font-semibold text-xs truncate max-w-[150px]" title={getModelDisplayLabel(bestModelId, {hideProvider:true})}>
                          {getModelDisplayLabel(bestModelId, {hideProvider:true})}
                        </span>
                        <span className={`text-xs ${getHybridScoreColor(bestScore)}`}>
                          {(bestScore * 100).toFixed(1)}%
                        </span>
                      </>
                    );
                  }
                }

                return (
                  <tr key={`${run.configId}-${run.runLabel}-${run.timestamp}`} className="hover:bg-muted/50 dark:hover:bg-slate-700/50 transition-colors group">
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <Link href={analysisUrl} className="group/bptitle font-medium text-primary dark:text-sky-400 hover:underline group-hover:text-primary/80 dark:group-hover:text-sky-300" title={run.configTitle || run.configId}>
                        <span className="truncate block max-w-xs">
                          {run.configTitle || run.configId}
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <Link href={runLabelUrl} className="text-muted-foreground dark:text-slate-400 hover:underline group-hover:text-foreground dark:group-hover:text-slate-300" title={`View all instances for version: ${run.runLabel}`}>
                        <span className="truncate block max-w-xs">
                          {run.runLabel}
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground dark:text-slate-400">{displayDate}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {typeof run.hybridScoreStats?.average === 'number' ? (
                        <span className={`font-semibold ${getHybridScoreColor(run.hybridScoreStats.average)}`}>
                          {(run.hybridScoreStats.average * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className={`font-semibold ${getHybridScoreColor(null)}`}>N/A</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {topModelDisplay}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-center">
                      <Link href={analysisUrl} className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md text-primary dark:text-sky-400 hover:bg-primary/10 dark:hover:bg-sky-500/20 transition-colors border border-primary/30 dark:border-sky-500/40 hover:border-primary/50 dark:hover:border-sky-500/60"
                            title="View Full Analysis">
                        View
                        {ExternalLink && <ExternalLink className="w-3.5 h-3.5 ml-1.5 opacity-80 group-hover/link:opacity-100" />}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const BrowseAllBlueprintsSection = ({ blueprints }: { blueprints: BlueprintSummaryInfo[] }) => {
  const FolderOpen = nextDynamic(() => import('lucide-react').then(mod => mod.FolderOpen));
  const ChevronRight = nextDynamic(() => import('lucide-react').then(mod => mod.ChevronRight));
  const Tag = nextDynamic(() => import('lucide-react').then(mod => mod.Tag));
  const Info = nextDynamic(() => import('lucide-react').then(mod => mod.Info));
  const PackageSearch = nextDynamic(() => import('lucide-react').then(mod => mod.PackageSearch));
  const ExternalLink = nextDynamic(() => import('lucide-react').then(mod => mod.ExternalLink));
  const Trophy = nextDynamic(() => import('lucide-react').then(mod => mod.Trophy));

  const getHybridScoreColor = (score: number | null | undefined): string => {
    if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-slate-400';
    if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
    if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <section id="browse-blueprints" className="mb-12 md:mb-16">
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-slate-100 mb-6 md:mb-8 text-center">
        Browse Evaluation Blueprints
      </h2>
      {blueprints.length === 0 ? (
        <div className="text-center py-10 bg-card/50 dark:bg-slate-800/40 rounded-lg shadow-md">
          {PackageSearch && <PackageSearch className="w-12 h-12 mx-auto mb-4 text-muted-foreground dark:text-slate-500" />}
          <p className="text-lg text-muted-foreground dark:text-slate-400">No evaluation blueprints found.</p>
          <p className="text-sm text-muted-foreground dark:text-slate-500 mt-1">Contribute blueprints to the <a href="https://github.com/civiceval/configs/tree/main/blueprints" target="_blank" rel="noopener noreferrer" className="text-primary dark:text-sky-400 hover:underline">CivicEval Blueprints repository</a>.</p>
        </div>
      ) : (
        <div className="space-y-5 md:space-y-6">
          {blueprints.map(bp => {
            const blueprintOverallViewUrl = `/analysis/${bp.id || bp.configId}`;
            const latestRunInstanceUrl = bp.latestRunActualLabel && bp.latestRunSafeTimestamp ? 
              `/analysis/${bp.id || bp.configId}/${encodeURIComponent(bp.latestRunActualLabel)}/${bp.latestRunSafeTimestamp}` 
              : null;
            
            const allRunsLinkClassName = ["w-full sm:w-auto text-center px-4 py-2 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-slate-200 hover:bg-muted/70 dark:hover:bg-slate-700/50 transition-colors", !latestRunInstanceUrl ? "sm:ml-auto" : ""].join(" ").trim();

            return (
            <Card key={bp.id || bp.configId} className="bg-card/80 dark:bg-slate-800/70 backdrop-blur-lg group ring-1 ring-border dark:ring-slate-700/70 flex flex-col">
              <div className="p-4 md:p-5 flex-grow">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                    <div className="flex-grow min-w-0">
                        <div className="flex items-center mb-2">
                            {FolderOpen && <FolderOpen className="w-6 h-6 mr-2.5 text-primary dark:text-sky-400 flex-shrink-0" />}
                            <h3 className="font-semibold text-lg md:text-xl text-primary dark:text-sky-400 truncate group-hover:text-primary/80 dark:group-hover:text-sky-300" title={bp.title || bp.configTitle}>{bp.title || bp.configTitle}</h3>
                        </div>
                        {bp.description && (
                            <p className="text-xs text-muted-foreground dark:text-slate-400 mb-3 leading-relaxed line-clamp-2 pr-4 group-hover:text-slate-600 dark:group-hover:text-slate-300" title={bp.description}>
                                {Info && <Info className="w-3 h-3 mr-1 inline-block relative -top-px opacity-70"/>} 
                                {bp.description}
                            </p>
                        )}
                        {(bp.tags && bp.tags.length > 0) && (
                            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                {Tag && <Tag className="w-3.5 h-3.5 text-muted-foreground dark:text-slate-500 flex-shrink-0" />} 
                                {bp.tags.map((tag: string) => (
                                <span key={tag} className="px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary dark:bg-sky-500/20 dark:text-sky-300 rounded-full transition-colors group-hover:bg-primary/20 dark:group-hover:bg-sky-500/30">
                                    {tag}
                                </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex-shrink-0 sm:text-right sm:pl-4 space-y-3 md:space-y-3.5">
                        {typeof bp.overallAverageHybridScore === 'number' ? (
                            <div className="text-center sm:text-right">
                                <span className={`block text-2xl md:text-3xl font-bold ${getHybridScoreColor(bp.overallAverageHybridScore)}`}>
                                    {(bp.overallAverageHybridScore * 100).toFixed(1)}%
                                </span>
                                <p className="text-xs text-muted-foreground dark:text-slate-400 -mt-0.5">Avg. Hybrid Score</p>
                            </div>
                        ) : (
                            <div className="text-center sm:text-right">
                                <span className={`block text-2xl md:text-3xl font-bold ${getHybridScoreColor(null)}`}>N/A</span>
                                <p className="text-xs text-muted-foreground dark:text-slate-400 -mt-0.5">Avg. Hybrid Score</p>
                            </div>
                        )}

                        {bp.bestOverallModel && (
                            <div className="pt-2 mt-2 border-t border-border/30 dark:border-slate-700/30 text-center sm:text-right">
                                <div className="flex items-center justify-center sm:justify-end text-xs text-muted-foreground dark:text-slate-500 mb-0.5">
                                  {Trophy && <Trophy className="w-3.5 h-3.5 mr-1.5 text-amber-500 dark:text-amber-400 flex-shrink-0" />} 
                                  <span className="font-medium">Top Performing Model:</span>
                                </div>
                                <span className="block font-semibold text-sm group-hover:text-foreground dark:group-hover:text-slate-200 truncate" title={bp.bestOverallModel.displayName}>
                                    {bp.bestOverallModel.displayName}
                                </span>
                                <span className={`text-xs font-medium ${getHybridScoreColor(bp.bestOverallModel.score)}`}>
                                    Avg. {(bp.bestOverallModel.score * 100).toFixed(1)}%
                                </span>
                            </div>
                        )}
                        
                        <div className={`pt-2 mt-2 ${bp.bestOverallModel ? 'border-t border-border/30 dark:border-slate-700/30' : ''} text-center sm:text-right`}>
                            <p className="text-xs text-muted-foreground dark:text-slate-500">
                                Latest: <span className="font-medium text-foreground dark:text-slate-300">{bp.latestInstanceDisplayDate}</span>
                            </p>
                            <p className="text-xs text-muted-foreground dark:text-slate-500 mt-0.5">
                                Unique Versions: <span className="font-medium text-foreground dark:text-slate-300">{bp.uniqueRunLabelCount}</span>
                            </p>
                        </div>
                    </div>
                </div>
              </div>
              <div className="p-3 md:p-4 border-t border-border dark:border-slate-700/50 bg-muted/20 dark:bg-slate-800/30 rounded-b-lg flex flex-col sm:flex-row justify-between items-center gap-3">
                {latestRunInstanceUrl && (
                  <Link 
                    href={latestRunInstanceUrl} 
                    className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 border border-primary/70 dark:border-sky-500/70 text-sm font-medium rounded-md text-primary dark:text-sky-300 bg-primary/10 hover:bg-primary/20 dark:bg-sky-500/20 dark:hover:bg-sky-500/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-sky-500 dark:ring-offset-slate-900 transition-all shadow-sm hover:shadow-md"
                  >
                    {ExternalLink && <ExternalLink className="w-4 h-4 mr-2 opacity-90" />}
                    View Latest Run Analysis
                  </Link>
                )}
                <Link 
                  href={blueprintOverallViewUrl} 
                  className={allRunsLinkClassName}
                >
                  View All Runs for this Blueprint 
                  {ChevronRight && <ChevronRight className="w-3.5 h-3.5 ml-1 inline-block relative -top-px opacity-80"/>}
                </Link>
              </div>
            </Card>
            )}
          )}
        </div>
      )}
    </section>
  );
};

function getLatestDateOfData(configs: EnhancedComparisonConfigInfo[]): string {
  let maxDate: Date | null = null;

  for (const config of configs) {
    for (const run of config.runs) {
      if (run.timestamp) {
        const currentDate = new Date(fromSafeTimestamp(run.timestamp));
        if (!isNaN(currentDate.getTime())) {
          if (!maxDate || currentDate > maxDate) {
            maxDate = currentDate;
          }
        }
      }
    }
  }

  return maxDate ? maxDate.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' }) : "N/A";
}

export default async function HomePage() {
  const [initialConfigsRaw, headlineStats, driftDetectionResult]: [
    EnhancedComparisonConfigInfo[], 
    AggregateStatsData | null, 
    PotentialDriftInfo | null
  ] = await Promise.all([
    getComparisonRunInfo(),
    getCachedHomepageHeadlineStats(),
    getCachedHomepageDriftDetectionResult()
  ]);

  const isDevelopment = process.env.NODE_ENV === 'development';
  const initialConfigs = initialConfigsRaw.filter(config => {
    if (isDevelopment) {
      return true;
    }
    return !(config.tags && config.tags.includes('test'));
  });

  const allRunInstances: DisplayableRunInstanceInfo[] = [];
  initialConfigs.forEach(config => {
      config.runs.forEach(run => {
          allRunInstances.push({
              ...run,
              configId: config.id || config.configId!,
              configTitle: config.title || config.configTitle
          });
      });
  });
  allRunInstances.sort((a, b) => {
    const dateA = new Date(fromSafeTimestamp(a.timestamp));
    const dateB = new Date(fromSafeTimestamp(b.timestamp));
    if (isNaN(dateA.getTime())) return 1;
    if (isNaN(dateB.getTime())) return -1;
    return dateB.getTime() - dateA.getTime();
  });
  const top20LatestRuns = allRunInstances.slice(0, 20);

  const blueprintSummaries: BlueprintSummaryInfo[] = initialConfigs.map(config => {
    let latestInstanceTimestampSortKey: string | null = null;
    let latestInstanceDisplayDate = "N/A";
    let latestRunActualLabel: string | null = null;
    let latestRunSafeTimestampForUrl: string | null = null;

    if (config.runs && config.runs.length > 0) {
      let latestRun: EnhancedRunInfo | null = null;
      let latestDateObj: Date | null = null;

      for (const run of config.runs) {
        if (run.timestamp && run.runLabel) {
          const currentDateObj = new Date(fromSafeTimestamp(run.timestamp)); 
          if (!isNaN(currentDateObj.getTime())) {
            if (!latestDateObj || currentDateObj.getTime() > latestDateObj.getTime()) {
              latestDateObj = currentDateObj;
              latestRun = run;
            }
          }
        }
      }

      if (latestRun && latestDateObj) {
        latestInstanceTimestampSortKey = latestDateObj.toISOString();
        latestInstanceDisplayDate = latestDateObj.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        latestRunActualLabel = latestRun.runLabel;
        latestRunSafeTimestampForUrl = latestRun.timestamp ? toSafeTimestamp(latestRun.timestamp) : null; 
      }
    }

    const uniqueRunLabels = new Set(config.runs.map(r => r.runLabel).filter(Boolean));
    
    let bestOverallModelData: { name: string; score: number; displayName: string } | null = null;
    if (config.runs && config.runs.length > 0) {
      const allModelScoresAcrossRuns = new Map<string, { scoreSum: number; count: number }>();

      config.runs.forEach(run => {
        if (run.perModelHybridScores) {
          const scoresMap = run.perModelHybridScores instanceof Map
            ? run.perModelHybridScores
            : new Map(Object.entries(run.perModelHybridScores || {}) as [string, { average: number | null; stddev: number | null }][]);

          scoresMap.forEach((scoreData, modelId) => {
            if (modelId !== IDEAL_MODEL_ID && scoreData.average !== null && scoreData.average !== undefined) {
              const current = allModelScoresAcrossRuns.get(modelId) || { scoreSum: 0, count: 0 };
              current.scoreSum += scoreData.average;
              current.count += 1;
              allModelScoresAcrossRuns.set(modelId, current);
            }
          });
        }
      });

      let bestOverallScore = -Infinity;
      let bestModelId: string | null = null;

      allModelScoresAcrossRuns.forEach((data, modelId) => {
        const avgScore = data.scoreSum / data.count;
        if (avgScore > bestOverallScore) {
          bestOverallScore = avgScore;
          bestModelId = modelId;
        }
      });

      if (bestModelId) {
        bestOverallModelData = {
          name: bestModelId,
          score: bestOverallScore,
          displayName: getModelDisplayLabel(bestModelId, {hideProvider:true})
        };
      }
    }

    return {
      ...config,
      latestInstanceTimestamp: latestInstanceTimestampSortKey,
      latestInstanceDisplayDate,
      uniqueRunLabelCount: uniqueRunLabels.size,
      latestRunActualLabel,
      latestRunSafeTimestamp: latestRunSafeTimestampForUrl,
      bestOverallModel: bestOverallModelData, 
    };
  });

  blueprintSummaries.sort((a, b) => {
    const tsA = a.latestInstanceTimestamp; 
    const tsB = b.latestInstanceTimestamp;

    if (!tsA) return 1;
    if (!tsB) return -1;
    return new Date(tsB).getTime() - new Date(tsA).getTime();
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 sm:py-3 md:pt-4 space-y-8 md:space-y-10">
        {/* <DonationBanner />  */}
        
        <header className="text-center pt-4">
          <CivicEvalLogo 
            className="w-12 h-12 md:w-14 md:h-14 mx-auto mb-3 text-primary dark:text-sky-400" 
            aria-label="CivicEval Logo"
          /> 
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground dark:text-slate-50 mb-3">
            CivicEval
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground dark:text-slate-300 mb-4 max-w-3xl mx-auto">
            AI evaluations for the issues that matter to us.
          </p>
        </header>
      </div>

      <HomePageBanner />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 sm:pb-2 md:pb-4 pt-8 md:pt-10 space-y-8 md:space-y-10">
        {initialConfigs.length > 0 && headlineStats && (
          <section 
            aria-labelledby="platform-summary-heading"
            className="bg-card/50 dark:bg-slate-800/50 backdrop-blur-md p-6 rounded-2xl shadow-lg ring-1 ring-border/60 dark:ring-slate-700/60"
          >
            <h2 id="platform-summary-heading" className="text-2xl sm:text-2xl font-semibold tracking-tight text-foreground dark:text-slate-100 mb-6 md:mb-8 text-center">
              Latest Platform Stats as of {getLatestDateOfData(initialConfigs)}
            </h2>
            <div className="space-y-8 md:space-y-10">
                <AggregateStatsDisplay stats={headlineStats} />
                {driftDetectionResult && <ModelDriftIndicator driftInfo={driftDetectionResult} />}
            </div>
          </section>
        )}

        {initialConfigs.length > 0 ? (
          <>
            <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
            <BrowseAllBlueprintsSection blueprints={blueprintSummaries} />
            <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
            <LatestEvaluationRunsSection latestRuns={top20LatestRuns} />
          </>
        ) : (
         <div className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md p-8 sm:p-12 rounded-xl shadow-xl ring-1 ring-border dark:ring-slate-700/80 text-center flex flex-col items-center mt-10">
            {React.createElement(nextDynamic(() => import('lucide-react').then(mod => mod.LayoutGrid)) as any, {className:"w-16 h-16 mx-auto mb-6 text-primary dark:text-sky-400 opacity-80"})}
            <h2 className="text-xl sm:text-2xl font-semibold text-card-foreground dark:text-slate-100 mb-3">
              No Evaluation Blueprints Found
            </h2>
            <p className="text-muted-foreground dark:text-slate-400 text-sm sm:text-base max-w-lg mx-auto mb-6">
              It looks like you haven't run any evaluation blueprints yet. Use the CLI to generate results, and they will appear here.
              Explore example blueprints or contribute your own at the <a href="https://github.com/civiceval/configs/tree/main/blueprints" target="_blank" rel="noopener noreferrer" className="text-primary dark:text-sky-400 hover:underline">CivicEval Blueprints repository</a>.
            </p>
            <div className="mt-4 text-xs text-muted-foreground/80 dark:text-slate-500/80 bg-muted dark:bg-slate-700/50 p-3 rounded-md w-full max-w-md">
                <span className="font-semibold">Example command:</span>
                <code className="block text-xs bg-transparent dark:bg-transparent p-1 rounded mt-1 select-all">
                  pnpm cli run_config --config path/to/your_blueprint.json --run-label "my-first-run"
                </code>
            </div>
          </div>
        )}
        
      </div>

      {/* Footer with full-width background */}
      <div className="w-full bg-slate-100 dark:bg-slate-800 py-8 md:py-12 mt-12 md:mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <footer className="text-center">
            <div className="text-xs md:text-left max-w-3xl mx-auto mb-8">
              <h4 className="font-semibold mb-3 text-sm text-foreground dark:text-slate-300">References</h4>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground dark:text-slate-400">
                <li id="footnote-1">
                  Stanford CRFM. HELM Leaderboards - A reproducible, transparent framework for evaluating foundation models. 2024. <a href="https://crfm.stanford.edu/helm/?utm_source=chatgpt.com" target="_blank" rel="noopener noreferrer" className="text-primary dark:text-sky-400 hover:underline">crfm.stanford.edu</a>
                </li>
                <li id="footnote-2">
                  Microsoft. AI at Work Is Here. Now Comes the Hard Part (Work Trend Index, 2024) - 75% of global knowledge-workers now use generative-AI. <a href="https://www.microsoft.com/en-us/worklab/work-trend-index/ai-at-work-is-here-now-comes-the-hard-part?utm_source=chatgpt.com" target="_blank" rel="noopener noreferrer" className="text-primary dark:text-sky-400 hover:underline">Microsoft</a>
                </li>
                <li id="footnote-3">
                  Kim et al. "Evaluating large language-model workflows in clinical decision support." <em>NPJ Digital Medicine</em> (May 2025). <a href="https://www.nature.com/articles/s41746-025-01684-1?utm_source=chatgpt.com" target="_blank" rel="noopener noreferrer" className="text-primary dark:text-sky-400 hover:underline">Nature</a>
                </li>
                <li id="footnote-4">
                  Reuters. "New York lawyers sanctioned for using fake ChatGPT cases in legal brief." 22 Jun 2023. <a href="https://www.reuters.com/legal/new-york-lawyers-sanctioned-using-fake-chatgpt-cases-legal-brief-2023-06-22/?utm_source=chatgpt.com" target="_blank" rel="noopener noreferrer" className="text-primary dark:text-sky-400 hover:underline">Reuters</a>
                </li>
                <li id="footnote-5">
                  Wang et al. "Cognitive Debiasing Large Language Models for Decision‑Making." arXiv pre‑print, Apr 2025. <a href="https://arxiv.org/html/2504.04141v3?utm_source=chatgpt.com" target="_blank" rel="noopener noreferrer" className="text-primary dark:text-sky-400 hover:underline">arXiv</a>
                </li>
              </ol>
            </div>
            <p className="text-sm text-muted-foreground">
            </p>
            <div className="mt-4 space-x-4">
              <a href="https://github.com/civiceval/app" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors">
                View App on GitHub
              </a>
              <span className="text-sm text-muted-foreground">|</span>
              <a href="https://github.com/civiceval/configs" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors">
                View Eval Blueprints on GitHub
              </a>
            </div>
          </footer>
        </div>
      </div>

    </div>
  );
}
