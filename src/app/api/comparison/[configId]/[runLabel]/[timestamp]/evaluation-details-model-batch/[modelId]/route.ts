import { NextRequest, NextResponse } from 'next/server';
import { getCoreResult, getCoverageResult } from '@/lib/storageService';

/**
 * Batch endpoint: returns evaluation details for ALL prompts for a given model.
 * Used by ModelPerformanceModal to avoid making P×V single-detail calls.
 */
export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      configId: string;
      runLabel: string;
      timestamp: string;
      modelId: string;
    }>;
  }
) {
  try {
    const { configId, runLabel, timestamp, modelId } = await context.params;

    const decodedModelId = decodeURIComponent(modelId);

    const coreData = await getCoreResult(configId, runLabel, timestamp);
    if (!coreData || !Array.isArray(coreData.promptIds)) {
      return NextResponse.json({ error: 'Core data not found' }, { status: 404 });
    }

    const pLimit = (await import('@/lib/pLimit')).default;
    const limit = pLimit(8);
    const result: Record<string, any> = {};
    await Promise.all(
      coreData.promptIds.map((promptId: string) =>
        limit(async () => {
          const detail = await getCoverageResult(configId, runLabel, timestamp, promptId, decodedModelId);
          if (detail) result[promptId] = detail;
        })
      )
    );

    if (Object.keys(result).length === 0) {
      return NextResponse.json(
        { error: 'No evaluation results for the specified model' },
        { status: 404 },
      );
    }

    const res = NextResponse.json({ modelId: decodedModelId, evaluations: result });
    res.headers.set('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=600');
    return res;
  } catch (error) {
    console.error('[Evaluation Details Model Batch API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch evaluation details' },
      { status: 500 },
    );
  }
}

