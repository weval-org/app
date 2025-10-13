import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';
import type { PairwiseTask } from '@/cli/services/pairwise-task-queue-service';

export const revalidate = 0;

const TASK_QUEUE_BLOB_STORE_NAME = 'pairwise-tasks-v2';

function getConfigIndexKey(configId: string): string {
  return `_index_${configId}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
) {
  console.log('[get-task] Route handler called');
  try {
    console.log('[get-task] Awaiting params...');
    const { configId } = await params;
    console.log('[get-task] Got configId:', configId);

    if (!configId) {
      console.error('[get-task] No configId provided');
      return NextResponse.json(
        { error: 'configId is required' },
        { status: 400 }
      );
    }

    console.log('[get-task] Getting blob store...');
    const store = getStore({
      name: TASK_QUEUE_BLOB_STORE_NAME,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    });
    const configIndexKey = getConfigIndexKey(configId);
    console.log('[get-task] Fetching config index:', configIndexKey);
    const configIndex = await store.get(configIndexKey, { type: 'json' }) as string[] | undefined;
    console.log('[get-task] Config index length:', configIndex?.length ?? 0);

    if (!configIndex || configIndex.length === 0) {
      console.error('[get-task] No config index found or empty for:', configId);
      return NextResponse.json(
        { error: `No comparison tasks found for config: ${configId}` },
        { status: 404 }
      );
    }

    // Select a random task from the config-specific index
    const randomIndex = Math.floor(Math.random() * configIndex.length);
    const randomTaskId = configIndex[randomIndex];
    console.log('[get-task] Selected random task ID:', randomTaskId);

    console.log('[get-task] Fetching task object...');
    const task = await store.get(randomTaskId, { type: 'json' }) as PairwiseTask | undefined;

    if (!task) {
      console.error('[get-task] Task object not found for ID:', randomTaskId);
      return NextResponse.json(
        { error: `Task object not found for ID: ${randomTaskId}. The index may be stale.` },
        { status: 404 }
      );
    }

    console.log('[get-task] Successfully fetched task, returning...');
    return NextResponse.json(task);

  } catch (error: any) {
    console.error('[get-task] Error:', error.message);
    console.error('[get-task] Stack:', error.stack);
    return NextResponse.json(
      { error: 'An internal server error occurred while fetching a comparison task.' },
      { status: 500 }
    );
  }
}
