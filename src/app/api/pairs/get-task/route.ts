import { NextResponse } from 'next/server';
import type { PairwiseTask } from '@/cli/services/pairwise-task-queue-service';
import { getStore } from '@/lib/blob-store';

export const revalidate = 0;

const TASK_QUEUE_BLOB_STORE_NAME = 'pairwise-tasks-v2';
const TASK_INDEX_KEY = '_index';

export async function GET() {
  try {
    const store = getStore({ name: TASK_QUEUE_BLOB_STORE_NAME });
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
