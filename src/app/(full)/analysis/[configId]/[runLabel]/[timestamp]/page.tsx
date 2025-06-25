import type { Metadata, ResolvingMetadata } from 'next';
import { generateAnalysisPageMetadata } from '@/app/utils/metadataUtils';
import BetaComparisonClientPage from './BetaComparisonClientPage';
import { notFound } from 'next/navigation';
import { ComparisonDataV2 } from '@/app/utils/types';
import { listRunsForConfig, getResultByFileName } from '@/lib/storageService';

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

async function getComparisonData(params: ThisPageProps['params']): Promise<ComparisonDataV2> {
  const { configId, runLabel, timestamp } = await params;

  try {
    const allRunsForConfig = await listRunsForConfig(configId);

    if (!allRunsForConfig || allRunsForConfig.length === 0) {
      console.log(`[Page Fetch] No runs found for configId: ${configId}`);
      notFound();
    }

    const specificRun = allRunsForConfig.find(run => 
      run.runLabel === runLabel && run.timestamp === timestamp
    );

    if (!specificRun) {
      console.log(`[Page Fetch] No specific run found for ${configId}/${runLabel}/${timestamp}`);
      notFound();
    }
    
    const jsonData = await getResultByFileName(configId, specificRun.fileName);
    
    if (!jsonData) {
      console.log(`[Page Fetch] Data not found for file: ${specificRun.fileName}`);
      notFound();
    }

    return jsonData as ComparisonDataV2;

  } catch (error) {
    console.error(`[Page Fetch] Failed to get comparison data for ${configId}/${runLabel}/${timestamp}:`, error);
    notFound();
  }
}

export default async function BetaComparisonPage(props: ThisPageProps) {
  const data = await getComparisonData(props.params);
  return <BetaComparisonClientPage data={data} />;
}