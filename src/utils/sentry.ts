import * as Sentry from '@sentry/node';

/**
 * Initializes Sentry for serverless functions with optimized settings
 *
 * @param functionName - Name of the function for tagging/identification
 * @returns Initialized Sentry instance
 */
export function initSentry(functionName: string) {
  const sentryDsn = process.env.SENTRY_DSN;
  const environment = process.env.CONTEXT || process.env.NODE_ENV || 'unknown';

  if (!sentryDsn) {
    console.warn(`[Sentry] No SENTRY_DSN configured for ${functionName} - error tracking disabled`);
    return null;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment,

    // Performance monitoring - sample 10% of transactions
    tracesSampleRate: 0.1,

    // Profiling - sample 10% of traced transactions (requires @sentry/profiling-node)
    // profilesSampleRate: 0.1,

    // Serverless-specific configuration
    integrations: [
      // Node-specific integrations
      Sentry.httpIntegration(),
      Sentry.modulesIntegration(),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
      Sentry.contextLinesIntegration(),

      // Uncomment if profiling is needed (requires build step)
      // nodeProfilingIntegration(),
    ],

    // Better stack traces
    attachStacktrace: true,

    // Set default tags for all events
    initialScope: {
      tags: {
        function: functionName,
        runtime: 'railway',
      },
    },

    // Release tracking (set via environment variable in CI/CD)
    release: process.env.SENTRY_RELEASE,

    // Filter out noisy errors
    beforeSend(event, hint) {
      // Don't send errors for specific patterns
      const error = hint.originalException;
      if (error && typeof error === 'object' && 'message' in error) {
        const message = String(error.message);

        // Filter out rate limiting errors (expected behavior)
        if (message.includes('rate limit') || message.includes('429')) {
          return null;
        }

        // Filter out network timeouts (common in serverless)
        if (message.includes('ETIMEDOUT') || message.includes('ECONNRESET')) {
          // Still send but with lower severity
          event.level = 'warning';
        }
      }

      return event;
    },
  });

  // Set global tags that apply to all events
  Sentry.setTag('function', functionName);

  return Sentry;
}

/**
 * Wraps a background function handler with Sentry error tracking
 *
 * @param handler - The original background handler function
 * @param functionName - Name of the function for identification
 * @returns Wrapped handler with Sentry integration
 */
export function wrapBackgroundHandler<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  functionName: string
): T {
  return (async (...args: any[]) => {
    const sentry = initSentry(functionName);

    if (!sentry) {
      // Sentry not configured, run handler normally
      return handler(...args);
    }

    try {
      const result = await handler(...args);
      return result;
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error);

      // Flush events before function terminates (important for serverless)
      await Sentry.close(2000);

      // Re-throw so handler can still process error
      throw error;
    }
  }) as T;
}

/**
 * Captures an error in Sentry with additional context
 *
 * @param error - The error to capture
 * @param context - Additional context to attach to the error
 */
export function captureError(
  error: Error | unknown,
  context?: {
    runId?: string;
    configId?: string;
    blueprintKey?: string;
    [key: string]: any;
  }
) {
  // Safe to call even if Sentry is not initialized (will be a no-op)
  try {
    Sentry.captureException(error, {
      contexts: {
        operation: context || {},
      },
      tags: {
        ...(context?.runId && { runId: context.runId }),
        ...(context?.configId && { configId: context.configId }),
      },
    });
  } catch (err) {
    // Silently fail if Sentry is not initialized
    // This ensures the app continues to work without Sentry
  }
}

/**
 * Adds breadcrumb for debugging
 *
 * @param message - Breadcrumb message
 * @param data - Additional data
 * @param level - Severity level
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, any>,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info'
) {
  // Safe to call even if Sentry is not initialized
  try {
    Sentry.addBreadcrumb({
      message,
      level,
      data,
      timestamp: Date.now() / 1000,
    });
  } catch (err) {
    // Silently fail if Sentry is not initialized
  }
}

/**
 * Flushes pending Sentry events (important for serverless)
 * Call this before function termination to ensure events are sent
 *
 * @param timeout - Max time to wait in milliseconds (default 2000)
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  // Safe to call even if Sentry is not initialized
  try {
    await Sentry.close(timeout);
  } catch (err) {
    // Silently fail if Sentry is not initialized
  }
}

/**
 * Sets user context for the current scope
 */
export function setUserContext(userId: string, additionalData?: Record<string, any>) {
  // Safe to call even if Sentry is not initialized
  try {
    Sentry.setUser({
      id: userId,
      ...additionalData,
    });
  } catch (err) {
    // Silently fail if Sentry is not initialized
  }
}

/**
 * Sets custom context for the current scope
 */
export function setContext(name: string, context: Record<string, any>) {
  // Safe to call even if Sentry is not initialized
  try {
    Sentry.setContext(name, context);
  } catch (err) {
    // Silently fail if Sentry is not initialized
  }
}

/**
 * Re-export commonly used Sentry utilities
 */
export { Sentry };
