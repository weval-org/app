import { NextRequest, NextResponse } from 'next/server';
import { getCoreResult, getCoverageResult } from '@/lib/storageService';

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

    // Load core to identify models
    const coreData = await getCoreResult(configId, runLabel, timestamp);
    if (!coreData || !Array.isArray(coreData.effectiveModels)) {
      return NextResponse.json({ error: 'Core data not found' }, { status: 404 });
    }

    const pLimit = (await import('@/lib/pLimit')).default;
    const limit = pLimit(8);
    const evaluations: Record<string, any> = {};
    await Promise.all(
      coreData.effectiveModels.map((modelId: string) =>
        limit(async () => {
          const cov = await getCoverageResult(configId, runLabel, timestamp, decodedPromptId, modelId);
          if (cov) evaluations[modelId] = cov;
        })
      )
    );

    if (Object.keys(evaluations).length === 0) {
      return NextResponse.json({ error: 'No evaluation results for the specified prompt' }, { status: 404 });
    }

    const res = NextResponse.json({ promptId: decodedPromptId, evaluations });
    res.headers.set('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=600');
    return res;
  } catch (error) {
    console.error('[Evaluation Details Batch API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch batch evaluation details' }, { status: 500 });
  }
}

