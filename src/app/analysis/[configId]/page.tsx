import { notFound } from 'next/navigation';
import type { Metadata, ResolvingMetadata } from 'next';
import { cache } from 'react';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import ConfigRunsClientPage from './ConfigRunsClientPage';
import { getConfigSummary } from '@/lib/storageService';

export interface ApiRunsResponse {
    runs: EnhancedRunInfo[];
    configTitle: string | null;
    configDescription: string | null;
    configTags: string[] | null;
    configAuthor?: string | { name: string; url?: string; image_url?: string } | null;
}

export const revalidate = 3600;

type ThisPageProps = {
    params: Promise<{
        configId: string;
    }>;
};

type ThisPageGenerateMetadataProps = {
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
        const configAuthor = configSummary.author || null;

        return { runs, configTitle, configDescription, configTags, configAuthor };

    } catch (error) {
        console.error(`[Page Fetch] Error fetching config summary for ${configId}:`, error);
        notFound();
    }
});

export async function generateMetadata(
  props: ThisPageGenerateMetadataProps,
  _parent: ResolvingMetadata
): Promise<Metadata> {
  const { configId } = await props.params;
  try {
    const data = await getConfigRunsData(configId);
    const titleBase = data.configTitle || configId;
    const pageTitle = `Analysis: ${titleBase} — All Runs`;
    return {
      title: pageTitle,
      description: data.configDescription || undefined,
    };
  } catch {
    return {
      title: `Analysis: ${configId}`,
    };
  }
}

export default async function ConfigRunsPage({ params }: ThisPageProps) {
  const thisParams = await params;
  const data = await getConfigRunsData(thisParams.configId);
  return (
    <ConfigRunsClientPage 
      configId={thisParams.configId} 
      configTitle={data.configTitle || 'Unknown Configuration'}
      description={data.configDescription || undefined}
      tags={data.configTags || undefined}
      author={data.configAuthor || undefined}
      runs={data.runs}
      totalRuns={data.runs.length}
      currentPage={1}
      runsPerPage={data.runs.length}
    />
  );
} 