# Sentry Error Tracking Setup

This project uses [Sentry](https://sentry.io) for comprehensive error tracking and observability across **all serverless infrastructure** - both Netlify Functions and Next.js API routes.

## Overview

Sentry integration provides:
- **Automatic error capture** in all background functions, scheduled tasks, and API routes
- **Breadcrumb trails** via logger integration for debugging
- **Structured context** (runId, configId, request data, etc.) attached to every error
- **Stack traces with source maps** for TypeScript errors
- **Performance monitoring** (optional) for function execution times and API response times
- **Session replay** for debugging user-reported issues
- **Error filtering** to reduce noise from expected errors (rate limits, timeouts)

## Quick Setup

### 1. Create a Sentry Account

1. Sign up at [sentry.io](https://sentry.io)
2. Create a new project (select "Node.js" as platform)
3. Copy your DSN from the project settings

### 2. Configure Environment Variables

Add to your `.env` file (or Netlify environment variables):

```bash
# Required - for server-side error tracking
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Required - for client-side error tracking (same DSN)
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Optional - for source map uploads
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=your-project-slug
SENTRY_AUTH_TOKEN=your-auth-token

# Optional - for release tracking
SENTRY_RELEASE=git-commit-sha
```

To add to Netlify:
```bash
# Using Netlify CLI
netlify env:set SENTRY_DSN "https://your-sentry-dsn@sentry.io/project-id"
netlify env:set NEXT_PUBLIC_SENTRY_DSN "https://your-sentry-dsn@sentry.io/project-id"
```

Or via the Netlify UI: **Site Settings → Environment Variables**

### 3. Deploy

That's it! Sentry is now active. Errors will automatically be captured and sent to your Sentry dashboard.

## Environment Configuration

### Do I Need Separate DSNs for Local/Staging/Production?

**No! You can use ONE DSN for all environments.**

Sentry uses the `environment` field (not different DSNs) to separate data:

```typescript
// Automatically set based on context:
environment: process.env.CONTEXT || process.env.NODE_ENV || 'development'
```

**With one DSN, all errors go to the same Sentry project, tagged with:**
- `production` - Your live Netlify site
- `deploy-preview` - Netlify preview deploys
- `branch-deploy` - Netlify branch deploys
- `development` - Local development

You can filter by environment in Sentry:
```
environment:production
environment:development
```

### Should I Set SENTRY_DSN Locally?

**Recommendation: Don't set SENTRY_DSN in your local `.env` file.**

**Why skip it locally:**
- ✅ No noise from local development errors
- ✅ Faster local development (no Sentry network calls)
- ✅ Only real staging/production errors get tracked

**What happens without local DSN:**
- Sentry logs: `[Sentry] No SENTRY_DSN configured - error tracking disabled`
- Your app works perfectly fine
- Just no error tracking locally (which is usually what you want)

### Graceful Degradation

**All Sentry integrations are designed to fail gracefully:**

If `SENTRY_DSN` is not configured or is invalid:
- ✅ **App continues to work normally** - no crashes or errors
- ✅ **Logging continues** - console logs work as expected
- ✅ **No performance impact** - Sentry calls become no-ops
- ✅ **Helpful warnings** - Console logs inform you that Sentry is disabled

**Protected functions:**
- `initSentry()` - Returns `null` if DSN missing, logs warning
- `captureError()` - Silently no-ops if Sentry not initialized
- `setContext()` - Silently no-ops if Sentry not initialized
- `flushSentry()` - Silently no-ops if Sentry not initialized
- `addBreadcrumb()` - Silently no-ops if Sentry not initialized

**What you'll see in console without DSN:**
```
[Sentry] No SENTRY_DSN configured for execute-story-quick-run-background - error tracking disabled
[Sentry] Client-side error tracking disabled (no DSN configured)
[Sentry] Server-side error tracking disabled (no DSN configured)
```

These are **informational messages only** - your app works perfectly.

**Configuration:**
```bash
# Local .env - DON'T include SENTRY_DSN
# (Just omit these lines locally)

# Netlify environment - DO include:
netlify env:set SENTRY_DSN "https://your-dsn@sentry.io/project-id"
netlify env:set NEXT_PUBLIC_SENTRY_DSN "https://your-dsn@sentry.io/project-id"
```

### When Would You Want Separate DSNs?

Only if you need:
1. **Separate quotas** - Production errors don't eat into dev quota
2. **Different team access** - Some people only see production
3. **Completely separate projects** - Different alerting rules per environment

**For most projects: One DSN is perfect.** The free tier (5k errors/month) is plenty.

## How It Works

### Automatic Integration

This project uses **two Sentry SDKs** for comprehensive coverage:

#### 1. **@sentry/nextjs** - API Routes & Client (Automatic)

All **80+ Next.js API routes** are automatically instrumented with zero code changes:
- `src/app/api/**/*.ts` - All API routes
- Client-side errors in the browser
- Edge runtime functions
- Server components

**What you get automatically:**
- Error capture with full request context (URL, headers, params)
- Performance monitoring (API response times)
- Session replay for debugging user issues
- Source maps for readable stack traces

#### 2. **@sentry/node** - Netlify Functions (Manual Integration)

All Netlify background functions have custom Sentry integration:

**Background Functions:**
- `execute-story-quick-run-background.ts`
- `execute-sandbox-pipeline-background.ts`
- `execute-evaluation-background.ts`
- `execute-api-evaluation-background.ts`
- `generate-pairs-background.ts`

**Scheduled Functions:**
- `fetch-and-schedule-evals.ts` (cron: on manual trigger)
- `cleanup-sandbox-runs.ts` (cron: daily at 2 AM UTC)

**What you get with custom integration:**
- Rich context (runId, configId, blueprintKey)
- Breadcrumb trails via logger
- Custom error filtering

### Logger Integration

The logger utility (`src/utils/logger.ts`) automatically integrates with Sentry when `SENTRY_DSN` is set:

```typescript
const logger = await getLogger('my-namespace');

// This creates a breadcrumb in Sentry
logger.info('Processing started', { runId: '123' });

// This creates a breadcrumb AND captures the error
logger.error('Pipeline failed', error);
```

**Benefits:**
- Every log becomes a breadcrumb in Sentry
- Full trail of what happened before an error
- Errors are automatically captured with full context

### Error Context

Every error captured includes:

```typescript
{
  // Function identification
  function: 'execute-story-quick-run-background',
  runtime: 'netlify-functions',

  // Request context
  runId: 'abc123',
  blueprintKey: 'live/story/runs/abc123/blueprint.yml',
  awsRequestId: 'lambda-request-id',

  // Error details
  message: 'Pipeline failed',
  stack: '...',

  // Breadcrumbs (last 100 log messages)
  breadcrumbs: [...]
}
```

## Advanced Configuration

### Custom Error Capture

Manually capture errors with additional context:

```typescript
import { captureError } from '@/utils/sentry';

try {
  await riskyOperation();
} catch (error) {
  captureError(error, {
    runId: 'abc123',
    blueprintKey: 'path/to/blueprint',
    customField: 'additional data',
  });
  throw error;
}
```

### Adding Custom Context

Add context that applies to all subsequent errors in the same invocation:

```typescript
import { setContext } from '@/utils/sentry';

setContext('evaluation', {
  configId: 'my-config',
  modelCount: 5,
  promptCount: 10,
});
```

### Adding Breadcrumbs

Manually add breadcrumbs for debugging:

```typescript
import { addBreadcrumb } from '@/utils/sentry';

addBreadcrumb('Cache hit for prompt', { promptId: 'p1', cacheKey: 'abc' });
```

### Error Filtering

Errors are automatically filtered in `src/utils/sentry.ts`:

- **Rate limit errors (429)** → Not captured (expected behavior)
- **Network timeouts (ETIMEDOUT/ECONNRESET)** → Captured as warnings (not errors)

To customize, edit the `beforeSend` hook in `src/utils/sentry.ts`.

## Configuration Files

Sentry is configured through several files in your project:

### Core Configuration

1. **`sentry.client.config.ts`** - Browser/client-side configuration
   - Error capture in React components
   - Session replay for debugging
   - Performance monitoring for page loads

2. **`sentry.server.config.ts`** - Server-side configuration (API routes)
   - Error capture in Next.js API routes
   - Request context capture
   - Performance monitoring for API calls

3. **`sentry.edge.config.ts`** - Edge runtime configuration
   - Error capture in middleware and edge functions

4. **`instrumentation.ts`** - Next.js instrumentation hook
   - Automatically loads appropriate Sentry config based on runtime

5. **`next.config.ts`** - Build-time configuration
   - Wraps Next.js config with `withSentryConfig`
   - Enables source map uploads
   - Configures build optimizations

### Sentry CLI Configuration

**`.sentryclirc`** (not committed to git):
```ini
[defaults]
org=your-org-slug
project=your-project-slug

[auth]
token=your-auth-token
```

This file is used for source map uploads during builds. You can also use environment variables instead (`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`).

## Source Maps (Automatic)

Source maps are **automatically uploaded** when you build the project with the proper configuration:

### Setup for Source Map Uploads

1. Create a Sentry internal integration:
   - Go to **Settings → Developer Settings → New Internal Integration**
   - Name: "Source Maps Upload"
   - Permissions: `Release` (Admin), `Organization` (Read)
   - Copy the auth token

2. Add to your environment (Netlify or local `.env`):
   ```bash
   SENTRY_ORG=your-org-slug
   SENTRY_PROJECT=your-project-slug
   SENTRY_AUTH_TOKEN=your-auth-token
   ```

3. Source maps will now upload automatically on every build!

**What this gives you:**
- Original TypeScript code in stack traces (not compiled JavaScript)
- Readable error locations and function names
- Easier debugging of production errors

## Advanced Features

### Tunnel Route (Ad-Blocker Bypass)

This project uses a **Next.js rewrite** at `/monitoring` to tunnel Sentry requests through your domain, bypassing ad blockers that might block `sentry.io` requests.

**How it works:**
- Client-side errors are sent to `https://your-domain.com/monitoring` instead of `sentry.io`
- Next.js automatically forwards these requests to Sentry
- No configuration needed - it's already set up in `next.config.ts`

**Benefits:**
- More reliable error tracking (ad blockers won't block your own domain)
- Better error capture rates
- Slight increase in server load (minimal impact)

### Session Replay

Sentry Session Replay lets you watch a video-like reproduction of user sessions where errors occurred:

**Configured in `sentry.client.config.ts`:**
- 100% of error sessions are recorded
- 10% of normal sessions are recorded
- Text and media are masked for privacy

**How to view:**
1. Go to any error in Sentry
2. Click the "Replay" tab
3. Watch what the user did before the error occurred

## Monitoring & Alerts

### Viewing Errors

1. Go to your Sentry dashboard
2. Navigate to **Issues** to see all captured errors
3. Click any error to see:
   - Full stack trace
   - Breadcrumb trail (all log messages leading up to error)
   - Context data (runId, configId, etc.)
   - User impact metrics

### Setting Up Alerts

1. Go to **Alerts** in Sentry
2. Create a new alert rule:
   - **Issue Alert**: Get notified when specific errors occur
   - **Metric Alert**: Get notified based on error rate/volume

Example alert: "Notify me via email when >10 errors occur in 1 hour"

### Searching Errors

Use Sentry's search to filter errors:

```
# Find all errors for a specific runId
runId:abc123

# Find all errors in a specific function
function:execute-story-quick-run-background

# Find errors in the last 24 hours with specific text
is:unresolved message:"Pipeline failed" age:-24h
```

## Troubleshooting

### No Errors Appearing in Sentry

**Check 1:** Verify SENTRY_DSN is set
```typescript
// Add this temporarily to any function
console.log('SENTRY_DSN configured:', !!process.env.SENTRY_DSN);
```

**Check 2:** Check Netlify function logs
Look for: `[Sentry] No SENTRY_DSN configured for {functionName} - error tracking disabled`

**Check 3:** Verify DSN is correct
- Should start with `https://`
- Should end with `@sentry.io/project-id`

### Errors Not Being Captured

**Common cause:** Function exits before Sentry flushes events

**Solution:** Ensure `await flushSentry()` is called before all return statements (already done in all functions).

### Too Many Errors

**Solution:** Update the `beforeSend` filter in `src/utils/sentry.ts` to filter out noisy errors:

```typescript
beforeSend(event, hint) {
  const error = hint.originalException;

  // Add your custom filters here
  if (error?.message?.includes('expected-error-pattern')) {
    return null; // Don't send to Sentry
  }

  return event;
}
```

## Cost & Limits

### Free Tier
- **5,000 errors/month**
- **10,000 performance transactions/month**
- **30-day retention**
- **Unlimited team members**

### Paid Plans
- Start at $29/month for 50k errors
- See [sentry.io/pricing](https://sentry.io/pricing)

**For this project:** Free tier should be sufficient unless you have >150 errors/day.

## Best Practices

1. **Always flush Sentry before function exit**
   - ✅ Already done in all functions
   - Serverless functions can terminate before events are sent

2. **Add meaningful context to errors**
   - Include runId, configId, blueprintKey
   - Makes debugging much easier

3. **Use breadcrumbs liberally**
   - The logger automatically creates breadcrumbs
   - Shows the full story of what happened

4. **Filter noisy errors**
   - Don't capture expected errors (rate limits, validation errors)
   - Focus on actionable errors

5. **Set up alerts for critical functions**
   - Get notified when background jobs fail
   - Monitor error rates in production

## Development vs Production

Sentry works the same in all environments. To distinguish between them:

```bash
# Set in Netlify production environment
SENTRY_ENVIRONMENT=production

# Set in Netlify preview/branch deploys
SENTRY_ENVIRONMENT=staging

# Local development
SENTRY_ENVIRONMENT=development
```

Errors will be tagged with the environment in Sentry.

**Note:** The code already uses `process.env.CONTEXT` from Netlify, which sets `production`, `deploy-preview`, or `branch-deploy` automatically.

## Further Reading

- [Sentry Node.js Documentation](https://docs.sentry.io/platforms/node/)
- [Sentry Best Practices](https://docs.sentry.io/platforms/node/best-practices/)
- [Sentry Serverless Guide](https://docs.sentry.io/platforms/node/guides/aws-lambda/)

## Support

Questions about the integration? Check:
1. This documentation
2. `src/utils/sentry.ts` for implementation details
3. Any background function for usage examples
4. [Sentry Documentation](https://docs.sentry.io)
