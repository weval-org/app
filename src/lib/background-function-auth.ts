/**
 * Authentication utilities for internal background API routes.
 *
 * Provides a simple authentication check based on a shared secret token.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Checks if the request has a valid authentication token (Next.js API route version).
 *
 * @param req - The Next.js request
 * @returns NextResponse if authentication fails, null if authentication succeeds
 *
 * @example
 * ```typescript
 * export async function POST(req: NextRequest) {
 *   const authError = checkBackgroundAuth(req);
 *   if (authError) return authError;
 *
 *   // Proceed with route logic...
 * };
 * ```
 */
export function checkBackgroundAuth(req: NextRequest): NextResponse | null {
    const authToken = req.headers.get('x-background-function-auth-token');
    const expectedToken = process.env.BACKGROUND_FUNCTION_AUTH_TOKEN;

    // Check if token is configured
    if (!expectedToken) {
        console.error('[BackgroundAuth] BACKGROUND_FUNCTION_AUTH_TOKEN not configured in environment');
        return NextResponse.json(
            { error: 'Background function not properly configured' },
            { status: 500 }
        );
    }

    // Check if token matches
    if (!authToken || authToken !== expectedToken) {
        console.warn('[BackgroundAuth] Unauthorized access attempt');
        return NextResponse.json(
            { error: 'Unauthorized. Valid authentication token required.' },
            { status: 401 }
        );
    }

    // Authentication successful
    return null;
}

/**
 * Legacy alias for backward compatibility with Netlify function callers.
 * @deprecated Use checkBackgroundAuth instead
 */
export const checkBackgroundFunctionAuth = checkBackgroundAuth;
