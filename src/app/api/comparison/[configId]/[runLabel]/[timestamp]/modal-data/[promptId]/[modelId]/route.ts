import { NextRequest, NextResponse } from 'next/server';
import { getPromptResponses, getResultByFileName, getCoreResult, getConversationHistory } from '@/lib/storageService';
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

    // Prefer prompt-level responses artefact for efficiency
    const promptResponses = await getPromptResponses(configId, runLabel, timestamp, decodedPromptId);
    let response: string | undefined;
    if (promptResponses) {
      response = promptResponses[decodedModelId];
    } else {
      // Fallback: legacy full comparison file
      const fileName = `${runLabel}_${timestamp}_comparison.json`;
      const fullData = await getResultByFileName(configId, fileName) as ComparisonDataV2;
      response = fullData?.allFinalAssistantResponses?.[decodedPromptId]?.[decodedModelId];
    }

    if (response === undefined) {
      return NextResponse.json(
        { error: 'Response not found for the specified prompt and model' },
        { status: 404 }
      );
    }

    // Try to fetch detailed conversation history if available for richer UI
    let history: any[] | undefined = undefined;
    try {
      await getCoreResult(configId, runLabel, timestamp); // warm cache / validate
      const h = await getConversationHistory(configId, runLabel, timestamp, decodedPromptId, decodedModelId);
      if (h && Array.isArray(h)) history = h;
    } catch {}

    const res = NextResponse.json({
      promptId: decodedPromptId,
      modelId: decodedModelId,
      response,
      history
    });
    res.headers.set('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=600');
    return res;

  } catch (error) {
    console.error('[Modal Data API] Error fetching modal data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch modal data' },
      { status: 500 }
    );
  }
}
