#!/usr/bin/env bash
set -euo pipefail

# ================================
# Public Evaluation API quickstart
# - Loads .env safely (zsh/bash)
# - Submits an inline JSON blueprint
# - Polls status until complete
# - Prints compact result
# ================================

# 1) Load .env (zsh-safe): export only KEY=VALUE lines, ignore comments/blank
if [ -f .env ]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    export "$key=$value"
  done < <(grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=' .env | sed -E 's/^[[:space:]]*//')
fi

# 2) Require env vars
: "${BASE_URL:?set BASE_URL in .env (e.g., http://localhost:3000 or http://localhost:8888)}"
: "${PUBLIC_API_KEY:?set PUBLIC_API_KEY in .env}"

# 3) Minimal inline JSON blueprint
BLUEPRINT='{"title":"Quick API Test","models":["openai:gpt-4o-mini"],"prompts":[{"id":"hello","prompt":"Say hello in one short sentence."}]}'

# 4) Submit run
RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $PUBLIC_API_KEY" \
  -H "Content-Type: application/json" \
  --data "$BLUEPRINT" \
  "$BASE_URL/api/v1/evaluations/run")

# 5) Extract runId (no jq); bail if missing
RUN_ID=$(printf '%s' "$RESP" | sed -n 's/.*"runId":"\([^"]*\)".*/\1/p')
if [ -z "$RUN_ID" ]; then
  echo "Failed to start run. Server response:"
  echo "$RESP"
  exit 1
fi
echo "runId=$RUN_ID"

# Extract and show the view URL
VIEW_URL=$(printf '%s' "$RESP" | sed -n 's#.*"viewUrl":"\([^"]*\)".*#\1#p')
if [ -n "$VIEW_URL" ]; then
    echo "View run progress at: $VIEW_URL"
fi

# 6) Poll status until completed/failed
while true; do
  STATUS_JSON=$(curl -s "$BASE_URL/api/v1/evaluations/status/$RUN_ID")
  STATUS=$(printf '%s' "$STATUS_JSON" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
  echo "status=$STATUS"
  [ "$STATUS" = "completed" ] && break
  [ "$STATUS" = "failed" ] && { echo "run failed"; exit 1; }
  sleep 2
done

# 7) Fetch result (compact payload) with small buffer and retries
sleep 2
TRIES=10
while : ; do
  HTTP=$(curl -s -o /tmp/_res.json -w "%{http_code}" "$BASE_URL/api/v1/evaluations/result/$RUN_ID")
  if [ "$HTTP" = "200" ]; then
    cat /tmp/_res.json
    echo
    break
  fi
  if [ "$HTTP" = "404" ]; then
    echo "Result not found (404)."
    cat /tmp/_res.json
    echo
    break
  fi
  TRIES=$((TRIES-1))
  if [ $TRIES -le 0 ]; then
    echo "Result not ready after retries."
    cat /tmp/_res.json
    echo
    break
  fi
  sleep 1
done


