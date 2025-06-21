'use client';

import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import ClientDateTime from '../ClientDateTime';

export interface DisplayableRunInstanceInfo extends EnhancedRunInfo {
  configId: string;
  configTitle?: string;
}

const getHybridScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-muted-foreground';
  if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

// Define dynamic components once, outside the render function
const ExternalLink = nextDynamic(() => import('lucide-react').then(mod => mod.ExternalLink));
const History = nextDynamic(() => import('lucide-react').then(mod => mod.History));
const Layers = nextDynamic(() => import('lucide-react').then(mod => mod.Layers));
const Hash = nextDynamic(() => import('lucide-react').then(mod => mod.Hash));
const Trophy = nextDynamic(() => import('lucide-react').then(mod => mod.Trophy));

const LatestEvaluationRunsSection = ({ latestRuns }: { latestRuns: DisplayableRunInstanceInfo[] }) => {
  return (
    <section id="latest-runs" className="mb-12 md:mb-16">
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-foreground mb-6 md:mb-8 text-center">
        Latest Evaluation Runs
      </h2>
      {latestRuns.length === 0 ? (
        <div className="text-center py-10 bg-card/50 dark:bg-card/40 rounded-lg shadow-md">
          {History && <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground dark:text-muted-foreground" />}
          <p className="text-lg text-muted-foreground dark:text-muted-foreground">No recent evaluation runs found.</p>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">Run evaluations using the CLI, and they will appear here.</p>
        </div>
      ) : (
        <div className="bg-card/70 dark:bg-card/60 backdrop-blur-sm rounded-lg shadow-lg ring-1 ring-border dark:ring-border/60 overflow-x-auto">
          <table className="min-w-full divide-y divide-border dark:divide-border/50">
            <thead className="bg-muted/30 dark:bg-muted/30">
              <tr>
                <th scope="col" className="px-4 py-3.5 text-left text-sm font-semibold text-foreground dark:text-foreground">
                  <div className="flex items-center">
                    {Layers && <Layers className="w-4 h-4 mr-1.5 opacity-80" />}
                    Blueprint
                  </div>
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-sm font-semibold text-foreground dark:text-foreground">
                  <div className="flex items-center">
                    {Hash && <Hash className="w-4 h-4 mr-1.5 opacity-80" />}
                    Version
                  </div>
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-sm font-semibold text-foreground dark:text-foreground">
                  Executed
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-sm font-semibold text-foreground dark:text-foreground">
                  Hybrid Score
                </th>
                <th scope="col" className="px-4 py-3.5 text-left text-sm font-semibold text-foreground dark:text-foreground">
                  <div className="flex items-center">
                    {Trophy && <Trophy className="w-4 h-4 mr-1.5 opacity-80" />}
                    Top Model
                  </div>
                </th>
                <th scope="col" className="px-4 py-3.5 text-center text-sm font-semibold text-foreground dark:text-foreground">
                  Analysis
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-border/40 bg-card dark:bg-card/50">
              {latestRuns.map(run => {
                const runTimestampForUrl = run.timestamp || '_';
                const analysisUrl = `/analysis/${run.configId}/${encodeURIComponent(run.runLabel)}/${runTimestampForUrl}`;
                const blueprintUrl = `/analysis/${run.configId}`;
                const runLabelUrl = `/analysis/${run.configId}/${encodeURIComponent(run.runLabel)}`;
                
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
                  <tr key={`${run.configId}-${run.runLabel}-${run.timestamp}`} className="hover:bg-muted/50 dark:hover:bg-muted/50 transition-colors group">
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center mb-1.5">
                          {run.configTitle && (
                            <Link href={analysisUrl} className="group/bptitle font-medium text-primary hover:underline group-hover:text-primary/80 dark:group-hover:text-primary/80" title={run.configTitle || run.configId}>
                              <span className="truncate">{run.configTitle || run.configId}</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <Link href={runLabelUrl} className="text-muted-foreground dark:text-muted-foreground hover:underline group-hover:text-foreground dark:group-hover:text-foreground" title={`View all instances for version: ${run.runLabel}`}>
                        <span className="truncate block max-w-xs">
                          {run.runLabel}
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground dark:text-muted-foreground">
                      <ClientDateTime timestamp={run.timestamp} />
                    </td>
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
                      <div className="mt-4 sm:mt-0 flex-shrink-0 flex sm:flex-col items-center sm:items-end justify-between gap-2">
                        <Link
                          href={analysisUrl}
                          className="w-full sm:w-auto text-center px-3 py-1.5 text-xs font-medium rounded-md text-primary hover:bg-primary/10 transition-colors border border-primary/30 hover:border-primary/50"
                        >
                          View Analysis
                        </Link>
                      </div>
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

export default LatestEvaluationRunsSection; 