import { ComparisonConfig, PromptResponseData } from '../types/cli_types';
import { ConversationMessage } from '@/types/shared';
import { getModelResponse, DEFAULT_TEMPERATURE } from './llm-service';
import { checkForErrors } from '../utils/response-utils';
import { SimpleLogger } from '@/lib/blueprint-service';
import pLimit from '@/lib/pLimit';

export type ProgressCallback = (completed: number, total: number) => Promise<void>;

const DEFAULT_GENERATION_CONCURRENCY = 20;
const FAILURE_THRESHOLD = 5; // Consecutive failures to trip circuit breaker

export async function generateAllResponses(
    config: ComparisonConfig,
    logger: SimpleLogger,
    useCache: boolean,
    onProgress?: ProgressCallback,
): Promise<Map<string, PromptResponseData>> {
    logger.info(`[PipelineService] Generating model responses... Caching: ${useCache}`);
    const limit = pLimit(config.concurrency || DEFAULT_GENERATION_CONCURRENCY);
    const allResponsesMap = new Map<string, PromptResponseData>();
    const tasks: Promise<void>[] = [];
    let generatedCount = 0;

    // --- Circuit Breaker State ---
    const failureCounters = new Map<string, number>();
    const trippedModels = new Set<string>();
    
    /*
     * Per-Model Concurrency Limiting for Circuit Breaker Race Condition Prevention
     * 
     * Problem: With global concurrency (e.g., 20 concurrent tasks), multiple tasks for the same
     * failing model could execute simultaneously:
     *   1. All tasks read failureCounter = 9 (below threshold)
     *   2. All tasks call API and fail
     *   3. All tasks increment counter → 12 API calls instead of 10
     * 
     * Solution: pLimit(1) per model ensures circuit breaker operations are atomic per model:
     *   - Tasks for model A serialize: check counter → API call → update counter → next task
     *   - Tasks for model B run independently and concurrently with model A
     *   - Global concurrency still applies (up to 20 tasks across all models)
     * 
     * Performance: No impact on overall throughput since different models can still run
     * concurrently. Only serializes operations within the same model to prevent races.
     */
    const perModelLimits = new Map<string, ReturnType<typeof pLimit>>();
    // ---------------------------

    const temperaturesToRun = (config.temperatures?.length) ? config.temperatures : [config.temperature];
    const systemPromptsToRun = (config.systems?.length) ? config.systems : [config.system];

    // Convert models to string IDs for processing
    const modelIds = config.models.map(m => typeof m === 'string' ? m : m.id);
    
    // Create per-model limiters upfront (see detailed explanation above)
    modelIds.forEach(modelId => {
        perModelLimits.set(modelId, pLimit(1)); // Each model gets its own "one-at-a-time" execution queue
    });

    const totalResponsesToGenerate = config.prompts.length * modelIds.length * temperaturesToRun.length * systemPromptsToRun.length;
    logger.info(`[PipelineService] Preparing to generate ${totalResponsesToGenerate} responses across ${temperaturesToRun.length} temperature(s) and ${systemPromptsToRun.length} system prompt(s).`);

    config.prompts.forEach(promptConfig => {
        if (!promptConfig.messages) {
            throw new Error(`[PipelineService] CRITICAL: promptConfig.messages is undefined for prompt ID '${promptConfig.id}' after validation.`);
        }

        const currentPromptData: PromptResponseData = {
            promptId: promptConfig.id,
            promptText: promptConfig.promptText,
            initialMessages: promptConfig.messages,
            idealResponseText: promptConfig.idealResponse || null,
            modelResponses: {}
        };
        allResponsesMap.set(promptConfig.id, currentPromptData);

        modelIds.forEach(modelId => {
            const modelLimit = perModelLimits.get(modelId)!;
            
            temperaturesToRun.forEach(tempValue => {
                systemPromptsToRun.forEach((systemPromptValue, sp_idx) => {
                    tasks.push(limit(async () => {
                        // Serialize all operations for this specific model to prevent circuit breaker races
                        return modelLimit(async () => {
                        const systemPromptToUse = (config.systems && config.systems.length > 0)
                            ? systemPromptValue
                            : (promptConfig.system !== undefined ? promptConfig.system : config.system);

                        const temperatureForThisCall = tempValue ?? promptConfig.temperature ?? config.temperature ?? DEFAULT_TEMPERATURE;
     
                        let finalEffectiveId = modelId;
                        if (temperatureForThisCall !== undefined) {
                            finalEffectiveId = `${finalEffectiveId}[temp:${temperatureForThisCall.toFixed(1)}]`;
                        }
                        if (config.systems && config.systems.length > 1) {
                            finalEffectiveId = `${finalEffectiveId}[sp_idx:${sp_idx}]`;
                        }
                        
                        logger.info(`[PipelineService] Processing prompt '${promptConfig.id}' with model '${modelId}' (effective: '${finalEffectiveId}'), temperature: ${tempValue}, system prompt index: ${sp_idx}.`);

                        // --- Circuit Breaker Check ---
                        // Check both tripped models and current failure count to prevent race conditions
                        const currentFailureCount = failureCounters.get(modelId) || 0;
                        if (trippedModels.has(modelId) || currentFailureCount >= FAILURE_THRESHOLD) {
                            const errorMessage = `Circuit breaker for model '${modelId}' is open. Auto-failing this request.`;
                            logger.warn(`[PipelineService] ${errorMessage}`);
                            currentPromptData.modelResponses[finalEffectiveId] = {
                                finalAssistantResponseText: `<<error>>${errorMessage}<</error>>`,
                                fullConversationHistory: [...promptConfig.messages!, { role: 'assistant', content: `<<error>>${errorMessage}<</error>>` }],
                                hasError: true,
                                errorMessage: errorMessage,
                                systemPromptUsed: systemPromptToUse ?? null
                            };
                            generatedCount++;
                            if (onProgress) await onProgress(generatedCount, totalResponsesToGenerate);
                            return; // Skip API call
                        }
                        // ---------------------------

                        // Rest of the processing logic uses modelId instead of modelString
                        const messagesForLlm: ConversationMessage[] = [...promptConfig.messages!];

                        let finalAssistantResponseText = '';
                        let errorMessage: string | undefined;
                        let hasError = false;
                        let fullConversationHistoryWithResponse: ConversationMessage[] = [];

                        if (systemPromptToUse && !messagesForLlm.find(m => m.role === 'system')) {
                            messagesForLlm.unshift({ role: 'system', content: systemPromptToUse });
                        }

                        try {
                            finalAssistantResponseText = await getModelResponse({
                                modelId: modelId,
                                messages: messagesForLlm,
                                temperature: temperatureForThisCall,
                                useCache: useCache
                            });

                            if (!finalAssistantResponseText || finalAssistantResponseText.trim() === '') {
                                throw new Error('Model returned an empty or whitespace-only response.');
                            }

                            // --- Circuit Breaker: Reset on Success ---
                            if (failureCounters.has(modelId)) {
                                const currentFailures = failureCounters.get(modelId) || 0;
                                if (currentFailures > 0) {
                                    logger.info(`[PipelineService] Successful response from '${modelId}' received. Resetting failure counter from ${currentFailures}.`);
                                    failureCounters.set(modelId, 0);
                                }
                            }
                            // ------------------------------------

                            hasError = checkForErrors(finalAssistantResponseText);
                            if (hasError) {
                                const errorMatch = finalAssistantResponseText.match(/<<error>>([\s\S]*)<<\/error>>/);
                                errorMessage = errorMatch ? errorMatch[1].trim() : `Response contains error markers.`;
                            }

                            fullConversationHistoryWithResponse = [...messagesForLlm, { role: 'assistant', content: finalAssistantResponseText }];

                        } catch (error: any) {
                            errorMessage = `Failed to get response for ${finalEffectiveId}: ${error.message || String(error)}`;
                            finalAssistantResponseText = `<<error>>${errorMessage}<</error>>`;
                            hasError = true;
                            logger.error(`[PipelineService] ${errorMessage}`);
                            fullConversationHistoryWithResponse = [...messagesForLlm, { role: 'assistant', content: finalAssistantResponseText }];

                            // --- Circuit Breaker: Increment on Failure ---
                            const newFailureCount = (failureCounters.get(modelId) || 0) + 1;
                            failureCounters.set(modelId, newFailureCount);
                            logger.warn(`[PipelineService] Failure counter for '${modelId}' is now ${newFailureCount}.`);

                            if (newFailureCount >= FAILURE_THRESHOLD) {
                                trippedModels.add(modelId);
                                logger.error(`[PipelineService] Circuit breaker for '${modelId}' has been tripped after ${newFailureCount} consecutive failures. Subsequent requests will be auto-failed.`);
                            }
                            // -----------------------------------------
                        }

                        currentPromptData.modelResponses[finalEffectiveId] = {
                            finalAssistantResponseText,
                            fullConversationHistory: fullConversationHistoryWithResponse,
                            hasError,
                            errorMessage,
                            systemPromptUsed: systemPromptToUse ?? null
                        };
                        generatedCount++;
                        logger.info(`[PipelineService] Generated ${generatedCount}/${totalResponsesToGenerate} responses.`);
                        if (onProgress) {
                            await onProgress(generatedCount, totalResponsesToGenerate);
                        }
                        }); // Close modelLimit async function
                    }));
                });
            });
        });
    });

    await Promise.all(tasks);
    logger.info(`[PipelineService] Finished generating ${generatedCount}/${totalResponsesToGenerate} responses.`);
    return allResponsesMap;
}
