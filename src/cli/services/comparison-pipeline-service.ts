import { getConfig } from '../config';
import { ComparisonConfig, EvaluationMethod, PromptResponseData, EvaluationInput, FinalComparisonOutputV2, Evaluator, IDEAL_MODEL_ID } from '../types/comparison_v2';
import { getModelResponse } from './llm-service';
import { checkForErrors } from '../utils/response-utils';
import { getEffectiveModelId, getUniqueModelIds } from '@/cli/utils/config-utils';
import { EmbeddingEvaluator } from '@/cli/evaluators/embedding-evaluator';
import { LLMCoverageEvaluator } from '@/cli/evaluators/llm-coverage-evaluator';
import { saveResult as saveResultToStorage } from '@/lib/storageService';

// Logger type, can be refined or passed as a generic
type Logger = ReturnType<typeof getConfig>['logger'];

// This function is moved from run-config.ts
async function generateAllResponses(
    config: ComparisonConfig,
    logger: Logger,
    useCache: boolean
): Promise<Map<string, PromptResponseData>> {
    logger.info(`[PipelineService] Generating model responses... Caching: ${useCache}`);
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(config.concurrency || 10);
    const allResponsesMap = new Map<string, PromptResponseData>();
    const tasks: Promise<void>[] = [];
    let generatedCount = 0;

    // Determine the list of temperatures to use
    const temperaturesToRun: (number | undefined)[] = 
        (config.temperatures && config.temperatures.length > 0) 
            ? config.temperatures 
            : [config.temperature]; // Use single global temp or undefined if not set

    const totalResponsesToGenerate = config.prompts.length * config.models.length * temperaturesToRun.length;
    // Spinner logic will be handled by the CLI caller, not here.
    logger.info(`[PipelineService] Preparing to generate ${totalResponsesToGenerate} responses across ${temperaturesToRun.length} temperature(s). (config.temperature: ${config.temperature}, config.temperatures: ${config.temperatures})`);

    config.prompts.forEach(promptConfig => {
        const currentPromptData: PromptResponseData = {
            promptId: promptConfig.id,
            promptText: promptConfig.promptText,
            idealResponseText: promptConfig.idealResponse || null,
            modelResponses: new Map()
        };
        allResponsesMap.set(promptConfig.id, currentPromptData);

        config.models.forEach(modelString => {
            temperaturesToRun.forEach(tempValue => {
                tasks.push(limit(async () => {
                    const systemPromptToUse = promptConfig.system !== undefined ? promptConfig.system : config.systemPrompt;
                    
                    // Determine the specific temperature for this call
                    const temperatureForThisCall = tempValue ?? promptConfig.temperature ?? undefined;

                    // modelString is the full "openrouter:provider/model"
                    // baseEffectiveId will be "openrouter:provider/model" or "openrouter:provider/model[sys:hash]"
                    let { effectiveId: baseEffectiveId } = getEffectiveModelId(modelString, systemPromptToUse);
                    let finalEffectiveId = baseEffectiveId;

                    if (temperaturesToRun.length > 1 || temperatureForThisCall !== undefined) {
                        const tempSuffix = temperatureForThisCall !== undefined ? `[temp:${temperatureForThisCall}]` : ""; 
                        finalEffectiveId = `${baseEffectiveId}${tempSuffix}`;
                    }

                    let responseText = '';
                    let hasError = false;
                    let errorMessage: string | undefined;

                    try {
                        // Pass the full modelString as modelId
                        // Remove the 'provider' property
                        responseText = await getModelResponse({
                            modelId: modelString,
                            prompt: promptConfig.promptText,
                            systemPrompt: systemPromptToUse,
                            temperature: temperatureForThisCall,
                            useCache: useCache
                        });
                        hasError = checkForErrors(responseText);
                        if (hasError) errorMessage = `Response contains error markers.`;

                    } catch (error: any) {
                        errorMessage = `Failed to get response for ${finalEffectiveId}: ${error.message || String(error)}`;
                        responseText = `<error>${errorMessage}</error>`;
                        hasError = true;
                        logger.error(`[PipelineService] ${errorMessage}`);
                    }

                    currentPromptData.modelResponses.set(finalEffectiveId, {
                        responseText,
                        hasError,
                        errorMessage,
                        systemPromptUsed: systemPromptToUse ?? null
                    });
                    generatedCount++;
                    logger.info(`[PipelineService] Generated ${generatedCount}/${totalResponsesToGenerate} responses.`);
                }));
            });
        });
    });

    await Promise.all(tasks);
    logger.info(`[PipelineService] Finished generating ${generatedCount}/${totalResponsesToGenerate} responses.`);
    return allResponsesMap;
}

