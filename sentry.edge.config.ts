// This file configures the initialization of Sentry for edge features (middleware, edge functions, etc.).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

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

    // Release tracking
    release: process.env.SENTRY_RELEASE,
  });
} else {
  console.log('[Sentry] Edge runtime error tracking disabled (no DSN configured)');
}
