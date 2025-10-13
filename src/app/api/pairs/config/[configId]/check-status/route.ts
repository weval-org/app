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

    if (!configId) {
      return NextResponse.json(
        { error: 'configId is required' },
        { status: 400 }
      );
    }

    // Check if tasks exist for this config
    const taskCount = await getConfigTaskCount(configId);
    const hasTasks = taskCount > 0;

    // Get generation status if it exists
    const generationStatus = await getGenerationStatus(configId);

    const response: CheckStatusResponse = {
      hasTasks,
      taskCount,
      generationStatus,
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[API /pairs/config/[configId]/check-status] Error:', error.message);
    return NextResponse.json(
      { error: 'An internal server error occurred while checking status.' },
      { status: 500 }
    );
  }
}
