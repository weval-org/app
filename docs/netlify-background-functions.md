### Netlify Background Functions – Implementation & Run Guide

This guide captures the proven patterns for implementing and running Netlify background functions, distilled from our current project. It’s written to be copy-pastable into new services (e.g., TreeTalk) with minimal adjustments.

### What is a background function?
- A function under `netlify/functions/` whose filename ends with `-background` (e.g., `summarize-session-background.ts`).
- Invoked at `/.netlify/functions/<file-name>`. Netlify immediately responds with 202 and runs the job asynchronously.
- Do not rely on the handler’s return body for the caller’s response; treat it as fire-and-forget.

### Core practices
- Use a shared-secret header (`X-Background-Function-Auth-Token`) validated in the function.
- Invoke functions only from server-side code (API routes, server actions), never from the browser.
- Keep jobs small and idempotent; pass identifiers, not large payloads.
- Add observability: request IDs, structured logs, and error reporting (e.g., Sentry) with flush on exit.

### Minimal handler pattern
```ts
import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';

function checkAuth(event: HandlerEvent): HandlerResponse | null {
  const sent = event.headers['x-background-function-auth-token'];
  const expected = process.env.BACKGROUND_FUNCTION_AUTH_TOKEN;
  if (!expected) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }
  if (!sent || sent !== expected) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  return null;
}

export const handler: Handler = async (event) => {
  const authErr = checkAuth(event);
  if (authErr) return authErr;

  let payload: any = {};
  try { payload = JSON.parse(event.body || '{}'); } catch {}

  // Do the work (keep under ~15 minutes)
  // ...

  // Note: Netlify returns 202 to the original caller for background functions
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
```

### Server-side client helper
Centralize URL resolution, auth header injection, and short timeouts (the platform responds quickly with 202).

```ts
export async function callBackgroundFunction({
  functionName,
  body,
  timeoutMs = 10000,
  baseUrl,
}: {
  functionName: string;
  body: any;
  timeoutMs?: number;
  baseUrl?: string;
}) {
  const token = process.env.BACKGROUND_FUNCTION_AUTH_TOKEN;
  if (!token) throw new Error('Auth token not configured');

  const base = baseUrl || process.env.URL || process.env.APP_URL || 'http://localhost:8888';
  const url = new URL(`/.netlify/functions/${functionName}`, base).toString();

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Background-Function-Auth-Token': token,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(t));

  // Success is typically 202 for background functions
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Background call failed: ${res.status} ${text}`);
  }
  return { status: res.status };
}
```

### Trigger via API routes (not from the browser)
Example Next.js route to trigger a job and return 202 immediately to the UI:

```ts
// POST /api/summarize/session
import { NextRequest, NextResponse } from 'next/server';
import { callBackgroundFunction } from '@/lib/background-function-client';

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  await callBackgroundFunction({
    functionName: 'summarize-session-background',
    body: { sessionId },
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
```

### Idempotency & dedupe (must-have for summarization)
- Compute a content hash (e.g., SHA-256 of messages) and skip if unchanged.
- Use idempotency keys like `${entity}:${hash}` to make retries safe.
- Store last processed hash and timestamp to prevent rework and enable staleness checks.

### Scheduling (maintenance, retries, backfills)
Add scheduled Netlify functions in `netlify.toml` for periodic tasks:

```toml
[build]
  command = "pnpm build"
  publish = ".next"

[functions."summarization-maintenance"]
  schedule = "0 3 * * *" # 03:00 UTC daily
```

### Local development
1) Create `.env` with:
```
BACKGROUND_FUNCTION_AUTH_TOKEN=your-secret
# plus any DB/LLM/S3 credentials your jobs need
```

2) Run Netlify dev (serves functions at `http://localhost:8888`):
```bash
pnpm dlx netlify-cli@latest dev
```

3) Test the function directly:
```bash
curl -X POST http://localhost:8888/.netlify/functions/summarize-session-background \
  -H 'Content-Type: application/json' \
  -H "X-Background-Function-Auth-Token: $BACKGROUND_FUNCTION_AUTH_TOKEN" \
  -d '{"sessionId":"sess_123"}'
```

4) Tail logs in another terminal:
```bash
pnpm dlx netlify-cli@latest functions:tail --name summarize-session-background
```

### Production setup
- Set all required environment variables in the Netlify site settings (never commit secrets).
- Ensure the `-background` suffix on filenames so Netlify treats them as background jobs.
- Monitor function logs in the Netlify dashboard; add Sentry (or similar) for error reporting and correlation IDs.
- Keep each job well under ~15 minutes; split/chain as needed.

### Applying this to TreeTalk
- Implement:
  - `summarize-session-background.ts` → input `{ sessionId }` (writes `summary`, `summary_hash`, `last_summarized_at`).
  - `summarize-tree-background.ts` → input `{ treeId }` (reads session summaries, writes `high_level_summary`, `high_level_summary_hash`).
- Trigger from:
  - Preflight steps before routing/keeper.
  - On-demand dev endpoints (`/api/summarize/session/:id`, `/api/summarize/tree/:id`).
  - Nightly maintenance via scheduled function.

This setup is simple, secure, and scalable: server-only invocation with a shared secret, idempotent jobs, short-running units of work, and clear local/prod workflows.


