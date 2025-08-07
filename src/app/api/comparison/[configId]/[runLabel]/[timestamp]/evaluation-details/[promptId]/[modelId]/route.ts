import { NextRequest, NextResponse } from 'next/server';
import { getResultByFileName } from '@/lib/storageService';
import { ComparisonDataV2 } from '@/app/utils/types';

/**
 * API endpoint that returns full evaluation details for a specific prompt+model combination.
 * This includes complete pointAssessments with keyPointText, individual judgements with reflection text,
 * and all other detailed evaluation data needed by SpecificEvaluationModal.
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

    // Extract the specific evaluation result with full detail
    const evaluationResult = fullData.evaluationResults?.llmCoverageScores?.[decodedPromptId]?.[decodedModelId];

    if (!evaluationResult) {
      return NextResponse.json(
        { error: 'Evaluation result not found for the specified prompt and model' },
        { status: 404 }
      );
    }

    // Return the complete evaluation result including:
    // - pointAssessments with keyPointText, reflection, individualJudgements with full reflection text
    // - All detailed evaluation data needed by the modal
    return NextResponse.json({
      promptId: decodedPromptId,
      modelId: decodedModelId,
      evaluationResult: evaluationResult
    });

  } catch (error) {
    console.error('[Evaluation Details API] Error fetching evaluation details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch evaluation details' },
      { status: 500 }
    );
  }
}
