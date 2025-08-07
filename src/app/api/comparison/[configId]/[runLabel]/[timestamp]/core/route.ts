import { NextRequest, NextResponse } from 'next/server';
import { getResultByFileName } from '@/lib/storageService';
import { ComparisonDataV2 } from '@/app/utils/types';

// Lightweight version of IndividualJudgement (no bulky reflection text)
interface CoreIndividualJudgement {
  judgeModelId: string;
  coverageExtent: number;
  // reflection removed - bulky text not needed for disagreement detection
}

// Lightweight version of PointAssessment for segments (no bulky text)
interface CorePointAssessment {
  coverageExtent: number;
  multiplier?: number;
  isInverted?: boolean;
  individualJudgements?: CoreIndividualJudgement[]; // For disagreement detection
  // keyPointText removed - bulky and not needed for segments
}

// Lightweight version of CoverageResult for core data
interface CoreCoverageResult {
  avgCoverageExtent: number;
  keyPointsCount?: number;
  judgeModelId: string;
  error?: string;
  pointAssessments?: CorePointAssessment[]; // Lightweight version for segments
}

type ComparisonDataCore = Omit<ComparisonDataV2, 'allFinalAssistantResponses' | 'fullConversationHistories' | 'evaluationResults'> & {
  allFinalAssistantResponses: Record<string, Record<string, null>>; // Structure preserved, but responses removed
  fullConversationHistories: Record<string, Record<string, null>>; // Structure preserved, but conversation histories removed
  evaluationResults: {
    llmCoverageScores: Record<string, Record<string, CoreCoverageResult>>;
    similarityMatrix: any; // Keep for dendrograms
    // perPromptSimilarities removed - only needed in specific prompt views
  };
};

/**
 * API endpoint that returns core comparison data without model response text.
 * This includes everything needed for MacroCoverageTable and AggregateAnalysisView
 * to render immediately, while excluding the large response text payloads.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ configId: string; runLabel: string; timestamp: string }> }
) {
  try {
    const { configId, runLabel, timestamp } = await context.params;

    // Fetch the full comparison data
    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    const fullData = await getResultByFileName(configId, fileName) as ComparisonDataV2;

    if (!fullData) {
      return NextResponse.json(
        { error: 'Comparison data not found' },
        { status: 404 }
      );
    }

    // Extract core data by removing response text and detailed evaluation data
    const coreData: ComparisonDataCore = {
      ...fullData,
      allFinalAssistantResponses: extractResponseStructure(fullData.allFinalAssistantResponses || {}),
      fullConversationHistories: extractResponseStructure(fullData.fullConversationHistories || {}),
      evaluationResults: {
        llmCoverageScores: extractCoreCoverageScores(fullData.evaluationResults?.llmCoverageScores || {}),
        similarityMatrix: fullData.evaluationResults?.similarityMatrix || {}
        // perPromptSimilarities intentionally removed
      }
    };

    return NextResponse.json(coreData);

  } catch (error) {
    console.error('[Core API] Error fetching core comparison data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch core comparison data' },
      { status: 500 }
    );
  }
}

/**
 * Converts response text to null while preserving the nested structure.
 * This maintains compatibility with existing code that checks for the presence
 * of promptId/modelId keys while removing the heavy response text.
 */
function extractResponseStructure(
  responses: Record<string, Record<string, any>>
): Record<string, Record<string, null>> {
  const structure: Record<string, Record<string, null>> = {};
  
  for (const promptId in responses) {
    structure[promptId] = {};
    for (const modelId in responses[promptId]) {
      structure[promptId][modelId] = null;
    }
  }
  
  return structure;
}

/**
 * Extracts only the essential coverage data needed for MacroCoverageTable,
 * including lightweight pointAssessments for segments but removing bulky text.
 */
function extractCoreCoverageScores(
  llmCoverageScores: Record<string, Record<string, any>>
): Record<string, Record<string, CoreCoverageResult>> {
  const coreScores: Record<string, Record<string, CoreCoverageResult>> = {};
  
  for (const promptId in llmCoverageScores) {
    coreScores[promptId] = {};
    for (const modelId in llmCoverageScores[promptId]) {
      const fullResult = llmCoverageScores[promptId][modelId];
      
      // Extract lightweight point assessments for segments (no text)
      let corePointAssessments: CorePointAssessment[] | undefined;
      if (fullResult.pointAssessments && Array.isArray(fullResult.pointAssessments)) {
        corePointAssessments = fullResult.pointAssessments.map((assessment: any) => {
          // Extract lightweight individual judgements (no reflection text)
          let coreIndividualJudgements: CoreIndividualJudgement[] | undefined;
          if (assessment.individualJudgements && Array.isArray(assessment.individualJudgements)) {
            coreIndividualJudgements = assessment.individualJudgements.map((judgement: any) => ({
              judgeModelId: judgement.judgeModelId,
              coverageExtent: judgement.coverageExtent
              // reflection intentionally omitted - bulky text not needed for disagreement detection
            }));
          }

          return {
            coverageExtent: assessment.coverageExtent,
            multiplier: assessment.multiplier,
            isInverted: assessment.isInverted,
            individualJudgements: coreIndividualJudgements
            // keyPointText intentionally omitted - bulky and not needed for segments
          };
        });
      }
      
      // Extract only the essential fields needed for table rendering
      coreScores[promptId][modelId] = {
        avgCoverageExtent: fullResult.avgCoverageExtent,
        keyPointsCount: fullResult.keyPointsCount,
        judgeModelId: fullResult.judgeModelId,
        error: fullResult.error,
        pointAssessments: corePointAssessments
      };
    }
  }
  
  return coreScores;
}
