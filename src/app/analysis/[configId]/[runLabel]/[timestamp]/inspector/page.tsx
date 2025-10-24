import type { Metadata, ResolvingMetadata } from 'next';
import { cache } from 'react';
import { generateAnalysisPageMetadata } from '@/app/utils/metadataUtils';
import { notFound } from 'next/navigation';
import { ComparisonDataV2 } from '@/app/utils/types';
import { getResultByFileName, getCoreResult } from '@/lib/storageService';
import { InspectorClientPage } from './InspectorClientPage';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';

type ThisPageProps = {
  params: Promise<{
    configId: string;
    runLabel: string;
    timestamp: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type ThisPageGenerateMetadataProps = {
  params: Promise<{
    configId: string;
    runLabel: string;
    timestamp: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const revalidate = 3600;

export async function generateMetadata(
  props: ThisPageGenerateMetadataProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  return generateAnalysisPageMetadata(
    {
      params: props.params,
      searchParams: props.searchParams,
    },
    parent
  );
}

const getComparisonData = cache(async (params: ThisPageProps['params']): Promise<ComparisonDataV2> => {
  const { configId, runLabel, timestamp } = await params;

  try {
    // Prefer direct core artefact read (works in SSR/Netlify without localhost fetch)
    const core = await getCoreResult(configId, runLabel, timestamp);
    if (core) {
      console.log(`[Inspector Page Fetch] Using core artefact for ${configId}/${runLabel}/${timestamp}`);
      return core as ComparisonDataV2;
    }

    // Fallback to legacy monolith for backward compatibility
    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    const jsonData = await getResultByFileName(configId, fileName);
    if (!jsonData) {
      console.log(`[Inspector Page Fetch] Data not found for file: ${fileName}`);
      notFound();
    }

    console.log(`[Inspector Page Fetch] Using full data from storage for ${configId}/${runLabel}/${timestamp}`);
    return jsonData as ComparisonDataV2;

  } catch (error) {
    console.error(`[Inspector Page Fetch] Failed to get comparison data for ${configId}/${runLabel}/${timestamp}:`, error);
    notFound();
  }
});

export default async function InspectorPage(props: ThisPageProps) {
  const data = await getComparisonData(props.params);
  const { configId, runLabel, timestamp } = await props.params;

  return (
    <AnalysisProvider
        initialData={data}
        configId={configId}
        runLabel={runLabel}
        timestamp={timestamp}
    >
        <InspectorClientPage />
    </AnalysisProvider>
  );
}
