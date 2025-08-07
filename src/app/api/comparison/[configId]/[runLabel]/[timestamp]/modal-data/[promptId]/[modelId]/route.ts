import { NextRequest, NextResponse } from 'next/server';
import { getResultByFileName } from '@/lib/storageService';
import { ComparisonDataV2 } from '@/app/utils/types';

/**
 * API endpoint that returns specific model response data for a single prompt+model combination.
 * This is used by SpecificEvaluationModal when a user clicks a table cell.
 */
export async function GET(
  request: NextRequest,
  context: { 
    params: Promise<{ 
      configId: string; 
      runLabel: string; 
      timestamp: string;
      promptId: string;
      modelId: string;
    }> 
  }
) {
  try {
    const { configId, runLabel, timestamp, promptId, modelId } = await context.params;

    // Decode URL-encoded parameters
    const decodedPromptId = decodeURIComponent(promptId);
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

    // Extract the specific response
    const response = fullData.allFinalAssistantResponses?.[decodedPromptId]?.[decodedModelId];

    if (response === undefined) {
      return NextResponse.json(
        { error: 'Response not found for the specified prompt and model' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      promptId: decodedPromptId,
      modelId: decodedModelId,
      response: response
    });

  } catch (error) {
    console.error('[Modal Data API] Error fetching modal data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch modal data' },
      { status: 500 }
    );
  }
}
