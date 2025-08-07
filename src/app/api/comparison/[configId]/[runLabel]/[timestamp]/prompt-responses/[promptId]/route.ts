import { NextRequest, NextResponse } from 'next/server';
import { getResultByFileName } from '@/lib/storageService';
import { ComparisonDataV2 } from '@/app/utils/types';

/**
 * API endpoint that returns all response data for a specific prompt across all models.
 * This is used by PromptPerformanceModal when a user clicks on a prompt row.
 */
export async function GET(
  request: NextRequest,
  context: { 
    params: Promise<{ 
      configId: string; 
      runLabel: string; 
      timestamp: string;
      promptId: string;
    }> 
  }
) {
  try {
    const { configId, runLabel, timestamp, promptId } = await context.params;

    // Decode URL-encoded parameter
    const decodedPromptId = decodeURIComponent(promptId);

    // Fetch the full comparison data
    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    const fullData = await getResultByFileName(configId, fileName) as ComparisonDataV2;

    if (!fullData) {
      return NextResponse.json(
        { error: 'Comparison data not found' },
        { status: 404 }
      );
    }

    // Extract all responses for this prompt across all models
    const promptResponses = fullData.allFinalAssistantResponses?.[decodedPromptId];

    if (!promptResponses) {
      return NextResponse.json(
        { error: 'No responses found for the specified prompt' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      promptId: decodedPromptId,
      responses: promptResponses
    });

  } catch (error) {
    console.error('[Prompt Responses API] Error fetching prompt responses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompt responses' },
      { status: 500 }
    );
  }
}
