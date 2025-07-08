import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';

export const revalidate = 0;

const PREFERENCES_STORE_NAME = 'pairwise-preferences-v2';
const DEV_API_ENDPOINT = 'https://dev--weval-dev.netlify.app/api/pairs/log';

interface PreferenceRecord {
  preference: 'A' | 'B' | 'Indifferent';
  reason?: string;
  timestamp: string;
  user?: {
    github_username: string;
  };
}

export async function GET() {
  if (process.env.NODE_ENV === 'development') {
    try {
      console.log(`[API /pairs/log] Development mode: Proxying request to ${DEV_API_ENDPOINT}`);
      const response = await fetch(DEV_API_ENDPOINT, { next: { revalidate: 0 } });
      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json(data, { status: response.status });
      }
      return NextResponse.json(data);
    } catch (error: any) {
      console.error(`[API /pairs/log] Error proxying request: ${error.message}`);
      return NextResponse.json({ error: 'Failed to proxy request to dev environment.' }, { status: 500 });
    }
  }

  try {
    const store = getStore(PREFERENCES_STORE_NAME);
    const { blobs } = await store.list();
    
    let allPreferences: (PreferenceRecord & { taskId: string })[] = [];

    for (const blob of blobs) {
      const taskPreferences = await store.get(blob.key, { type: 'json' }) as PreferenceRecord[] | undefined;
      if (taskPreferences) {
        const preferencesWithTaskId = taskPreferences.map(p => ({ ...p, taskId: blob.key }));
        allPreferences.push(...preferencesWithTaskId);
      }
    }

    // Sort by timestamp descending to get the latest first
    allPreferences.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Get the last 100
    const last100 = allPreferences.slice(0, 100);

    return NextResponse.json(last100);

  } catch (error: any) {
    console.error(`[API /api/pairs/log] Error: ${error.message}`);
    return NextResponse.json(
      { error: 'An internal server error occurred while fetching the preference log.' },
      { status: 500 }
    );
  }
}
