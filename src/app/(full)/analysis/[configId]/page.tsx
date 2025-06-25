import { notFound } from 'next/navigation';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import ConfigRunsClientPage from './ConfigRunsClientPage';

export interface ApiRunsResponse {
    runs: EnhancedRunInfo[];
    configTitle: string | null;
    configDescription: string | null;
    configTags: string[] | null;
}

type ThisPageProps = {
    params: Promise<{
        configId: string;
    }>;
};

async function getConfigRunsData(configId: string): Promise<ApiRunsResponse> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8888';
    
    const res = await fetch(`${appUrl}/api/runs/${configId}`, {
        next: { revalidate: 3600 },
    });

    if (!res.ok) {
        console.error(`[Page Fetch] API request failed for /api/runs/${configId} with status ${res.status}`);
        notFound();
    }
 
    return res.json();
}

export default async function ConfigRunsPage({ params }: ThisPageProps) {
  const thisParams = await params;
  const data = await getConfigRunsData(thisParams.configId);
  return <ConfigRunsClientPage configId={thisParams.configId} data={data} />;
} 