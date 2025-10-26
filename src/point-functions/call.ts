import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';
import {
    makeHttpRequest,
    substituteTemplates,
    TemplateData
} from '@/lib/external-service-utils';
import { ExternalServiceRequest, ExternalServiceConfig } from '@/types/shared';
import { getCache, generateCacheKey } from '@/lib/cache-service';
import { getConfig } from '@/cli/config';

/**
 * Arguments for the $call point function.
 * Either 'service' (named) or 'url' (inline) must be provided.
 */
interface CallArgs {
    /** Named service from config.externalServices */
    service?: string;

    /** Direct URL for inline service calls */
    url?: string;

    /** HTTP method (for inline calls) */
    method?: 'GET' | 'POST' | 'PUT';

    /** HTTP headers (for inline calls) */
    headers?: Record<string, string>;

    /** Request timeout in milliseconds (for inline calls) */
    timeout_ms?: number;

    /** Whether to cache responses (for inline calls) */
    cache?: boolean;

    /** Max retry attempts (for inline calls) */
    max_retries?: number;

    /** Retry backoff in ms (for inline calls) */
    retry_backoff_ms?: number;

    /** All other fields are user-defined parameters passed to the service */
    [key: string]: any;
}

/** Keys that are configuration, not user parameters */
const CONFIG_KEYS = [
    'service',
    'url',
    'method',
    'headers',
    'timeout_ms',
    'cache',
    'max_retries',
    'retry_backoff_ms'
];

/**
 * Resolves service configuration from either named service or inline specification.
 *
 * @param args - Call arguments from blueprint
 * @param context - Point function context
 * @returns Resolved service config and service name
 * @throws Error if neither service nor url is provided, or service not found
 */
function resolveServiceConfig(
    args: CallArgs,
    context: PointFunctionContext
): { config: ExternalServiceConfig; name: string } {
    if (args.service) {
        // Named service - look up in config
        const services = context.config.externalServices;

        if (!services || !services[args.service]) {
            const available = services ? Object.keys(services) : [];
            throw new Error(
                `External service '${args.service}' not found in config. ` +
                `Available services: ${available.length > 0 ? available.join(', ') : 'none'}`
            );
        }

        return {
            config: services[args.service],
            name: args.service
        };
    }

    if (args.url) {
        // Inline URL - build config from args
        return {
            config: {
                url: args.url,
                method: args.method || 'POST',
                headers: args.headers,
                timeout_ms: args.timeout_ms,
                cache: args.cache,
                max_retries: args.max_retries,
                retry_backoff_ms: args.retry_backoff_ms
            },
            name: 'inline'
        };
    }

    throw new Error(
        "Must provide either 'service' (named service) or 'url' (inline service)"
    );
}

/**
 * Extracts user-defined parameters from call arguments.
 * Filters out configuration keys, leaving only custom parameters.
 *
 * @param args - Call arguments
 * @returns Object containing only user-defined parameters
 */
function extractUserParams(args: CallArgs): Record<string, any> {
    return Object.fromEntries(
        Object.entries(args).filter(([key]) => !CONFIG_KEYS.includes(key))
    );
}

/**
 * Builds request body with standard fields and user parameters.
 *
 * @param response - Model response text
 * @param context - Point function context
 * @param userParams - User-defined parameters
 * @returns Complete request body
 */
function buildRequestBody(
    response: string,
    context: PointFunctionContext,
    userParams: Record<string, any>
): ExternalServiceRequest {
    const templateData: TemplateData = {
        response,
        modelId: context.modelId,
        promptId: context.prompt.id,
        messages: context.prompt?.messages,
        promptText: context.prompt?.promptText
    };

    // Apply template substitution to all user params
    const substitutedParams = substituteTemplates(userParams, templateData);

    // Build request with standard fields + user params
    return {
        response,
        modelId: context.modelId,
        promptId: context.prompt.id,
        ...substitutedParams
    };
}

/**
 * External service call point function.
 * Calls an HTTP service to perform custom evaluation logic.
 *
 * Supports template substitution for:
 * - {response}: Model's response text
 * - {modelId}: Model identifier
 * - {promptId}: Prompt identifier
 * - {messages}: Conversation history (array)
 * - {promptText}: The prompt text
 *
 * Usage:
 *   $call:
 *     service: fact-checker        # Named service
 *     claim: "Factual claim"
 *     response: "{response}"
 *
 *   $call:
 *     url: "https://..."           # Or inline URL
 *     messages: "{messages}"       # Pass conversation history
 *     param: "value"
 *
 * @param response - The model's response text
 * @param args - Call arguments (service or url + parameters)
 * @param context - Point function context
 * @returns Score and explanation from service, or error
 */
export const call: PointFunction = async (
    response: string,
    args: any,
    context: PointFunctionContext
): Promise<PointFunctionReturn> => {
    const logger = getConfig().logger;

    // Validate args type
    if (typeof args !== 'object' || args === null) {
        return { error: "Argument for 'call' must be an object" };
    }

    const callArgs = args as CallArgs;

    try {
        // Resolve service configuration
        const { config: serviceConfig, name: serviceName } = resolveServiceConfig(
            callArgs,
            context
        );

        // Extract user-defined parameters
        const userParams = extractUserParams(callArgs);

        // Build request body
        const requestBody = buildRequestBody(response, context, userParams);

        // Check cache
        const useCache = serviceConfig.cache !== false;
        if (useCache) {
            const cache = getCache('external-services');
            const cacheKey = generateCacheKey({
                type: 'call',
                service: serviceName,
                url: serviceConfig.url,
                body: requestBody
            });

            const cached = await cache.get(cacheKey);
            if (cached) {
                logger.info(`[call] Cache hit for service '${serviceName}'`);
                return {
                    score: cached.score,
                    explain: cached.explain ? `${cached.explain} (cached)` : undefined
                };
            }
        }

        // Make HTTP request
        logger.info(
            `[call] Calling external service '${serviceName}': ${serviceConfig.url}`
        );

        const result = await makeHttpRequest(serviceConfig, requestBody);

        // Handle error response from service
        if (result.error) {
            logger.error(
                `[call] Service '${serviceName}' returned error: ${result.error}`
            );
            return { error: `External service error: ${result.error}` };
        }

        // Cache successful result
        if (useCache) {
            const cache = getCache('external-services');
            const cacheKey = generateCacheKey({
                type: 'call',
                service: serviceName,
                url: serviceConfig.url,
                body: requestBody
            });
            await cache.set(cacheKey, result, 60 * 60 * 24 * 1000); // 24 hours in ms
        }

        logger.info(`[call] Service '${serviceName}' returned score: ${result.score}`);

        return {
            score: result.score,
            explain: result.explain
        };

    } catch (error: any) {
        logger.error(`[call] External service call failed: ${error.message}`);

        return {
            error: `External service call failed: ${error.message}`
        };
    }
};
