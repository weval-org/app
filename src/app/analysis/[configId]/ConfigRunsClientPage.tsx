'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import AnalysisPageHeader from '../components/AnalysisPageHeader';
import { ApiRunsResponse } from './page';
import ClientDateTime from '@/app/components/ClientDateTime';

const ChevronRightIcon = dynamic(() => import('lucide-react').then(mod => mod.ChevronRight));
const HistoryIcon = dynamic(() => import('lucide-react').then(mod => mod.History));
const LayersIcon = dynamic(() => import('lucide-react').then(mod => mod.Layers));
const Loader2Icon = dynamic(() => import('lucide-react').then(mod => mod.Loader2));
const ExternalLinkIcon = dynamic(() => import('lucide-react').then(mod => mod.ExternalLink));

interface UniqueVersionInfo {
  configId: string;
  versionId: string;
  instanceCount: number;
  latestTimestamp: string | null;
  displayLatestDate: string;
  latestInstanceSafeTimestamp: string | null;
  averageHybridScore?: number | null;
}

// Helper function for score color
const getHybridScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-slate-400';
  if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

export default function ConfigRunsClientPage({ configId, data }: { configId: string, data: ApiRunsResponse }) {
  const router = useRouter();
  const { runs: allRunsForThisConfig, configTitle, configDescription, configTags } = data;

  const uniqueRuns = useMemo(() => {
    if (!allRunsForThisConfig || allRunsForThisConfig.length === 0) {
      return [];
    }

    const runsByLabel = new Map<string, { 
      timestamps: string[], 
      safeTimestamps: string[],
      scores: (number | null)[]
    }>();

    allRunsForThisConfig.forEach(run => {
      if (!run.runLabel || !run.timestamp) return;
      const existing = runsByLabel.get(run.runLabel) || { timestamps: [], safeTimestamps: [], scores: [] };
      existing.timestamps.push(fromSafeTimestamp(run.timestamp));
      existing.safeTimestamps.push(run.timestamp);
      existing.scores.push(run.hybridScoreStats?.average ?? null);
      runsByLabel.set(run.runLabel, existing);
    });

    const processedRuns: UniqueVersionInfo[] = Array.from(runsByLabel.entries()).map(([versionId, data]) => {
      const instanceCount = data.timestamps.length;
      const parsedAndValidDateObjects = data.timestamps
        .map(tsString => new Date(tsString))
        .filter(dateObj => !isNaN(dateObj.getTime()));
      parsedAndValidDateObjects.sort((a, b) => b.getTime() - a.getTime());
      const latestValidDate = parsedAndValidDateObjects.length > 0 ? parsedAndValidDateObjects[0] : null;
      let latestSafeTs: string | null = null;
      if (latestValidDate) {
        const latestValidDateISO = latestValidDate.toISOString();
        const originalIndex = data.timestamps.findIndex(ts => ts === latestValidDateISO);
        if (originalIndex !== -1) {
          latestSafeTs = data.safeTimestamps[originalIndex];
        }
      }
      const latestTimestampForStorage = latestValidDate ? latestValidDate.toISOString() : null;
      let displayLatestDate = "N/A";
      if (latestValidDate) {
        displayLatestDate = latestValidDate.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
      const validScores = data.scores.filter(s => typeof s === 'number') as number[];
      let avgScore: number | null = null;
      if (validScores.length > 0) {
        avgScore = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
      }
      return {
        configId,
        versionId,
        instanceCount: instanceCount,
        latestTimestamp: latestTimestampForStorage, 
        displayLatestDate,
        latestInstanceSafeTimestamp: latestSafeTs,
        averageHybridScore: avgScore,
      };
    });
    
    processedRuns.sort((a, b) => {
      if (!a.latestTimestamp) return 1;
      if (!b.latestTimestamp) return -1;
      return new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime();
    });

    return processedRuns;
  }, [allRunsForThisConfig, configId]);

  const pageTitle = configTitle ? `All Unique Versions for: ${configTitle}` : `All Unique Versions for Blueprint: ${configId}`;

  const breadcrumbItems = useMemo(() => [
    { label: 'Home', href: '/' },
    { label: configTitle || configId }
  ], [configId, configTitle]);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
      <div className="mx-auto">
        <AnalysisPageHeader
          breadcrumbs={breadcrumbItems}
          pageTitle={pageTitle}
          contextualInfo={{
            configTitle: configTitle || '',
            runLabel: '',
            timestamp: '',
            description: configDescription || '',
            tags: configTags || []
          }}
          isSticky={false}
        />

        <main className="mt-6 md:mt-8">
          {uniqueRuns.length === 0 && (
            <div className="text-center py-12">
              {HistoryIcon && <HistoryIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground dark:text-slate-500" />}
              <p className="text-lg text-muted-foreground dark:text-slate-400">
                No runs found for Blueprint: <strong className="text-foreground dark:text-slate-200">{configId}</strong>
              </p>
            </div>
          )}

          {uniqueRuns.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground dark:text-slate-400">
                Showing all unique evaluation versions (based on content hash) for blueprint <strong className="text-foreground dark:text-slate-300">{configTitle || configId}</strong>. Each may have multiple timestamped instances. Select a version to see all its instances, or go directly to its latest analysis.
              </p>
              {uniqueRuns.map((run) => {
                const latestAnalysisLink = run.latestInstanceSafeTimestamp 
                  ? `/analysis/${run.configId}/${run.versionId}/${run.latestInstanceSafeTimestamp}` 
                  : null;

                return (
                  <Card key={run.versionId} className="bg-card/80 dark:bg-slate-800/60 backdrop-blur-sm ring-1 ring-border dark:ring-slate-700/70 flex flex-col">
                    <Link href={`/analysis/${run.configId}/${run.versionId}`} className="block hover:bg-muted/30 dark:hover:bg-slate-700/40 transition-colors flex-grow">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center">
                            {LayersIcon && <LayersIcon className="w-5 h-5 mr-2.5 text-primary flex-shrink-0" />}
                            <CardTitle className="text-base font-medium text-primary truncate" title={run.versionId}>
                              Version: {run.versionId}
                            </CardTitle>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {run.instanceCount} {run.instanceCount === 1 ? 'instance' : 'instances'}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="flex justify-between items-center">
                        <div className="text-xs text-muted-foreground">
                          Latest run: <ClientDateTime timestamp={run.latestInstanceSafeTimestamp} />
                        </div>
                        <div className="flex items-center space-x-4">
                          {run.averageHybridScore !== null && run.averageHybridScore !== undefined && (
                             <div className="flex flex-col items-end">
                                <p className="text-xs text-muted-foreground">Avg. Hybrid Score</p>
                                <p className={`text-lg font-semibold ${getHybridScoreColor(run.averageHybridScore)}`}>
                                  {(run.averageHybridScore * 100).toFixed(1)}%
                                </p>
                              </div>
                          )}
                          {ChevronRightIcon && <ChevronRightIcon className="w-5 h-5 text-muted-foreground" />}
                        </div>
                      </CardContent>
                    </Link>
                    {latestAnalysisLink && (
                       <div className="border-t border-border/50 dark:border-slate-700/50 bg-muted/40 dark:bg-slate-800/40 px-4 py-2">
                         <Link href={latestAnalysisLink} className="text-xs font-medium text-primary hover:underline inline-flex items-center">
                           Go to latest analysis
                           {ExternalLinkIcon && <ExternalLinkIcon className="w-3 h-3 ml-1.5" />}
                         </Link>
                       </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
} 