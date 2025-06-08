feat: Add admin revalidation, refactor LLM dispatching, and enhance UI

This commit introduces several significant features, refactors, and UI enhancements across the application and CLI.

### Features & Major Changes

-   **Admin Cache Revalidation**: An admin panel button now allows manually triggering a homepage data refresh (`revalidatePath('/')`), making it easy to clear the Next.js ISR cache after running evaluations.
-   **Centralized LLM Dispatching**: Internal services (`llm-service`, `llm-evaluation-service`, `llm-coverage-evaluator`) have been refactored to use the central `client-dispatcher`. This decouples them from being hardcoded to the OpenRouter client and allows internal "judge" LLMs to be sourced from any supported provider (e.g., `openai:`, `google:`).
-   **Removal of File-Based Cache**: The temporary file-based caching (`/tmp/civiceval_homepage_cache.json`) has been removed from `homepageDataUtils`. This was ineffective on serverless platforms; the application now relies on Next.js's built-in Data Cache and the new manual revalidation trigger.

### UI/UX Enhancements

-   **Aggregate Stats**: Stat cards on the homepage now include tooltips explaining each metric. "Least Consistent Eval" has been renamed to "Most Differentiating Eval" with a new icon to better reflect its purpose.
-   **Semantic Similarity**: The "Semantic Similarity Extremes" cards are now wrapped in a container with a descriptive title explaining what the metric measures.
-   **Model Drift**: The model drift indicator now includes a "View Runs & Investigate" link, taking users directly to the relevant analysis page to compare runs.
-   **Evaluation Modal**: Fixed a bug where the `llm-coverage` evaluation modal would fail to open if result data was in a slightly different format. The data lookup is now more robust.

### CLI & Backend Improvements

-   **Data Integrity**:
    -   When a configuration is deleted, the homepage summary stats are now fully recalculated to ensure accuracy.
    -   The `comparison-pipeline-service` now returns data and a filename together, making the `run-config` command's data handling more reliable.
    -   The calculation for "most/least consistent" evaluations is now more robust, requiring a minimum number of runs before a config is considered.
-   **Storage Service**: Added a `deleteResultByFileName` utility to programmatically delete individual result files from storage.
-   **OpenRouter Client**: Converted the `openrouter-client` from an exported object to a class, aligning it with the lazy-instantiation pattern used by all other providers. 