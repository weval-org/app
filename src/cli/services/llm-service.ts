import { getConfig } from '../config';
import { dispatchMakeApiCall as dispatch } from '../../lib/llm-clients/client-dispatcher';
import { LLMApiCallResult as ModelResponse, LLMApiCallOptions } from '../../lib/llm-clients/types';
import { getCache, generateCacheKey } from '../../lib/cache-service';
import { ConversationMessage } from '../../types/shared';

const llmCache = getCache('llm-responses');

// Constants
export const DEFAULT_TEMPERATURE = 0;

export interface GetModelResponseParams {
    modelId: string;
    prompt?: string;
    systemPrompt?: string;
    messages?: ConversationMessage[];
    temperature?: number;
    maxTokens?: number;
    useCache?: boolean;
    timeout?: number;
    retries?: number;
}

// Legacy alias for backward compatibility
export type GetModelResponseOptions = GetModelResponseParams;

export async function getModelResponse(params: GetModelResponseParams): Promise<string> {
    const {
        modelId,
        prompt,
        messages,
        systemPrompt,
        temperature = 0,
        maxTokens,
        useCache = true,
        timeout,
        retries,
    } = params;
    const { logger } = getConfig();

    // Convert prompt to messages format if needed
    let finalMessages: ConversationMessage[] | undefined = messages;
    if (prompt && !messages) {
        finalMessages = [{ role: 'user', content: prompt }];
    }

    // Create a comprehensive cache key that includes ALL parameters that affect the response
    const cacheKeyPayload = {
        modelId,
        prompt,
        messages: finalMessages,
        systemPrompt,
        temperature,
        maxTokens,
        // Include any other parameters that might affect the response
    };
    const cacheKey = generateCacheKey(cacheKeyPayload);

    if (useCache) {
        // Check cache first
        try {
            const cachedResponse = await llmCache.get(cacheKey);
            if (cachedResponse) {
                logger.info(`[LLM Service] Cache HIT for ${modelId}. Key: ${cacheKey.slice(0, 8)}...`);
                return cachedResponse;
            }
        } catch (error) {
            logger.warn(`[LLM Service] Cache read failed for ${modelId}: ${error}`);
        }
    }
    
    logger.info(`[LLM Service] Cache MISS for ${modelId}. Key: ${cacheKey.slice(0, 8)}... Calling API...`);

    const requestPayload: LLMApiCallOptions = {
        modelId,
        messages: finalMessages?.map(m => ({ role: m.role, content: m.content ?? '' })),
        systemPrompt,
        temperature,
        maxTokens,
        ...(typeof timeout === 'number' && isFinite(timeout) ? { timeout } : {}),
    };

    const apiCall = async () => {
        const response: ModelResponse = await dispatch(requestPayload);

        // This is a simplistic check. You might want to refine it based on actual API responses.
        if (response.error || (response.responseText && response.responseText.trim() === '')) {
            throw new Error(response.error || 'Empty response from model');
        }
        return response.responseText || '';
    };

    try {
        const pRetry = (await import('p-retry')).default;
        const responseContent = await pRetry(apiCall, {
            retries: (typeof retries === 'number' && retries >= 0) ? retries : 1,
            onFailedAttempt: (error: any) => {
                logger.warn(`[LLM Service] API call failed. Attempt ${error.attemptNumber}. Retries left: ${error.retriesLeft}.`);
                logger.warn(`[LLM Service] Error: ${error.message}`);
            },
            // TODO: Re-implement shouldRetry with a proper isRateLimitError function
            // shouldRetry: (error) => {
            //     return isRateLimitError(error);
            // }
        });
        
        if (useCache) {
            try {
                await llmCache.set(cacheKey, responseContent);
                logger.info(`[LLM Service] Cached response for ${modelId}. Key: ${cacheKey.slice(0, 8)}...`);
            } catch (cacheWriteError) {
                logger.error(`[LLM Service] Failed to write to cache: ${cacheWriteError}`);
            }
        }
        
        return responseContent;
    } catch (error: any) {
        logger.error(`[LLM Service] API call failed after all retries for model ${modelId}. Error: ${error.message}`);
        throw error; // Re-throw the final error
    }
} 