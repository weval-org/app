// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

// Only initialize Sentry if DSN is configured
// If not configured, the app will work normally without error tracking
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,

  // Environment
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development',

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  replaysOnErrorSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out noisy errors
  beforeSend(event, hint) {
    const error = hint.originalException;

    if (error && typeof error === 'object' && 'message' in error) {
      const message = String(error.message);

      // Filter out common non-actionable errors
      if (
        message.includes('ResizeObserver') ||
        message.includes('Non-Error promise rejection') ||
        message.includes('cancelled') ||
        message.includes('Network request failed')
      ) {
        return null;
      }
    }

    return event;
  },
  });
} else {
  console.log('[Sentry] Client-side error tracking disabled (no DSN configured)');
}
