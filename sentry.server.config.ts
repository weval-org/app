// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const sentryDsn = process.env.SENTRY_DSN;

// Only initialize Sentry if DSN is configured
// If not configured, the app will work normally without error tracking
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,

  // Environment
  environment: process.env.CONTEXT || process.env.NODE_ENV || 'development',

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Integrations
  integrations: [
    Sentry.httpIntegration(),
    Sentry.modulesIntegration(),
    Sentry.onUncaughtExceptionIntegration(),
    Sentry.onUnhandledRejectionIntegration(),
    Sentry.contextLinesIntegration(),
  ],

  // Better stack traces
  attachStacktrace: true,

  // Release tracking (set via environment variable in CI/CD)
  release: process.env.SENTRY_RELEASE,

  // Filter out noisy errors
  beforeSend(event, hint) {
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

      // Filter out common validation errors
      if (message.includes('Invalid request') || message.includes('Validation failed')) {
        event.level = 'info';
      }
    }

    return event;
  },
  });
} else {
  console.log('[Sentry] Server-side error tracking disabled (no DSN configured)');
}
