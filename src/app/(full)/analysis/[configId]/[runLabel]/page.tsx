import { notFound } from 'next/navigation';
import RunLabelInstancesClientPage from './RunLabelInstancesClientPage';
import { ApiRunsResponse } from '../page';

type ThisPageProps = {
    params: Promise<{
        configId: string;
        runLabel: string;
    }>;
};

async function getRunLabelInstancesData(configId: string, runLabel: string): Promise<ApiRunsResponse> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8888';
    
    // The API route supports filtering by runLabel
    const res = await fetch(`${appUrl}/api/runs/${configId}?runLabel=${runLabel}`, {
        next: { revalidate: 3600 },
    });

    if (!res.ok) {
        console.error(`[Page Fetch] API request failed for /api/runs/${configId}?runLabel=${runLabel} with status ${res.status}`);
        notFound();
    }
 
    return res.json();
}

export default async function RunLabelInstancesPage({ params }: ThisPageProps) {
  const thisParams = await params;
  const data = await getRunLabelInstancesData(thisParams.configId, thisParams.runLabel);
  return <RunLabelInstancesClientPage configId={thisParams.configId} runLabel={thisParams.runLabel} data={data} />;
} 