import { notFound } from 'next/navigation';
import { cache } from 'react';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import RefactorConfigRunsClientPage from './RefactorConfigRunsClientPage';
import { getConfigSummary } from '@/lib/storageService';

export interface ApiRunsResponse {
    runs: EnhancedRunInfo[];
    configTitle: string | null;
    configDescription: string | null;
    configTags: string[] | null;
}

export const revalidate = 3600;

type ThisPageProps = {
    params: Promise<{
        configId: string;
    }>;
};

const getConfigRunsData = cache(async (configId: string): Promise<ApiRunsResponse> => {
    try {
        const configSummary = await getConfigSummary(configId);

        if (!configSummary) {
            console.warn(`[Page Fetch] No config-summary.json found for ${configId}.`);
            notFound();
        }

        const runs = configSummary.runs || [];
        const configTitle = configSummary.title || configSummary.configTitle || null;
        const configDescription = configSummary.description || null;
        const configTags = configSummary.tags || null;

        return { runs, configTitle, configDescription, configTags };

    } catch (error) {
        console.error(`[Page Fetch] Error fetching config summary for ${configId}:`, error);
        notFound();
    }
});

export default async function RefactorConfigRunsPage({ params }: ThisPageProps) {
  const thisParams = await params;
  const data = await getConfigRunsData(thisParams.configId);
  return (
    <RefactorConfigRunsClientPage 
      configId={thisParams.configId} 
      configTitle={data.configTitle || 'Unknown Configuration'}
      description={data.configDescription || undefined}
      tags={data.configTags || undefined}
      runs={data.runs}
      totalRuns={data.runs.length}
      currentPage={1}
      runsPerPage={data.runs.length}
    />
  );
} 