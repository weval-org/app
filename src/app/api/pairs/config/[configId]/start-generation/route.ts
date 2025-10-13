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
      return NextResponse.json({
        status: existingStatus.status,
        message: 'Generation is already in progress for this config.',
        generationStatus: existingStatus,
      });
    }

    // Set initial status to pending
    await updateGenerationStatus(configId, {
      status: 'pending',
      message: 'Generation job queued.',
      timestamp: new Date().toISOString(),
    });

    // Trigger the background function
    const functionUrl = new URL(
      '/.netlify/functions/generate-pairs-background',
      process.env.URL || 'http://localhost:8888'
    );

    fetch(functionUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configId }),
    }).catch(err => {
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
