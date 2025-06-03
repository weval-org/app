'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { toSafeTimestamp, fromSafeTimestamp } from '@/app/utils/timestampUtils';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import AnalysisPageHeader from '../../components/AnalysisPageHeader';

interface RunInstanceInfo {
  configId: string;
  runLabel: string;
  timestamp: string | null;
  safeTimestamp: string;
  displayDate: string;
  fileName: string;
}

const ChevronRightIcon = dynamic(() => import('lucide-react').then(mod => mod.ChevronRight));
const HistoryIcon = dynamic(() => import('lucide-react').then(mod => mod.History));
const ListFilterIcon = dynamic(() => import('lucide-react').then(mod => mod.ListFilter));
const Loader2Icon = dynamic(() => import('lucide-react').then(mod => mod.Loader2));

export default function RunLabelInstancesPage() {
  const router = useRouter();
  const params = useParams();
  const configId = params.configId as string;
  const runLabel = params.runLabel as string;

  const [runInstances, setRunInstances] = useState<RunInstanceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overallConfigTitle, setOverallConfigTitle] = useState<string | null>(null);
  const [configDescription, setConfigDescription] = useState<string | null>(null);
  const [configTags, setConfigTags] = useState<string[] | null>(null);

  useEffect(() => {
    if (configId && runLabel) {
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

          if (!allRunsForThisConfig) { 
            throw new Error(`No run data could be retrieved for Blueprint ID: ${configId}`);
          }
          if (allRunsForThisConfig.length === 0) {
             throw new Error(`No runs found at all for Blueprint ID: ${configId}`);
          }

          const filteredInstances = allRunsForThisConfig
            .filter(run => run.runLabel === runLabel)
            .map(run => {
              let displayDate = "Invalid Date";
              const isoTimestampToParse = fromSafeTimestamp(run.timestamp);
              const dateObj = new Date(isoTimestampToParse);
              if (!isNaN(dateObj.getTime())) {
                  displayDate = dateObj.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
              }
              return {
                configId: configId,
                runLabel: run.runLabel,
                timestamp: run.timestamp,
                safeTimestamp: run.timestamp,
                displayDate,
                fileName: run.fileName
              } as RunInstanceInfo;
            });
          
          if (filteredInstances.length === 0) {
            setError(`No specific instances found for Run Label: ${runLabel} under Blueprint ID: ${configId}. This could mean the run label doesn\'t exist, or associated runs have missing timestamps.`);
          } else {
             filteredInstances.sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime());
          }

          setRunInstances(filteredInstances);
        } catch (err) {
          console.error("Error fetching run instances:", err);
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [configId, runLabel]);

  const pageTitle = overallConfigTitle ? 
    `Instances for Run: ${runLabel} (Blueprint: ${overallConfigTitle})` : 
    `Instances for Run: ${runLabel} (Blueprint ID: ${configId})`;

  const breadcrumbItems = useMemo(() => [
    { label: 'Home', href: '/' },
    { label: overallConfigTitle || configId, href: `/analysis/${configId}` },
    { label: `Run: ${runLabel}` }
  ], [configId, runLabel, overallConfigTitle]);

  const headerActions = useMemo(() => (
    <Link href={`/analysis/${configId}`} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-primary dark:text-sky-400 hover:bg-primary/10 dark:hover:bg-sky-500/20 transition-colors border border-primary/30 dark:border-sky-500/40 hover:border-primary/50 dark:hover:border-sky-500/60">
      {ChevronRightIcon && (
        <ChevronRightIcon className="w-4 h-4 mr-1.5 transform rotate-180" />
      )}
      Back to All Runs for Blueprint: {overallConfigTitle || configId}
    </Link>
  ), [configId, overallConfigTitle]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8">
         <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
        <div className="flex items-center space-x-3 text-xl text-foreground dark:text-slate-200">
          {Loader2Icon && <Loader2Icon className="animate-spin h-8 w-8 text-primary dark:text-sky-400" />}
          <span>Loading run instances for "<strong>{runLabel}</strong>" under blueprint "<strong>{configId}</strong>"...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8">
        <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
        <div className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md p-8 rounded-xl shadow-lg ring-1 ring-destructive/70 dark:ring-red-500/70 text-center max-w-lg w-full">
            {ListFilterIcon && <ListFilterIcon className="w-16 h-16 mx-auto mb-4 text-destructive dark:text-red-400" />}
            <h2 className="text-2xl font-semibold mb-3 text-destructive dark:text-red-300">Error Loading Instances</h2>
            <p className="text-card-foreground dark:text-slate-300 mb-4">Could not load instances for Run Label: <strong className="text-card-foreground dark:text-slate-100">{runLabel}</strong> (Blueprint: {configId})</p>
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
        <div className="max-w-[1800px] mx-auto">
          <AnalysisPageHeader
            breadcrumbs={breadcrumbItems}
            pageTitle={pageTitle}
            contextualInfo={{
              configTitle: overallConfigTitle,
              description: configDescription,
              tags: configTags
            }}
            actions={headerActions}
            isSticky={false}
          />

          <main className="max-w-4xl mx-auto mt-6 md:mt-8">
              {runInstances.length === 0 && !loading && (
                  <div className="text-center py-12">
                      {HistoryIcon && <HistoryIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground dark:text-slate-500" />}
                      <p className="text-lg text-muted-foreground dark:text-slate-400">
                          No specific instances found for Run Label: <strong className="text-foreground dark:text-slate-200">{runLabel}</strong>
                      </p>
                      <p className="text-sm text-muted-foreground dark:text-slate-500 mt-2">
                          This might mean the selected run label (hash) does not exist or has no associated execution records for this blueprint (or they lack timestamps).
                      </p>
                  </div>
              )}

              {runInstances.length > 0 && (
                  <div className="space-y-4">
                      <p className="text-sm text-muted-foreground dark:text-slate-400">
                          Showing all recorded executions for Run Label <strong className="text-foreground dark:text-slate-300">{runLabel}</strong>. Each execution represents the same blueprint configuration run at a different time.
                      </p>
                      {runInstances.map((instance) => (
                          <Card key={instance.timestamp} className="bg-card/80 dark:bg-slate-800/60 backdrop-blur-sm hover:shadow-lg transition-shadow duration-200 ring-1 ring-border dark:ring-slate-700/70">
                              <Link href={`/analysis/${instance.configId}/${instance.runLabel}/${instance.safeTimestamp}`} className="block hover:bg-muted/30 dark:hover:bg-slate-700/40 transition-colors">
                                  <CardHeader className="pb-3">
                                      <div className="flex justify-between items-center">
                                          <CardTitle className="text-base font-medium text-primary dark:text-sky-400">
                                              Executed: {instance.displayDate}
                                          </CardTitle>
                                          {ChevronRightIcon && <ChevronRightIcon className="w-5 h-5 text-muted-foreground dark:text-slate-400" />}
                                      </div>
                                  </CardHeader>
                                  <CardContent>
                                      <p className="text-xs text-muted-foreground dark:text-slate-500">
                                          Timestamp (ISO): {instance.timestamp || 'N/A'} (Safe for URL: {instance.safeTimestamp})
                                      </p>
                                       <p className="text-xs text-muted-foreground dark:text-slate-500 mt-1">
                                          Filename: {instance.fileName}
                                      </p>
                                  </CardContent>
                              </Link>
                          </Card>
                      ))}
                  </div>
              )}
          </main>
        </div>
    </div>
  );
} 