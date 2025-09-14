# Public Evaluation API

This document describes the public API for submitting evaluation blueprints, polling run status, and retrieving results.

## Base URL

All examples assume the app is deployed at `NEXT_PUBLIC_APP_URL`.

```
BASE_URL = $NEXT_PUBLIC_APP_URL
```

## Authentication

- Scheme: Bearer token
- Header: `Authorization: Bearer <PUBLIC_API_KEY>`
- Server env: `PUBLIC_API_KEY` must be set. For local/testing, an internal flag `DISABLE_PUBLIC_API_AUTH=true` can bypass auth; do not use in production.

## Endpoints

### 1) Submit a run

POST `${BASE_URL}/api/v1/evaluations/run`

- Body: Blueprint as YAML or JSON (UTF-8). The service accepts raw YAML/JSON text.
- Headers:
  - `Authorization: Bearer <PUBLIC_API_KEY>`
  - `Content-Type: text/plain` (or `application/yaml`, `application/json`)
- Behavior:
  - Parses and normalizes the blueprint.
  - Adds tag `_public_api` to isolate these runs.
  - Triggers a background execution.
  - Returns immediately with identifiers and polling links.
- Response (200 OK):
```json
{
  "message": "Evaluation run initiated successfully.",
  "runId": "<uuid>",
  "statusUrl": "<BASE_URL>/api/v1/evaluations/status/<runId>",
  "resultsUrl": "<BASE_URL>/api/v1/evaluations/result/<runId>"
}
```

Example:
```bash
curl -X POST \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  -H "Content-Type: text/plain" \
  --data-binary @path/to/blueprint.yml \
  "$BASE_URL/api/v1/evaluations/run"
```

### 2) Check status

GET `${BASE_URL}/api/v1/evaluations/status/:runId`

- Returns the current status JSON.
- Status values: `pending | running | completed | failed`
- Response (200 OK):
```json
{
  "status": "running",
  "message": "Evaluation pipeline is in progress...",
  "lastUpdated": "2025-01-01T12:34:56.000Z"
}
```

- When completed (200 OK):
```json
{
  "status": "completed",
  "message": "Evaluation completed successfully.",
  "lastUpdated": "2025-01-01T12:40:22.000Z",
  "payload": {
    "output": "api-runs/<runId>/results/live/blueprints/<configId>/<fileName>",
    "resultUrl": "<BASE_URL>/analysis/<configId>/<runLabel>/<timestamp>"
  }
}
```

Example:
```bash
curl "$BASE_URL/api/v1/evaluations/status/$RUN_ID"
```

### 3) Get result

GET `${BASE_URL}/api/v1/evaluations/result/:runId`

- If run not completed yet: 202 Accepted
```json
{
  "error": "Result not ready.",
  "message": "Status is 'running'."
}
```

- If completed: 200 OK with a compact result payload (prefers `core.json` artefact; falls back to monolithic file when needed)
```json
{
  "result": { /* compact run data for visualization */ },
  "resultUrl": "<BASE_URL>/analysis/<configId>/<runLabel>/<timestamp>"
}
```

Example:
```bash
curl "$BASE_URL/api/v1/evaluations/result/$RUN_ID"
```

## Status model (internal details)

- Storage key: `api-runs/<runId>/status.json`
- Schema:
```json
{
  "status": "pending|running|completed|failed",
  "lastUpdated": "<ISO datetime>",
  "message": "<optional string>",
  "payload": { "output": "<path>", "resultUrl": "<url>", "...": "..." }
}
```
- Written by the background function via a storage abstraction. Supports S3 or local filesystem transparently.

## Polling pattern

1. Submit with POST `/run` → capture `runId` and `statusUrl`.
2. Poll `statusUrl` every 2–5 seconds until `status` is `completed` or `failed`.
3. On `completed`, request `/result/:runId`.

## Limits & recommendations

- Validate blueprints client-side when possible.
- Reasonable bounds (guidance):
  - Max prompts per submission: 100
  - Max models per submission: 20
  - Body size: ≤ 1–2 MB
- Server may enforce stricter limits or rate-limiting.

## Errors

- 400 Bad Request: empty/invalid blueprint
- 401 Unauthorized: missing/invalid bearer token (production)
- 404 Not Found: unknown `runId` (rare; usually returns `pending` if status not written yet)
- 500 Internal Server Error: unexpected failure

## Security

- Always require `Authorization: Bearer <PUBLIC_API_KEY>` in production.
- Configure CORS to restrict origins if called from browsers.
- Blueprints are treated as user-supplied content—avoid logging sensitive content in server logs.

## Environment variables

- `PUBLIC_API_KEY`: required for auth
- `NEXT_PUBLIC_APP_URL`: base URL used to construct return links
- Storage (pick one):
  - Local: `STORAGE_PROVIDER=local`
  - S3: `STORAGE_PROVIDER=s3`, `APP_S3_BUCKET_NAME`, `APP_S3_REGION`, `APP_AWS_ACCESS_KEY_ID`, `APP_AWS_SECRET_ACCESS_KEY`
- Testing-only: `DISABLE_PUBLIC_API_AUTH=true` (do not use in production)

## Retention & cleanup

- The status file is necessary for polling and for locating results; do not delete on completion.
- Recommended: set an S3 lifecycle rule (or a local cron) to expire `api-runs/` objects after a retention period (e.g., 7–30 days).

## Example end-to-end

```bash
# 1) Submit
RUN_ID=$(curl -s -X POST \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  -H "Content-Type: text/plain" \
  --data-binary @path/to/blueprint.yml \
  "$BASE_URL/api/v1/evaluations/run" | jq -r .runId)

# 2) Poll
while true; do
  STATUS=$(curl -s "$BASE_URL/api/v1/evaluations/status/$RUN_ID" | jq -r .status)
  echo "status=$STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then break; fi
  sleep 3
done

# 3) Fetch result (if completed)
curl -s "$BASE_URL/api/v1/evaluations/result/$RUN_ID" | jq .
```

### Minimal example (pure bash, no jq; inline JSON)

```bash
# Config
BASE_URL=${BASE_URL:-http://localhost:3000}
PUBLIC_API_KEY=${PUBLIC_API_KEY:?set PUBLIC_API_KEY}

# Inline JSON blueprint (smallest valid shape)
BLUEPRINT='{"title":"Quick API Test","models":["openai:gpt-4o-mini"],"prompts":[{"id":"hello","prompt":"Say hello in one short sentence."}]}'

# 1) Submit
RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  -H "Content-Type: application/json" \
  --data "$BLUEPRINT" \
  "$BASE_URL/api/v1/evaluations/run")

# Extract runId without jq
RUN_ID=$(printf '%s' "$RESP" | sed -n 's/.*"runId":"\([^"]*\)".*/\1/p')
echo "runId=$RUN_ID"

# 2) Poll status (2s interval)
while true; do
  STATUS_JSON=$(curl -s "$BASE_URL/api/v1/evaluations/status/$RUN_ID")
  STATUS=$(printf '%s' "$STATUS_JSON" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
  echo "status=$STATUS"
  [ "$STATUS" = "completed" ] && break
  [ "$STATUS" = "failed" ] && { echo "run failed"; exit 1; }
  sleep 2
done

# 3) Fetch result
curl -s "$BASE_URL/api/v1/evaluations/result/$RUN_ID"
echo
```


