import { NextRequest, NextResponse } from 'next/server';
import { getResultByFileName } from '@/lib/storageService';
import { ComparisonDataV2 } from '@/app/utils/types';

/**
 * API endpoint that returns all response data for a specific model across all prompts.
 * This is used by ModelPerformanceModal when a user clicks on a model header.
 */
export async function GET(
  request: NextRequest,
  context: { 
    params: Promise<{ 
      configId: string; 
      runLabel: string; 
      timestamp: string;
      modelId: string;
    }> 
  }
) {
  try {
    const { configId, runLabel, timestamp, modelId } = await context.params;

    // Decode URL-encoded parameter
    const decodedModelId = decodeURIComponent(modelId);

    // Fetch the full comparison data
    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    const fullData = await getResultByFileName(configId, fileName) as ComparisonDataV2;

    if (!fullData) {
      return NextResponse.json(
        { error: 'Comparison data not found' },
        { status: 404 }
      );
    }

    // Extract all responses for this model across all prompts
    const modelResponses: Record<string, string> = {};

    for (const promptId in fullData.allFinalAssistantResponses) {
      const response = fullData.allFinalAssistantResponses[promptId][decodedModelId];
      if (response !== undefined) {
        modelResponses[promptId] = response;
      }
    }

    if (Object.keys(modelResponses).length === 0) {
      return NextResponse.json(
        { error: 'No responses found for the specified model' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      modelId: decodedModelId,
      responses: modelResponses
    });

  } catch (error) {
    console.error('[Model Responses API] Error fetching model responses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch model responses' },
      { status: 500 }
    );
  }
}
