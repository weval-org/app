import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';
import type { PairwiseTask } from '@/cli/services/pairwise-task-queue-service';

export const revalidate = 0;

const TASK_QUEUE_BLOB_STORE_NAME = 'pairwise-tasks-v2';
const TASK_INDEX_KEY = '_index';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
) {
  try {
    const { configId } = await params;

    if (!configId) {
      return NextResponse.json(
        { error: 'configId is required' },
        { status: 400 }
      );
    }

    const store = getStore(TASK_QUEUE_BLOB_STORE_NAME);
    const taskIndex = await store.get(TASK_INDEX_KEY, { type: 'json' }) as string[] | undefined;

    if (!taskIndex || taskIndex.length === 0) {
      return NextResponse.json(
        { error: 'No comparison tasks are available in the index.' },
        { status: 404 }
      );
    }

    // Filter tasks by configId
    const matchingTaskIds: string[] = [];
    for (const taskId of taskIndex) {
      const task = await store.get(taskId, { type: 'json' }) as PairwiseTask | undefined;
      if (task && task.configId === configId) {
        matchingTaskIds.push(taskId);
      }
    }

    if (matchingTaskIds.length === 0) {
      return NextResponse.json(
        { error: `No comparison tasks found for config: ${configId}` },
        { status: 404 }
      );
    }

    // Select a random task from the filtered list
    const randomIndex = Math.floor(Math.random() * matchingTaskIds.length);
    const randomTaskId = matchingTaskIds[randomIndex];

    const task = await store.get(randomTaskId, { type: 'json' }) as PairwiseTask | undefined;

    if (!task) {
      return NextResponse.json(
        { error: `Task object not found for ID: ${randomTaskId}. The index may be stale.` },
        { status: 404 }
      );
    }

    return NextResponse.json(task);

  } catch (error: any) {
    console.error('[API /pairs/config/[configId]/get-task] Error:', error.message);
    return NextResponse.json(
      { error: 'An internal server error occurred while fetching a comparison task.' },
      { status: 500 }
    );
  }
}
