import { NextRequest, NextResponse } from 'next/server';
import { getResultByFileName } from '@/lib/storageService';
import { ComparisonDataV2 } from '@/app/utils/types';

/**
 * Batch endpoint: returns evaluation details for ALL models for a given prompt.
 * This avoids one request per model from the client.
 */
export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      configId: string;
      runLabel: string;
      timestamp: string;
      promptId: string;
    }>;
  }
) {
  try {
    const { configId, runLabel, timestamp, promptId } = await context.params;

    const decodedPromptId = decodeURIComponent(promptId);

    // Filename convention matches single-detail route
    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    const fullData = (await getResultByFileName(configId, fileName)) as ComparisonDataV2 | null;

    if (!fullData) {
      return NextResponse.json({ error: 'Comparison data not found' }, { status: 404 });
    }

    const evaluationsForPrompt =
      fullData.evaluationResults?.llmCoverageScores?.[decodedPromptId] ?? null;

    if (!evaluationsForPrompt) {
      return NextResponse.json(
        { error: 'No evaluation results for the specified prompt' },
        { status: 404 }
      );
    }

    return NextResponse.json({ promptId: decodedPromptId, evaluations: evaluationsForPrompt });
  } catch (error) {
    console.error('[Evaluation Details Batch API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch batch evaluation details' }, { status: 500 });
  }
}

