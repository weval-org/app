/**
 * Authentication utilities for Netlify background functions.
 *
 * Provides a simple authentication check based on a shared secret token.
 */

import type { HandlerEvent, HandlerResponse } from '@netlify/functions';

/**
 * Checks if the request has a valid authentication token.
 *
 * @param event - The Netlify function event
 * @returns HandlerResponse if authentication fails, null if authentication succeeds
 *
 * @example
 * ```typescript
 * export const handler: Handler = async (event) => {
 *   const authError = checkBackgroundFunctionAuth(event);
 *   if (authError) return authError;
 *
 *   // Proceed with function logic...
 * };
 * ```
 */
export function checkBackgroundFunctionAuth(event: HandlerEvent): HandlerResponse | null {
    const authToken = event.headers['x-background-function-auth-token'];
    const expectedToken = process.env.BACKGROUND_FUNCTION_AUTH_TOKEN;

    // Check if token is configured
    if (!expectedToken) {
        console.error('[BackgroundFunctionAuth] BACKGROUND_FUNCTION_AUTH_TOKEN not configured in environment');
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Background function not properly configured'
            }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    // Check if token matches
    if (!authToken || authToken !== expectedToken) {
        console.warn('[BackgroundFunctionAuth] Unauthorized access attempt');
        return {
            statusCode: 401,
            body: JSON.stringify({
                error: 'Unauthorized. Valid authentication token required.'
            }),
            headers: { 'Content-Type': 'application/json' }
        };
    }

    // Authentication successful
    return null;
}
