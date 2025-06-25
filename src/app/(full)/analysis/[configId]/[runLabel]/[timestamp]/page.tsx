import type { Metadata, ResolvingMetadata } from 'next';
import { generateAnalysisPageMetadata } from '@/app/utils/metadataUtils';
import BetaComparisonClientPage from './BetaComparisonClientPage';
import { notFound } from 'next/navigation';
import { ComparisonDataV2 } from '@/app/utils/types';

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8888';
  
  // Fetch from the internal API route. Next.js automatically dedupes this request
  // if the same URL is fetched elsewhere for the same request.
  const res = await fetch(`${appUrl}/api/comparison/${configId}/${runLabel}/${timestamp}`, {
    // This enables server-side caching of the fetched data.
    // Requests are cached by default. Revalidating every hour.
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    // This will activate the closest `error.tsx` Error Boundary.
    // In our case, we'll just show a not found page.
    console.error(`[Page Fetch] API request failed with status ${res.status} for ${configId}/${runLabel}/${timestamp}`);
    notFound();
  }
 
  return res.json();
}

export default async function BetaComparisonPage(props: ThisPageProps) {
  const data = await getComparisonData(props.params);
  return <BetaComparisonClientPage data={data} />;
}