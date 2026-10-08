'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import AnalysisPageHeader from '@/app/analysis/components/AnalysisPageHeader';
import BlueprintRunsTable from '@/app/analysis/components/BlueprintRunsTable';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';
import { ApiRunsResponse } from '../page';
import Icon from '@/components/ui/icon';
import { buildConfigBreadcrumbs } from '@/app/utils/blueprintIdUtils';

export default function RunLabelInstancesClientPage({ configId, runLabel, data }: { configId: string, runLabel: string, data: ApiRunsResponse }) {
  const { runs: allRunsForThisConfig, configTitle, configDescription, configTags, configAuthor, configReference } = data;

  // The server page has already narrowed the runs to this version.
  const runInstances = allRunsForThisConfig || [];

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

        {runInstances.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="history" className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">
              No specific instances found for Run Label: <strong className="text-foreground">{runLabel}</strong>
            </p>
          </div>
        ) : (
          <section className="space-y-4">
            <p className="text-sm text-muted-foreground">
              All recorded executions of version <strong className="text-foreground">{runLabel}</strong>.
            </p>
            <BlueprintRunsTable configId={configId} runs={runInstances} singleVersion />
          </section>
        )}
      </div>
    </AnalysisProvider>
  );
} 