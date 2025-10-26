import {
    ExternalServiceConfig,
    ExternalServiceRequest,
    ExternalServiceResponse
} from '@/types/shared';

/**
 * Substitutes ${ENV_VAR} placeholders with environment variable values.
 * Throws if variable is not found.
 *
 * @param value - String that may contain ${VAR} placeholders
 * @returns String with environment variables substituted
 * @throws Error if environment variable is not defined
 */
export function substituteEnvVars(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        const envValue = process.env[varName];
        if (envValue === undefined) {
            throw new Error(`Environment variable ${varName} is not defined`);
        }
        return envValue;
    });
}

/**
 * Template data available for substitution in request bodies.
 */
export interface TemplateData {
    response: string;
    modelId: string;
    promptId: string;
    messages?: any[];          // Conversation history for multi-turn prompts
    promptText?: string;        // The prompt text (for backwards compatibility)
}

/**
 * Recursively substitutes templates in an object.
 * Supported templates: {response}, {modelId}, {promptId}, {messages}, {promptText}
 * Templates are replaced with actual values from the provided data.
 *
 * @param obj - Object, array, or primitive value to process
 * @param data - Template data containing response, modelId, promptId, messages, promptText
 * @returns Object with templates substituted
 */
export function substituteTemplates(obj: any, data: TemplateData): any {
    if (typeof obj === 'string') {
        // Special case: if the string is exactly a template, return the value directly
        // This allows complex objects like arrays to be passed through
        if (obj === '{messages}' && data.messages !== undefined) {
            return data.messages;
        }
        if (obj === '{response}') return data.response;
        if (obj === '{modelId}') return data.modelId;
        if (obj === '{promptId}') return data.promptId;
        if (obj === '{promptText}' && data.promptText !== undefined) {
            return data.promptText;
        }

        // Otherwise, perform string replacement for embedded templates
        let result = obj;
        result = result.replace(/\{response\}/g, data.response);
        result = result.replace(/\{modelId\}/g, data.modelId);
        result = result.replace(/\{promptId\}/g, data.promptId);

        // For complex objects in string context, use JSON representation
        if (result.includes('{messages}') && data.messages !== undefined) {
            result = result.replace(/\{messages\}/g, JSON.stringify(data.messages));
        }
        if (result.includes('{promptText}') && data.promptText !== undefined) {
            result = result.replace(/\{promptText\}/g, data.promptText);
        }

        return result;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => substituteTemplates(item, data));
    }

    if (typeof obj === 'object' && obj !== null) {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [
                key,
                substituteTemplates(value, data)
            ])
        );
    }

    return obj;
}

/**
 * Validates that a service response has the required format.
 *
 * @param response - Response object from external service
 * @returns Validation result with valid flag and optional error message
 */
export function validateServiceResponse(response: any): {
    valid: boolean;
    error?: string;
} {
    if (typeof response !== 'object' || response === null) {
        return { valid: false, error: 'Response must be an object' };
    }

    // If service returned an error, that's a valid format (though not success)
    if (response.error) {
        return { valid: true };
    }

    // Check score field
    if (typeof response.score !== 'number') {
        return {
            valid: false,
            error: `score must be a number, got ${typeof response.score}`
        };
    }

    // Check score range
    if (response.score < 0 || response.score > 1) {
        return {
            valid: false,
            error: `score must be between 0 and 1, got ${response.score}`
        };
    }

    return { valid: true };
}

/**
 * Determines if an error is retryable (network issues, timeouts, 5xx errors).
 *
 * @param error - Error object from failed request
 * @returns True if the request should be retried
 */
function shouldRetry(error: any): boolean {
    // Retry on network errors, timeouts, or server errors (5xx)
    return (
        error.name === 'AbortError' ||
        error.message?.includes('HTTP 5') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ETIMEDOUT') ||
        error.message?.includes('fetch failed')
    );
}

/**
 * Sleep for specified milliseconds.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Makes an HTTP request to an external service with timeout and retry logic.
 * Automatically retries on network errors and server errors (5xx).
 *
 * @param config - External service configuration
 * @param body - Request body to send
 * @param retryCount - Current retry attempt (for internal use)
 * @returns Promise resolving to service response
 * @throws Error if request fails after all retries
 */
export async function makeHttpRequest(
    config: ExternalServiceConfig,
    body: ExternalServiceRequest,
    retryCount: number = 0
): Promise<ExternalServiceResponse> {
    const controller = new AbortController();
    const timeoutMs = config.timeout_ms || 30000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        // Substitute environment variables in headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (config.headers) {
            for (const [key, value] of Object.entries(config.headers)) {
                try {
                    headers[key] = substituteEnvVars(value);
                } catch (error: any) {
                    throw new Error(`Failed to substitute env var in header '${key}': ${error.message}`);
                }
            }
        }

        // Make HTTP request
        const response = await fetch(config.url, {
            method: config.method || 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });

        // Handle non-OK responses
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
        }

        // Parse JSON response
        const result = await response.json();

        // Validate response format
        const validation = validateServiceResponse(result);
        if (!validation.valid) {
            throw new Error(`Invalid service response: ${validation.error}`);
        }

        return result;

    } catch (error: any) {
        // Retry logic
        const maxRetries = config.max_retries ?? 2;
        if (retryCount < maxRetries && shouldRetry(error)) {
            const backoffMs = (config.retry_backoff_ms || 1000) * (retryCount + 1);
            await sleep(backoffMs);
            return makeHttpRequest(config, body, retryCount + 1);
        }

        // Re-throw if not retryable or retries exhausted
        throw error;

    } finally {
        clearTimeout(timeout);
    }
}
