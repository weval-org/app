# Sandbox & Workshops: Technical Guide

This document provides a comprehensive overview of the architecture, implementation details, and design philosophy for Weval's two ephemeral evaluation environments: **Sandbox** and **Workshops**.

## Table of Contents

1. [Introduction & Philosophy](#1-introduction--philosophy)
2. [Sandbox: Individual Testing Environment](#2-sandbox-individual-testing-environment)
3. [Workshops: Collaborative Evaluation Building](#3-workshops-collaborative-evaluation-building)
4. [Shared Execution Infrastructure](#4-shared-execution-infrastructure)
5. [Storage Architecture](#5-storage-architecture)
6. [Comparison Matrix](#6-comparison-matrix)

---

## 1. Introduction & Philosophy

Weval has three distinct types of evaluation runs, each serving a different purpose:

### Run Types

1. **Production Runs** (via `run-config` or cron)
   - Official platform benchmarks
   - Stored in `live/blueprints/{configId}/`
   - Version-controlled in `weval-org/configs` repository
   - Scheduled/triggered runs for monitoring AI behavior over time

2. **Sandbox Runs** (individual, ephemeral)
   - Solo developer iteration and testing
   - Stored in `live/sandbox/runs/{runId}/`
   - Not version-controlled
   - Focus: Quick experimentation and refinement

3. **Workshop Runs** (collaborative, ephemeral)
   - Group evaluation building sessions
   - Stored in `live/workshop/runs/{workshopId}/{wevalId}/`
   - Not version-controlled
   - Focus: Collaborative creation and sharing

### Design Philosophy: Ephemeral Runs

Both Sandbox and Workshops are **ephemeral evaluation environments**. They share core principles:

- **No Persistence Guarantee**: Results may be cleaned up periodically
- **Rapid Iteration**: Fast feedback loops for development
- **Shared Execution Engine**: Both use the same background pipeline (`execute-sandbox-pipeline-background.ts`)
- **Path-Agnostic Storage**: Storage paths are derived from input, not hardcoded
- **No Production Impact**: Experiments don't pollute official benchmark data

The key distinction is **audience**:
- **Sandbox**: Individual developer working alone
- **Workshop**: Multiple participants collaborating in a shared space

---

## 2. Sandbox: Individual Testing Environment

### Overview

The Sandbox is an interactive, browser-based environment designed for creating, testing, and evaluating AI model prompts using the Weval blueprint format. It provides a seamless experience for both anonymous users and authenticated GitHub users.

### Key Design Principles

- **Graceful Fallback**: Works perfectly for anonymous users, with GitHub integration as progressive enhancement
- **Client-Side State Management**: Highly responsive UI managing complex state transitions
- **Clear Separation of Concerns**: Logic separated between frontend, hooks, and backend
- **Idiomatic Source Control**: Changes managed on isolated feature branches

### Core Features

#### Blueprint Creation & Editing

- **Dual-Editor Interface**:
  - Structured form editor
  - Raw YAML editor (Monaco-based)
  - Real-time synchronization between editors

- **Local Drafts**:
  - Anonymous users can create/edit/save drafts in browser localStorage
  - Multiple drafts supported
  - No account required

- **AI-Powered Creation**:
  - Users provide high-level goal
  - LLM generates starter blueprint via `/api/sandbox/auto-create`

#### Model Evaluation

- Run blueprints against multiple AI models
- Real-time status updates: `idle` → `pending` → `generating_responses` → `evaluating` → `saving` → `complete`
- Error states with clear messaging

#### GitHub Integration (Authenticated Users)

- **Automatic Forking**: Auto-forks `weval-org/configs` on first login
- **Branch-Based File Management**: Each proposal gets its own `proposal/*` feature branch
- **Propose Changes**: Create pull requests to public library
- **PR Status Tracking**: UI shows PR status (open, closed, merged)

### Architecture

#### Frontend (`src/app/sandbox/`)

**State Management Hooks**:

- **`useWorkspace()`** (`src/app/sandbox/hooks/useWorkspace.ts`)
  - Master orchestrator hook
  - Manages file list (local + GitHub)
  - Handles active blueprint and branch
  - Coordinates all user actions
  - Manages workspace status

- **`useGitHub()`** (`src/app/sandbox/hooks/useGitHub.ts`)
  - All GitHub API interactions
  - Fork management
  - Branch operations: `setupWorkspace`, `promoteBlueprintToBranch`, `updateFileOnGitHub`, `createPullRequest`

- **`useEvaluation()`** (`src/app/sandbox/hooks/useEvaluation.ts`)
  - Evaluation lifecycle management
  - Polling `/api/sandbox/status/[runId]` every 3 seconds
  - Immediate poll on `runId` assignment

- **`useAuth()`** (`src/app/sandbox/hooks/useAuth.ts`)
  - Authentication state
  - Calls `/api/github/user/status` on load

**Core Components**:

- **`SandboxClientPage.tsx`**: Main container, assembles all UI elements
- **`FileNavigator.tsx`**: File list with icons for local vs. GitHub, branch indicators, PR status
- **`EditorPanel.tsx` & `FormPanel.tsx`**: Dual-editing experience

#### Backend API

**Sandbox API** (`/api/sandbox/`):

- **`run`**: Initiates evaluation, returns `runId`
- **`status`**: Real-time status polling endpoint
- **`auto-create`**: LLM-powered blueprint generation

**GitHub Workspace API** (`/api/github/workspace/`):

- **`setup`**: Fork check/creation
- **`files`**: List blueprint files from all `proposal/*` branches
- **`file`**: RESTful CRUD for branch-aware file operations
- **`prs-status`**: Fetch user's PR statuses
- **`pr/create`**: Create PR from feature branch

### Key User Flows

#### Promoting Local Blueprint to GitHub

1. User clicks "Save to GitHub..." on local draft
2. Modal confirms filename
3. `POST /api/github/workspace/file`:
   - Fetch latest upstream `main` SHA
   - Create feature branch `proposal/{filename}-{timestamp}` in user's fork
   - Commit blueprint to branch
4. Client refreshes file list
5. Delete local draft, load GitHub file
6. UI shows "Saved to GitHub" toast

#### Deleting GitHub File

1. User clicks trash icon
2. Confirmation dialog
3. `deletingFilePath` state set immediately (visual feedback)
4. `DELETE /api/github/workspace/file` with path, SHA, branchName
5. Backend deletes file from branch
6. Clear `deletingFilePath`, remove from file list

### Storage Pattern

```
live/
└── sandbox/
    └── runs/
        └── {runId}/
            ├── blueprint.yml         # Input blueprint
            ├── status.json          # Real-time status updates
            └── _comparison.json     # Final results

# Legacy compatibility path also written:
live/
└── blueprints/
    └── sandbox-{runId}/
        └── sandbox-run_{timestamp}_comparison.json
```

---

## 3. Workshops: Collaborative Evaluation Building

### Overview

Workshops are ephemeral, collaborative spaces where multiple participants can build, publish, and run AI evaluations together using a conversational interface. They emphasize frictionless participation and community-driven eval creation.

### Key Design Principles

- **Client-Side Sessions**: No server registration, localStorage-based
- **Frictionless Participation**: No authentication barriers
- **Memorable Identity**: Workshop IDs like "crimson-elephant-742"
- **Story-Style Building**: Conversational AI interface for creating evaluations
- **Collaborative Discovery**: Gallery of published evaluations

### Core Features

#### Workshop Sessions

- **Client-Side Only**:
  - Session ID generated locally (`ws_{timestamp}_{random}`)
  - Stored in localStorage per workshop
  - Display names persist across workshops in same browser
  - No PIN/recovery mechanism

- **Memorable Workshop IDs**:
  - Format: `{adjective}-{noun}-{number}` (e.g., "azure-phoenix-427")
  - Easy to share verbally
  - Validation: `/^[a-z]+-[a-z]+-\d{1,3}$/`

#### Conversational Builder

- **Story-Style Interface**:
  - Uses same architecture as Story feature
  - User describes AI interaction anecdote
  - AI asks clarifying questions (2-5 turns typical)
  - Creates minimal outline, expands naturally
  - Real-time blueprint preview

- **Evaluation Creation**:
  - System instructions via `<SYSTEM_INSTRUCTIONS>` tags
  - Commands: `CREATE_OUTLINE`, `UPDATE_OUTLINE`, `NO_OP`
  - Visible chat + hidden system coordination

#### Publishing & Gallery

- **Publish to Gallery**:
  - Requires author name and description
  - Automatically starts evaluation run
  - Visible in workshop gallery
  - Returns weval URL

- **Share Directly**:
  - Creates evaluation without gallery entry
  - Returns shareable link immediately
  - Author shown as "Anonymous"

- **Gallery View**:
  - All published evaluations for workshop
  - Status badges (Running, Complete, Failed)
  - Contributors count
  - Direct links to results

#### Rate Limiting

```typescript
// In-memory sliding window rate limiter
publishPerSession: { max: 10, window: '1h' }
publishPerWorkshop: { max: 50, window: '1h' }
runsPerWorkshop: { max: 100, window: '1h' }
```

### Architecture

#### Frontend (`src/app/workshop/`)

**Page Structure**:

```
/workshop                                  # Workshop landing/intro
/workshop/[workshopId]                     # Builder interface
/workshop/[workshopId]/gallery             # Published evaluations
/workshop/[workshopId]/weval/[wevalId]     # Results view
```

**State Management**:

- **`useWorkshopOrchestrator`** (`src/hooks/useWorkshopOrchestrator.ts`)
  - Session management (client-side only)
  - Chat state and streaming
  - Blueprint creation/updates via API
  - Publishing and sharing logic
  - Quick test execution
  - Auto-saves to localStorage

**Key Features**:

- **Session Auto-Creation**: On mount, checks localStorage or creates new session
- **State Persistence**: Debounced auto-save (500ms) of messages, outline, phase, quickRunResult
- **Streaming Parser**: Same as Story feature, parses `<USER_RESPONSE>` and `<SYSTEM_INSTRUCTIONS>`
- **Error Handling**: Stream errors via `<STREAM_ERROR>` control signals

**Components**:

- **Builder Page**: Story-style chat + blueprint preview
- **Gallery Page**: Card grid of published wevals with status polling (10s interval)
- **Weval View Page**: Two-column layout (blueprint + results), execution status polling (3s interval)
- **PublishModal**: Collect author name and description
- **ShareModal**: Display shareable link

#### Backend API (`/api/workshop/`)

**Weval Management**:

- **`weval/create`** (`POST`):
  - Validates blueprint
  - Checks rate limits (session and workshop level)
  - Generates wevalId (hash of content)
  - Saves weval metadata to S3: `live/workshop/wevals/{workshopId}/{wevalId}.json`
  - Saves blueprint to S3: `live/workshop/runs/{workshopId}/{wevalId}/blueprint.yml`
  - Invokes background function with `blueprintKey`
  - Updates gallery index
  - Returns `wevalId`, `wevalUrl`

- **`weval/[workshopId]/[wevalId]`** (`GET`):
  - Fetches weval metadata
  - Fetches execution status from `live/workshop/runs/{workshopId}/{wevalId}/status.json`
  - Fetches results from `live/workshop/runs/{workshopId}/{wevalId}/_comparison.json`
  - Returns combined data

- **`weval/status/[workshopId]/[wevalId]`** (`GET`):
  - Lightweight status-only endpoint
  - Returns status.json contents
  - Used for polling

- **`weval/[workshopId]/[wevalId]/retry`** (`POST`):
  - Re-invokes background function with existing blueprint
  - Updates execution metadata
  - Returns new execution info

**Gallery API**:

- **`[workshopId]/gallery`** (`GET`):
  - Fetches gallery index: `live/workshop/wevals/{workshopId}/_gallery.json`
  - Returns list of wevals with status

**Utilities** (`src/lib/workshop-utils.ts`):

```typescript
// ID Generation
generateWorkshopId(): string              // "crimson-elephant-742"
isValidWorkshopId(id: string): boolean
generateSessionId(): string               // "ws_{timestamp}_{random}"

// Session Management (localStorage)
createWorkshopSession(workshopId, displayName)
getWorkshopSession(workshopId)
saveWorkshopSession(session)
ensureWorkshopSession(workshopId, displayName)

// Display Name Persistence
getStoredDisplayName(): string | null
saveDisplayName(name: string)

// State Persistence (localStorage)
saveWorkshopState(workshopId, state)
getWorkshopState(workshopId)
clearWorkshopState(workshopId)

// S3 Paths
WorkshopPaths.weval(workshopId, wevalId)
```

### Storage Pattern

```
live/
└── workshop/
    ├── wevals/
    │   └── {workshopId}/
    │       ├── _gallery.json                    # Gallery index
    │       └── {wevalId}.json                   # Weval metadata
    └── runs/
        └── {workshopId}/
            └── {wevalId}/
                ├── blueprint.yml                # Input blueprint
                ├── status.json                  # Execution status
                └── _comparison.json             # Results
```

### Weval Metadata Schema

```typescript
{
  wevalId: string,           // Content hash
  workshopId: string,
  sessionId: string,
  authorName: string,
  description: string,
  inGallery: boolean,        // Published vs. shared
  blueprint: object,         // Full blueprint object
  createdAt: string,         // ISO timestamp
  executionStatus: string,   // pending|running|complete|error
  executionRunId: string     // Background function invocation ID
}
```

### Key User Flows

#### Creating & Publishing Evaluation

1. User enters workshop: `/{workshopId}`
2. Session auto-created/loaded from localStorage
3. User describes AI interaction in story-style interface
4. AI asks clarifying questions (2-5 turns)
5. AI issues `CREATE_OUTLINE` command
6. Blueprint appears in preview panel
7. User clicks "Publish"
8. `PublishModal` collects author name and description
9. `POST /api/workshop/weval/create`:
   - Save metadata + blueprint to S3
   - Invoke background function
   - Update gallery index
10. User redirected to weval view
11. Execution status polled every 3 seconds
12. Results displayed when complete

#### Viewing Gallery

1. User visits `/{workshopId}/gallery`
2. Fetch gallery index from S3
3. Display cards with:
   - Author name
   - Description
   - Prompt count
   - Status badge (with icon)
4. Poll gallery every 10 seconds for status updates
5. Click card → navigate to weval view

---

## 4. Shared Execution Infrastructure

Both Sandbox and Workshops use the **same background execution function** but with different storage paths. This eliminates code duplication while maintaining feature separation.

### Path-Agnostic Pipeline

**Function**: `netlify/functions/execute-sandbox-pipeline-background.ts`

**Key Innovation**: Derives all output paths from the input `blueprintKey` parameter, rather than hardcoding directory names.

```typescript
// Input
{
  runId: string,
  blueprintKey: string,  // e.g., "live/workshop/runs/{workshopId}/{wevalId}/blueprint.yml"
  sandboxVersion: string // (ignored, kept for backward compat)
}

// Path derivation
const basePath = blueprintKey.replace(/\/blueprint\.yml$/, '');
// Sandbox: "live/sandbox/runs/{runId}"
// Workshop: "live/workshop/runs/{workshopId}/{wevalId}"

// All outputs use basePath
const statusKey = `${basePath}/status.json`;
const resultKey = `${basePath}/_comparison.json`;
```

### Execution Flow

1. **Invocation**:
   - Sandbox: `POST /api/sandbox/run` → invoke background function
   - Workshop: `POST /api/workshop/weval/create` → invoke background function

2. **Status Updates** (via `getStatusUpdater`):
   ```
   pending → "Fetching blueprint..."
   generating_responses → "Generating model responses..." (with progress)
   evaluating → "Running evaluations..." (with progress)
   saving → "Aggregating and saving results..."
   complete → "Run finished!" (with resultUrl)
   error → "An error occurred..." (with details)
   ```

3. **Blueprint Processing**:
   - Fetch blueprint from S3 using `blueprintKey`
   - Parse and normalize with `parseAndNormalizeBlueprint`
   - Register custom models if defined
   - Sanitize system prompts (array vs. object handling)
   - Normalize tags

4. **Response Generation**:
   - Call `generateAllResponses` with progress callback
   - Update status with `progress: { completed, total }`
   - Store responses in memory map

5. **Evaluation**:
   - Run evaluators based on `evaluationConfig`:
     - `embedding`: Similarity matrix
     - `llm-coverage`: Coverage scores and key points
   - Update status with evaluation progress

6. **Result Aggregation**:
   - Build `FinalComparisonOutputV2` object
   - Skip executive summary (ephemeral runs)
   - Write to `{basePath}/_comparison.json`

7. **Legacy Compatibility** (Sandbox only):
   ```typescript
   if (basePath.startsWith('live/sandbox/')) {
     // Also write to live/blueprints/sandbox-{runId}/... for old UI
   }
   ```

### Status Polling

**Sandbox**:
- Frontend: `useEvaluation` hook
- Endpoint: `/api/sandbox/status/[runId]`
- Interval: 3 seconds
- Reads: `live/sandbox/runs/{runId}/status.json`

**Workshop**:
- Frontend: weval view page `useEffect`
- Endpoint: `/api/workshop/weval/status/[workshopId]/[wevalId]`
- Interval: 3 seconds
- Reads: `live/workshop/runs/{workshopId}/{wevalId}/status.json`

### Result Retrieval

**Sandbox**:
- Results UI: `/sandbox/results/[runId]`
- Fetches: `live/sandbox/runs/{runId}/_comparison.json` (preferred)
- Fallback: `live/blueprints/sandbox-{runId}/sandbox-run_{timestamp}_comparison.json`

**Workshop**:
- Results UI: `/workshop/[workshopId]/weval/[wevalId]`
- Endpoint: `/api/workshop/weval/[workshopId]/[wevalId]`
- Fetches: `live/workshop/runs/{workshopId}/{wevalId}/_comparison.json`
- Embedded in page via `AnalysisProvider` + `SimpleClientPage`

---

## 5. Storage Architecture

### S3 Bucket Structure

```
live/
├── blueprints/                      # Production runs (official benchmarks)
│   └── {configId}/
│       └── {runLabel}_{timestamp}_comparison.json
│
├── sandbox/                         # Sandbox runs (individual testing)
│   └── runs/
│       └── {runId}/
│           ├── blueprint.yml
│           ├── status.json
│           └── _comparison.json
│
└── workshop/                        # Workshop runs (collaborative)
    ├── wevals/
    │   └── {workshopId}/
    │       ├── _gallery.json        # Gallery index
    │       └── {wevalId}.json       # Weval metadata
    └── runs/
        └── {workshopId}/
            └── {wevalId}/
                ├── blueprint.yml
                ├── status.json
                └── _comparison.json
```

### Timestamp Formats

All timestamps use the "safe timestamp" format for URL compatibility:

```typescript
// toSafeTimestamp(isoString)
// Input:  "2025-01-09T12:30:45.123Z"
// Output: "2025-01-09T12-30-45-123Z"
```

This format:
- URL-safe (no colons or dots in path)
- Sortable chronologically
- Parseable back to ISO format via `fromSafeTimestamp`

**Usage**:
- Production: `/analysis/{configId}/{runLabel}/{safeTimestamp}`
- Sandbox: Legacy path uses safe timestamp
- Workshop: `toSafeTimestamp(weval.createdAt)` used internally by AnalysisProvider (no direct URL)

### Advanced Analysis Integration

**Sandbox**:
Sandbox results provide a link to the advanced analysis UI:
```typescript
// Results page provides link
const analysisUrl = `/analysis/sandbox-${runId}/sandbox-run/${safeTimestamp}`;
```

**Workshop**:
Workshop results are **embedded inline** using `SimpleClientPage` and do not link to the advanced analysis page. This is intentional, as workshops are ephemeral and don't need the full analysis tooling.

```typescript
// Workshop weval page embeds results directly
<AnalysisProvider
  initialData={execution.result}
  configId={`workshop_${workshopId}`}
  runLabel={wevalId}
  timestamp={toSafeTimestamp(weval.createdAt)}
>
  <SimpleClientPage />
</AnalysisProvider>
```

The `SimpleClientPage` components detect workshop runs by checking if `configId.startsWith('workshop_')` and hide advanced analysis links accordingly.

### Storage Service Workshop Support

The storage service (`src/lib/storageService.ts`) automatically detects workshop runs and uses the correct S3 paths:

```typescript
// Workshop detection
function isWorkshopRun(configId: string): boolean {
  return configId.startsWith('workshop_');
}

// Path construction
function workshopPaths(configId: string, wevalId: string, relative: string) {
  const workshopId = extractWorkshopId(configId); // "workshop_foo-bar" -> "foo-bar"
  const s3Key = path.join(LIVE_DIR, 'workshop', 'runs', workshopId, wevalId, relative);
  // Returns: live/workshop/runs/{workshopId}/{wevalId}/_comparison.json
}
```

All lazy-loading API endpoints (`/api/comparison/[configId]/[runLabel]/[timestamp]/...`) automatically support workshop runs through this detection mechanism. This enables workshop modals (ModelPerformanceModal, PromptDetailModal, etc.) to work correctly.

---

## 6. Comparison Matrix

| Feature | Sandbox | Workshops |
|---------|---------|-----------|
| **Purpose** | Individual testing & iteration | Collaborative eval building |
| **Authentication** | Optional (GitHub) | None required |
| **Session Storage** | Client-side (localStorage) | Client-side (localStorage) |
| **Identity** | GitHub username or anonymous | Display name (workshop-scoped) |
| **Creation Interface** | Form/YAML editor | Story-style conversational |
| **Collaboration** | No (single user) | Yes (shared workspace) |
| **Version Control** | GitHub fork + branches | No (ephemeral only) |
| **Pull Requests** | Yes (propose to public library) | No |
| **Blueprint Format** | Raw YAML or structured form | AI-generated via conversation |
| **Execution Trigger** | User clicks "Run" | Auto-runs on publish/share |
| **Results Storage** | `live/sandbox/runs/{runId}/` | `live/workshop/runs/{workshopId}/{wevalId}/` |
| **Gallery** | No (personal file list) | Yes (workshop-wide gallery) |
| **Rate Limiting** | No | Yes (per-session + per-workshop) |
| **Sharing** | Via GitHub PR or export | Direct link or gallery |
| **Persistence** | Local drafts + GitHub files | Client-side state only |
| **Background Function** | `execute-sandbox-pipeline-background.ts` | Same (path-agnostic) |
| **Status Polling** | `/api/sandbox/status/[runId]` | `/api/workshop/weval/status/[workshopId]/[wevalId]` |
| **Advanced Analysis** | Link to `/analysis/sandbox-{runId}/...` | Embedded inline (SimpleClientPage) |
| **Modal Support** | Yes (via storage service) | Yes (via storage service workshop detection) |

### When to Use Each

**Use Sandbox When**:
- Developing evals alone
- Need version control (GitHub integration)
- Want to propose evals to public library
- Prefer structured editing (form or YAML)
- Testing before making eval official

**Use Workshops When**:
- Building evals with a group
- Want conversational creation interface
- Need to share results with specific audience
- Running quick collaborative experiments
- Teaching/demonstrating eval creation
- Workshop or classroom setting

### Migration Path

There is **no direct migration** between Sandbox and Workshops, as they serve different purposes:

- Sandbox blueprints can be manually copied to Workshop builder
- Workshop wevals can be exported as YAML and imported to Sandbox
- Both can be promoted to production runs via `run-config`

---

## 7. Implementation Notes

### Error Handling

**Streaming Errors**:
- LLM service failures yield `{ type: 'error', error: string }`
- Wrapped in `<STREAM_ERROR>` control signal
- Parsed by `StreamingParser`, stored in `streamError`
- Displayed to user, skips instruction processing

**Background Function Errors**:
- Caught in try/catch, written to `status.json`:
  ```json
  { "status": "error", "message": "...", "details": "..." }
  ```
- Frontend polls status, displays error state
- Retry mechanism available for workshop wevals

### Security Considerations

**Sandbox**:
- GitHub OAuth for authentication
- GitHub API token stored in session
- User can only modify their own fork
- PRs require review before merge

**Workshops**:
- No authentication (intentional)
- Rate limiting prevents abuse
- Client-side sessions prevent CSRF
- S3 paths validated server-side
- Content-addressed wevalIds (hash-based)

### Performance Optimizations

**Sandbox**:
- Debounced editor updates (500ms)
- Immediate UI feedback during deletion
- Lazy load PR statuses
- Monaco editor code splitting

**Workshops**:
- Debounced state auto-save (500ms)
- Gallery index caching
- Lightweight status polling endpoint
- Streaming chat responses

### Testing

**Sandbox**:
- No tests in codebase currently

**Workshop**:
- `src/app/api/workshop/__tests__/workshop.test.ts`
  - Workshop ID generation and validation
  - Session creation (no PIN)
  - Session ID uniqueness
- `src/app/api/workshop/__tests__/workshop-rate-limiter.test.ts`
  - Sliding window rate limiting
  - Per-session and per-workshop limits
  - Clock mocking for time-based tests

---

## 8. Future Considerations

### Potential Enhancements

**Sandbox**:
- Real-time collaboration (multi-user editing)
- Blueprint templates library
- Diff view for GitHub file changes
- Integration with CI/CD for automated testing

**Workshops**:
- Workshop discovery page (browse all workshops)
- Private workshops (invite-only)
- Workshop moderation tools
- Export gallery as static site
- Upvoting/commenting on wevals

### Cleanup & Maintenance

Both features generate ephemeral data that should be periodically cleaned:

**Cleanup Policy** (not yet implemented):
- Sandbox runs: 30 days
- Workshop wevals: 90 days (longer for shared spaces)
- Gallery indexes: Keep indefinitely
- Status files: Delete after 7 days of completion

**Monitoring**:
- Track S3 usage per feature
- Monitor background function execution time
- Rate limit breach notifications
- Failed execution alerts

---

## 9. Related Documentation

- [Blueprint Format Specification](./BLUEPRINT_FORMAT.md) *(if exists)*
- [Evaluation Methods](./EVALUATION_METHODS.md) *(if exists)*
- [Story Feature Architecture](./STORY_ARCHITECTURE.md) *(if exists)*
- [API Authentication](./API_AUTH.md) *(if exists)*

---

**Document Version**: 1.1
**Last Updated**: 2025-10-09
**Authors**: Claude Code (generated), James (reviewed)
