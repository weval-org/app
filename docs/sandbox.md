# Sandbox: Technical Guide

This document provides a comprehensive overview of the architecture, implementation details, and user flows for the Sandbox feature.

## 1. Introduction

The Sandbox is an interactive, browser-based environment designed for creating, testing, and evaluating AI model prompts using the Weval blueprint format. It provides a seamless experience for both anonymous users and authenticated GitHub users, offering a powerful tool for prompt engineering and model comparison.

The key design principles are:
- **Graceful Fallback**: The system works perfectly for anonymous users, with GitHub integration acting as a progressive enhancement.
- **Client-Side State Management**: The UI is highly responsive, managing complex state transitions (e.g., local drafts vs. GitHub files) on the client.
- **Clear Separation of Concerns**: Logic is clearly separated between frontend components, state management hooks, and backend API routes.

## 2. Core Features

- **Blueprint Creation & Editing**:
    - **Form & YAML Editors**: A dual-editor interface allows users to build blueprints using either a structured form or raw YAML, with changes synchronized between them.
    - **Local Drafts**: Anonymous users can create, edit, and save multiple blueprint drafts entirely within their browser's local storage.
    - **AI-Powered Creation**: Users can provide a high-level goal, and the system will use an LLM to automatically generate a high-quality starter blueprint.
- **Model Evaluation**:
    - Users can run their blueprints against a suite of supported AI models.
    - The system provides real-time status updates on the evaluation process (pending, generating, evaluating, complete).
- **GitHub Integration (Authenticated Users)**:
    - **Automatic Forking**: On first login, the application automatically forks the `weval-org/configs` repository on the user's behalf.
    - **File Management**: Users can create, read, update, and delete blueprint files directly in their fork.
    - **Propose Changes**: Users can create pull requests to propose their blueprints for inclusion in the main public library.
    - **PR Status Tracking**: The UI displays the status (open, closed, merged) of any pull requests associated with a user's blueprints.

## 3. Architecture Deep Dive

The Sandbox is a full-stack feature built within the Next.js application.

### Frontend

The frontend is located in `src/app/sandbox/` and is composed of three main layers: the main page component, custom hooks for state management, and UI components.

#### State Management Hooks

-   **`useAuth()`**:
    -   **Location**: `src/app/sandbox/hooks/useAuth.ts`
    -   **Responsibility**: Manages the user's authentication state. It makes an API call to `/api/github/user/status` on load to determine if the user has a valid session. It provides a `clearAuth` function to gracefully handle auth mismatches between the client and server.

-   **`useWorkspace()`**:
    -   **Location**: `src/app/sandbox/hooks/useWorkspace.ts`
    -   **Responsibility**: This is the heart of the Sandbox's frontend logic. It is responsible for:
        - Managing the list of blueprint files (both local and from GitHub).
        - Handling the active blueprint being edited.
        - Orchestrating all API calls related to file operations (CRUD), evaluations, and pull requests.
        - Managing workspace status (e.g., `setting_up`, `loading`, `saving`, `deleting`).
        - Tracking the state of file deletions on a per-file basis (`deletingFilePath`) for a responsive UI.

#### Core Components

-   **`SandboxClientPage.tsx`**:
    -   **Location**: `src/app/sandbox/components/SandboxClientPage.tsx`
    -   **Responsibility**: The main container component that assembles all other UI elements. It initializes the `useAuth` and `useWorkspace` hooks and passes state and callbacks down to its children.

-   **`FileNavigator.tsx`**:
    -   **Location**: `src/app/sandbox/components/FileNavigator.tsx`
    -   **Responsibility**: Renders the list of blueprint files on the left-hand side. It displays different icons for local vs. GitHub files, shows PR status, and handles user interactions like selecting, creating, and deleting files. It uses a modal dialog for deletion confirmation.

-   **`EditorPanel.tsx` & `FormPanel.tsx`**:
    -   **Location**: `src/app/sandbox/components/`
    -   **Responsibility**: These two components provide the dual-editing experience. `EditorPanel` contains the Monaco editor for raw YAML, while `FormPanel` provides a structured UI. Changes in one are parsed and reflected in the other.

### Backend API

The backend consists of two sets of API routes: sandbox-specific and GitHub-specific.

#### Sandbox API (`/api/sandbox/`)

-   **`run`**: Kicks off an evaluation by sending the blueprint content to a background job orchestrator.
-   **`status`**: Provides the real-time status of an ongoing evaluation run.
-   **`auto-create`**: Takes a user's goal and uses an LLM via `getModelResponse` to generate YAML for a new blueprint.

#### GitHub Workspace API (`/api/github/workspace/`)

-   **`setup`**: Checks if a user has a fork of `weval-org/configs`. If not, it creates one. This is the first step for any authenticated user.
-   **`files`**: Lists the blueprint files from the user's forked repository.
-   **`file`**: A RESTful endpoint for Creating (`POST`), Reading (`GET`), Updating (`POST`), and Deleting (`DELETE`) individual blueprint files in the user's fork.
-   **`prs-status`**: Fetches the status of all pull requests authored by the user in the upstream repository, allowing the UI to decorate files with their PR status.
-   **`pr/create`**: Creates a new pull request from the user's fork to the `weval-org/configs` repository.

## 4. Key User Flows

### Promoting a Local Blueprint to GitHub

This flow corrects a previous bug where the process was handled incorrectly on the client.

1.  **User Action**: A logged-in user clicks "Save" on a blueprint that is currently a local draft (`isLocal: true`).
2.  **Modal**: The `handleSave` function in `SandboxClientPage.tsx` opens a modal asking for a filename.
3.  **API Call**: On confirmation, `handleSave` calls the `promoteBlueprint` function from the `useWorkspace` hook.
4.  **Backend Creation**: `promoteBlueprint` makes a `POST` request to `/api/github/workspace/file` with the blueprint content and an `isNew: true` flag. The backend API creates this new file in the user's GitHub fork.
5.  **Client-Side Cleanup**: Upon a successful API response, `promoteBlueprint` immediately calls `fetchFiles()` to get the updated list of remote files.
6.  **UI Update**: Back in `handleSave`, the original local draft is deleted from local storage via `deleteBlueprint()`, and the newly created remote file is loaded into the editor via `loadFile()`. The user sees a "Saved to GitHub" toast.

### Deleting a GitHub-Synced File

This flow was improved to provide better real-time feedback.

1.  **User Action**: The user clicks the trash icon next to a GitHub file in the `FileNavigator`.
2.  **Confirmation Dialog**: The `handleDeleteClick` function opens a modal dialog to confirm the destructive action.
3.  **Initiate Deletion**: Upon confirmation, the `onDeleteFile` callback is invoked, which maps to the `deleteBlueprint` function in `useWorkspace`.
4.  **Immediate Feedback**: `deleteBlueprint` *immediately* sets the `deletingFilePath` state with the path of the file being deleted.
5.  **UI Reaction**: The `FileNavigator` sees the `deletingFilePath` and applies a visual style to the corresponding file item (e.g., reduced opacity and a loading spinner), indicating it is being processed.
6.  **Backend Deletion**: `deleteBlueprint` sends a `DELETE` request to `/api/github/workspace/file`.
7.  **Finalize**: Once the API call completes, `deletingFilePath` is set back to `null`, and the file is removed from the `files` array, disappearing from the UI. 