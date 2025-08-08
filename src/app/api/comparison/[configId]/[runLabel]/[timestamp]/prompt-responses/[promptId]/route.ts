import { NextRequest, NextResponse } from 'next/server';
import { getPromptResponses } from '@/lib/storageService';


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

    // Fetch responses via artefact helper
    const responses = await getPromptResponses(configId, runLabel, timestamp, decodedPromptId);

    if (!responses) {
      return NextResponse.json(
        { error: 'Comparison data not found' },
        { status: 404 }
      );
    }

    const res = NextResponse.json({
      promptId: decodedPromptId,
      responses
    });
    res.headers.set('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=600');
    return res;

  } catch (error) {
    console.error('[Prompt Responses API] Error fetching prompt responses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompt responses' },
      { status: 500 }
    );
  }
}
