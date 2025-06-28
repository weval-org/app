import type { BackgroundHandler } from '@netlify/functions';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as yaml from 'js-yaml';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';
import { generateAllResponses } from '@/cli/services/comparison-pipeline-service.non-stream';
import { EmbeddingEvaluator } from '@/cli/evaluators/embedding-evaluator';
import { LLMCoverageEvaluator } from '@/cli/evaluators/llm-coverage-evaluator';
import { ComparisonConfig, FinalComparisonOutputV2, IDEAL_MODEL_ID, EvaluationMethod, PromptResponseData, EvaluationInput } from '@/cli/types/cli_types';
import { toSafeTimestamp } from '@/lib/timestampUtils';
import { generateExecutiveSummary } from '@/cli/services/executive-summary-service';
import { ConversationMessage } from '@/types/shared';

const PLAYGROUND_TEMP_DIR = 'playground';

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

const streamToString = (stream: Readable): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });

const logger = {
  info: (message: string) => console.log(`[Playground Pipeline] [INFO] ${message}`),
  warn: (message: string) => console.warn(`[Playground Pipeline] [WARN] ${message}`),
  error: (message: string) => console.error(`[Playground Pipeline] [ERROR] ${message}`),
  success: (message: string) => console.log(`[Playground Pipeline] [SUCCESS] ${message}`),
};
type PlaygroundLogger = typeof logger;

const updateStatus = async (runId: string, status: string, message: string, extraData: object = {}) => {
  logger.info(`Updating status for ${runId}: ${status} - ${message}`);
  const statusKey = `${PLAYGROUND_TEMP_DIR}/runs/${runId}/status.json`;
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.APP_S3_BUCKET_NAME!,
    Key: statusKey,
    Body: JSON.stringify({ status, message, ...extraData }),
    ContentType: 'application/json',
  }));
};

export const handler: BackgroundHandler = async (event) => {
  const body = event.body ? JSON.parse(event.body) : {};
  const { runId, blueprintKey } = body;

  if (!runId || !blueprintKey) {
    logger.error('Missing runId or blueprintKey in invocation.');
    return;
  }

  try {
    await updateStatus(runId, 'pending', 'Fetching blueprint...');

    const blueprintContent = await streamToString(
      (await s3Client.send(new GetObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: blueprintKey,
      }))).Body as Readable
    );
    const config = parseAndNormalizeBlueprint(blueprintContent, 'yaml');

    await updateStatus(runId, 'generating_responses', 'Generating model responses...');
    
    const generationProgressCallback = async (completed: number, total: number) => {
        await updateStatus(runId, 'generating_responses', 'Generating model responses...', {
            progress: { completed, total },
        });
    };

    const allResponsesMap = await generateAllResponses(config, logger, true, generationProgressCallback);

    await updateStatus(runId, 'evaluating', 'Running evaluations...');
    
    const embeddingEval = new EmbeddingEvaluator(logger);
    const coverageEval = new LLMCoverageEvaluator(logger, false);

    const evaluationResults: Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>> = {};
    const evalMethods = config.evaluationConfig ? Object.keys(config.evaluationConfig) as EvaluationMethod[] : [];

    // Calculate effective model IDs for the entire run
    const effectiveModelIdsSet = new Set<string>();
    for (const promptData of allResponsesMap.values()) {
        if (promptData.idealResponseText) {
            effectiveModelIdsSet.add(IDEAL_MODEL_ID);
        }
        for (const modelId of Object.keys(promptData.modelResponses)) {
            effectiveModelIdsSet.add(modelId);
        }
    }
    const effectiveModelIds = Array.from(effectiveModelIdsSet).sort();

    // Evaluators expect an array of EvaluationInput
    const evaluationInputs: EvaluationInput[] = [];

    for (const promptData of allResponsesMap.values()) {
        const modelIdsForThisPrompt = Object.keys(promptData.modelResponses);
        evaluationInputs.push({
            promptData: promptData,
            config: config,
            effectiveModelIds: modelIdsForThisPrompt
        });
    }
    
    let totalEvalTasks = 0;
    if (evalMethods.includes('embedding')) {
        // Total embeddings to generate
        totalEvalTasks += evaluationInputs.reduce((sum, input) => {
            let count = Object.keys(input.promptData.modelResponses).length;
            if (input.promptData.idealResponseText) count++;
            return sum + count;
        }, 0);
    }
     if (evalMethods.includes('llm-coverage')) {
        // Total model responses to judge
        totalEvalTasks += evaluationInputs.reduce((sum, input) => sum + Object.keys(input.promptData.modelResponses).length, 0);
    }
    let completedEvalTasks = 0;

    const evaluationProgressCallback = async (completedInStep: number, totalInStep: number) => {
        // Note: This callback will be called by each evaluator separately.
        // We need a way to track overall progress if they run sequentially.
        // For now, we just pass the progress from the current step.
         await updateStatus(runId, 'evaluating', 'Running evaluations...', {
            progress: { completed: completedInStep, total: totalInStep },
        });
    };

    if (evalMethods.includes('embedding')) {
        const result = await embeddingEval.evaluate(evaluationInputs, evaluationProgressCallback);
        evaluationResults.similarityMatrix = result.similarityMatrix;
        evaluationResults.perPromptSimilarities = result.perPromptSimilarities;
    }

    if (evalMethods.includes('llm-coverage')) {
        const result = await coverageEval.evaluate(evaluationInputs, evaluationProgressCallback);
        evaluationResults.llmCoverageScores = result.llmCoverageScores;
        evaluationResults.extractedKeyPoints = result.extractedKeyPoints;
    }
    
    await updateStatus(runId, 'saving', 'Aggregating and saving results...');

    const { data: finalOutput } = await aggregatePlaygroundResult(
        config,
        'playground-run',
        allResponsesMap,
        evaluationResults,
        evalMethods,
        logger
    );

    const resultKey = `${PLAYGROUND_TEMP_DIR}/runs/${runId}/_comparison.json`;
    await s3Client.send(new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: resultKey,
        Body: JSON.stringify(finalOutput, null, 2),
        ContentType: 'application/json',
    }));

    await updateStatus(runId, 'complete', 'Run finished!', { resultUrl: `/playground/results/${runId}` });

  } catch (error: any) {
    logger.error(`Pipeline failed for runId ${runId}: ${error.message}`);
    await updateStatus(runId, 'error', 'An error occurred during the evaluation.', { details: error.message });
  }
};

