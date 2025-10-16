import { getConfig } from '../config';
import { dispatchMakeApiCall as dispatch, dispatchStreamApiCall } from '../../lib/llm-clients/client-dispatcher';
import { LLMApiCallResult as ModelResponse, LLMApiCallOptions, StreamChunk } from '../../lib/llm-clients/types';
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
    promptNoCache?: boolean;
    timeout?: number;
    retries?: number;
}

export type StreamModelResponseParams = Omit<GetModelResponseParams, 'useCache' | 'retries'>;

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
        promptNoCache = false,
        timeout,
        retries,
    } = params;
    const { logger } = getConfig();

    // Convert prompt to messages format if needed
    let finalMessages: ConversationMessage[] | undefined = messages;
    if (prompt && !messages) {
        finalMessages = [{ role: 'user', content: prompt }];
    }

    // --- Cache Debugging Controls (non-invasive; does not alter actual keying) ---
    const DEBUG_CACHE = (process.env.LLM_CACHE_DEBUG || '').toLowerCase() === 'true' || process.env.LLM_CACHE_DEBUG === '1';
    const DEBUG_MODEL = process.env.LLM_CACHE_DEBUG_MODEL;
    const DEBUG_TEMP = process.env.LLM_CACHE_DEBUG_TEMP;
    const DEBUG_PROMPT_CONTAINS = process.env.LLM_CACHE_DEBUG_PROMPT_CONTAINS;

    // Build a canonicalized payload (messages with system injected) purely for debugging/visibility
    const canonicalMessagesForHash: ConversationMessage[] | undefined = (() => {
        const base: ConversationMessage[] = [];
        if (systemPrompt) {
            base.push({ role: 'system', content: systemPrompt });
        }
        if (finalMessages && Array.isArray(finalMessages)) {
            // Use messages as-is; do not trim or transform so logs reflect exactly what's sent downstream
            base.push(...finalMessages.map(m => ({ role: m.role, content: m.content ?? '' })));
        }
        return base.length > 0 ? base : undefined;
    })();

    const totalChars = (canonicalMessagesForHash || []).reduce((acc, msg) => acc + (msg.content?.length || 0), 0);
    const heuristicTokenCount = Math.round(totalChars / 3);

    const canonicalKeyPayload = {
        modelId,
        messages: canonicalMessagesForHash,
        temperature,
        maxTokens,
    } as const;

    const shouldDebugThisCall = DEBUG_CACHE && (
        (!DEBUG_MODEL || modelId.includes(DEBUG_MODEL)) &&
        (!DEBUG_TEMP || String(temperature) === String(DEBUG_TEMP)) &&
        (!DEBUG_PROMPT_CONTAINS || (() => {
            try {
                const hay = (canonicalMessagesForHash || finalMessages || []).map(m => m.content || '').join('\n');
                return hay.includes(DEBUG_PROMPT_CONTAINS);
            } catch { return false; }
        })())
    );

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

    if (shouldDebugThisCall) {
        try {
            const canonicalKey = generateCacheKey(canonicalKeyPayload as any);
            const sample = (canonicalMessagesForHash || finalMessages || []).slice(0, 3);
            logger.info(`[LLM Service][CACHE-DEBUG] modelId=${modelId} temp=${temperature ?? 'n/a'} maxTokens=${maxTokens ?? 'n/a'}`);
            logger.info(`[LLM Service][CACHE-DEBUG] key(current-schema)=${cacheKey.slice(0, 12)}…`);
            logger.info(`[LLM Service][CACHE-DEBUG] key(canonical)=${canonicalKey.slice(0, 12)}…`);
            logger.info(`[LLM Service][CACHE-DEBUG] canonicalMessages(first 3 turns): ${JSON.stringify(sample)}`);
        } catch (e: any) {
            logger.warn(`[LLM Service][CACHE-DEBUG] Failed to compute canonical key: ${e?.message || e}`);
        }
    }

    const effectiveUseCache = useCache && !promptNoCache;

    if (effectiveUseCache) {
        // Check cache first
        try {
            const cachedResponse = await llmCache.get(cacheKey);
            if (cachedResponse) {
                logger.info(`[LLM Service] Cache HIT for ${modelId}. Tokens: ~${heuristicTokenCount}. Key: ${cacheKey.slice(0, 8)}...`);
                return cachedResponse;
            }
        } catch (error) {
            logger.warn(`[LLM Service] Cache read failed for ${modelId}: ${error}`);
        }
    }
    
    let reason = '';
    if (effectiveUseCache) {
        reason = 'Cache MISS';
    } else if (promptNoCache) {
        reason = `Bypassing cache due to prompt's 'noCache: true' setting`;
    } else { // !useCache
        reason = `Caching disabled by CLI flag`;
    }

    logger.info(`[LLM Service] ${reason} for ${modelId}. Tokens: ~${heuristicTokenCount}. Key: ${cacheKey.slice(0, 8)}... Calling API...`);

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

        // Treat any missing or empty response as an error for resilience.
        if (response.error || !response.responseText || response.responseText.trim() === '') {
            const error: any = new Error(response.error || 'Empty response from model');
            // Attach rate limit metadata to error for smart retry
            error.isRateLimitError = response.isRateLimitError;
            error.retryAfter = response.retryAfter;
            error.rateLimitReset = response.rateLimitReset;
            error.rateLimitRemaining = response.rateLimitRemaining;
            throw error;
        }
        return response.responseText;
    };

    try {
        const pRetry = (await import('p-retry')).default;
        const responseContent = await pRetry(apiCall, {
            retries: (typeof retries === 'number' && retries >= 0) ? retries : 1,

            // Smart retry: only retry rate limits and network errors
            shouldRetry: (error: any) => {
                // Always retry rate limits (429)
                if (error.isRateLimitError) {
                    return true;
                }

                // Retry network/connection errors
                if (error.code === 'ECONNRESET' ||
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'ENOTFOUND' ||
                    error.code === 'ECONNREFUSED') {
                    return true;
                }

                // Don't retry other errors (4xx client errors, 500 server errors, etc.)
                return false;
            },

            onFailedAttempt: (error: any) => {
                if (error.isRateLimitError) {
                    // Calculate exponential backoff with jitter
                    const baseDelay = 1000; // 1 second
                    const maxDelay = 30000; // 30 seconds cap

                    let waitTime: number;
                    if (error.retryAfter !== undefined) {
                        // Respect server's Retry-After header
                        waitTime = error.retryAfter * 1000;
                    } else {
                        // Exponential backoff: 2^(attempt-1) * baseDelay
                        const exponentialDelay = baseDelay * Math.pow(2, error.attemptNumber - 1);
                        // Add jitter (0-25% random variation)
                        const jitter = exponentialDelay * 0.25 * Math.random();
                        waitTime = Math.min(exponentialDelay + jitter, maxDelay);
                    }

                    logger.warn(
                        `[LLM Service] Rate limit (429) for ${modelId}. ` +
                        `Attempt ${error.attemptNumber}. ` +
                        `Retries left: ${error.retriesLeft}. ` +
                        `Waiting ${Math.round(waitTime)}ms before retry...`
                    );

                    // Note: p-retry doesn't support dynamic delays per attempt out of the box
                    // The actual wait is handled by p-retry's minTimeout/maxTimeout/factor
                } else {
                    logger.warn(`[LLM Service] API call failed for ${modelId}. Attempt ${error.attemptNumber}. Retries left: ${error.retriesLeft}.`);
                    logger.warn(`[LLM Service] Error: ${error.message}`);
                }
            },

            // Exponential backoff configuration for p-retry
            minTimeout: 1000,      // Start at 1 second
            maxTimeout: 30000,     // Cap at 30 seconds
            factor: 2,             // Double the delay each time
            randomize: true,       // Add jitter
        });
        
        if (effectiveUseCache) {
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

export async function* streamModelResponse(
  params: Omit<GetModelResponseParams, 'useCache' | 'retries'>
): AsyncGenerator<StreamChunk, void, undefined> {
  const { messages, modelId, systemPrompt, temperature, maxTokens, timeout } = params;
  const { logger } = getConfig();

  const finalMessages: ConversationMessage[] | undefined = messages;

  const requestPayload: LLMApiCallOptions = {
      modelId,
      messages: finalMessages?.map(m => ({ role: m.role, content: m.content ?? '' })),
      systemPrompt,
      temperature,
      maxTokens,
      stream: true,
      ...(typeof timeout === 'number' && isFinite(timeout) ? { timeout } : {}),
  };

  logger.info(`[LLM Service] Starting stream for ${modelId}...`);
  
  try {
    const stream = dispatchStreamApiCall(requestPayload);
    for await (const chunk of stream) {
      yield chunk;
    }
  } catch (err: any) {
    const errorMsg = err.message || 'An unknown error occurred during the stream.';
    logger.error(`[llm-service] failed to stream response: ${errorMsg}`);
    yield { type: 'error', error: `Sorry, there was a problem communicating with the model. Please try again.\n\nDetails: ${errorMsg}` };
  }
} 