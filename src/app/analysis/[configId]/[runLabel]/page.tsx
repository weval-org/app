import { notFound } from 'next/navigation';
import { cache } from 'react';
import RunLabelInstancesClientPage from './RunLabelInstancesClientPage';
import { ApiRunsResponse } from '../page';
import { getConfigSummary } from '@/lib/storageService';

type ThisPageProps = {
    params: Promise<{
        configId: string;
        runLabel: string;
    }>;
};

export const revalidate = 3600;

const getRunLabelInstancesData = cache(async (configId: string, runLabel: string): Promise<ApiRunsResponse> => {
    try {
        const configSummary = await getConfigSummary(configId);

        if (!configSummary) {
            console.warn(`[Page Fetch] No config-summary.json found for ${configId}.`);
            notFound();
        }

        const runs = (configSummary.runs || []).filter(run => run.runLabel === runLabel);
        const configTitle = configSummary.title || configSummary.configTitle || null;
        const configDescription = configSummary.description || null;
        const configTags = configSummary.tags || null;
        const configAuthor = configSummary.author || null;
        const configReference = (configSummary as any).reference || null;

        if (runs.length === 0) {
            console.log(`[Page Fetch] No runs found for runLabel '${runLabel}' in config '${configId}'.`);
            notFound();
        }
        
        return { runs, configTitle, configDescription, configTags, configAuthor, configReference };

    } catch (error) {
        console.error(`[Page Fetch] Error fetching config summary for ${configId}:`, error);
        notFound();
    }
});

export default async function RunLabelInstancesPage({ params }: ThisPageProps) {
  const thisParams = await params;
  const data = await getRunLabelInstancesData(thisParams.configId, thisParams.runLabel);
  return <RunLabelInstancesClientPage configId={thisParams.configId} runLabel={thisParams.runLabel} data={data} />;
} 