import type { Metadata, ResolvingMetadata } from 'next';
import { cache } from 'react';
import { generateAnalysisPageMetadata } from '@/app/utils/metadataUtils';
import BetaComparisonClientPage from './BetaComparisonClientPage';
import { notFound } from 'next/navigation';
import { ComparisonDataV2 } from '@/app/utils/types';
import { getResultByFileName } from '@/lib/storageService';

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

export const revalidate = 3600; // Revalidate once per hour

export async function generateMetadata(
  props: ThisPageGenerateMetadataProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  // The props here are promises that need to be awaited.
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
    // Optimistically construct the filename directly to avoid listing all files.
    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    
    const jsonData = await getResultByFileName(configId, fileName);
    
    if (!jsonData) {
      console.log(`[Page Fetch] Data not found for file: ${fileName}`);
      notFound();
    }

    return jsonData as ComparisonDataV2;

  } catch (error) {
    console.error(`[Page Fetch] Failed to get comparison data for ${configId}/${runLabel}/${timestamp}:`, error);
    notFound();
  }
});

export default async function BetaComparisonPage(props: ThisPageProps) {
  const data = await getComparisonData(props.params);
  return <BetaComparisonClientPage data={data} />;
}