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
  preference: 'A' | 'B' | 'Indifferent';
  reason?: string;
  userToken: string; // Placeholder for a future user fingerprint/ID
  timestamp: string;
}

const PREFERENCES_BLOB_STORE_NAME = 'pairwise-preferences-v2';
const DEV_API_ENDPOINT = 'https://dev--weval-dev.netlify.app/api/pairs/submit-preference';

export async function POST(request: Request) {
  const body = await request.json();

  // In development, proxy the request to the deployed dev environment
  if (process.env.NODE_ENV === 'development') {
    try {
      console.log(`[API /submit-preference] Development mode: Proxying request to ${DEV_API_ENDPOINT}`);
      const response = await fetch(DEV_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json(data, { status: response.status });
      }
      return NextResponse.json(data);
    } catch (error: any) {
      console.error(`[API /submit-preference] Error proxying request: ${error.message}`);
      return NextResponse.json({ error: 'Failed to proxy preference submission to dev environment.' }, { status: 500 });
    }
  }

  // Production logic
  try {
    const { taskId, preference, reason } = body;

    if (!taskId || !preference) {
      return NextResponse.json(
        { error: 'Missing required fields: taskId and preference.' },
        { status: 400 }
      );
    }
    
    // In a real app, this would come from a fingerprinting service or session
    const userToken = `user_${Math.random().toString(36).substring(2, 10)}`;

    const newRecord: PreferenceRecord = {
      preference,
      reason: reason || undefined,
      userToken,
      timestamp: new Date().toISOString(),
    };

    const store = getStore(PREFERENCES_BLOB_STORE_NAME);
    
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