async function aggregatePlaygroundResult(
    config: ComparisonConfig,
    runLabel: string,
    allResponsesMap: Map<string, PromptResponseData>,
    evaluationResults: Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>,
    evalMethodsUsed: EvaluationMethod[],
    logger: PlaygroundLogger,
): Promise<{ data: FinalComparisonOutputV2 }> {
    const promptIds = Array.from(allResponsesMap.keys());
    const effectiveModelsSet = new Set<string>();
    const allFinalAssistantResponses: Record<string, Record<string, string>> = {};
    const promptContexts: Record<string, string | ConversationMessage[]> = {};
    const hasAnyIdeal = config.prompts.some(p => p.idealResponse);

    // This is a fully-formed default object.
    const defaultOutput: FinalComparisonOutputV2 = {
        configId: config.id!,
        configTitle: config.title!,
        runLabel,
        timestamp: toSafeTimestamp(new Date().toISOString()),
        config,
        evalMethodsUsed: [],
        effectiveModels: [],
        promptIds: [],
        promptContexts: {},
        allFinalAssistantResponses: {},
        evaluationResults: {
            similarityMatrix: undefined,
            perPromptSimilarities: {},
            llmCoverageScores: {},
        },
        extractedKeyPoints: {},
        executiveSummary: undefined,
    };

    for (const [promptId, promptData] of allResponsesMap.entries()) {
        allFinalAssistantResponses[promptId] = {};
        promptContexts[promptId] = promptData.initialMessages || [];
        if (promptData.idealResponseText) {
            allFinalAssistantResponses[promptId][IDEAL_MODEL_ID] = promptData.idealResponseText;
        }
        for (const [effectiveModelId, responseData] of Object.entries(promptData.modelResponses)) {
            effectiveModelsSet.add(effectiveModelId);
            allFinalAssistantResponses[promptId][effectiveModelId] = responseData.finalAssistantResponseText;
        }
    }
     if (hasAnyIdeal) {
        effectiveModelsSet.add(IDEAL_MODEL_ID);
    }
    const effectiveModels = Array.from(effectiveModelsSet).sort();

    // We merge the real data into the default object structure.
    const finalOutput: FinalComparisonOutputV2 = {
        ...defaultOutput,
        evalMethodsUsed,
        effectiveModels,
        promptIds: promptIds.sort(),
        promptContexts, 
        allFinalAssistantResponses,
        evaluationResults: {
            similarityMatrix: evaluationResults.similarityMatrix,
            perPromptSimilarities: evaluationResults.perPromptSimilarities,
            llmCoverageScores: evaluationResults.llmCoverageScores,
        },
        extractedKeyPoints: evaluationResults.extractedKeyPoints,
    };
    
    const summaryResult = await generateExecutiveSummary(finalOutput, logger);
    if (summaryResult && !('error' in summaryResult)) {
      finalOutput.executiveSummary = summaryResult;
    }

    return { data: finalOutput };
}
