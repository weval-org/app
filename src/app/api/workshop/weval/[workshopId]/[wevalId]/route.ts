import { NextRequest, NextResponse } from 'next/server';
import { getJsonFile } from '@/lib/storageService';
import { WorkshopPaths } from '@/lib/workshop-utils';
import { getLogger } from '@/utils/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workshopId: string; wevalId: string }> }
) {
  const logger = await getLogger('workshop:weval:view');

  try {
    const { workshopId, wevalId } = await params;

    // Fetch the weval
    const wevalPath = WorkshopPaths.weval(workshopId, wevalId);
    const weval = await getJsonFile<{
      wevalId: string;
      workshopId: string;
      sessionId: string;
      blueprint: any;
      authorName: string;
      description: string;
      inGallery: boolean;
      executionRunId: string | null;
      executionStatus: string;
      createdAt: string;
    }>(wevalPath);

    if (!weval) {
      return NextResponse.json(
        { error: 'Weval not found' },
        { status: 404 }
      );
    }

    // If there's an execution, fetch its status/results
    let executionData = null;
    if (weval.executionRunId) {
      try {
        const statusRes = await fetch(
          `${request.nextUrl.origin}/api/workshop/weval/status/${workshopId}/${wevalId}`
        );

        if (statusRes.ok) {
          executionData = await statusRes.json();
        } else if (statusRes.status === 202) {
          // Status file not yet created, execution is initializing
          executionData = { status: 'pending', message: 'Execution is initializing...' };
        }
      } catch (error: any) {
        logger.warn(`[workshop:weval:view] Failed to fetch execution status: ${error.message}`);
      }
    }

    // Return weval data with execution info
    return NextResponse.json({
      weval: {
        wevalId: weval.wevalId,
        workshopId: weval.workshopId,
        sessionId: weval.sessionId,
        blueprint: weval.blueprint,
        authorName: weval.authorName,
        description: weval.description,
        inGallery: weval.inGallery,
        executionRunId: weval.executionRunId,
        executionStatus: weval.executionStatus,
        createdAt: weval.createdAt,
      },
      execution: executionData,
    });
  } catch (error: any) {
    logger.error(`[workshop:weval:view] Error: ${error.message}`);

    return NextResponse.json(
      { error: 'Failed to load weval' },
      { status: 500 }
    );
  }
}
