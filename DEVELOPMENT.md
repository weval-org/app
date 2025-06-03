# CivicEval Development Guide

*Last updated: 1 June 2025*

This guide provides instructions for setting up and running the CivicEval project locally for development purposes, as well as notes on deployment.

## 1. Overview of Development Environment

The CivicEval project consists of several key components:
-   **Next.js Web Application**: The user-facing dashboard and admin panel, located in `src/app`.
-   **CLI Tools**: For running evaluations from the command line (e.g., `run_config`), located in `src/cli`.
-   **Netlify Functions**: For automated tasks in the deployed environment:
    -   `fetch-and-schedule-evals` (Scheduled Function): Periodically fetches configurations from GitHub and triggers evaluations.
    -   `execute-evaluation` (Background Function): Runs the core evaluation pipeline for a given configuration.
-   **Storage Service**: Abstracted service (`src/lib/storageService.ts`) to handle saving and retrieving results from either local filesystem or AWS S3.

For a seamless local development experience that mirrors the deployed environment (especially for testing Netlify Functions), using the Netlify CLI is highly recommended.

## 2. Prerequisites

Ensure you have the following installed:

-   [Node.js](https://nodejs.org/) (version 18+ recommended)
-   [pnpm](https://pnpm.io/installation)
-   [Netlify CLI](https://docs.netlify.com/cli/get-started/): Install globally with `npm install -g netlify-cli` or `pnpm add -g netlify-cli`.
-   [Git](https://git-scm.com/)

## 3. Initial Setup

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/civiceval/app.git
    cd llm-semantic-comparison # Or your repository name
    ```

2.  **Install Dependencies:**
    ```bash
    pnpm install
    ```

3.  **Set Up Environment Variables:**
    Copy the example environment file to create your local configuration:
    ```bash
    cp .env.example .env.local
    ```
    Now, edit `.env.local` to include your specific keys and settings as described in the next section.

## 4. Environment Variables (`.env.local`)

Populate your `.env.local` file with the following variables. Only include S3 variables if you intend to test with AWS S3 locally.

-   **LLM API Keys (Required for most operations):**
    -   `OPENAI_API_KEY`: Essential for text embeddings (default `text-embedding-3-small`) and if using OpenAI models for generation or `llm-coverage`.
    -   `OPENROUTER_API_KEY`: Required for the `llm-coverage` feature (most models are available via OpenRouter).

-   **Storage Configuration (Controls where results are saved):**
    -   `STORAGE_PROVIDER`: Set to `local` to save results to the local filesystem (`/.results/...`). Set to `s3` to save results to AWS S3. Defaults to `local` if `NODE_ENV=development` and this variable is not set, otherwise defaults to `s3`.
    -   `APP_S3_BUCKET_NAME`: Your AWS S3 bucket name (required if `STORAGE_PROVIDER=s3`).
    -   `APP_S3_REGION`: The AWS region of your S3 bucket (required if `STORAGE_PROVIDER=s3`).
    -   `APP_AWS_ACCESS_KEY_ID`: Your AWS IAM access key ID (if using S3 with explicit credentials).
    -   `APP_AWS_SECRET_ACCESS_KEY`: Your AWS IAM secret access key (if using S3 with explicit credentials).
        *Note: Ensure these S3 variables use the `APP_` prefix as defined in `storageService.ts` to avoid conflicts with Netlify's reserved variables.*

-   **Admin Panel Access (For local development):**
    -   `NEXT_PUBLIC_ADMIN_SECRET_SLUG`: A secret string used to access the admin panel at `/admin/[YOUR_SLUG]`. For example: `mysecretadmin`. The `NEXT_PUBLIC_` prefix is important for client-side access.

-   **URL for Netlify Functions (Usually handled by `netlify dev`):**
    -   `URL`: This variable is used by the Next.js API route (`/api/admin/trigger-eval`) to know the endpoint of the `execute-evaluation` Netlify function. 
        -   When using `netlify dev`, this is **automatically set** to the local development server's URL (e.g., `http://localhost:8888`). You typically **do not need to set this manually** in `.env.local` if using `netlify dev`.
        -   If you are running the Next.js app and Netlify functions separately (not recommended for full testing), you would need to set this to the URL where your local Netlify functions are being served (e.g., `http://localhost:9999` if using `netlify functions:serve` on that port).

## 5. Running the Full Application Locally (Recommended)

Using `netlify dev` is the best way to run all parts of the application locally, including the Next.js frontend, API routes, and Netlify functions.

1.  **Start the Development Server:**
    ```bash
    netlify dev
    ```
    This command will:
    -   Start your Next.js development server.
    -   Detect and run your Netlify functions (from the `netlify/functions` directory) locally.
    -   Make environment variables from your `.env.local` file and Netlify's own local environment available (including setting `process.env.URL`).
    -   Output the local URL where the application is being served (commonly `http://localhost:8888`).

2.  **Accessing the Application:**
    -   Open your browser and navigate to the URL provided by `netlify dev` (e.g., `http://localhost:8888`).
    -   To access the admin panel, navigate to `http://localhost:8888/admin/YOUR_ADMIN_SECRET_SLUG` (replace `YOUR_ADMIN_SECRET_SLUG` with the value you set in `.env.local`).

## 6. Running Parts of the Application Locally

While `netlify dev` is recommended for a full-stack experience, you can also run parts of the application independently:

-   **CLI for `run_config`:**
    To run specific evaluation configurations using the command-line tool:
    ```bash
    pnpm cli run_config --config path/to/your_config.json --run-label my-local-test
    ```
    Ensure your `.env.local` has the necessary `STORAGE_PROVIDER` ('local' or 's3') and API keys set up for the CLI to use.

-   **Next.js App Only (Limited Functionality):**
    To run only the Next.js web application (e.g., for UI development not involving Netlify functions directly):
    ```bash
    pnpm dev
    ```
    This will typically start the app on `http://localhost:3000`. However, any functionality relying on Netlify Functions (like triggering evaluations from the admin panel or data fetching that might eventually use serverless functions) might not work correctly or will require the functions to be running separately and the `URL` environment variable to be configured appropriately.

## 7. Testing Specific Functionality

-   **Admin Panel Evaluation Triggers:** 
    Use the admin panel (accessed via `netlify dev` as described above) to list configurations and trigger evaluations. The `trigger-eval` API route will call your locally running `execute-evaluation` Netlify function.

-   **Scheduled Functions (`fetch-and-schedule-evals`):**
    `netlify dev` attempts to simulate scheduled functions. You can also manually trigger Netlify Functions for testing purposes. One way is to directly access their local endpoint if you know it (e.g., `http://localhost:8888/.netlify/functions/fetch-and-schedule-evals`), or use `netlify functions:invoke fetch-and-schedule-evals --no-identity`.

-   **Checking Logs:**
    -   **`netlify dev` Output**: Terminal output from `netlify dev` will show logs from both the Next.js application and your Netlify functions.
    -   **Browser Developer Console**: For client-side issues on the web dashboard or admin panel.

## 8. Deployment to Netlify

The CivicEval project is designed for deployment on Netlify. Deployment is typically handled via Git integration.

-   **Build Settings:** Netlify should be configured to use `pnpm` and appropriate build commands (e.g., `pnpm build`). The publish directory is usually `.next` for Next.js apps.

-   **Environment Variables in Netlify UI:** Configure the following environment variables in your Netlify site settings (Site settings > Build & deploy > Environment > Environment variables):
    -   `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, (and other LLM API keys)
    -   `STORAGE_PROVIDER`: Set to `s3` for deployed environments.
    -   `APP_S3_BUCKET_NAME`
    -   `APP_S3_REGION`
    -   `APP_AWS_ACCESS_KEY_ID`
    -   `APP_AWS_SECRET_ACCESS_KEY`
    -   `NEXT_PUBLIC_ADMIN_SECRET_SLUG` (if you want the admin panel accessible on the deployed site)
    -   `NODE_ENV`: Set to `production`.
    -   `URL`: Netlify automatically provides this for the deployed site.

-   **Netlify Functions:** Ensure your `netlify.toml` correctly configures your functions, including any scheduled functions.
    Example for `netlify.toml` (ensure it reflects your current setup):
    ```toml
    [build]
      command = "pnpm build"
      publish = ".next"

    [functions]
      directory = "netlify/functions"
      node_bundler = "esbuild"

    [[plugins]]
      package = "@netlify/plugin-nextjs"

    # Example: Scheduled function (ensure cron matches your needs)
    [functions."fetch-and-schedule-evals"]
      schedule = "0 0 * * *" # Daily at midnight UTC
    ```

## 9. Troubleshooting Common Issues

-   **`process.env.URL` is undefined (in `/api/admin/trigger-eval`):**
    This usually means you are not running the application via `netlify dev`, or `netlify dev` failed to set it. Ensure you are using `netlify dev` or have manually set the `URL` in `.env.local` to point to your local Netlify functions server if running components separately.

-   **S3 Connection Errors (Locally or Deployed):**
    Double-check bucket name, region, access key, and secret key. Ensure the IAM user associated with the keys has the necessary S3 permissions (GetObject, PutObject, ListBucket for the relevant paths).

-   **Admin Panel Access Denied:**
    Verify `NEXT_PUBLIC_ADMIN_SECRET_SLUG` in your `.env.local` (for local) or Netlify UI (for deployed) matches the slug you are using in the URL.

-   **Netlify Function Invocation Errors:**
    Check the function logs in the `netlify dev` terminal (local) or in the Netlify dashboard (Functions > select function > Logs) for detailed error messages.

## Appendix: Changelog of Transition to Automated System (31 MAY 2025)

This section outlines the major development phases and key changes that transitioned the CivicEval project from a local, file-based system to a deployed, automated evaluation system.

### Phase 1: Decoupling from Local Filesystem (Core Abstraction)

The initial goal was to move away from direct filesystem reads/writes for evaluation configurations and results, making the system suitable for serverless deployment platforms like Netlify.

1.  **Abstracted Storage Service (`storageService.ts`):**
    *   Created `src/lib/storageService.ts` to handle all interactions for saving and retrieving evaluation data (blueprints and results).
    *   Implemented support for two storage providers:
        *   `local`: For local development, saving to `/.results/`.
        *   `s3`: For cloud storage, integrating with AWS S3.
    *   Configuration via environment variables:
        *   `STORAGE_PROVIDER` (e.g., `local` or `s3`).
        *   `APP_AWS_ACCESS_KEY_ID`, `APP_AWS_SECRET_ACCESS_KEY`, `APP_S3_BUCKET_NAME`, `APP_S3_REGION` for S3, using `APP_` prefix to avoid conflicts with Netlify reserved variables.

2.  **Core Logic Adaptation:**
    *   Modified `src/cli/services/comparison-pipeline-service.ts` (specifically `aggregateAndSaveResults` and `executeComparisonPipeline`) to use `storageService.saveResult`.
    *   Updated `src/cli/commands/run-config.ts` to align with changes in the pipeline service.
    *   Refactored API routes (e.g., `src/app/api/comparison/[configId]/[runLabel]/route.ts` was later changed to `src/app/api/comparison/[configId]/[runLabel]/[timestamp]/route.ts`) for analysis pages to fetch data via `storageService` (e.g., `listRunsForConfig`, `getResultByFileName`). The `configId` path parameter will be adapted to prefer `id` if present.
    *   Updated `src/app/utils/homepageDataUtils.ts` to use `storageService` for populating the homepage, enabling it to display data from S3 or local storage.

3.  **Dependency Management:**
    *   Added `@aws-sdk/client-s3` for S3 interactions.

4.  **Debugging and Refinements (Storage):**
    *   Addressed issues with `runLabel` parsing from filenames in `storageService.ts` to ensure correct matching between URL parameters and stored data (especially regarding timestamps and content hashes).
    *   Ensured consistent path alias usage (e.g., `@/`) was compatible with Netlify functions or converted to relative paths where necessary.

### Phase 2: Automation with Netlify Functions & GitHub Configuration Sourcing

This phase focused on automating the evaluation process by fetching configurations from a central repository and running evaluations periodically or on-demand.

1.  **Blueprint Sourcing from GitHub:**
    *   Established `https://github.com/civiceval/configs` (specifically the `/blueprints` subdirectory) as the central public repository for `ComparisonConfig` JSON files (now referred to as Blueprints).

2.  **Content Hashing for Uniqueness:**
    *   Extracted config content hashing logic into `src/lib/hash-utils.ts` (`generateConfigContentHash` function).
    *   This hash became a core part of the `runLabel` to uniquely identify runs based on the exact configuration content.

3.  **Netlify Functions Setup:**
    *   Created `netlify/functions` directory for serverless functions.
    *   Configured `netlify.toml` for function deployment and scheduling.
    *   Added Netlify-related development dependencies (`@netlify/functions`, `netlify`).

4.  **Scheduled Function (`fetch-and-schedule-evals.ts`):**
    *   Runs on a schedule (e.g., daily via `netlify.toml` cron definition).
    *   Fetches all blueprint files from the `civiceval/configs` GitHub repository (from the `blueprints` directory).
    *   For each blueprint:
        *   Calculates its content hash.
        *   Checks S3 (via `storageService.listRunsForConfig`) for existing runs with the same content hash (using `id` or `configId` as the primary key).
        *   If no run exists or the latest run is older than a specified threshold (e.g., one week), it triggers the `execute-evaluation` background function.
    *   Invocation Method: Uses `axios.post` to call the `execute-evaluation` function's endpoint.

5.  **Background Execution Function (`execute-evaluation-background.ts`):**
    *   Renamed from `execute-evaluation.ts` and appended with `-background` to enable Netlify's extended execution time (up to 15 minutes).
    *   Receives the `ComparisonConfig` object in its event payload.
    *   Sets up a simple console logger prefixed with the request ID.
    *   Generates the `runLabel` using `generateConfigContentHash`.
    *   Calls `executeComparisonPipeline` from the main codebase to perform the actual evaluation.
        *   Hardcoded `evalMethods` (e.g., `['embedding', 'llm-coverage']`) and `useCache = true` for automated runs.
    *   Saves results using `storageService` (which directs to S3 in the deployed environment).

6.  **Debugging and Refinements (Netlify Functions):**
    *   **Invocation Issues:** Resolved an issue where `trigger-eval` (and potentially `fetch-and-schedule-evals`) did not reliably trigger the background function. The fix involved `await`ing the `axios.post` call in the invoking function to ensure the request was fully processed before the invoking function terminated.
    *   **Filesystem Cache Errors:** Addressed `EROFS: read-only file system` errors in `execute-evaluation-background.ts` when the `embedding-service.ts` tried to write its `.cache_embeddings.json` to a non-writable path. Fixed by making the cache path environment-aware in `embedding-service.ts`, using `/tmp/.cache_embeddings.json` when running in the Netlify environment (`process.env.NETLIFY === 'true'`). This cache is ephemeral to the function invocation.

### Phase 3: Admin Interface & Manual Triggers

To allow for manual control and testing of the automated system, a simple admin interface was developed.

1.  **Admin Page (`src/app/admin/[slug]/page.tsx`):**
    *   Client-side component protected by a secret slug in the URL (`NEXT_PUBLIC_ADMIN_SECRET_SLUG`).
    *   Fetches available blueprints from the `civiceval/configs` GitHub repository (`blueprints` directory).
    *   Provides a "Run Now" button for each blueprint.
    *   Displays status messages for triggering evaluations.

2.  **API Route for Manual Trigger (`src/app/api/admin/trigger-eval/route.ts`):**
    *   Receives a `POST` request from the admin page containing the `ComparisonConfig` data (from a blueprint).
    *   Invokes the `execute-evaluation-background` Netlify function by making an `axios.post` request to its endpoint (`${process.env.URL}/.netlify/functions/execute-evaluation-background`).
    *   Responds to the admin page, indicating the trigger request has been accepted.
