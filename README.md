# CivicEval

This suite offers a dual-lens approach to understanding language model performance. It facilitates deep **qualitative assessment** by using LLM judges to evaluate responses against user-defined rubrics (defined by key points or ideal answers). Simultaneously, it provides robust **semantic similarity analysis**, allowing for comparison of how different models interpret prompts and the nuanced relationships between their response styles.

## Live on [civiceval.org](https://civiceval.org):

![Screenshot of CivicEval.org](./public/screenshot.png)

## Submitting an evaluation blueprint for [civiceval.org](https://civiceval.org)

CivicEval.org is the public-facing main instance of CivicEval open-source evaluation platform and web application. It is focused purely on evaluating models on a set of *civic-minded* prompts, including law, health, human rights, and matters of locale-specific or global civic matters.

To contribute a blueprint, please follow the guidance in the [configs repository](https://github.com/civiceval/configs). You'll be able to submit a 'pull request' to add your blueprint JSON file, which simply specifies a list of prompts, idealized responses, and key 'success' criteria.

If you want to evaluate things unrelated to civic matters, you can freely use CivicEval yourself in accordance with the [MIT license](LICENSE).

## [STATUS] Deployed Architecture Overview

Beyond local execution, CivicEval is designed to operate as an automated, deployed service:
*   **Centralized Blueprints**: Evaluation configurations (JSON files, now called "Blueprints") are managed in a dedicated public GitHub repository (`civiceval/configs`, in the `blueprints` subdirectory).
*   **Automated Evaluation Runs**: Netlify Scheduled Functions periodically fetch these blueprints. If a blueprint is new or its last evaluation is outdated (e.g., older than a week), a new evaluation is triggered.
*   **Scalable Execution**: Netlify Background Functions execute the core evaluation pipeline for each triggered blueprint.
*   **Cloud-Based Results**: Evaluation results (JSON outputs) are stored in cloud blob storage (e.g., AWS S3), making them persistently available to the web dashboard.
*   **Continuous Monitoring**: The web dashboard reads from this cloud storage, providing an always up-to-date view of model performance.

This setup allows for collaborative and transparent management of evaluation suites and continuous, automated benchmarking of language models.

## [GENERAL] Overview (Local Usage & Core Functionality)

Primarily, this project serves as CivicEval, an independent, public-interest watchdog that runs weekly, open-source tests on leading language models. We measure how accurately—and how consistently—each model understands universal human-rights standards, anti-discrimination laws and core democratic processes. The results are published here in real time so policymakers, journalists, engineers and everyday citizens can see at a glance which AI systems are ready for rights-respecting work—and which still miss the mark.

You can additionally use this open-source application for any qualitative evaluation. It is not limited to a specific domain.

This project provides tools to systematically evaluate and compare language models. Its core functionality revolves around two main types of analysis:

1.  **Qualitative Rubric-Based Evaluation**: Enables the assessment of model responses against user-defined criteria (such as `idealResponse` or `points`). This involves LLM-judged evaluations to determine how well a model's output covers essential information and aligns with desired outcomes.
2.  **Semantic Similarity Analysis**: Generates text embeddings for model outputs and calculates similarity scores to measure how closely model responses align with each other semantically, or with a benchmark `idealResponse`.

This approach is useful for:
* Understanding how different models interpret and respond to the same prompts.
* Assessing the impact of system prompts.
* Benchmarking model outputs against desired standards of quality and completeness.
* Identifying which models are most alike or different in their response styles for specific tasks.

Interactive visualizations aid in exploring these comparisons and uncovering patterns.

## Key Features

- **Qualitative Rubric Evaluation**: Assess model responses against user-defined key points or ideal answers using LLM-judged evaluations (e.g., via the `llm-coverage` method).
- **Semantic Similarity Analysis**: Calculate cosine similarity scores between model response embeddings to measure semantic closeness.
- **Blueprint-Driven Runs**: Define complex evaluation setups—including an `id` (or `configId`), `title` (or `configTitle`), models, prompts, ideal responses, explicit key points, and `tags`—in a JSON file (Blueprint) for reproducible evaluations. For the deployed system, these Blueprints are sourced from the `blueprints` directory in the [civiceval/configs](https://github.com/civiceval/configs) repository. Each execution is identified by a `--run-label` (for manual CLI runs) or an automatically generated label based on content hash for automated runs.
- **Automated Periodic Evaluations (Deployed System)**: New and updated blueprints from the `blueprints` directory in the `civiceval/configs` repository are automatically picked up and evaluated on a schedule (e.g., weekly).
- **Cloud-Based Results Storage (Deployed System)**: Evaluation results are stored in cloud blob storage (e.g., AWS S3), ensuring persistence and accessibility for the web dashboard.
- **Categorize and Filter**: Use `tags` within blueprints for better organization and to filter views on the homepage.
- **Benchmark Against Ideal Responses**: Define an `idealResponse` for any prompt to quantitatively and qualitatively measure how LLM outputs align with this benchmark.
- **Multi-Model/Multi-Prompt Capability**: Generate responses and embeddings from multiple models across multiple prompts.
- **Per-Prompt Comparison**: Analyze how model similarity and qualitative performance vary across different prompts.
- **System Prompt Impact Testing**: Evaluate how different system prompts affect the semantic content of model responses.
- **Model Performance Shift Detection**: Identify potential changes in model behavior over time by comparing runs with identical parameters that are executed at least a day apart and show significant score variance. This is particularly effective with automated, scheduled runs.
- **Aggregate Statistics**: View overall best/worst performing and most/least consistent evaluation blueprints, plus identify overall top and worst-performing models based on average hybrid scores across all runs.
- **Interactive Visualizations**: Explore comparison results through a web dashboard featuring:
    - Grouping of runs by `title` on the homepage.
    - Display of `tags` for each blueprint.
    - Filtering by `tags` on the homepage.
    - Detailed analysis views:
        - Per blueprint (`/analysis/[id]`): Lists all unique run labels (hashes) for that blueprint.
        - Per run label (`/analysis/[id]/[runLabel]`): Lists all timestamped execution instances for that specific run label.
        - Per specific run instance (`/analysis/[id]/[runLabel]/[timestamp]`): Shows detailed visualizations and data for a single execution.
    - Similarity Matrix/Heatmap, Force-Directed Graph, Dendrogram.
    - Side-by-Side Response Comparison (including against Ideal Response if available).

## Workflow

This toolkit supports both local/manual evaluations (ideal for developing and testing blueprints) and a fully automated, deployed evaluation system.

**1. Automated Deployed Workflow (Primary for Production System)**

This is the main operational mode for the CivicEval platform.
1.  **Contribute Blueprints**: Users propose new or updated evaluation blueprints by submitting pull requests to the `blueprints` directory in the [civiceval/configs](https://github.com/civiceval/configs) GitHub repository. Each blueprint is a JSON file.
2.  **Automated Fetch & Schedule**: A scheduled Netlify Function (`fetch-and-schedule-evals`) runs periodically (e.g., daily):
    *   It fetches all blueprint files from the `blueprints` directory in the `civiceval/configs` repository.
    *   For each blueprint, it calculates a content hash.
    *   It checks cloud blob storage (AWS S3) for existing results matching this content hash.
    *   If no result exists, or the existing result is older than a defined period (e.g., one week), it triggers a new evaluation.
3.  **Execute Evaluation**: The scheduled function invokes a Netlify Background Function (`execute-evaluation`), passing the blueprint data. This background function:
    *   Runs the core `executeComparisonPipeline`.
    *   Model responses are generated (caching is enabled).
    *   Specified evaluation methods (e.g., `embedding`, `llm-coverage`) are performed.
    *   The complete results object is saved to AWS S3, keyed by `id` and a `runLabel` that includes the content hash and a timestamp.
4.  **Visualize & Analyze**:
    *   The Next.js web dashboard (running on Netlify) reads data directly from AWS S3.
    *   The homepage lists available evaluation blueprints by their `title`.
    *   Users can navigate through a hierarchical structure:
        - From the homepage, clicking a blueprint title leads to `/analysis/[id]`, showing all unique run labels for that blueprint.
        - Clicking a specific run label leads to `/analysis/[id]/[runLabel]`, showing all timestamped instances of that run.
        - Clicking "View Full Analysis" for a specific instance (either from the homepage's "Latest Evaluation Runs" or the run label page) navigates to `/analysis/[id]/[runLabel]/[timestamp]` to explore the rich, interactive visualizations for that specific execution.

**2. Local JSON Config Workflow (`run_config` - For Development & Manual Runs)**

This method allows for detailed, reproducible evaluations driven by a single configuration file locally. It's highly recommended for developing new blueprints before contributing them to the `civiceval/configs` repository.

1.  **Create Blueprint File**: Define your entire test run in a JSON file (see structure below).
    *   Store these in a local directory like `/evaluation_blueprints`.
2.  **Run Config Command**: Execute `pnpm cli run_config --config path/to/your_blueprint.json --run-label <your_run_label>`.
    *   The `--run-label` (e.g., "run-2024-07-18-initial") uniquely identifies this specific execution of the blueprint.
    *   You can specify evaluation methods (e.g., `--eval-method="embedding,llm-coverage"`).
    *   This command handles response generation, embedding, and chosen evaluations.
    *   **Output Location**:
        *   If `STORAGE_PROVIDER` environment variable is set to `s3` (and S3 credentials are configured), output is saved to AWS S3.
        *   Otherwise (default local development), output is a `[runLabel]_[timestamp]_comparison.json` file, stored in `/.results/multi/[id]`.
3.  **Visualize & Analyze (Local)**:
    *   Start the web dashboard (`pnpm dev`).
    *   If results were saved locally, the dashboard will read from the local filesystem. If saved to S3 (and `STORAGE_PROVIDER=s3` is set for `pnpm dev`), it will read from S3.
    *   Navigate through the analysis pages starting from the homepage, or directly access specific views like `/analysis/[id]`, `/analysis/[id]/[runLabel]`, or `/analysis/[id]/[runLabel]/[timestamp]`.

## CLI Commands

This suite provides tools for generating embeddings and comparing the semantic similarity of model responses.

---

#### Configuration-Driven Run (`run_config`)

**(Strongly Recommended for local development and testing blueprints)**

Runs the entire response generation, embedding, and comparison process based on parameters defined in a JSON configuration file.

```bash
pnpm cli run_config --config path/to/your_blueprint.json --run-label <your_run_label>
```

Options:
- `--config <path>`: (Required) Path to the JSON configuration file.
- `--run-label <runLabelValue>`: Optional. A user-defined label for this specific execution run. A content hash will always be generated and appended.
- `--eval-method <methods>`: Optional. Comma-separated evaluation methods. Defaults to `embedding`. (`embedding`, `llm-coverage`, `all`).
- `--cache`: Optional. Enables caching for model responses. For automated runs in the deployed system, caching is enabled by default.

**JSON Configuration File Structure:**

```json
{
  "id": "unique-evaluation-identifier",
  "title": "Human-Readable Title for this Eval",
  "description": "Optional detailed description...",
  "tags": ["topic-A", "experimental-setup"],
  "models": [ "<provider>:<model-identifier>" ],
  "systemPrompt": null,
  "concurrency": 5,
  "temperature": 0.3,
  "temperatures": [0.0, 0.5, 0.8],
  "prompts": [
    {
      "id": "prompt-unique-id-1",
      "promptText": "Text of the first prompt...",
      "idealResponse": "The ideal response text...", // Optional
      "system": null, // Optional: Prompt-specific system prompt
      "points": [ /* ... */ ] // Optional: Key points
    }
  ]
}
```

**Key Identifiers:** (Same as before, but `id` and `title` are preferred)
- `id` / `configId`
- `title` / `configTitle`
- `runLabel`

**Note on `idealResponse` and `points`:** (Same as before)

**Output (from `run_config`):**
- If `STORAGE_PROVIDER=s3` is configured, stores a JSON object in cloud blob storage (e.g., AWS S3) under a key like `multi/[id_or_configId]/[final_runLabel]_[timestamp]_comparison.json`.
- Otherwise (default local), generates a `[final_runLabel]_[timestamp]_comparison.json` file in `/.results/multi/[id_or_configId]/`.
- This result contains full details, including `id` (or `configId`), `title` (or `configTitle`), the final `runLabel`, similarities, and evaluation scores.
- If multiple `temperatures` are specified, model identifiers in the output will be suffixed (e.g., `openai:gpt-4o-mini[temp:0.7]`).

---

## System Prompts

You can test how system prompts affect a model's response semantics by setting the `systemPrompt` (global) or prompt-specific `system` fields in a JSON config for `run_config`. Each run using a distinct system prompt will be treated as a separate entity (e.g., `modelId[sys:hash]`) in the comparison results, allowing you to analyze its impact.

## Web Dashboard

The dashboard (Next.js application) reads data via backend utilities that fetch from either local storage or cloud blob storage (AWS S3), depending on the environment.

1.  Start the app: `pnpm dev`
2.  Navigate to the analysis section by browsing from the homepage. You can access:
    *   Blueprint overview: `/analysis/[id]`
    *   Run label specific instances: `/analysis/[id]/[runLabel]`
    *   Detailed analysis for a specific run instance: `/analysis/[id]/[runLabel]/[timestamp]`

Dashboard features:
- Clear display of `title`, `runLabel` (including its content hash), `description`, and `tags`.
- Interactive filtering of blueprints by `tags` on the homepage.
- Overall and per-prompt views for analysis.
- Similarity Matrix/Heatmap.
- Force-Directed Graph of model similarity (Note: if multiple temperatures are run, the graph by default shows one variant per base model, typically the lowest temperature, to maintain clarity. The Ideal Response model is also excluded from this specific graph).
- Dendrogram for hierarchical clustering.
- Detailed tooltips with similarity scores.
- Response Comparison modal showing raw text and system prompts used (or Ideal Response text).
- **Dedicated Ideal Response display and statistics when available.**
- **Information card highlighting potential model performance shifts** if significant variance is detected between time-separated runs of identical parameters.
- **Aggregate statistics cards** showing overall best/worst performing evaluation blueprints, most/least consistent blueprints, and overall top/worst performing models based on average hybrid scores.

## Understanding Visualizations

The visualizations help interpret the semantic similarity data:

- **Similarity Matrix/Heatmap**: Shows pairwise similarity scores between models (including `IDEAL_BENCHMARK` if present). Darker/hotter colors indicate higher semantic similarity for that model pair on the selected prompt(s).
- **Force-Directed Graph**: Represents models as nodes. Models with higher average semantic similarity are pulled closer together, revealing clusters of similar-behaving models. Distances reflect overall semantic similarity across the analyzed prompts.
- **Dendrogram**: Shows the hierarchical clustering based on similarity. Models joined by branches lower down the diagram are more similar. The horizontal distance represents the similarity level at which clusters are merged.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- API keys for desired language models (OpenAI, Anthropic, etc.)
- **For S3 storage (deployed system or local S3 testing):** AWS account and S3 bucket.

### Installation

```bash
# Clone the main application repository
git clone https://github.com/civiceval/app.git # Or your repo name
cd llm-semantic-comparison # Or your repository name

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys and S3 configuration (see below)
```

### Environment Variables

Update your `.env` file (for local development) and configure these in your deployment environment (e.g., Netlify):

- **LLM API Keys:**
    - `OPENROUTER_API_KEY`: Your API key for OpenRouter. This is **essential** for all LLM interactions (response generation, LLM-based evaluations).
    - `OPENAI_API_KEY`: Required **specifically for generating text embeddings**.
- **Storage Configuration:**
    - `STORAGE_PROVIDER`: (Optional) Set to `s3` to use AWS S3 for results storage. Defaults to `local` for development (`NODE_ENV=development`), `s3` otherwise.
    - `APP_S3_BUCKET_NAME`: Your AWS S3 bucket name (if using S3).
    - `APP_S3_REGION`: The AWS region of your S3 bucket (if using S3).
    - `APP_AWS_ACCESS_KEY_ID`: Your AWS IAM access key ID (if using S3 and explicit credentials).
    - `APP_AWS_SECRET_ACCESS_KEY`: Your AWS IAM secret access key (if using S3 and explicit credentials).
- **Netlify Deployment (for automated functions):**
    - Netlify automatically provides `process.env.URL`.
    - `NETLIFY_API_TOKEN` and `SITE_ID` were previously considered for function invocation but are not strictly needed with the current direct POST method between functions. However, keep them in mind if more advanced Netlify API interactions are added later.

### Quick Start (Local Development & Config Testing)

This example demonstrates the `run_config` command for local use.

**1. Create a Rich Blueprint File (e.g., `evaluation_blueprints/comprehensive_test.json`)**

```json
{
  "id": "comprehensive-llm-test-v1",
  "title": "Comprehensive LLM Functionality Test (Version 1)",
  "description": "Tests multiple LLMs on a mix of philosophy, tech explanation, and creative writing prompts. Includes ideal responses and system prompt overrides.",
  "tags": ["general-knowledge", "creative-writing", "philosophy", "stoicism"],
  "models": [
    "openrouter:openai/gpt-4o-mini",
    "openrouter:anthropic/claude-3-haiku-20240307",
    "openrouter:google/gemini-1.5-flash-latest"
  ],
  "systemPrompt": "You are a helpful assistant. Provide clear and concise answers.",
  "concurrency": 5,
  "prompts": [
    {
      "id": "philosophy-wisdom",
      "promptText": "What are the core tenets of Stoic philosophy and how can they be applied in modern life?",
      "idealResponse": "Stoicism, founded in Athens by Zeno of Citium in the early 3rd century BC, emphasizes virtue, reason, and living in accordance with nature. Key tenets include: 1. Virtue is the only good (wisdom, justice, courage, temperance). 2. Focus on what you can control (your thoughts, judgments, actions) and accept what you cannot. 3. Live in accordance with nature/reason. 4. The practice of negative visualization (imagining potential misfortunes) to appreciate what you have and prepare for adversity. In modern life, these can be applied by practicing mindfulness, focusing on internal responses to external events, maintaining emotional resilience, and acting with integrity.",
      "points": [
        "Virtue is the only good (wisdom, justice, courage, temperance).",
        "Focus on what you can control and accept what you cannot.",
        "Live in accordance with nature/reason.",
        "Practice negative visualization."
      ]
    },
    {
      "id": "tech-cloud",
      "promptText": "Explain the main benefits of cloud computing for a small business.",
      "system": "Explain in simple terms, avoiding overly technical jargon."
    },
    {
      "id": "creative-story",
      "promptText": "Write a short story opening (100 words) about a detective discovering a mysterious antique map."
    }
  ]
}
```

**2. Run the Config-Based Command**

```bash
# To save results locally (default for NODE_ENV=development)
pnpm cli run_config --config evaluation_blueprints/comprehensive_test.json --run-label "initial-baseline-run" --eval-method="embedding,llm-coverage"

# To save results to S3 (ensure .env has S3 vars and STORAGE_PROVIDER=s3 if not in production)
# STORAGE_PROVIDER=s3 pnpm cli run_config --config evaluation_blueprints/comprehensive_test.json --run-label "s3-baseline-run" --eval-method="embedding,llm-coverage"
```

**3. Start the Web Dashboard**

```bash
pnpm dev
```

**4. Visualize Your Results**
Open your browser. The dashboard will display results from the configured storage provider.

## Model Configuration and Environment Variables

All language models are accessed exclusively through OpenRouter. This simplifies configuration and allows access to a wide variety of models from different underlying providers using a single API key.

**Model ID Format:**
When specifying models in your configuration files, you **must** use the OpenRouter format:
`"openrouter:<provider_slug>/<model_name>"`

For example:
- `"openrouter:openai/gpt-4o-mini"`
- `"openrouter:anthropic/claude-3-haiku-20240307"`
- `"openrouter:google/gemini-1.5-flash-latest"`
- `"openrouter:mistralai/mistral-large-latest"`

Refer to the [OpenRouter documentation](https://openrouter.ai/docs#models) for a full list of available models and their provider slugs/model names.

**Required `.env` Variable:**
- `OPENROUTER_API_KEY`: Your API key for OpenRouter. This is essential for all LLM interactions **except for text embedding generation**, including response generation, key point extraction, and coverage assessment.
- `OPENAI_API_KEY`: Required **specifically for generating text embeddings** (e.g., `text-embedding-3-small`, `text-embedding-3-large`).

*(The previous table listing individual providers like Anthropic, Deepseek, etc., and their specific API keys has been removed as direct integration with these providers for response generation is no longer supported. All general LLM access is unified through OpenRouter. OpenAI is still directly used for embeddings.)*

**Important Considerations for API Keys & Internal Models:**

*   **Text Embeddings (OpenAI Required)**:
    *   The toolkit generates semantic embeddings using OpenAI models (e.g., `text-embedding-3-small`, `text-embedding-3-large`) via a direct OpenAI API client.
    *   An `OPENAI_API_KEY` is **essential** for this core functionality. The `OPENROUTER_API_KEY` is not used for this specific task.

*   **`llm-coverage` Evaluation (Internal "Judge" Models via OpenRouter)**:
    *   The `llm-coverage` evaluation method involves two steps performed by LLMs:
        1.  **Key Point Extraction**: Extracts key points from your `idealResponse`.
        2.  **Coverage Assessment**: Checks if a model's actual output covers these extracted key points.
    *   Both of these steps internally use a list of models specified in the OpenRouter format (e.g., `openrouter:openai/gpt-4o-mini`, `openrouter:anthropic/claude-3-haiku-20240307`).
    *   Therefore, to use the `llm-coverage` feature, your `OPENROUTER_API_KEY` must have access to the judge models defined internally for these tasks. You will also need to provide either an `idealResponse` (for key point extraction) or a list of `points` in your prompt configurations.

*   **Model Identifiers for Response Generation**:
    *   When you specify models in your JSON configuration for generating the primary responses (e.g., `"openrouter:openai/gpt-4o-mini"`), these are passed directly to OpenRouter.
    *   Refer to the [OpenRouter documentation](https://openrouter.ai/docs#models) for model availability.

## Project Structure

- `/netlify/functions` - Contains Netlify Functions for automated tasks (e.g., `fetch-and-schedule-evals.ts`, `execute-evaluation.ts`).
- `/src/app` - Next.js web application
  - `/(dashboard)` - Dashboard components
    - `/analysis/[configId]` - Page listing unique run labels for a config.
    - `/analysis/[configId]/[runLabel]` - Page listing timestamped instances for a run label.
    - `/analysis/[configId]/[runLabel]/[timestamp]` - Detailed comparison visualization page for a specific run instance.
- `/src/cli` - Command-line tools and services
  - `/commands` - CLI command implementations
  - `/services` - Backend services (embedding, comparison logic)
  - `/utils` - Shared utilities for CLI
- `/src/lib` - Shared library code used by both CLI, Next.js app, and Netlify functions (e.g., `storageService.ts`, `hash-utils.ts`).
- `/src/data` - (May contain built-in prompt definitions if used)
- `/evaluation_blueprints` - (Suggested location for user-created JSON blueprint files for local testing)
- `/.results` - Test results and visualizations (used when `STORAGE_PROVIDER=local`). This path structure might use `id` or `configId` based on what's present in the blueprint.
  - `/multi` - Output files from `run_config` (if local)
