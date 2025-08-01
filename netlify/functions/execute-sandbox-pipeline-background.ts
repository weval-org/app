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
import { generateExecutiveSummary as generateExecutiveSummary } from '@/cli/services/executive-summary-service';
import { ConversationMessage } from '@/types/shared';
import { normalizeTag } from '@/app/utils/tagUtils';
import { configure } from '@/cli/config';
import { CustomModelDefinition } from '@/lib/llm-clients/types';
import { registerCustomModels } from '@/lib/llm-clients/client-dispatcher';

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
  info: (message: string) => console.log(`[Sandbox Pipeline] [INFO] ${message}`),
  warn: (message: string) => console.warn(`[Sandbox Pipeline] [WARN] ${message}`),
  error: (message: string) => console.error(`[Sandbox Pipeline] [ERROR] ${message}`),
  success: (message: string) => console.log(`[Sandbox Pipeline] [SUCCESS] ${message}`),
};
type SandboxLogger = typeof logger;

const getStatusUpdater = (runId: string, sandboxVersion: 'v1' | 'v2' = 'v1') => {
  const directory = sandboxVersion === 'v2' ? 'live/sandbox' : 'live/sandbox';
  return async (status: string, message: string, extraData: object = {}) => {
    logger.info(`Updating status for ${runId} (v: ${sandboxVersion}): ${status} - ${message}`);
    const statusKey = `${directory}/runs/${runId}/status.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: statusKey,
      Body: JSON.stringify({ status, message, ...extraData }),
      ContentType: 'application/json',
    }));
  };
};

export const handler: BackgroundHandler = async (event) => {
  const body = event.body ? JSON.parse(event.body) : {};
  const { runId, blueprintKey, sandboxVersion } = body;
  
  // Configure CLI before any CLI services are used
  configure({
    errorHandler: (error: Error) => {
      logger.error(`[Sandbox Pipeline] CLI Error: ${error.message}`);
    },
    logger: {
      info: (msg: string) => logger.info(msg),
      warn: (msg: string) => logger.warn(msg), 
      error: (msg: string) => logger.error(msg),
      success: (msg: string) => logger.success(msg),
    }
  });
  
  logger.info(`[Sandbox Pipeline] CLI configured for runId: ${runId}`);
  
  const updateStatus = getStatusUpdater(runId, sandboxVersion);
  const directory = sandboxVersion === 'v2' ? 'live/sandbox' : 'live/sandbox';

  if (!runId || !blueprintKey) {
    logger.error('Missing runId or blueprintKey in invocation.');
    return;
  }

  try {
    await updateStatus('pending', 'Fetching blueprint...');

    const blueprintContent = await streamToString(
      (await s3Client.send(new GetObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: blueprintKey,
      }))).Body as Readable
    );
    const config = parseAndNormalizeBlueprint(blueprintContent, 'yaml');

    // --- Custom Model Registration ---
    const customModelDefs = config.models?.filter(m => typeof m === 'object') as CustomModelDefinition[] || [];
    if (customModelDefs.length > 0) {
        registerCustomModels(customModelDefs);
        logger.info(`Registered ${customModelDefs.length} custom model definitions.`);
    }
    // --- End Custom Model Registration ---

    // --- Sanitize System Prompts (mirroring run-config logic) ---
    // If 'system' is an array, treat it as the 'systems' permutation array.
    if (Array.isArray(config.system)) {
        if (config.systems && config.systems.length > 0) {
            logger.warn(`Both 'system' (as an array) and 'systems' are defined. Using 'systems' and ignoring the array in 'system'.`);
        } else {
            logger.info(`Found 'system' field is an array. Treating it as the 'systems' array for permutation.`);
            config.systems = config.system;
        }
        // Unset 'system' to avoid conflicts.
        config.system = undefined;
    }
    // --- End Sanitize System Prompts ---

    // --- NORMALIZE TAGS ---
    if (config.tags) {
        const originalTags = [...config.tags];
        const normalizedTags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
        config.tags = normalizedTags;
    }
    // --- END NORMALIZE TAGS ---

    await updateStatus('generating_responses', 'Generating model responses...');
    
    logger.info(`[Sandbox Pipeline] About to generate responses for models: ${config.models?.join(', ')}`);
    
    const generationProgressCallback = async (completed: number, total: number) => {
        await updateStatus('generating_responses', 'Generating model responses...', {
            progress: { completed, total },
        });
    };

    logger.info(`[Sandbox Pipeline] Calling generateAllResponses with ${config.prompts?.length} prompts and ${config.models?.length} models`);
    const allResponsesMap = await generateAllResponses(config, logger, true, generationProgressCallback);
    logger.info(`[Sandbox Pipeline] generateAllResponses completed, got ${allResponsesMap.size} prompt responses`);

    await updateStatus('evaluating', 'Running evaluations...');
    
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
         await updateStatus('evaluating', 'Running evaluations...', {
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
    
    await updateStatus('saving', 'Aggregating and saving results...');

    const { data: finalOutput } = await aggregateSandboxResult(
        config,
        'sandbox-run',
        allResponsesMap,
        evaluationResults,
        evalMethods,
        logger
    );

    const resultKey = `${directory}/runs/${runId}/_comparison.json`;
    await s3Client.send(new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: resultKey,
        Body: JSON.stringify(finalOutput, null, 2),
        ContentType: 'application/json',
    }));

    const resultUrl = `/sandbox/results/${runId}`;
    await updateStatus('complete', 'Run finished!', { resultUrl });

  } catch (error: any) {
    logger.error(`Pipeline failed for runId ${runId}: ${error.message}`);
    await updateStatus('error', 'An error occurred during the evaluation.', { details: error.message });
  }
};

async function aggregateSandboxResult(
    config: ComparisonConfig,
    runLabel: string,
    allResponsesMap: Map<string, PromptResponseData>,
    evaluationResults: Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>,
    evalMethodsUsed: EvaluationMethod[],
    logger: SandboxLogger,
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
    
    // For any run processed by this pipeline (sandbox/sandbox), skip the summary.
    const isSandboxTestRun = true;
    if (!isSandboxTestRun) {
        const summaryResult = await generateExecutiveSummary(finalOutput, logger);
        if (summaryResult && !('error' in summaryResult)) {
          finalOutput.executiveSummary = summaryResult;
        }
    } else {
        logger.info('Skipping executive summary generation for sandbox test run.');
    }

    return { data: finalOutput };
}
