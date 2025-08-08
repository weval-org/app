import { NextRequest, NextResponse } from 'next/server';
import { getPromptResponses, getCoreResult } from '@/lib/storageService';

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

    // Load core data to know available promptIds
    const coreData = await getCoreResult(configId, runLabel, timestamp);
    if (!coreData || !Array.isArray(coreData.promptIds)) {
      return NextResponse.json({ error: 'Core data not found' }, { status: 404 });
    }

    const modelResponses: Record<string, string> = {};
    for (const promptId of coreData.promptIds) {
      const promptResponses = await getPromptResponses(configId, runLabel, timestamp, promptId);
      if (promptResponses && promptResponses[decodedModelId] !== undefined) {
        modelResponses[promptId] = promptResponses[decodedModelId];
      }
    }

    if (Object.keys(modelResponses).length === 0) {
      return NextResponse.json(
        { error: 'No responses found for the specified model' },
        { status: 404 }
      );
    }

    const res = NextResponse.json({
      modelId: decodedModelId,
      responses: modelResponses
    });
    res.headers.set('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=600');
    return res;

  } catch (error) {
    console.error('[Model Responses API] Error fetching model responses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch model responses' },
      { status: 500 }
    );
  }
}
