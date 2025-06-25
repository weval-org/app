import BetaComparisonClientPage from '@/app/(full)/analysis/[configId]/[runLabel]/[timestamp]/BetaComparisonClientPage';
import { ComparisonDataV2 } from '@/app/utils/types';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

interface PlaygroundResultsPageProps {
  params: Promise<{
    playgroundId: string;
  }>;
}

// Ensure the page is not cached
export const revalidate = 0;

async function getPlaygroundResult(playgroundId: string): Promise<ComparisonDataV2 | null> {
    // This fetch needs to be absolute for server-side fetching.
    // In a real deployment, NEXT_PUBLIC_URL would be set.
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
    try {
        const res = await fetch(`${baseUrl}/api/playground/results/${playgroundId}`);
        if (!res.ok) {
            return null;
        }
        return res.json();
    } catch (error) {
        console.error(`Failed to fetch playground result for ${playgroundId}`, error);
        return null;
    }
}

export async function generateMetadata({ params }: PlaygroundResultsPageProps): Promise<Metadata> {
    const { playgroundId } = await params;
    const data = await getPlaygroundResult(playgroundId);
    const title = data?.configTitle ? `${data.configTitle} (Playground)` : 'Playground Result';
    const description = data?.config?.description || 'A custom blueprint evaluation run in the playground.';

    return {
        title: title,
        description: description,
        openGraph: {
            title: title,
            description: description,
        },
    };
}


export default async function PlaygroundResultPage({ params }: PlaygroundResultsPageProps) {
  const { playgroundId } = await params;
  const data = await getPlaygroundResult(playgroundId);

  if (!data) {
    return notFound();
  }

  // The BetaComparisonClientPage expects the data in a specific prop.
  // We pass the fetched data directly to it.
  return <BetaComparisonClientPage data={data} isPlayground={true} />;
}
