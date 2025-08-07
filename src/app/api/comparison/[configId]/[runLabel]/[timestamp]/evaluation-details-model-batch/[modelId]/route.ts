import { NextRequest, NextResponse } from 'next/server';
import { getResultByFileName } from '@/lib/storageService';
import { ComparisonDataV2 } from '@/app/utils/types';

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

    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    const fullData = (await getResultByFileName(configId, fileName)) as ComparisonDataV2 | null;

    if (!fullData) {
      return NextResponse.json({ error: 'Comparison data not found' }, { status: 404 });
    }

    const result: Record<string, any> = {};
    const scores = fullData.evaluationResults?.llmCoverageScores;
    if (scores) {
      for (const promptId in scores) {
        const detail = scores[promptId]?.[decodedModelId];
        if (detail) {
          result[promptId] = detail;
        }
      }
    }

    if (Object.keys(result).length === 0) {
      return NextResponse.json(
        { error: 'No evaluation results for the specified model' },
        { status: 404 },
      );
    }

    return NextResponse.json({ modelId: decodedModelId, evaluations: result });
  } catch (error) {
    console.error('[Evaluation Details Model Batch API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch evaluation details' },
      { status: 500 },
    );
  }
}

