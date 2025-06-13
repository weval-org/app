import { getConfig } from '../config';
import { ComparisonConfig, EvaluationMethod, PromptResponseData, EvaluationInput, FinalComparisonOutputV2, Evaluator, IDEAL_MODEL_ID, ConversationMessage } from '../types/comparison_v2';
import { getModelResponse, DEFAULT_TEMPERATURE } from './llm-service';
import { checkForErrors } from '../utils/response-utils';
import { getEffectiveModelId, getUniqueModelIds } from '@/cli/utils/config-utils';
import { EmbeddingEvaluator } from '@/cli/evaluators/embedding-evaluator';
import { LLMCoverageEvaluator } from '@/cli/evaluators/llm-coverage-evaluator';
import { saveResult as saveResultToStorage } from '@/lib/storageService';
import { toSafeTimestamp } from '@/app/utils/timestampUtils';

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
        // Ensure messages is not undefined, as loadAndValidateConfig should have populated it.
        if (!promptConfig.messages) {
            logger.error(`[PipelineService] CRITICAL: promptConfig.messages is undefined for prompt ID '${promptConfig.id}' after validation. This should not happen.`);
            // Skip this prompt or throw error
            return;
        }

        const currentPromptData: PromptResponseData = {
            promptId: promptConfig.id,
            promptText: promptConfig.promptText, // Keep for backward compatibility / reference
            initialMessages: promptConfig.messages, // Store the input messages
            idealResponseText: promptConfig.idealResponse || null,
            modelResponses: new Map()
        };
        allResponsesMap.set(promptConfig.id, currentPromptData);

        config.models.forEach(modelString => {
            temperaturesToRun.forEach(tempValue => {
                tasks.push(limit(async () => {
                    const systemPromptToUse = promptConfig.system !== undefined ? promptConfig.system : config.systemPrompt;
                    
                    // Prioritize temp from the temperatures array, then prompt-specific, then global, then the hardcoded default.
                    const temperatureForThisCall = tempValue ?? promptConfig.temperature ?? config.temperature ?? DEFAULT_TEMPERATURE;

                    // This block now correctly and consistently creates the effective ID
                    let { effectiveId: baseEffectiveId } = getEffectiveModelId(modelString, systemPromptToUse);
                    let finalEffectiveId = baseEffectiveId;
                    if (temperatureForThisCall !== undefined) {
                        finalEffectiveId = `${baseEffectiveId}[temp:${temperatureForThisCall}]`;
                    }
                    
                    let finalAssistantResponseText = '';
                    let fullConversationHistoryWithResponse: ConversationMessage[] = [];
                    let hasError = false;
                    let errorMessage: string | undefined;

                    // Prepare messages for the LLM call
                    // loadAndValidateConfig ensures promptConfig.messages is always populated.
                    const messagesForLlm: ConversationMessage[] = [...promptConfig.messages!];

                    // If a global systemPrompt is defined in the config,
                    // and not overridden by a prompt-specific system message,
                    // and there isn't already a system message in messagesForLlm, prepend it.
                    if (systemPromptToUse && !messagesForLlm.find(m => m.role === 'system')) {
                        messagesForLlm.unshift({ role: 'system', content: systemPromptToUse });
                    }

                    // ---- BEGIN ADDED DEBUG LOG ----
                    logger.info(`[PipelineService] About to call getModelResponse for model: ${modelString} (Effective ID: ${finalEffectiveId}) with prompt ID: ${promptConfig.id}. Temperature: ${temperatureForThisCall}. Messages payload:`);
                    try {
                        // Attempt to pretty-print JSON
                        logger.info(JSON.stringify(messagesForLlm, null, 2));
                    } catch (e) {
                        logger.info('Could not JSON.stringify messagesForLlm. Logging raw object below:');
                        logger.info(messagesForLlm as any); // Cast to any if logger has trouble with specific type
                    }
                    // ---- END ADDED DEBUG LOG ----

                    try {
                        finalAssistantResponseText = await getModelResponse({
                            modelId: modelString,
                            messages: messagesForLlm, // Pass the messages array
                            // systemPrompt is now handled by being part of messagesForLlm if applicable
                            temperature: temperatureForThisCall,
                            useCache: useCache
                        });
                        hasError = checkForErrors(finalAssistantResponseText);
                        if (hasError) errorMessage = `Response contains error markers.`;

                        // Construct full history
                        fullConversationHistoryWithResponse = [...messagesForLlm, { role: 'assistant', content: finalAssistantResponseText }];

                    } catch (error: any) {
                        errorMessage = `Failed to get response for ${finalEffectiveId}: ${error.message || String(error)}`;
                        finalAssistantResponseText = `<error>${errorMessage}</error>`;
                        hasError = true;
                        logger.error(`[PipelineService] ${errorMessage}`);
                        // Construct history even with error
                        fullConversationHistoryWithResponse = [...messagesForLlm, { role: 'assistant', content: finalAssistantResponseText }];
                    }

                    currentPromptData.modelResponses.set(finalEffectiveId, {
                        finalAssistantResponseText,
                        fullConversationHistory: fullConversationHistoryWithResponse,
                        hasError,
                        errorMessage,
                        systemPromptUsed: systemPromptToUse ?? null // This might need re-evaluation: system prompt is now part of messages
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
    logger: Logger,
    commitSha?: string,
): Promise<{ data: FinalComparisonOutputV2, fileName: string | null }> {
    logger.info('[PipelineService] Aggregating results...');
    logger.info(`[PipelineService] Received config.configId for saving: '${config.configId}'`);

    const promptIds: string[] = [];
    // Store either original promptText or a string representation of initialMessages
    const promptContexts: Record<string, string | ConversationMessage[]> = {}; 
    const allFinalAssistantResponses: Record<string, Record<string, string>> = {};
    const fullConversationHistories: Record<string, Record<string, ConversationMessage[]>> = {};
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
        // Store context appropriately
        if (promptData.initialMessages && promptData.initialMessages.length > 0) {
            // If it was originally multi-turn or converted from promptText, initialMessages is the source of truth for input
            promptContexts[promptId] = promptData.initialMessages;
        } else if (promptData.promptText) { // Fallback for any case where initialMessages might be missing (should not happen)
            promptContexts[promptId] = promptData.promptText;
        } else {
            promptContexts[promptId] = "Error: No input context found"; // Should not happen
        }
        
        allFinalAssistantResponses[promptId] = {};
        if (process.env.STORE_FULL_HISTORY === 'true' || true) { // Default to true for now
             fullConversationHistories[promptId] = {};
        }


        // Add ideal response text if it was part of the input
        if (promptData.idealResponseText !== null && promptData.idealResponseText !== undefined) {
            allFinalAssistantResponses[promptId][IDEAL_MODEL_ID] = promptData.idealResponseText;
            // If storing full histories, the ideal response doesn't have a "history" in the same way
        }

        for (const [effectiveModelId, responseData] of promptData.modelResponses.entries()) {
            effectiveModelsSet.add(effectiveModelId);
            modelSystemPrompts[effectiveModelId] = responseData.systemPromptUsed; // systemPromptUsed might be less relevant if system message is in messages
            allFinalAssistantResponses[promptId][effectiveModelId] = responseData.finalAssistantResponseText;
            
            if (responseData.fullConversationHistory && fullConversationHistories[promptId]) {
                 fullConversationHistories[promptId][effectiveModelId] = responseData.fullConversationHistory;
            }

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
    const safeTimestamp = toSafeTimestamp(currentTimestamp);

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
        timestamp: safeTimestamp,
        description: config.description,
        sourceCommitSha: commitSha,
        config: config, // This config still has promptText and messages, which is fine
        evalMethodsUsed: evalMethodsUsed,
        effectiveModels: effectiveModels,
        modelSystemPrompts: modelSystemPrompts,
        promptIds: promptIds.sort(),
        promptContexts: promptContexts, // Changed from promptTexts
        extractedKeyPoints: evaluationResults.extractedKeyPoints ?? undefined,
        allFinalAssistantResponses: allFinalAssistantResponses, // Changed from allResponses
        fullConversationHistories: (process.env.STORE_FULL_HISTORY === 'true' || true) ? fullConversationHistories : undefined, // Conditionally add
        evaluationResults: {
            similarityMatrix: evaluationResults.similarityMatrix ?? undefined,
            perPromptSimilarities: evaluationResults.perPromptSimilarities ?? undefined,
            llmCoverageScores: evaluationResults.llmCoverageScores ?? undefined,
        },
        errors: Object.keys(errors).length > 0 ? errors : undefined,
    };

    const fileName = `${runLabel}_${safeTimestamp}_comparison.json`;

    try {
        await saveResultToStorage(resolvedConfigId, fileName, finalOutput);
        logger.info(`[PipelineService] Successfully saved aggregated results to storage with key/filename: ${fileName}`);
        return { data: finalOutput, fileName: fileName };
    } catch (error: any) {
        logger.error(`[PipelineService] Failed to save the final comparison output to storage: ${error.message}`);
        // Still return the data even if save fails, caller can decide what to do
        return { data: finalOutput, fileName: null };
    }
}

/**
 * Main service function to execute the full comparison pipeline.
 * @param config - The comparison configuration.
 * @param runLabel - The label for the current run.
 * @param evalMethods - The evaluation methods to use.
 * @param logger - The logger for logging purposes.
 * @param existingResponsesMap - Optional map of pre-generated responses.
 * @param forcePointwiseKeyEval - Optional flag to force pointwise key evaluation.
 * @param useCache - Optional flag to enable caching for model responses.
 * @returns A promise that resolves to an object containing the full comparison data and the filename it was saved under.
 */
export async function executeComparisonPipeline(
    config: ComparisonConfig,
    runLabel: string,
    evalMethods: EvaluationMethod[],
    logger: Logger,
    // Optional: allow passing pre-generated responses to skip generation
    existingResponsesMap?: Map<string, PromptResponseData>,
    forcePointwiseKeyEval?: boolean,
    useCache: boolean = false,
    commitSha?: string,
): Promise<{ data: FinalComparisonOutputV2, fileName: string | null }> {
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
    const aggregatedResults = await aggregateAndSaveResults(
        config,
        runLabel,
        allResponsesMap,
        evaluationResultsAccumulator,
        evalMethods,
        logger,
        commitSha,
    );
    logger.info(`[PipelineService] executeComparisonPipeline finished successfully. Results at: ${aggregatedResults.fileName}`);
    return aggregatedResults;
} 