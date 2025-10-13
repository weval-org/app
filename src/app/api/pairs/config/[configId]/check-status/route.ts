import { NextRequest, NextResponse } from 'next/server';
import { getGenerationStatus, getConfigTaskCount, GenerationStatus } from '@/cli/services/pairwise-task-queue-service';

export const revalidate = 0;

interface CheckStatusResponse {
  hasTasks: boolean;
  taskCount: number;
  generationStatus: GenerationStatus | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
) {
  try {
    const { configId } = await params;
    console.log(`[check-status] Starting status check for configId: ${configId}`);

    if (!configId) {
      console.error('[check-status] No configId provided');
      return NextResponse.json(
        { error: 'configId is required' },
        { status: 400 }
      );
    }

    // Check if tasks exist for this config
    console.log(`[check-status] Counting tasks for configId: ${configId}`);
    const taskCount = await getConfigTaskCount(configId);
    const hasTasks = taskCount > 0;
    console.log(`[check-status] Found ${taskCount} tasks (hasTasks: ${hasTasks})`);

    // Get generation status if it exists
    console.log(`[check-status] Retrieving generation status for configId: ${configId}`);
    const generationStatus = await getGenerationStatus(configId);
    console.log(`[check-status] Generation status:`, generationStatus);

    const response: CheckStatusResponse = {
      hasTasks,
      taskCount,
      generationStatus,
    };

    console.log(`[check-status] Returning response:`, response);
    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[check-status] Error:', error.message);
    console.error('[check-status] Stack:', error.stack);
    return NextResponse.json(
      { error: 'An internal server error occurred while checking status.' },
      { status: 500 }
    );
  }
}
