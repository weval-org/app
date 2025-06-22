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
    
    const {
        modelId, // Full OpenRouter model string
        messages,
        systemPrompt,
        maxTokens = DEFAULT_MAX_TOKENS,
        temperature = DEFAULT_TEMPERATURE,
        logProgress = false,
        useCache = false 
    } = options;

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

        if (cachedResponse) {
            if (logProgress) {
                console.log(chalk.green(`  -> Cache HIT for model: ${modelId}`));
            }
            return cachedResponse as string;
        }
        if (logProgress) {
            console.log(chalk.yellow(`  -> Cache MISS for model: ${modelId}`));
        }
    }

    try {
        if (logProgress && useCache) {
            console.log(chalk.yellow('  -> Caching is enabled. Will store response after generation.'));
        }

        const clientOptions: Omit<LLMApiCallOptions, 'modelName'> & { modelId: string } = {
            modelId: modelId, 
            messages: messages,
            systemPrompt: systemPrompt ?? undefined,
            maxTokens: maxTokens,
            temperature: temperature,
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
            const errorMessage = `API Error from model ${modelId}: ${response.error}`;
            console.error(chalk.red(errorMessage));
            return `<error> ${errorMessage} </error>`;
        }

        const fullResponse = response.responseText;

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
            await cache.set(cacheKey, fullResponse);
            if (logProgress) {
                console.log(chalk.blue(`  -> Cached response for model: ${modelId}`));
            }
        }

        return fullResponse;

    } catch (error: any) {
        const errorMessage = `Error getting response for model ${modelId}: ${error.message || String(error)}`;
        console.error(chalk.red(errorMessage));
        return `<error> LLM issue: ${errorMessage} </error>`;
    }
} 