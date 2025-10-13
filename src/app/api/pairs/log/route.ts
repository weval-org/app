import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';

export const revalidate = 0;

const PREFERENCES_STORE_NAME = 'pairwise-preferences-v2';

interface PreferenceRecord {
  preference: 'A' | 'B' | 'Indifferent' | 'Unknown';
  reason?: string;
  timestamp: string;
  userToken?: string;
  // Task metadata
  modelIdA?: string;
  modelIdB?: string;
  configId?: string;
  promptPreview?: string;
}

export async function GET() {
  try {
    const store = getStore({
      name: PREFERENCES_STORE_NAME,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    });
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
