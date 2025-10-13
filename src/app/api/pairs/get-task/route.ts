import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';
import type { PairwiseTask } from '@/cli/services/pairwise-task-queue-service';

// This is a placeholder implementation.
// In the future, this will:
// 1. Connect to Netlify Blobs or another K/V store.
// 2. Implement logic to find a pair of responses with the fewest comparisons.
//    - This might involve scanning recent runs from storage.
// 3. Construct a canonical task ID for tracking.
// 4. Return the task to the client.

export const revalidate = 0;

const TASK_QUEUE_BLOB_STORE_NAME = 'pairwise-tasks-v2';
const TASK_INDEX_KEY = '_index';

export async function GET() {
  try {
    const store = getStore(TASK_QUEUE_BLOB_STORE_NAME);
    const taskIndex = await store.get(TASK_INDEX_KEY, { type: 'json' }) as string[] | undefined;

    if (!taskIndex || taskIndex.length === 0) {
      return NextResponse.json({ error: 'No comparison tasks are available in the index.' }, { status: 404 });
    }

    const randomIndex = Math.floor(Math.random() * taskIndex.length);
    const randomTaskId = taskIndex[randomIndex];

    if (!randomTaskId) {
        return NextResponse.json({ error: 'Failed to select a random task ID from the index.' }, { status: 500 });
    }

    const task = await store.get(randomTaskId, { type: 'json' }) as PairwiseTask | undefined;

    if (!task) {
        return NextResponse.json({ error: `Task object not found for ID: ${randomTaskId}. The index may be stale.` }, { status: 404 });
    }

    return NextResponse.json(task);

  } catch (error: any) {
    console.error(`[API /api/pairs/get-task] Error: ${error.message}`);
    return NextResponse.json(
      { error: 'An internal server error occurred while fetching a comparison task.' },
      { status: 500 }
    );
  }
} 