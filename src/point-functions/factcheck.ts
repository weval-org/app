import { PointFunction, PointFunctionContext } from './types';
import { callBackgroundFunction } from '../lib/background-function-client';
import { getCache, generateCacheKey } from '../lib/cache-service';
import { getConfig } from '@/cli/config';

/**
 * Shortcut point function for fact-checking using the factcheck endpoint.
 *
 * This is a convenience wrapper around $call that automatically:
 * - Passes the response as the claim
 * - Uses the factcheck service endpoint
 * - Takes an instruction string to guide the fact-checker
 *
 * Usage:
 *   $factcheck: "focus on city names and population figures only"
 *
 * Equivalent to:
 *   $call:
 *     url: "${FACTCHECK_ENDPOINT_URL}"
 *     claim: "{response}"
 *     instruction: "focus on city names and population figures only"
 *
 * @param response - The model's response text (automatically passed as claim)
 * @param args - The instruction string to guide fact-checking
 * @param context - Point function context
 * @returns Score and explanation from fact-check service, or error
 */
export const factcheck: PointFunction = async (
    response: string,
    args: any,
    context: PointFunctionContext
): Promise<{ score: number; explain: string } | { error: string }> => {
    const logger = getConfig().logger;

    // Validate args - should be a string instruction, or omitted entirely for general fact-checking
    if (args !== undefined && args !== null && typeof args !== 'string') {
        return { error: "Argument for 'factcheck' must be a string instruction (e.g., 'focus on city names only'), or omitted for general fact-checking" };
    }

    const instruction = args || ''; // Empty string if omitted

    // Build request body for factcheck endpoint
    const requestBody: any = {
        claim: response,
        instruction: instruction,
        includeRaw: false  // We don't need the raw parse in normal usage
    };

    // If we have a multi-turn conversation, pass the full context
    if (context.prompt.messages && context.prompt.messages.length > 0) {
        const generatedIndices = new Set(context.generatedAssistantIndices || []);

        // Build messages array with marking which assistant messages were generated
        let assistantIndex = 0;
        requestBody.messages = context.prompt.messages.map((msg) => {
            const isGenerated = msg.role === 'assistant' && generatedIndices.has(assistantIndex);
            if (msg.role === 'assistant') {
                assistantIndex++;
            }
            return {
                role: msg.role,
                content: msg.content || '',
                generated: isGenerated
            };
        });
    }

    // Check cache (24 hour TTL)
    const cache = getCache('llm-responses');
    const cacheKey = generateCacheKey({
        type: 'factcheck',
        claim: response,
        instruction,
        messages: requestBody.messages  // Include messages in cache key for multi-turn
    });

    try {
        const cachedResult = await cache.get(cacheKey);
        if (cachedResult) {
            logger.info('[factcheck] Cache hit');
            // Append cached indicator to explain
            const result = cachedResult as { score: number; explain: string };
            return {
                ...result,
                explain: result.explain + (result.explain ? ' (cached)' : '(cached)')
            };
        }
    } catch (error: any) {
        logger.warn(`[factcheck] Cache check failed: ${error.message}`);
    }

    // Call factcheck background function
    try {
        logger.info('[factcheck] Calling factcheck service');

        const result = await callBackgroundFunction({
            functionName: 'factcheck',
            body: requestBody,
            timeout: 65000  // Web searches take time
        });

        // Check if the call failed
        if (!result.ok) {
            return { error: result.error || `Factcheck service returned HTTP ${result.status}` };
        }

        // Validate response data format
        const data = result.data;
        if (!data || typeof data !== 'object') {
            return { error: 'Invalid response from factcheck service: no data' };
        }

        if (typeof data.score !== 'number') {
            return { error: 'Invalid response from factcheck service: missing or invalid score' };
        }

        if (data.score < 0 || data.score > 1) {
            return { error: `Invalid score from factcheck service: ${data.score} (must be 0-1)` };
        }

        const factcheckResponse: { score: number; explain: string } = {
            score: data.score,
            explain: data.explain || 'No explanation provided'
        };

        // Cache successful result (24 hours)
        try {
            await cache.set(cacheKey, factcheckResponse, 60 * 60 * 24 * 1000);
        } catch (error: any) {
            logger.warn(`[factcheck] Failed to cache result: ${error.message}`);
        }

        return factcheckResponse;

    } catch (error: any) {
        logger.error(`[factcheck] Factcheck service call failed: ${error.message}`);
        return {
            error: `Factcheck failed: ${error.message}`
        };
    }
};
