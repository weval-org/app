# Sandbox: Technical Guide

This document provides a comprehensive overview of the architecture, implementation details, and user flows for the Sandbox feature.

## 1. Introduction

The Sandbox is an interactive, browser-based environment designed for creating, testing, and evaluating AI model prompts using the Weval blueprint format. It provides a seamless experience for both anonymous users and authenticated GitHub users, offering a powerful tool for prompt engineering and model comparison.

The key design principles are:
- **Graceful Fallback**: The system works perfectly for anonymous users, with GitHub integration acting as a progressive enhancement.
- **Client-Side State Management**: The UI is highly responsive, managing complex state transitions (e.g., local drafts vs. GitHub files) on the client.
- **Clear Separation of Concerns**: Logic is clearly separated between frontend components, state management hooks, and backend API routes.
- **Idiomatic Source Control**: All proposed changes are managed on isolated "feature branches," ensuring that pull requests are clean, focused, and easy to review, mirroring professional development workflows.

## 2. Core Features

- **Blueprint Creation & Editing**:
    - **Form & YAML Editors**: A dual-editor interface allows users to build blueprints using either a structured form or raw YAML, with changes synchronized between them.
    - **Local Drafts**: Anonymous users can create, edit, and save multiple blueprint drafts entirely within their browser's local storage.
    - **AI-Powered Creation**: Users can provide a high-level goal, and the system will use an LLM to automatically generate a high-quality starter blueprint.
- **Model Evaluation**:
    - Users can run their blueprints against a suite of supported AI models.
    - The system provides real-time status updates on the evaluation process. The lifecycle is `idle` -> `pending` -> `generating_responses` -> `evaluating` -> `saving` -> `complete`. An `error` state can be entered if any step fails.
- **GitHub Integration (Authenticated Users)**:
    - **Automatic Forking**: On first login, the application automatically forks the `weval-org/configs` repository on the user's behalf.
    - **Branch-Based File Management**: Users can create, read, update, and delete blueprint files. Each new proposal is automatically placed on its own "feature branch" in the user's fork.
    - **Propose Changes**: Users can create pull requests from their feature branches to propose their blueprints for inclusion in the main public library.
    - **PR Status Tracking**: The UI displays the status (open, closed, merged) of any pull requests associated with a user's blueprints.

## 3. Architecture Deep Dive

The Sandbox is a full-stack feature built within the Next.js application.

### Frontend

The frontend is located in `src/app/sandbox/` and is composed of three main layers: the main page component, custom hooks for state management, and UI components.

#### State Management Hooks

The logic of the Sandbox is primarily managed by a set of custom hooks that handle state, API interactions, and side effects.

-   **`useWorkspace()`**:
    -   **Location**: `src/app/sandbox/hooks/useWorkspace.ts`
    -   **Responsibility**: This is the master hook that orchestrates the entire Sandbox UI. It integrates the other hooks and serves as the single source of truth for the `SandboxClientPage`. It is responsible for:
        - Managing the list of blueprint files (both local drafts and GitHub files on branches).
        - Handling the active blueprint being edited, including its `branchName`.
        - Orchestrating all user actions (saving, deleting, promoting, creating PRs) and delegating to the appropriate sub-hooks.
        - Managing the overall workspace status (e.g., `setting_up`, `loading`, `saving`, `deleting`).

-   **`useGitHub()`**:
    -   **Location**: `src/app/sandbox/hooks/useGitHub.ts`
    -   **Responsibility**: Manages all direct interactions with the GitHub API via the backend. Its concerns are isolated to handling the user's fork and all branch-based operations. Key functions include `setupWorkspace` (checks for/creates the fork), `promoteBlueprintToBranch` (initiates branch and file creation), `updateFileOnGitHub` (commits changes to a branch), and `createPullRequest` (creates a PR from a branch).

-   **`useEvaluation()`**:
    -   **Location**: `src/app/sandbox/hooks/useEvaluation.ts`
    -   **Responsibility**: Manages the lifecycle of a single evaluation run. When a run is initiated, it sets a `runId` and begins polling the `/api/sandbox/status/[runId]` endpoint. A key behavior is that it polls **immediately** upon receiving a `runId` and then continues polling on a 3-second interval until the run is `complete` or enters an `error` state.

-   **`useAuth()`**:
    -   **Location**: `src/app/sandbox/hooks/useAuth.ts`
    -   **Responsibility**: A simple hook that manages the user's authentication state. It calls `/api/github/user/status` on load to check for a valid session.

#### Core Components

-   **`SandboxClientPage.tsx`**:
    -   **Location**: `src/app/sandbox/components/SandboxClientPage.tsx`
    -   **Responsibility**: The main container component that assembles all other UI elements. It initializes the `useWorkspace` and `useAuth` hooks and passes state and callbacks down to its children.

