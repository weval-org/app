'use client'

import { useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { AllCoverageScores, EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import AnalysisPageHeader from '../../components/AnalysisPageHeader';
import CoverageHeatmapCanvas from '../../components/CoverageHeatmapCanvas';
import { ApiRunsResponse } from '../page';
import DriftComparisonView from './DriftComparisonView';
import ClientDateTime from '@/app/components/ClientDateTime';

export interface RunInstanceInfo extends EnhancedRunInfo {
  configId: string;
  safeTimestamp: string;
  displayDate: string;
  promptIds?: string[];
}

const ChevronRightIcon = dynamic(() => import('lucide-react').then(mod => mod.ChevronRight));
const HistoryIcon = dynamic(() => import('lucide-react').then(mod => mod.History));
const ListFilterIcon = dynamic(() => import('lucide-react').then(mod => mod.ListFilter));

// Helper function for score color
const getHybridScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-slate-400';
  if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

export default function RunLabelInstancesClientPage({ configId, runLabel, data }: { configId: string, runLabel: string, data: ApiRunsResponse }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { runs: allRunsForThisConfig, configTitle, configDescription, configTags } = data;

  const minScoreTimestamp = searchParams.get('min_ts');
  const maxScoreTimestamp = searchParams.get('max_ts');
  const modelId = searchParams.get('modelId');

  const runInstances = useMemo(() => {
    if (!allRunsForThisConfig) { 
      return [];
    }
  
    const instances = allRunsForThisConfig
      .map((run: EnhancedRunInfo) => {
        const isoTimestamp = fromSafeTimestamp(run.timestamp);
        const dateObj = new Date(isoTimestamp);
        const displayDate = !isNaN(dateObj.getTime()) 
            ? dateObj.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : "Invalid Date";
        
        const promptIds = run.allCoverageScores ? Object.keys(run.allCoverageScores) : [];
        
        return {
          ...run,
          configId: configId,
          timestamp: isoTimestamp,
          safeTimestamp: run.timestamp,
          displayDate,
          promptIds: promptIds,
        };
      });
    
    instances.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return instances;
  }, [allRunsForThisConfig, configId]);

  const comparisonRuns = useMemo(() => {
    if (minScoreTimestamp && maxScoreTimestamp) {
      const minScoreRun = runInstances.find(run => run.safeTimestamp === minScoreTimestamp);
      const maxScoreRun = runInstances.find(run => run.safeTimestamp === maxScoreTimestamp);
      if (minScoreRun && maxScoreRun) {
        return { minScoreRun, maxScoreRun };
      }
    }
    return null;
  }, [runInstances, minScoreTimestamp, maxScoreTimestamp]);

  const pageTitle = configTitle ? 
    `Instances for Run Label: ${runLabel} (Blueprint: ${configTitle})` : 
    `Instances for Run Label: ${runLabel} (Blueprint ID: ${configId})`;

  const breadcrumbItems = useMemo(() => [
    { label: 'Home', href: '/' },
    { label: configTitle || configId, href: `/analysis/${configId}` },
    { label: `Run: ${runLabel}` }
  ], [configId, runLabel, configTitle]);

  const headerActions = useMemo(() => (
    <Link href={`/analysis/${configId}`} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-primary text-primary hover:bg-primary/10 dark:hover:bg-sky-500/20 transition-colors border border-primary/30 dark:border-sky-500/40 hover:border-primary/50 dark:hover:border-sky-500/60">
      <ChevronRightIcon className="w-4 h-4 mr-1.5 transform rotate-180" />
      Back to All Runs for Blueprint: {configTitle || configId}
    </Link>
  ), [configId, configTitle]);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
        <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
        <div className="mx-auto">
          <AnalysisPageHeader
            breadcrumbs={breadcrumbItems}
            pageTitle={pageTitle}
            contextualInfo={{
              configTitle: configTitle || '',
              runLabel: runLabel,
              timestamp: '',
              description: configDescription || '',
              tags: configTags || []
            }}
            actions={headerActions}
            isSticky={false}
          />

          <main className="mt-6 md:mt-8">
              {comparisonRuns ? (
                <DriftComparisonView 
                  minScoreRun={comparisonRuns.minScoreRun} 
                  maxScoreRun={comparisonRuns.maxScoreRun}
                  modelId={modelId}
                />
              ) : (
                <>
                  {runInstances.length === 0 && (
                      <div className="text-center py-12">
                          <HistoryIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground dark:text-slate-500" />
                          <p className="text-lg text-muted-foreground dark:text-slate-400">
                              No specific instances found for Run Label: <strong className="text-foreground dark:text-slate-200">{runLabel}</strong>
                          </p>
                          <p className="text-sm text-muted-foreground dark:text-slate-500 mt-2">
                              This might mean the selected run label (hash) does not exist or has no associated execution records for this blueprint.
                          </p>
                      </div>
                  )}

                  {runInstances.length > 0 && (
                      <div className="space-y-4">
                          <p className="text-sm text-muted-foreground dark:text-slate-400">
                              Showing all recorded executions for Run Label <strong className="text-foreground dark:text-slate-300">{runLabel}</strong>. Each execution represents the same blueprint configuration run at a different time.
                          </p>
                          {runInstances.map((instance) => (
                              <Card key={instance.safeTimestamp} className="bg-card/80 dark:bg-slate-800/60 backdrop-blur-sm hover:shadow-lg transition-shadow duration-200 ring-1 ring-border dark:ring-slate-700/70 overflow-hidden">
                                  <Link href={`/analysis/${instance.configId}/${instance.runLabel}/${instance.safeTimestamp}`} className="block hover:bg-muted/30 dark:hover:bg-slate-700/40 transition-colors p-4">
                                      <div className="flex justify-between items-start">
                                          <div>
                                              <p className="text-base font-medium text-primary">
                                                  Executed: <ClientDateTime timestamp={instance.timestamp} />
                                              </p>
                                              <p className="text-xs text-muted-foreground dark:text-slate-500 mt-1">
                                                Filename: {instance.fileName}
                                              </p>
                                          </div>
                                           <div className="flex items-center space-x-6 text-right">
                                               {instance.allCoverageScores && instance.models && instance.promptIds && instance.models.length > 0 && instance.promptIds.length > 0 && (
                                                  <div className="flex-shrink-0 w-24 h-16 mr-4">
                                                      <CoverageHeatmapCanvas 
                                                          allCoverageScores={instance.allCoverageScores}
                                                          models={instance.models}
                                                          promptIds={instance.promptIds}
                                                          width={96}
                                                          height={64}
                                                          className="rounded-sm border border-border/50 dark:border-slate-700"
                                                      />
                                                  </div>
                                                )}
                                              {instance.hybridScoreStats?.average !== undefined && instance.hybridScoreStats?.average !== null && (
                                                <div className="flex flex-col items-end w-28">
                                                  <p className="text-xs text-muted-foreground dark:text-slate-400">Avg. Hybrid Score</p>
                                                  <p className={`text-xl font-semibold ${getHybridScoreColor(instance.hybridScoreStats.average)}`}>
                                                    {(instance.hybridScoreStats.average * 100).toFixed(1)}%
                                                  </p>
                                                </div>
                                              )}
                                               {instance.numModels !== undefined && (
                                                <div className="flex flex-col items-end">
                                                  <p className="text-xs text-muted-foreground dark:text-slate-400">Model Variants</p>
                                                  <p className="text-xl font-semibold text-foreground dark:text-slate-200">
                                                    {instance.numModels}
                                                  </p>
                                                </div>
                                              )}
                                              {instance.numPrompts !== undefined && (
                                                <div className="flex flex-col items-end">
                                                  <p className="text-xs text-muted-foreground dark:text-slate-400">Test Cases</p>
                                                  <p className="text-xl font-semibold text-foreground dark:text-slate-200">{instance.numPrompts}</p>
                                                </div>
                                              )}
                                              {ChevronRightIcon && <ChevronRightIcon className="w-5 h-5 text-muted-foreground dark:text-slate-400 self-center ml-2" />}
                                          </div>
                                      </div>
                                  </Link>
                              </Card>
                          ))}
                      </div>
                  )}
                </>
              )}
          </main>
        </div>
    </div>
  );
} 