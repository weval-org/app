import type { Metadata, ResolvingMetadata } from 'next';
import { generateAnalysisPageMetadata } from '@/app/utils/metadataUtils';
import { notFound } from 'next/navigation';
import { ComparisonDataV2 } from '@/app/utils/types';
import { getResultByFileName, getCoreResult } from '@/lib/storageService';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';
import { ComparePageClient } from './ComparePageClient';
import { cache } from 'react';

type ThisPageProps = {
  params: {
    configId: string;
    runLabel: string;
    timestamp: string;
  };
  searchParams: { [key: string]: string | string[] | undefined };
};

export const revalidate = 3600;

export async function generateMetadata(
  props: ThisPageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { params, searchParams } = props;
  const newSearchParams = { ...searchParams, view: 'compare' };
  return generateAnalysisPageMetadata(
    {
      params,
      searchParams: newSearchParams,
    },
    parent
  );
}

const getComparisonData = cache(async (params: ThisPageProps['params']): Promise<ComparisonDataV2 | null> => {
  const { configId, runLabel, timestamp } = params;

  try {
    const core = await getCoreResult(configId, runLabel, timestamp);
    if (core) {
      console.log(`[Compare Page Fetch] Using core artefact for ${configId}/${runLabel}/${timestamp}`);
      return core as ComparisonDataV2;
    }
    
    // Fallback for older runs that might not have core.json
    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    const jsonData = await getResultByFileName(configId, fileName);
    if (!jsonData) {
      console.log(`[Compare Page Fetch] Data not found for file: ${fileName}`);
      return null;
    }

    console.log(`[Compare Page Fetch] Using full data from storage for ${configId}/${runLabel}/${timestamp}`);
    return jsonData as ComparisonDataV2;

  } catch (error) {
    console.error(`[Compare Page Fetch] Failed to get comparison data for ${configId}/${runLabel}/${timestamp}:`, error);
    return null;
  }
});

export default async function ComparePage(props: ThisPageProps) {
  const data = await getComparisonData(props.params);
  const { configId, runLabel, timestamp } = props.params;

  if (!data) {
    notFound();
  }

  return (
    <AnalysisProvider 
        initialData={data} 
        configId={configId}
        runLabel={runLabel}
        timestamp={timestamp}
    >
        <ComparePageClient />
    </AnalysisProvider>
  );
}
