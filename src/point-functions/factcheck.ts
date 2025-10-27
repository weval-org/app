import { PointFunction, PointFunctionContext } from './types';
import { makeHttpRequest, substituteEnvVars } from '../lib/external-service-utils';
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

    // Validate args - should be a string instruction
    if (typeof args !== 'string') {
        return { error: "Argument for 'factcheck' must be a string instruction (e.g., 'focus on city names only')" };
    }

    const instruction = args;

    // Get factcheck endpoint URL from environment
    const factcheckUrl = process.env.FACTCHECK_ENDPOINT_URL;
    if (!factcheckUrl) {
        return {
            error: 'FACTCHECK_ENDPOINT_URL environment variable is not set. Please configure the factcheck endpoint URL.'
        };
    }

    // Substitute environment variables in URL if needed
    let resolvedUrl: string;
    try {
        resolvedUrl = substituteEnvVars(factcheckUrl);
    } catch (error: any) {
        return {
            error: `Failed to resolve factcheck URL: ${error.message}`
        };
    }

    // Build request body for factcheck endpoint
    // Note: factcheck endpoint expects {claim, instruction}, not the standard ExternalServiceRequest format
    const requestBody: any = {
        claim: response,
        instruction: instruction,
        includeRaw: false  // We don't need the raw parse in normal usage
    };

    // Check cache (24 hour TTL)
    const cache = getCache('llm-responses');
    const cacheKey = generateCacheKey({
        type: 'factcheck',
        claim: response,
        instruction,
        url: resolvedUrl
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

    // Make HTTP request to factcheck service
    const serviceConfig = {
        url: resolvedUrl,
        method: 'POST' as const,
        timeout_ms: 65000,  // Web searches take time
        max_retries: 1
    };

    try {
        logger.info('[factcheck] Calling factcheck service');

        const result = await makeHttpRequest(serviceConfig, requestBody);

        // Validate response format
        if (typeof result !== 'object' || result === null) {
            return { error: 'Invalid response from factcheck service: not an object' };
        }

        if ('error' in result && typeof result.error === 'string') {
            return { error: `Factcheck service error: ${result.error}` };
        }

        if (!('score' in result) || typeof result.score !== 'number') {
            return { error: 'Invalid response from factcheck service: missing or invalid score' };
        }

        if (result.score < 0 || result.score > 1) {
            return { error: `Invalid score from factcheck service: ${result.score} (must be 0-1)` };
        }

        const response: { score: number; explain: string } = {
            score: result.score,
            explain: result.explain || 'No explanation provided'
        };

        // Cache successful result (24 hours)
        try {
            await cache.set(cacheKey, response, 60 * 60 * 24 * 1000);
        } catch (error: any) {
            logger.warn(`[factcheck] Failed to cache result: ${error.message}`);
        }

        return response;

    } catch (error: any) {
        logger.error(`[factcheck] Factcheck service call failed: ${error.message}`);
        return {
            error: `Factcheck failed: ${error.message}`
        };
    }
};
