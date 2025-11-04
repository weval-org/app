# Automated Evaluation Setup Guide

This guide explains the complete automation system for blueprint evaluations in the `weval-org/configs` repository.

## Overview

Weval uses a **three-layer validation and evaluation system**:

1. **GitHub Actions Validation (Layer 1)** - Fast, free YAML/structure validation
2. **PR Evaluations (Layer 2 - Staging)** - Cost-controlled evaluation before merge
3. **Production Evaluations (Layer 3)** - Full evaluation after merge

## Validation & Evaluation Layers

### Layer 1: GitHub Actions Validation (FREE, ~30 seconds)

**Purpose:** Catch errors early before expensive evaluation runs

**Triggered by:** Every PR that modifies blueprint files

**What it validates:**
- ✅ YAML/JSON syntax is valid
- ✅ Required fields exist (id, prompts, etc.)
- ✅ **Security check:** Username matches directory (`blueprints/users/{pr-author}/`)
- ✅ Prompt structure is correct

**Location:** `.github/workflows/blueprint-validation.yml` in configs repo

**Result:** PR is blocked if validation fails (GitHub status check)

**Benefits:**
- Instant feedback (no waiting for webhook)
- No cost (runs on GitHub's servers)
- Prevents webhook from running on broken files
- **Double security layer** (validates username at both GitHub Actions AND webhook)

### Layer 2: PR Evaluations (Staging - COST-CONTROLLED)

**Purpose:** Validate blueprint works with real models, but control costs

**Triggered by:** Webhook after Layer 1 passes

**What it does:**
1. Validates the blueprint (structure, username matching, size limits)
2. **Auto-trims if needed:** Max 10 prompts, CORE models only, 2 temps, 2 systems
3. Runs evaluation against trimmed configuration
4. Posts status updates as GitHub comments
5. Displays real-time progress at `https://weval.org/pr-eval/{pr-number}/{blueprint-path}`

**Cost limits:**
- Max 100 total responses per PR evaluation
- Only CORE model collection allowed
- Blueprint auto-trimmed to fit limits (not rejected)

**Storage:** `live/pr-evals/{pr-number}/` (temporary)

**Result:** PR comment with status link and analysis link

### Layer 3: Production Evaluations (UNLIMITED)

When blueprints are merged to main:
1. Push webhook detects new/modified blueprints
2. Checks if already evaluated (by content hash)
3. Runs production evaluation if needed
4. Results stored permanently in `live/blueprints/{configId}/`

### Orphan Detection

Manually scan for blueprints that haven't been evaluated:
```bash
pnpm cli scan-unrun-blueprints [--run] [--limit N]
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      STAGING (PR)                            │
│  GitHub PR → Webhook → Validation → Background Eval         │
│           → Status Page → PR Comment                         │
│  Storage: live/pr-evals/{pr-number}/                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   PRODUCTION (MERGE)                         │
│  Push to main → Webhook → Check Hash → Background Eval      │
│  Storage: live/blueprints/{configId}/                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 ORPHAN DETECTION (MANUAL)                    │
│  CLI scan → Fetch all blueprints → Check hashes             │
│          → List unrun → Optionally run them                  │
└─────────────────────────────────────────────────────────────┘
```

### Components

**PR Evaluations:**
- **PR Webhook**: `/api/webhooks/github-pr` - Receives PR events from GitHub
- **PR Background Function**: `execute-pr-evaluation-background.ts` - Runs PR evaluations
- **Status API**: `/api/pr-eval/[prNumber]/[...blueprintPath]` - Real-time status
- **Status Page**: `/pr-eval/[prNumber]/[...blueprintPath]` - User-facing UI

**Production Evaluations:**
- **Push Webhook**: `/api/webhooks/github-push` - Receives push events to main branch
- **Production Background Function**: `execute-evaluation-background.ts` - Runs production evaluations
- **CLI Scanner**: `pnpm cli scan-unrun-blueprints` - Manual orphan detection

**Shared:**
- **Rate Limiters**: Prevents abuse (per-user, per-IP, global)
- **Blueprint Validator**: Validates YAML structure and content
- **Hash Generator**: Determines if blueprint needs re-evaluation

## Setup Instructions

### 1. Generate GitHub Webhook Secret

```bash
# Generate a secure random secret
openssl rand -hex 32
```

Add to your `.env` or Netlify environment variables:
```
GITHUB_WEBHOOK_SECRET=your_generated_secret_here
```

### 2. Configure GitHub Webhooks

You need **two webhooks** for the full workflow:

#### Webhook 1: Pull Requests (Staging)

1. Go to `https://github.com/weval-org/configs/settings/hooks`
2. Click "Add webhook"
3. Configure:
   - **Payload URL**: `https://weval.org/api/webhooks/github-pr`
   - **Content type**: `application/json`
   - **Secret**: (paste the secret from step 1)
   - **Events**: Select "Pull requests" only
   - **Active**: ✓ Checked
4. Click "Add webhook"

#### Webhook 2: Pushes to Main (Production)

1. Click "Add webhook" again
2. Configure:
   - **Payload URL**: `https://weval.org/api/webhooks/github-push`
   - **Content type**: `application/json`
   - **Secret**: (same secret as above)
   - **Events**: Select "Pushes" only
   - **Active**: ✓ Checked
3. Click "Add webhook"

### 3. Verify Environment Variables

Ensure these are set in Netlify (or `.env` for local testing):

```bash
# Required
GITHUB_TOKEN=ghp_your_github_personal_access_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret_from_step1
BACKGROUND_FUNCTION_AUTH_TOKEN=your_background_function_token

# Storage (S3)
STORAGE_PROVIDER=s3
APP_S3_BUCKET_NAME=your_bucket_name
APP_S3_REGION=us-east-1
APP_AWS_ACCESS_KEY_ID=your_aws_key
APP_AWS_SECRET_ACCESS_KEY=your_aws_secret

# LLM APIs (at minimum: OpenAI for embeddings, OpenRouter for models)
OPENAI_API_KEY=sk-your_openai_key
OPENROUTER_API_KEY=sk-or-your_openrouter_key

# App URL
NEXT_PUBLIC_APP_URL=https://weval.org
```

### 4. GitHub Token Permissions

The `GITHUB_TOKEN` needs these permissions:
- `repo` - Full control of private repositories
- `write:discussion` - Access to comments on PRs

You can create a Personal Access Token at: https://github.com/settings/tokens

### 5. Test the Setup

1. Create a test PR to `weval-org/configs` with a blueprint in:
   ```
   blueprints/users/{your-github-username}/test-blueprint.yml
   ```

2. The bot should comment within seconds:
   ```
   ⚡ Evaluation started!
   - ✅ blueprints/users/yourname/test-blueprint.yml - View Status
   ```

3. Click the status link to see real-time progress

4. When complete, another comment appears:
   ```
   ✅ Evaluation complete for blueprints/users/yourname/test-blueprint.yml
   [View detailed results →]
   ```

## User Guidelines

### Directory Structure

All user-contributed blueprints must follow this pattern:
```
blueprints/users/{github-username}/{blueprint-name}.yml
```

Example:
```
blueprints/users/alice/medical-qa-eval.yml
blueprints/users/bob/code-generation-test.yml
```

### Validation Rules

The system enforces these rules:

#### 1. **Username Matching** (Security)
- Directory name MUST match PR author's GitHub username
- `blueprints/users/alice/...` can only be created by @alice

#### 2. **Blueprint Limits** (Abuse Prevention)
- Max 3 blueprints per PR
- Max 500KB per blueprint file

#### 3. **File Format** (Syntax)
- Must be `.yml` or `.yaml`
- Must be valid YAML
- Must have `id` and `prompts` fields

#### 4. **PR Evaluation Limits** (Cost Control)

**IMPORTANT:** PR evaluations are limited to control costs. Production evaluations (after merge) have no limits.

**Default limits:**
- **Models**: Max 5 models, only from `CORE` collection
- **Prompts**: Max 10 prompts
- **Temperatures**: Max 2 temperature values
- **System Prompts**: Max 2 system prompt variations
- **Total Responses**: Max 100 total API calls (prompts × models × temps × systems)

**Calculation example:**
```
10 prompts × 5 models × 2 temps × 1 system = 100 responses ✅
10 prompts × 5 models × 2 temps × 2 systems = 200 responses ❌
```

**Changing limits:**

These limits are hardcoded in `src/lib/pr-eval-limiter.ts`. To change them, modify the `PR_EVAL_LIMITS` constant and redeploy:

```typescript
export const PR_EVAL_LIMITS: PREvalLimits = {
  allowedModelCollections: ['CORE'],  // Only CORE models
  maxModels: 5,  // Max 5 models
  maxPrompts: 10,  // Max 10 prompts
  maxTemperatures: 2,  // Max 2 temperature values
  maxSystemPrompts: 2,  // Max 2 system prompts
  maxTotalResponses: 100,  // Hard cap: 100 total responses
};
```

**If your blueprint exceeds limits:**
1. Blueprint is automatically trimmed to fit within limits
2. PR evaluation runs with the trimmed version
3. Bot comments explaining what was trimmed
4. **After merge:** Full evaluation runs with all prompts/models (no limits)

**Example:**
- Your blueprint: 50 prompts, 15 models, 3 temps
- PR evaluation runs: 10 prompts (first 10), 5 models (from CORE), 2 temps
- After merge: Full 50 prompts × 15 models × 3 temps evaluation

#### 5. **Rate Limits** (Abuse Prevention)
- Max 10 PR evaluations per user per hour
- Max 100 webhook requests per IP per hour
- Max 500 total webhook requests per hour

### Creating a Blueprint PR

1. **Fork the repository**:
   ```bash
   gh repo fork weval-org/configs
   ```

2. **Create a branch**:
   ```bash
   git checkout -b add-my-blueprint
   ```

3. **Add your blueprint**:
   ```bash
   mkdir -p blueprints/users/your-username
   cp my-blueprint.yml blueprints/users/your-username/
   ```

4. **Commit and push**:
   ```bash
   git add blueprints/users/your-username/my-blueprint.yml
   git commit -m "Add my blueprint"
   git push origin add-my-blueprint
   ```

5. **Create PR**:
   ```bash
   gh pr create --title "Add my blueprint" --body "This blueprint evaluates..."
   ```

6. **Wait for evaluation**:
   - Bot posts status link within seconds
   - Click link to watch progress
   - Results appear when complete (~5-15 minutes depending on models/prompts)

## Storage Structure

PR evaluations are stored in S3:

```
live/
└── pr-evals/
    └── {pr-number}/
        └── {sanitized-blueprint-path}/
            ├── pr-metadata.json       # PR info
            ├── blueprint.yml          # Blueprint content
            ├── status.json            # Real-time status
            └── _comparison.json       # Results (when complete)
```

Example:
```
live/pr-evals/123/alice-medical-qa-eval/
  ├── pr-metadata.json
  ├── blueprint.yml
  ├── status.json
  └── _comparison.json
```

## Rate Limiting Details

### Per-User Limits
- **Identifier**: GitHub username
- **Limit**: 10 evaluations per hour
- **Window**: Sliding 1-hour window
- **Response**: Comment on PR + 429 status

### Per-IP Limits
- **Identifier**: Request IP address
- **Limit**: 100 requests per hour
- **Window**: Sliding 1-hour window
- **Response**: 429 status with Retry-After header

### Global Limits
- **Identifier**: System-wide
- **Limit**: 500 requests per hour
- **Window**: Sliding 1-hour window
- **Response**: 429 status with Retry-After header

## Monitoring

### Logs

Check Netlify function logs:
1. Netlify Dashboard → Functions → `execute-pr-evaluation-background`
2. Filter by PR number or username

### Status Tracking

Real-time status stages:
- `pending` - Starting up
- `validating` - Checking blueprint structure
- `generating_responses` - Running prompts against models
- `evaluating` - Running evaluators (embedding, llm-coverage)
- `saving` - Writing results to S3
- `complete` - Done!
- `error` - Something went wrong

### Errors

Common errors and solutions:

**"Username mismatch"**
- Fix: Ensure directory path matches your GitHub username exactly

**"Blueprint validation failed"**
- Fix: Check YAML syntax and required fields (id, prompts)

**"Too many blueprints in this PR"**
- Fix: Split into multiple PRs (max 3 per PR)

**"Rate limit exceeded"**
- Fix: Wait for the retry time, then push a new commit or re-open PR

**"Blueprint trimmed to fit PR evaluation limits"**
- Not an error! Your blueprint is valid and will be evaluated
- Bot comment shows what was trimmed:
  ```
  ⚡ Evaluation started!

  - ✅ blueprints/users/alice/my-blueprint.yml - View Status
    ⚠️ Blueprint trimmed to fit PR evaluation limits (full evaluation runs after merge)

  Note: 1 blueprint exceeded PR evaluation limits and was automatically trimmed:
  - Limited to 10 prompts, 5 models (CORE), 2 temps, 2 systems
  - Full evaluation with all prompts/models will run automatically after merge

  Results will be posted here when complete.
  ```
- PR evaluation runs with trimmed version for validation
- Full evaluation runs automatically after merge

## Troubleshooting

### Webhook not triggering

1. Check webhook delivery: `https://github.com/weval-org/configs/settings/hooks`
2. Click on the webhook → "Recent Deliveries"
3. Check for failures and response codes

### Evaluation stuck

1. Check Netlify function logs
2. Background functions timeout after 10 minutes
3. Status should show error state if timeout occurs

### Results not appearing

1. Check S3 bucket permissions
2. Verify `APP_S3_BUCKET_NAME` is correct
3. Check function logs for S3 errors

## Security Considerations

### Webhook Signature Verification

All webhook requests are verified using HMAC SHA-256:
```typescript
const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
const digest = 'sha256=' + hmac.update(payload).digest('hex');
```

Invalid signatures are rejected with 401.

### Username Validation

CRITICAL: The system enforces strict username matching:
```typescript
if (username !== prAuthor) {
  // Reject the blueprint
}
```

This prevents users from:
- Creating blueprints in other users' directories
- Impersonating other contributors
- Polluting the namespace

### Size Limits

Blueprints are limited to 500KB to prevent:
- Storage abuse
- Memory exhaustion
- Slow evaluation times

### Authentication

Background functions require authentication:
```typescript
X-Background-Function-Auth-Token: your_token_here
```

Only the webhook handler can invoke evaluations.

## Cost Considerations

Each PR evaluation:
- Runs prompts against all configured models
- Generates embeddings for all responses
- Uses LLM-based evaluation

Estimated costs (varies by blueprint):
- Small (5 prompts, 3 models): ~$0.10
- Medium (20 prompts, 5 models): ~$1.00
- Large (50 prompts, 10 models): ~$5.00

Rate limits help control costs:
- 10 evals/user/hour
- Max 500 evals/hour globally

## Development

### Local Testing

1. Use ngrok to expose local server:
   ```bash
   ngrok http 8888
   ```

2. Update webhook URL to ngrok URL temporarily

3. Set environment variables in `.env`

4. Create test PRs to your fork first

### Webhook Payload

Example PR opened event:
```json
{
  "action": "opened",
  "pull_request": {
    "number": 123,
    "user": { "login": "alice" },
    "head": {
      "sha": "abc123",
      "ref": "add-blueprint",
      "repo": { "full_name": "alice/configs" }
    }
  }
}
```

### Testing Rate Limits

```typescript
import { prEvaluationLimiter } from '@/lib/webhook-rate-limiter';

// Check status
const status = prEvaluationLimiter.getStatus('alice');
console.log(status); // { requests: 3, limit: 10, remaining: 7, resetAt: ... }

// Check if allowed
const check = prEvaluationLimiter.check('alice');
console.log(check); // { allowed: true } or { allowed: false, retryAfter: 120 }
```

## CLI Scanner Usage

### Scan for Unrun Blueprints

```bash
# Just list unrun blueprints
pnpm cli scan-unrun-blueprints

# List and run all unrun blueprints
pnpm cli scan-unrun-blueprints --run

# Run only first 5 unrun blueprints
pnpm cli scan-unrun-blueprints --run --limit 5

# Use custom GitHub token
pnpm cli scan-unrun-blueprints --run --github-token ghp_your_token
```

### How It Works

1. **Fetches all blueprints** from `weval-org/configs` repository
2. **Calculates content hash** for each blueprint
3. **Checks S3** for existing results: `live/blueprints/{configId}/{hash}_comparison.json`
4. **Lists unrun blueprints** that have no matching results
5. **Optionally runs** evaluations for unrun blueprints (with `--run` flag)

### When to Use

- **After bulk imports**: When many blueprints are added directly to main
- **After system changes**: When evaluation logic changes and you want to find stale results
- **Periodic maintenance**: Monthly check to ensure all blueprints have been evaluated
- **Disaster recovery**: After storage issues or data loss

### Example Output

```
🔍 Scanning blueprints repository...

Progress: 50/150 blueprints analyzed...
Progress: 100/150 blueprints analyzed...
✓ Analyzed all 150 blueprints

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SCAN RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total blueprints: 150
✓ Already evaluated: 145
⚠ Not yet evaluated: 5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Unrun blueprints:

  • blueprints/users/alice/new-eval.yml (new-eval)
    Hash: abc123...
  • blueprints/users/bob/test-blueprint.yml (test-blueprint)
    Hash: def456...

💡 To run evaluations for these blueprints, use:
   pnpm cli scan-unrun-blueprints --run
```

## Complete Workflow Examples

### Scenario 1: New Contributor Adds Blueprint

```
1. Alice forks weval-org/configs
2. Alice creates blueprints/users/alice/medical-qa.yml
3. Alice opens PR #123
4. ⚡ PR webhook triggers → Validation → Evaluation
5. Bot comments: "⚡ Evaluation started! View Status"
6. Alice clicks status link → Sees real-time progress
7. ✅ Evaluation completes → Bot comments with results
8. Maintainer reviews and merges PR
9. 🚀 Push webhook triggers → Checks hash
10. Hash not found → Runs production evaluation
11. Results saved to live/blueprints/medical-qa/
```

### Scenario 2: Bulk Import of Blueprints

```
1. Maintainer directly pushes 20 blueprints to main
2. 🚀 Push webhook processes all 20
3. Checks hashes for each
4. Runs production evaluations for all new ones
5. Results saved to live/blueprints/
```

### Scenario 3: Orphaned Blueprint Discovery

```
1. Admin runs: pnpm cli scan-unrun-blueprints
2. Finds 3 blueprints never evaluated
3. Runs: pnpm cli scan-unrun-blueprints --run
4. All 3 get evaluated and saved
```

## Comparison: Scheduled vs Event-Driven

### ❌ OLD: Scheduled (Disabled)

```toml
# netlify.toml (COMMENTED OUT)
[functions."fetch-and-schedule-evals"]
  schedule = "0 0 * * 0"  # Weekly
```

**Problems:**
- Runs even when nothing changed
- Can be expensive
- Doesn't catch new blueprints immediately
- Requires `_periodic` tag

### ✅ NEW: Event-Driven

**Advantages:**
- Runs only when needed (PRs, merges)
- Immediate feedback
- Cost-efficient
- No scheduler maintenance
- Manual control with CLI for edge cases

## Future Enhancements

Potential improvements:
- [ ] GitHub App instead of Personal Access Token
- [ ] Detailed evaluation metrics in PR comment
- [ ] Re-run button in status page
- [ ] Comparison with previous runs
- [ ] Email notifications when complete
- [ ] Slack/Discord integration
- [ ] Cost estimation before running
- [ ] Selective model testing (choose which models to run)
- [ ] Automatic re-evaluation when models are updated

---

**Last Updated**: 2025-01-09
**Maintainer**: Weval Team
