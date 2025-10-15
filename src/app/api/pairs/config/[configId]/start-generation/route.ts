import { NextRequest, NextResponse } from 'next/server';
import { getLogger } from '@/utils/logger';
import { getGenerationStatus, updateGenerationStatus } from '@/cli/services/pairwise-task-queue-service';

export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
) {
  const logger = await getLogger('pairs:start-generation');
  const { configId } = await params;

  try {
    if (!configId) {
      return NextResponse.json(
        { error: 'configId is required' },
        { status: 400 }
      );
    }

    // Check if generation is already in progress
    const existingStatus = await getGenerationStatus(configId);
    if (existingStatus && (existingStatus.status === 'generating' || existingStatus.status === 'pending')) {
      // Check if status is stale (more than 5 minutes old)
      const statusAge = Date.now() - new Date(existingStatus.timestamp).getTime();
      const fiveMinutes = 5 * 60 * 1000;

      if (statusAge > fiveMinutes) {
        logger.warn(`Found stale ${existingStatus.status} status from ${existingStatus.timestamp} (${Math.round(statusAge / 1000)}s ago). Allowing retry.`);
      } else {
        logger.info(`Generation already in progress (status: ${existingStatus.status}, age: ${Math.round(statusAge / 1000)}s). Blocking duplicate request.`);
        return NextResponse.json({
          status: existingStatus.status,
          message: 'Generation is already in progress for this config.',
          generationStatus: existingStatus,
        });
      }
    }

    // Set initial status to pending
    await updateGenerationStatus(configId, {
      status: 'pending',
      message: 'Generation job queued.',
      timestamp: new Date().toISOString(),
    });

    // Trigger the background function
    const baseUrl = process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8888';
    const functionUrl = new URL(
      '/.netlify/functions/generate-pairs-background',
      baseUrl
    );

    logger.info(`Invoking background function at: ${functionUrl.toString()}`);
    logger.info(`Base URL (process.env.URL): ${process.env.URL}`);
    logger.info(`Sending body:`, { configId });

    fetch(functionUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configId }),
    })
      .then(async (response) => {
        logger.info(`Background function response status: ${response.status}`);
        const text = await response.text();
        logger.info(`Background function response body: ${text}`);
      })
      .catch(err => {
        logger.error(`Failed to invoke background function for configId ${configId}:`, err);
      });

    return NextResponse.json({
      status: 'pending',
      message: 'Pair generation started successfully.',
      configId,
    });

  } catch (error: any) {
    logger.error(`Failed to start pair generation for ${configId}: ${error.message}`);
    return NextResponse.json(
      { error: 'Failed to start pair generation.', details: error.message },
      { status: 500 }
    );
  }
}