-   **`FileNavigator.tsx`**:
    -   **Location**: `src/app/sandbox/components/FileNavigator.tsx`
    -   **Responsibility**: Renders the list of blueprint files. It displays different icons for local vs. GitHub files and visually indicates when a file is on a feature branch or has an open pull request. It also handles user interactions like selecting, creating, renaming, and deleting files.

-   **`EditorPanel.tsx` & `FormPanel.tsx`**:
    -   **Location**: `src/app/sandbox/components/`
    -   **Responsibility**: These two components provide the dual-editing experience. `EditorPanel` contains the Monaco editor for raw YAML, while `FormPanel` provides a structured UI. Changes in one are parsed and reflected in the other.

### Backend API

The backend consists of two sets of API routes: sandbox-specific and GitHub-specific.

#### Sandbox API (`/api/sandbox/`)

-   **`run`**: Kicks off an evaluation by creating a run record and invoking a background job orchestrator. Returns a `runId` to the client.
-   **`status`**: Provides the real-time status of an ongoing evaluation run, which is polled by the `useEvaluation` hook.
-   **`auto-create`**: Takes a user's goal and uses an LLM via `getModelResponse` to generate YAML for a new blueprint.

#### GitHub Workspace API (`/api/github/workspace/`)

-   **`setup`**: Checks if a user has a fork of `weval-org/configs`. If not, it creates one. This is the first step for any authenticated user.
-   **`files`**: Lists the blueprint files from the user's forked repository, discovering files from all `proposal/*` branches.
-   **`file`**: A RESTful endpoint that handles all branch-aware file operations. It can create, read, update, and delete files on specific branches in the user's fork. When creating a new file, it also creates the feature branch itself.
-   **`prs-status`**: Fetches the status of all pull requests authored by the user in the upstream repository, allowing the UI to decorate files with their PR status.
-   **`pr/create`**: Creates a new pull request from a pre-existing feature branch in the user's fork to the `weval-org/configs` repository.

## 4. Key User Flows

### Promoting a Local Blueprint to GitHub

This flow details how a user-created local draft becomes a version-controlled file on a dedicated feature branch in their GitHub repository.

1.  **User Action**: A logged-in user clicks "Save to GitHub..." on a blueprint that is currently a local draft (`isLocal: true`).
2.  **Modal**: The `handlePromotion` function in `SandboxClientPage.tsx` opens a modal for the user to confirm the filename.
3.  **Frontend Call**: On confirmation, the function calls `promoteBlueprint` from `useWorkspace`, which in turn calls `promoteBlueprintToBranch` from `useGitHub`.
4.  **Backend Branch Creation**: `promoteBlueprintToBranch` sends a `POST` request to `/api/github/workspace/file`. The backend API then performs a critical, robust sequence:
    a. It fetches the latest commit SHA from the `main` branch of the official **upstream** `weval-org/configs` repository, ensuring the proposal is based on the most up-to-date code.
    b. It creates a new, unique branch (e.g., `proposal/my-blueprint-1678886400000`) in the **user's fork**, pointing it directly to the upstream SHA.
    c. It commits the new blueprint file to this clean feature branch.
5.  **Client-Side Sync**: Upon a successful API response (which includes the new file's `branchName`), the `useWorkspace` hook refreshes the file list.
6.  **UI Update**: Back in the `SandboxClientPage.tsx`, the `promoteBlueprint` logic proceeds to delete the original local draft and load the newly created, branch-aware remote file into the editor. The user sees a "Saved to GitHub" toast, and the file navigator updates to show the new file with a branch icon.

### Deleting a GitHub-Synced File

This flow was improved to provide better real-time feedback.

1.  **User Action**: The user clicks the trash icon next to a GitHub file in the `FileNavigator`.
2.  **Confirmation Dialog**: A modal dialog appears to confirm the destructive action.
3.  **Initiate Deletion**: Upon confirmation, the `deleteBlueprint` function in `useWorkspace` is invoked.
4.  **Immediate Feedback**: `deleteBlueprint` *immediately* sets the `deletingFilePath` state with the path of the file being deleted.
5.  **UI Reaction**: The `FileNavigator` sees the `deletingFilePath` and applies a visual style to the corresponding file item (e.g., reduced opacity and a loading spinner), indicating it is being processed.
6.  **Backend Deletion**: `deleteBlueprint` delegates to `useGitHub`, which sends a `DELETE` request to `/api/github/workspace/file`. The request body includes the file's path, SHA, and its specific `branchName`. The backend then deletes the file from that branch.
7.  **Finalize**: Once the API call completes, `deletingFilePath` is set back to `null`, and the file is removed from the `files` array, disappearing from the UI. 