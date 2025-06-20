'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import { fromSafeTimestamp } from '@/app/utils/timestampUtils';
import AnalysisPageHeader from '../components/AnalysisPageHeader';
import { Badge } from '@/components/ui/badge';

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

// Helper function for score color (can be moved to utils if used elsewhere frequently)
const getHybridScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-slate-400';
  if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

export default function ConfigRunsPage() {
  const router = useRouter();
  const params = useParams();
  const configId = params.configId as string;

  const [uniqueRuns, setUniqueRuns] = useState<UniqueVersionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overallConfigTitle, setOverallConfigTitle] = useState<string | null>(null);
  const [configDescription, setConfigDescription] = useState<string | null>(null);
  const [configTags, setConfigTags] = useState<string[] | null>(null);

  useEffect(() => {
    if (configId) {
      const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
          const response = await fetch(`/api/runs/${configId}`);
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API request failed with status ${response.status}`);
          }
          const apiResponse = await response.json();
          const allRunsForThisConfig: EnhancedRunInfo[] = apiResponse.runs;
          const fetchedConfigTitle: string | null = apiResponse.configTitle;
          const fetchedConfigDescription: string | null = apiResponse.configDescription;
          const fetchedConfigTags: string[] | null = apiResponse.configTags;

          if (fetchedConfigTitle) {
            setOverallConfigTitle(fetchedConfigTitle);
          }
          if (fetchedConfigDescription) {
            setConfigDescription(fetchedConfigDescription);
          }
          if (fetchedConfigTags) {
            setConfigTags(fetchedConfigTags);
          }

          if (!allRunsForThisConfig || allRunsForThisConfig.length === 0) {
            if (!fetchedConfigTitle) {
                throw new Error(`No runs found for Blueprint ID: ${configId} and config title could not be determined.`);
            } else {
                setError(`No runs found for Blueprint ID: ${configId}`);
            }
          }
          
          const runsByLabel = new Map<string, { 
            timestamps: string[], 
            safeTimestamps: string[],
            scores: (number | null)[] // To store hybrid scores for averaging
          }>();

          allRunsForThisConfig.forEach(run => {
            console.log("run", run);
            if (!run.runLabel || !run.timestamp) return;
            const existing = runsByLabel.get(run.runLabel) || { timestamps: [], safeTimestamps: [], scores: [] };
            existing.timestamps.push(fromSafeTimestamp(run.timestamp));
            existing.safeTimestamps.push(run.timestamp);
            existing.scores.push(run.hybridScoreStats?.average ?? null); // Collect score
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

            // Calculate average hybrid score for this version
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
              averageHybridScore: avgScore, // Store the average score
            };
          });
          
          processedRuns.sort((a, b) => {
            if (!a.latestTimestamp) return 1;
            if (!b.latestTimestamp) return -1;
            return new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime();
          });

          setUniqueRuns(processedRuns);
        } catch (err) {
          console.error("Error fetching unique run labels:", err);
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [configId]);

  const pageTitle = overallConfigTitle ? `All Unique Versions for: ${overallConfigTitle}` : `All Unique Versions for Blueprint: ${configId}`;

  const breadcrumbItems = useMemo(() => [
    { label: 'Home', href: '/' },
    { label: overallConfigTitle || configId }
  ], [configId, overallConfigTitle]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8">
        <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
        <div className="flex items-center space-x-3 text-xl text-foreground dark:text-slate-200">
          {Loader2Icon && <Loader2Icon className="animate-spin h-8 w-8 text-primary" />}
          <span>Loading unique versions for blueprint "<strong>{configId}</strong>"...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8">
        <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
        <div className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md p-8 rounded-xl shadow-lg ring-1 ring-destructive/70 dark:ring-red-500/70 text-center max-w-lg w-full">
          {HistoryIcon && <HistoryIcon className="w-16 h-16 mx-auto mb-4 text-destructive dark:text-red-400" />}
          <h2 className="text-2xl font-semibold mb-3 text-destructive dark:text-red-300">Error Loading Runs</h2>
          <p className="text-card-foreground dark:text-slate-300 mb-4">Could not load runs for: <strong className="text-card-foreground dark:text-slate-100">{configId}</strong></p>
          <div className="text-sm text-muted-foreground dark:text-slate-400 bg-muted/70 dark:bg-slate-700/50 p-4 rounded-md ring-1 ring-border dark:ring-slate-600 mb-6">
              <p className="font-semibold text-card-foreground dark:text-slate-300 mb-1">Error Details:</p>
              {error}
          </div>
          <Button onClick={() => router.push('/')} variant="default" className="mt-8 w-full sm:w-auto px-6 py-2.5">
              Go to Homepage
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
      <div className="max-w-7xl mx-auto">
        <AnalysisPageHeader
          breadcrumbs={breadcrumbItems}
          pageTitle={pageTitle}
          contextualInfo={{
            description: configDescription,
            tags: configTags
          }}
          isSticky={false}
        />

        <main className="mt-6 md:mt-8">
          {uniqueRuns.length === 0 && !loading && (
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
                Showing all unique evaluation versions (based on content hash) for blueprint <strong className="text-foreground dark:text-slate-300">{overallConfigTitle || configId}</strong>. Each may have multiple timestamped instances. Select a version to see all its instances, or go directly to its latest analysis.
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
                          {ChevronRightIcon && <ChevronRightIcon className="w-5 h-5 text-muted-foreground dark:text-slate-400 flex-shrink-0" />}
                        </div>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <p className="text-xs text-muted-foreground dark:text-slate-400">
                          Instances: <span className="font-semibold text-foreground dark:text-slate-300">{run.instanceCount}</span>
                        </p>
                        <p className="text-xs text-muted-foreground dark:text-slate-400 mt-1">
                          Latest Instance: <span className="font-semibold text-foreground dark:text-slate-300">{run.displayLatestDate}</span>
                        </p>
                        {typeof run.averageHybridScore === 'number' ? (
                          <p className="text-xs text-muted-foreground dark:text-slate-400 mt-1">
                            Avg. Hybrid Score: <span className={`font-semibold ${getHybridScoreColor(run.averageHybridScore)}`}>
                              {(run.averageHybridScore * 100).toFixed(1)}%
                            </span>
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground dark:text-slate-400 mt-1">
                            Avg. Hybrid Score: <span className="font-semibold text-muted-foreground dark:text-slate-400">N/A</span>
                          </p>
                        )}
                      </CardContent>
                    </Link>
                    {latestAnalysisLink && (
                      <div className="p-3 border-t border-border/30 dark:border-slate-700/50 bg-muted/20 dark:bg-slate-800/30 rounded-b-lg">
                        <Link 
                          href={latestAnalysisLink} 
                          className="w-full inline-flex items-center justify-center px-3 py-2 text-xs font-medium rounded-md text-primary dark:text-sky-300 bg-primary/10 hover:bg-primary/20 dark:bg-sky-500/20 dark:hover:bg-sky-500/30 transition-all shadow-sm hover:shadow group"
                        >
                          {ExternalLinkIcon && <ExternalLinkIcon className="w-3.5 h-3.5 mr-1.5 opacity-90 group-hover:opacity-100" />}
                          View Latest Analysis
                        </Link>
                      </div>
                    )}
                  </Card>
                )}
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
} 