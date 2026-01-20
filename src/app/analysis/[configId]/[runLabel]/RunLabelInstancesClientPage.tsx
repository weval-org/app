'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import AnalysisPageHeader from '@/app/analysis/components/AnalysisPageHeader';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';
import CoverageHeatmapCanvas from '@/app/analysis/components/CoverageHeatmapCanvas';
import { ApiRunsResponse } from '../page';
import ClientDateTime from '@/app/components/ClientDateTime';
import Icon from '@/components/ui/icon';
import { buildConfigBreadcrumbs } from '@/app/utils/blueprintIdUtils';

export interface RunInstanceInfo extends EnhancedRunInfo {
  configId: string;
  safeTimestamp: string;
  displayDate: string;
  promptIds?: string[];
}

const getHybridScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground';
  if (score >= 0.8) return 'text-emerald-600';
  if (score >= 0.6) return 'text-lime-600';
  if (score >= 0.4) return 'text-amber-600';
  return 'text-red-600';
};

export default function RunLabelInstancesClientPage({ configId, runLabel, data }: { configId: string, runLabel: string, data: ApiRunsResponse }) {
  const { runs: allRunsForThisConfig, configTitle, configDescription, configTags, configAuthor, configReference } = data;

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

  const pageTitle = configTitle ? 
    `Instances for Run Label: ${runLabel} (Blueprint: ${configTitle})` : 
    `Instances for Run Label: ${runLabel} (Blueprint ID: ${configId})`;

  const breadcrumbItems = useMemo(() => [
    { label: 'Home', href: '/' },
    ...buildConfigBreadcrumbs(configId, configTitle || undefined),
    { label: `Run: ${runLabel}` }
  ], [configId, runLabel, configTitle]);

  const headerActions = useMemo(() => (
    <Link href={`/analysis/${configId}`} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-primary hover:bg-primary/10 transition-colors border border-primary/30">
      <Icon name="chevron-right" className="w-4 h-4 mr-1.5 transform rotate-180" />
      Back to All Runs for Blueprint: {configTitle || configId}
    </Link>
  ), [configId, configTitle]);

  return (
    <AnalysisProvider
      configId={configId}
      runLabel={runLabel}
      configTitle={configTitle || ''}
      description={configDescription || ''}
      tags={configTags || []}
      author={configAuthor || undefined}
      reference={configReference || undefined}
      pageTitle={pageTitle}
      breadcrumbItems={breadcrumbItems}
    >
      <div className="mx-auto p-4 md:p-6 lg:p-8 space-y-8">
        <AnalysisPageHeader
          actions={headerActions}
          isSticky={false}
        />

        <>
          {runInstances.length === 0 && (
              <div className="text-center py-12">
                  <Icon name="history" className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg text-muted-foreground">
                      No specific instances found for Run Label: <strong className="text-foreground">{runLabel}</strong>
                  </p>
              </div>
          )}

          {runInstances.length > 0 && (
              <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                      Showing all recorded executions for Run Label <strong className="text-foreground">{runLabel}</strong>.
                  </p>
                  {runInstances.map((instance) => (
                      <Card key={instance.safeTimestamp} className="transition-shadow duration-200 overflow-hidden">
                          <Link href={`/analysis/${instance.configId}/${instance.runLabel}/${instance.safeTimestamp}`} className="block hover:bg-muted/30 transition-colors p-4">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <p className="text-base font-medium text-primary">
                                          Executed: <ClientDateTime timestamp={instance.timestamp} />
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-1">
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
                                                  className="rounded-sm border border-border/50"
                                              />
                                          </div>
                                        )}
                                      {instance.hybridScoreStats?.average !== undefined && instance.hybridScoreStats?.average !== null && (
                                        <div className="flex flex-col items-end w-28">
                                          <p className="text-xs text-muted-foreground">Avg. Hybrid Score</p>
                                          <p className={`text-xl font-semibold ${getHybridScoreColor(instance.hybridScoreStats.average)}`}>
                                            {(instance.hybridScoreStats.average * 100).toFixed(1)}%
                                          </p>
                                        </div>
                                      )}
                                       {instance.numModels !== undefined && (
                                        <div className="flex flex-col items-end">
                                          <p className="text-xs text-muted-foreground">Model Variants</p>
                                          <p className="text-xl font-semibold text-foreground">{instance.numModels}</p>
                                        </div>
                                      )}
                                      {instance.numPrompts !== undefined && (
                                        <div className="flex flex-col items-end">
                                          <p className="text-xs text-muted-foreground">Test Cases</p>
                                          <p className="text-xl font-semibold text-foreground">{instance.numPrompts}</p>
                                        </div>
                                      )}
                                      <Icon name="chevron-right" className="w-5 h-5 text-muted-foreground self-center ml-2" />
                                  </div>
                              </div>
                          </Link>
                      </Card>
                  ))}
              </div>
          )}
        </>
      </div>
    </AnalysisProvider>
  );
} 