// This function is moved from run-config.ts
async function aggregateAndSaveResults(
    config: ComparisonConfig,
    runLabel: string,
    allResponsesMap: Map<string, PromptResponseData>,
    evaluationResults: Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>,
    evalMethodsUsed: EvaluationMethod[],
    logger: Logger
): Promise<string | null> { // Returns the storage key/path or null
    logger.info('[PipelineService] Aggregating results...');
    logger.info(`[PipelineService] Received config.configId for saving: '${config.configId}'`);

    const promptIds: string[] = [];
    const promptTexts: Record<string, string> = {};
    const allResponses: Record<string, Record<string, string>> = {};
    const errors: Record<string, Record<string, string>> = {};
    const effectiveModelsSet = new Set<string>();
    const modelSystemPrompts: Record<string, string | null> = {};
    let hasAnyIdeal = false;

    // Determine if any ideal response exists based on the config
    if (config.prompts.some(p => p.idealResponse)) {
        hasAnyIdeal = true;
    }

    for (const [promptId, promptData] of allResponsesMap.entries()) {
        promptIds.push(promptId);
        promptTexts[promptId] = promptData.promptText;
        allResponses[promptId] = {};

        // Add ideal response text if it was part of the input (e.g. from live analyzer or if it was in a promptConfig)
        if (promptData.idealResponseText !== null && promptData.idealResponseText !== undefined) {
            allResponses[promptId][IDEAL_MODEL_ID] = promptData.idealResponseText;
            // No need to add IDEAL_MODEL_ID to effectiveModelsSet here if hasAnyIdeal from config is the source of truth
        }

        for (const [effectiveModelId, responseData] of promptData.modelResponses.entries()) {
            effectiveModelsSet.add(effectiveModelId);
            modelSystemPrompts[effectiveModelId] = responseData.systemPromptUsed;
            allResponses[promptId][effectiveModelId] = responseData.responseText;

            if (responseData.hasError && responseData.errorMessage) {
                if (!errors[promptId]) errors[promptId] = {};
                errors[promptId][effectiveModelId] = responseData.errorMessage;
            }
        }
    }

    if (hasAnyIdeal) {
        effectiveModelsSet.add(IDEAL_MODEL_ID);
        if (!(IDEAL_MODEL_ID in modelSystemPrompts)) { // Add system prompt for IDEAL_MODEL_ID if not already set (e.g. if only from config)
             modelSystemPrompts[IDEAL_MODEL_ID] = null;
        }
    }

    const effectiveModels = Array.from(effectiveModelsSet).sort();

    const currentTimestamp = new Date().toISOString();

    // Upstream validation in loadAndValidateConfig (run-config.ts) ensures that
    // (config.id OR config.configId) is a valid string,
    // AND (config.title OR config.configTitle) is a valid string.

    const resolvedConfigId: string = config.id || config.configId!;
    const resolvedConfigTitle: string = config.title || config.configTitle!;

    // Paranoia checks - these should ideally not be hit if upstream validation is robust.
    if (typeof resolvedConfigId !== 'string' || resolvedConfigId.trim() === '') {
        logger.error(`Critical: Blueprint ID resolved to an invalid string ('${resolvedConfigId}'). Config: ${JSON.stringify(config)}`);
        throw new Error("Blueprint ID resolved to an invalid string unexpectedly.");
    }
    if (typeof resolvedConfigTitle !== 'string' || resolvedConfigTitle.trim() === '') {
        logger.error(`Critical: Blueprint Title resolved to an invalid string ('${resolvedConfigTitle}'). Config: ${JSON.stringify(config)}`);
        throw new Error("Blueprint Title resolved to an invalid string unexpectedly.");
    }

    const finalOutput: FinalComparisonOutputV2 = {
        configId: resolvedConfigId,
        configTitle: resolvedConfigTitle,
        runLabel,
        timestamp: currentTimestamp,
        config: config,
        evalMethodsUsed: evalMethodsUsed,
        effectiveModels: effectiveModels,
        modelSystemPrompts: modelSystemPrompts,
        promptIds: promptIds.sort(),
        promptTexts: promptTexts,
        extractedKeyPoints: evaluationResults.extractedKeyPoints ?? undefined,
        allResponses: allResponses,
        evaluationResults: {
            similarityMatrix: evaluationResults.similarityMatrix ?? undefined,
            perPromptSimilarities: evaluationResults.perPromptSimilarities ?? undefined,
            llmCoverageScores: evaluationResults.llmCoverageScores ?? undefined,
        },
        errors: Object.keys(errors).length > 0 ? errors : undefined,
    };

    const timestampStr = currentTimestamp.replace(/[:.]/g, '-');
    const outputFilename = `${runLabel}_${timestampStr}_comparison.json`;

    try {
        const storagePath = await saveResultToStorage(resolvedConfigId, outputFilename, finalOutput);

        if (storagePath) {
            logger.success(`[PipelineService] Comparison results saved successfully!`);
            logger.info(`[PipelineService] Output location: ${storagePath}`);
            return storagePath;
        } else {
            logger.error(`[PipelineService] Failed to save results to storage.`);
            return null;
        }
    } catch (writeError: any) {
        logger.error(`[PipelineService] Failed to save results: ${writeError.message || String(writeError)}`);
        return null;
    }
}

