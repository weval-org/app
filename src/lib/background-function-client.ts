/**
 * Unified client for calling internal background API routes with authentication.
 *
 * This module provides a simple abstraction for invoking background routes
 * with automatic URL construction and authentication header injection.
 */

export interface BackgroundFunctionCallOptions {
    /**
     * The name of the background function (maps to /api/internal/{functionName})
     * e.g., 'factcheck', 'execute-evaluation-background'
     */
    functionName: string;

    /**
     * The request body to send (will be JSON.stringify'd)
     */
    body: any;

    /**
     * Optional timeout in milliseconds (default: 30000)
     */
    timeout?: number;

    /**
     * Optional base URL override (defaults to process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3172')
     */
    baseUrl?: string;
}

export interface BackgroundFunctionResponse {
    ok: boolean;
    status: number;
    data?: any;
    error?: string;
}

/**
 * Calls an internal background API route with automatic authentication.
 *
 * @param options - Configuration for the background function call
 * @returns Promise resolving to the response data
 *
 * @example
 * ```typescript
 * const result = await callBackgroundFunction({
 *   functionName: 'factcheck',
 *   body: { claim: 'Water freezes at 0°C' }
 * });
 * ```
 */
export async function callBackgroundFunction(
    options: BackgroundFunctionCallOptions
): Promise<BackgroundFunctionResponse> {
    const { functionName, body, timeout = 30000, baseUrl } = options;

    // Get authentication token
    const authToken = process.env.BACKGROUND_FUNCTION_AUTH_TOKEN;
    if (!authToken) {
        throw new Error(
            'BACKGROUND_FUNCTION_AUTH_TOKEN environment variable is not set. ' +
            'This is required for calling background functions.'
        );
    }

    // Construct URL
    const base = baseUrl || process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3172';
    const url = new URL(`/api/internal/${functionName}`, base);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Background-Function-Auth-Token': authToken
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Parse response
        let data: any;
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            try {
                data = await response.json();
            } catch (e) {
                data = null;
            }
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            return {
                ok: false,
                status: response.status,
                error: data?.error || data || `HTTP ${response.status}`,
                data
            };
        }

        return {
            ok: true,
            status: response.status,
            data
        };

    } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            throw new Error(`Background function call to ${functionName} timed out after ${timeout}ms`);
        }

        throw new Error(`Failed to call background function ${functionName}: ${error.message}`);
    }
}

/**
 * Helper to construct a background function URL without calling it.
 * Useful for logging or debugging.
 *
 * @param functionName - The name of the background function
 * @param baseUrl - Optional base URL override
 * @returns The full URL to the background function
 */
export function getBackgroundFunctionUrl(functionName: string, baseUrl?: string): string {
    const base = baseUrl || process.env.URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3172';
    return new URL(`/api/internal/${functionName}`, base).toString();
}
