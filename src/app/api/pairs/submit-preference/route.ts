import { NextResponse } from 'next/server';
import { getStore } from '@netlify/blobs';

// This is a placeholder implementation.
// In the future, this will:
// 1. Validate the incoming request body.
// 2. Connect to Netlify Blobs.
// 3. Generate a canonical key from the taskId or its components.
// 4. Append the new preference record to the value array for that key.
// 5. Implement user fingerprinting/identification for data quality.

interface PreferenceRecord {
  preference: 'A' | 'B' | 'Indifferent' | 'Unknown';
  reason?: string;
  userToken: string; // Placeholder for a future user fingerprint/ID
  timestamp: string;
  // Task metadata for analysis
  modelIdA?: string;
  modelIdB?: string;
  configId?: string;
  promptPreview?: string; // First 200 chars of prompt for quick reference
}

const PREFERENCES_BLOB_STORE_NAME = 'pairwise-preferences-v2';
const TASK_QUEUE_BLOB_STORE_NAME = 'pairwise-tasks-v2';

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const { taskId, preference, reason } = body;

    if (!taskId || !preference) {
      return NextResponse.json(
        { error: 'Missing required fields: taskId and preference.' },
        { status: 400 }
      );
    }

    // Fetch the task to get metadata
    const taskStore = getStore({
      name: TASK_QUEUE_BLOB_STORE_NAME,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    });
    const task = await taskStore.get(taskId, { type: 'json' }) as any;

    // Extract prompt preview
    let promptPreview = '';
    if (task?.prompt) {
      if (typeof task.prompt === 'string') {
        promptPreview = task.prompt.substring(0, 200);
      } else if (task.prompt.messages?.length > 0) {
        promptPreview = task.prompt.messages[0].content?.substring(0, 200) || '';
      }
    }

    // In a real app, this would come from a fingerprinting service or session
    const userToken = `user_${Math.random().toString(36).substring(2, 10)}`;

    const newRecord: PreferenceRecord = {
      preference,
      reason: reason || undefined,
      userToken,
      timestamp: new Date().toISOString(),
      modelIdA: task?.modelIdA,
      modelIdB: task?.modelIdB,
      configId: task?.configId,
      promptPreview,
    };

    const store = getStore({
      name: PREFERENCES_BLOB_STORE_NAME,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    });
    
    // Get existing records for this task, or start a new array
    const existingRecords = await store.get(taskId, { type: 'json' }) as PreferenceRecord[] | undefined || [];
    
    // Append the new record
    const updatedRecords = [...existingRecords, newRecord];

    // Save the updated array back to the store
    await store.setJSON(taskId, updatedRecords);
    
    console.log(`[API /api/pairs/submit-preference] Preference recorded for taskId: ${taskId}. Total records: ${updatedRecords.length}`);

    return NextResponse.json({
      message: 'Preference submitted successfully.',
      recordsSaved: updatedRecords.length,
    });

  } catch (error: any) {
    console.error(`[API /api/pairs/submit-preference] Error: ${error.message}`);
    return NextResponse.json(
      { error: 'An internal server error occurred while submitting the preference.' },
      { status: 500 }
    );
  }
} 