export async function executeComparisonPipeline(
    config: ComparisonConfig,
    runLabel: string,
    evalMethods: EvaluationMethod[],
    logger: Logger,
    // Optional: allow passing pre-generated responses to skip generation
    existingResponsesMap?: Map<string, PromptResponseData>,
    forcePointwiseKeyEval?: boolean,
    useCache?: boolean
): Promise<string | null> { // Returns the storage key/path of the saved comparison file or null
    logger.info(`[PipelineService] executeComparisonPipeline started for configId: ${config.configId}, runLabel: ${runLabel}`);
    logger.info(`[PipelineService] Model response caching: ${useCache ?? false}`);
    logger.info(`[PipelineService] Evaluation methods: ${evalMethods.join(', ')}`);

    let allResponsesMap: Map<string, PromptResponseData>;
    if (existingResponsesMap) {
        logger.info('[PipelineService] Using existing responses map.');
        allResponsesMap = existingResponsesMap;
    } else {
        allResponsesMap = await generateAllResponses(config, logger, useCache ?? false);
    }
    
    logger.info('[PipelineService] Preparing evaluators...');
    const evaluationResultsAccumulator: Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>> = {};
    const evaluators: Evaluator[] = [];

    if (evalMethods.includes('embedding')) {
        logger.info('[PipelineService] Adding EmbeddingEvaluator.');
        evaluators.push(new EmbeddingEvaluator(logger));
    }
    if (evalMethods.includes('llm-coverage')) {
        logger.info('[PipelineService] Adding LLMCoverageEvaluator.');
        try {
            evaluators.push(new LLMCoverageEvaluator(logger));
        } catch (e: any) {
            logger.error(`[PipelineService] Failed to instantiate LLMCoverageEvaluator: ${e.message}. LLM Coverage will be skipped.`);
            evalMethods = evalMethods.filter(m => m !== 'llm-coverage');
        }
    }

    if (evaluators.length === 0 && evalMethods.length > 0) {
        logger.warn('[PipelineService] No valid evaluators configured or loaded for the specified methods. Only response generation (if applicable) will occur.');
    } else if (evaluators.length > 0) {
        logger.info('[PipelineService] Preparing evaluation input...');
        const effectiveModelIds = getUniqueModelIds(allResponsesMap, config); // Pass config to include ideal if any prompt has it
        const evaluationInputArray: EvaluationInput[] = Array.from(allResponsesMap.values()).map(promptData => ({
            promptData,
            config,
            effectiveModelIds
        }));
        logger.info(`[PipelineService] Created ${evaluationInputArray.length} inputs for ${evaluators.length} evaluators.`);

        for (const evaluator of evaluators) {
            const evaluatorName = evaluator.getMethodName();
            logger.info(`[PipelineService] Running evaluator: ${evaluatorName}...`);
            try {
                const resultPart = await evaluator.evaluate(evaluationInputArray);
                logger.info(`[PipelineService] Evaluator ${evaluatorName} finished. Merging results...`);
                Object.assign(evaluationResultsAccumulator, resultPart);
                logger.info(`[PipelineService] Results merged for evaluator: ${evaluatorName}.`);
            } catch (evalError: any) {
                logger.error(`[PipelineService] Error during ${evaluatorName} evaluation: ${evalError.message}`);
                // Decide if you want to stop the whole pipeline or just skip this evaluator
            }
        }
    }

    logger.info('[PipelineService] Aggregating and saving final results...');
    const outputPath = await aggregateAndSaveResults(config, runLabel, allResponsesMap, evaluationResultsAccumulator, evalMethods, logger);
    logger.info(`[PipelineService] executeComparisonPipeline finished successfully. Results at: ${outputPath}`);
    return outputPath;
} 