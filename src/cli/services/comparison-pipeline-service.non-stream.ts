import { ComparisonConfig, PromptResponseData } from '../types/cli_types';
import { ConversationMessage } from '@/types/shared';
import { getModelResponse, DEFAULT_TEMPERATURE } from './llm-service';
import { checkForErrors } from '../utils/response-utils';
import { SimpleLogger } from '@/lib/blueprint-service';

export type ProgressCallback = (completed: number, total: number) => Promise<void>;

export async function generateAllResponses(
    config: ComparisonConfig,
    logger: SimpleLogger,
    useCache: boolean,
    onProgress?: ProgressCallback,
): Promise<Map<string, PromptResponseData>> {
    logger.info(`[PipelineService] Generating model responses... Caching: ${useCache}`);
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(config.concurrency || 10);
    const allResponsesMap = new Map<string, PromptResponseData>();
    const tasks: Promise<void>[] = [];
    let generatedCount = 0;

    const temperaturesToRun = (config.temperatures?.length) ? config.temperatures : [config.temperature];
    const systemPromptsToRun = (config.systems?.length) ? config.systems : [config.system];

    const totalResponsesToGenerate = config.prompts.length * config.models.length * temperaturesToRun.length * systemPromptsToRun.length;
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

        config.models.forEach(modelString => {
            temperaturesToRun.forEach(tempValue => {
                systemPromptsToRun.forEach((systemPromptValue, sp_idx) => {
                    tasks.push(limit(async () => {
                        const systemPromptToUse = (config.systems && config.systems.length > 0)
                            ? systemPromptValue
                            : (promptConfig.system !== undefined ? promptConfig.system : config.system);

                        const temperatureForThisCall = tempValue ?? promptConfig.temperature ?? config.temperature ?? DEFAULT_TEMPERATURE;
    
                        let finalEffectiveId = modelString;
                        if (temperatureForThisCall !== undefined) {
                            finalEffectiveId = `${finalEffectiveId}[temp:${temperatureForThisCall.toFixed(1)}]`;
                        }
                        if (config.systems && config.systems.length > 1) {
                            finalEffectiveId = `${finalEffectiveId}[sp_idx:${sp_idx}]`;
                        }
                        
                        let finalAssistantResponseText = '';
                        let fullConversationHistoryWithResponse: ConversationMessage[] = [];
                        let hasError = false;
                        let errorMessage: string | undefined;

                        const messagesForLlm: ConversationMessage[] = [...promptConfig.messages!];

                        if (systemPromptToUse && !messagesForLlm.find(m => m.role === 'system')) {
                            messagesForLlm.unshift({ role: 'system', content: systemPromptToUse });
                        }

                        try {
                            finalAssistantResponseText = await getModelResponse({
                                modelId: modelString,
                                messages: messagesForLlm,
                                temperature: temperatureForThisCall,
                                useCache: useCache
                            });
                            hasError = checkForErrors(finalAssistantResponseText);
                            if (hasError) {
                                const errorMatch = finalAssistantResponseText.match(/<error>([\s\S]*)<\/error>/);
                                errorMessage = errorMatch ? errorMatch[1].trim() : `Response contains error markers.`;
                            }

                            fullConversationHistoryWithResponse = [...messagesForLlm, { role: 'assistant', content: finalAssistantResponseText }];

                        } catch (error: any) {
                            errorMessage = `Failed to get response for ${finalEffectiveId}: ${error.message || String(error)}`;
                            finalAssistantResponseText = `<error>${errorMessage}</error>`;
                            hasError = true;
                            logger.error(`[PipelineService] ${errorMessage}`);
                            fullConversationHistoryWithResponse = [...messagesForLlm, { role: 'assistant', content: finalAssistantResponseText }];
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
                    }));
                });
            });
        });
    });

    await Promise.all(tasks);
    logger.info(`[PipelineService] Finished generating ${generatedCount}/${totalResponsesToGenerate} responses.`);
    return allResponsesMap;
}
