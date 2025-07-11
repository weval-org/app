import { dispatchMakeApiCall } from '../../lib/llm-clients/client-dispatcher';
import { LLMApiCallOptions } from '../../lib/llm-clients/types';
import { ConversationMessage } from '@/types/shared';
import { getConfig } from '../config';
import { getCache, generateCacheKey } from '../../lib/cache-service';

export interface GetModelResponseOptions {
    modelId: string; // Now expected to be the full OpenRouter model string, e.g., "openrouter:openai/gpt-4o-mini"
    messages: ConversationMessage[];
    systemPrompt?: string | null;
    maxTokens?: number;
    temperature?: number;
    logProgress?: boolean; 
    useCache?: boolean; 
}

const DEFAULT_MAX_TOKENS = 2000;
export const DEFAULT_TEMPERATURE = 0.0;

/**
 * Gets a streamed response from the specified LLM via OpenRouter.
 * Handles model name resolution and basic error wrapping.
 */
export async function getModelResponse(options: GetModelResponseOptions): Promise<string> {
    const chalk = (await import('chalk')).default;
    const { logger } = getConfig();
    
    const {
        modelId, // Full OpenRouter model string
        messages,
        systemPrompt,
        maxTokens = DEFAULT_MAX_TOKENS,
        temperature = DEFAULT_TEMPERATURE,
        logProgress = false,
        useCache = false 
    } = options;

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;

    if (logProgress) {
        console.log(chalk.gray(`  -> Using model: ${modelId}`));
    }

    if (useCache) {
        const cacheKeyPayload = {
            modelId,
            messages,
            systemPrompt,
            maxTokens,
            temperature,
        };
        const cacheKey = generateCacheKey(cacheKeyPayload);
        const cache = getCache('model-responses');
        const cachedResponse = await cache.get(cacheKey);

        if (cachedResponse && (cachedResponse as string).trim() !== '') {
            if (logProgress) {
                console.log(chalk.green(`  -> Cache HIT for model: ${modelId}`));
            }
            return cachedResponse as string;
        }
        if (logProgress) {
            if (cachedResponse) { // This means it existed but was empty/whitespace
                 console.log(chalk.yellow(`  -> Cache HIT but response was empty. Invalidating and treating as MISS for model: ${modelId}`));
            } else {
                 console.log(chalk.yellow(`  -> Cache MISS for model: ${modelId}`));
            }
        }
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        // Create a copy of messages and modify the latest user message for retry attempts
        let messagesForAttempt = [...messages];
        
        if (attempt > 1) {
            // Find the last user message and add spaces to break caching
            for (let i = messagesForAttempt.length - 1; i >= 0; i--) {
                if (messagesForAttempt[i].role === 'user') {
                    // Add (attempt - 1) spaces to the end of the user message
                    const spacesToAdd = ' '.repeat(attempt - 1);
                    messagesForAttempt[i] = {
                        ...messagesForAttempt[i],
                        content: messagesForAttempt[i].content + spacesToAdd
                    };
                    if (logProgress) {
                        console.log(chalk.yellow(`  -> Retry attempt ${attempt}: Added ${attempt - 1} space(s) to break caching`));
                    }
                    break;
                }
            }
        }

        try {
            if (logProgress && useCache) {
                console.log(chalk.yellow('  -> Caching is enabled. Will store response after generation.'));
            }

            const clientOptions: Omit<LLMApiCallOptions, 'modelName'> & { modelId: string } = {
                modelId: modelId, 
                messages: messagesForAttempt,
                systemPrompt: systemPrompt ?? undefined,
                maxTokens: maxTokens,
                temperature: temperature,
                timeout: 120000, // 120 seconds
            };

            if (logProgress || process.env.DEBUG_LLM_PAYLOAD === 'true') {
                const { logger: internalLogger } = getConfig();
                internalLogger.info(`[LLMService] Calling LLM client for model: ${modelId}. Client options payload (messages):`);
                try {
                    internalLogger.info(JSON.stringify(clientOptions.messages, null, 2));
                } catch (e) {
                    internalLogger.info('Could not JSON.stringify clientOptions.messages. Logging raw object below:');
                    internalLogger.info(clientOptions.messages as any);
                }
                if (clientOptions.systemPrompt) {
                     internalLogger.info(`[LLMService] System prompt being passed separately: ${clientOptions.systemPrompt}`);
                }
            }

            const response = await dispatchMakeApiCall(clientOptions);

            if (response.error) {
                throw new Error(`API Error from model ${modelId}: ${response.error}`);
            }

            const fullResponse = response.responseText;


            if (!fullResponse || fullResponse.trim() === '') {
                throw new Error('Model returned an empty or whitespace-only response.');
            }

            if (useCache) {
                // Note: We cache using the original messages, not the modified ones with spaces
                const cacheKeyPayload = {
                    modelId,
                    messages, // Original messages without added spaces
                    systemPrompt,
                    maxTokens,
                    temperature,
                };
                const cacheKey = generateCacheKey(cacheKeyPayload);
                const cache = getCache('model-responses');
                await cache.set(cacheKey, fullResponse);
                if (logProgress) {
                    console.log(chalk.blue(`  -> Cached response for model: ${modelId}`));
                }
            }

            return fullResponse;

        } catch (error: any) {
            logger.warn(`[LLM Service] Attempt ${attempt} of ${MAX_RETRIES} failed for model ${modelId}: ${error.message}`);
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            } else {
                logger.error(`[LLM Service] All ${MAX_RETRIES} attempts failed for model ${modelId}.`);
                throw error;
            }
        }
    }

    throw new Error(`Failed to get response for model ${modelId} after ${MAX_RETRIES} attempts.`);
} 