import type { Metadata, ResolvingMetadata } from 'next';
import { cache } from 'react';
import { generateAnalysisPageMetadata } from '@/app/utils/metadataUtils';
import { notFound } from 'next/navigation';
import { ComparisonDataV2 } from '@/app/utils/types';
import { getResultByFileName } from '@/lib/storageService';
import { ClientPage } from './ClientPage';
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
    // Try to fetch core data first (optimized for faster initial load)
    try {
      const coreResponse = await fetch(
        `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/comparison/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(timestamp)}/core`,
        { cache: 'force-cache' }
      );
      
      if (coreResponse.ok) {
        const coreData = await coreResponse.json();
        console.log(`[Page Fetch] Using optimized core data for ${configId}/${runLabel}/${timestamp}`);
        return coreData as ComparisonDataV2;
      }
    } catch (coreError) {
      console.warn(`[Page Fetch] Core API failed, falling back to full data:`, coreError);
    }

    // Fallback to full data from storage (backward compatibility)
    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    const jsonData = await getResultByFileName(configId, fileName);
    
    if (!jsonData) {
      console.log(`[Page Fetch] Data not found for file: ${fileName}`);
      notFound();
    }

    console.log(`[Page Fetch] Using full data from storage for ${configId}/${runLabel}/${timestamp}`);
    return jsonData as ComparisonDataV2;

  } catch (error) {
    console.error(`[Page Fetch] Failed to get comparison data for ${configId}/${runLabel}/${timestamp}:`, error);
    notFound();
  }
});

export default async function ComparisonPage(props: ThisPageProps) {
  const data = await getComparisonData(props.params);
  const { configId, runLabel, timestamp } = await props.params;

  return (
    <AnalysisProvider 
        initialData={data} 
        configId={configId}
        runLabel={runLabel}
        timestamp={timestamp}
    >
        <ClientPage />
    </AnalysisProvider>
  );
} 