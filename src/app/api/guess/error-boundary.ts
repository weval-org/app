/**
 * Global error handler for the guess API routes
 * Catches uncaught exceptions that escape route handlers
 */

if (typeof process !== 'undefined') {
    // Store original handlers
    const originalUncaughtException = process.listeners('uncaughtException');
    const originalUnhandledRejection = process.listeners('unhandledRejection');

    // Add our handler
    process.on('uncaughtException', (error: Error) => {
        if (error.message?.includes('Invalid string length')) {
            console.error('[Guess][Global] ⚠️ Caught RangeError at process level:');
            console.error('[Guess][Global] Error:', error.message);
            console.error('[Guess][Global] Stack:', error.stack);
            console.error('[Guess][Global] This likely means a large object was being stringified');
            // Don't crash the process for this error
            return;
        }

        // For other errors, call original handlers
        for (const handler of originalUncaughtException) {
            if (typeof handler === 'function') {
                try {
                    (handler as any)(error, 'uncaughtException');
                } catch {
                    // Ignore errors from handlers
                }
            }
        }
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
        console.error('[Guess][Global] ⚠️ Unhandled promise rejection:');
        console.error('[Guess][Global] Reason:', reason);
        console.error('[Guess][Global] Promise:', promise);

        // For other errors, call original handlers
        for (const handler of originalUnhandledRejection) {
            if (typeof handler === 'function') {
                handler(reason, promise);
            }
        }
    });
}

export {};
