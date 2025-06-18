# CivicEval

CivicEval is an independent, open-source evaluation suite designed to act as a **public-interest watchdog for artificial intelligence**. Its primary purpose is not to measure a model's raw intelligence or general capabilities, but to perform a deep, qualitative audit of its **fitness for civic life**. It moves beyond asking "Is this model smart?" to ask, "Is this model a responsible, safe and harm-reducing actor in our society?"

It achieves this by creating and running a suite of transparent and continuous evaluations that probe AI model behavior on topics vital to a healthy functioning society.


## Live on [civiceval.org](https://civiceval.org):

![Screenshot of CivicEval.org](./public/screenshot.png)

---

### Core Focus: A Qualitative, Context-Aware Auditor

CivicEval is best understood as a system for targeted audits in specific, high-stakes domains. Its focus can be broken down into several key areas:

1.  **Testing Nuanced, High-Stakes Scenarios:** It evaluates models in areas where failure could cause direct public harm. This includes understanding fundamental human rights, resisting dangerous misinformation, avoiding biased cultural and geographical assumptions, and responding safely to users in a mental health crisis.

2.  **Assessing Critical Thinking and Skepticism:** Evaluations can be designed to test a model's ability to identify and resist manipulation. Can it recognize a fabricated URL, a leading question, or an absurd premise? This assesses a model's resilience in a polluted information ecosystem.

3.  **Applying a Rich, Rubric-Based Methodology:** A key differentiator for CivicEval is its `points` system, which allows for granular, rubric-based judgments instead of a simple pass/fail score. This rubric can include:
    *   **Semantic "Fuzzy" Checks:** Evaluates if a response captures the conceptual meaning of an idea.
    *   **Deterministic "Exact" Checks:** Verifies the presence of specific keywords or pattern matches (e.g., with regex).
    *   **Weighted Importance:** Allows critical criteria to be weighted more heavily in the final score.

4.  **Providing Continuous and Transparent Monitoring:** As an automated system running on a public repository of blueprints, CivicEval functions as a living benchmark. It can detect when a model's performance on these critical issues *drifts* over time with new updates—a vital function for public accountability that static, one-off benchmarks cannot provide.

---

### How CivicEval Complements Other Evaluation Types

The AI landscape is rich with benchmarks, and it is important to understand how CivicEval's role is distinct from and complementary to other established methods.

*   **It is NOT a general capability benchmark (e.g., MMLU, Hellaswag, ARC).** These benchmarks are the "SATs for LLMs" and are essential for measuring raw cognitive ability, reasoning, and knowledge across academic domains. CivicEval does not focus on this, but rather on applied social and civic behavior.

*   **It is NOT a broad-stroke safety benchmark (e.g., ToxiGen, BBQ).** These benchmarks are fundamental for identifying and mitigating generic harms like toxicity, hate speech, and common stereotypes at scale. CivicEval complements this by performing deeper dives into more specific, value-laden topics that require nuanced understanding beyond a general safety filter.

## Blueprints

Our [initial set of blueprints](https://github.com/civiceval/configs/tree/main/blueprints) test models on a wide spectrum of topics critical for public trust and safety. Key themes include:

*   **Information Integrity & Adversarial Robustness:** We test a model's resilience to misinformation. This includes its ability to identify and debunk fabricated claims ([`udhr-misattribution-absurd-framing`](https://github.com/civiceval/configs/blob/main/blueprints/udhr-misattribution-absurd-framing.json)), refuse to validate fake news URLs ([`url-classification-fallacies`](https://github.com/civiceval/configs/blob/main/blueprints/url-classification-fallacies.json)), avoid generating falsehoods ([`hallucination-probe`](https://github.com/civiceval/configs/blob/main/blueprints/hallucination-probe.json)), and resist being led by loaded questions ([`mrna-leading-question-classification`](https://github.com/civiceval/configs/blob/main/blueprints/mrna-leading-question-classification.json)).
*   **International Law & Human Rights:** We measure a model's understanding of foundational international legal and ethical frameworks. This includes core treaties like the Universal Declaration of Human Rights (`udhr-evaluation-v1`), the Geneva Conventions (`geneva-conventions-full-evaluation-v1.1`), and regional charters like the Banjul Charter (`banjul-charter-v1`).
*   **National & Regional Governance:** We evaluate knowledge of specific, jurisdiction-dependent legal and civic frameworks. This includes national laws like the UK Equality Act (`uk-equality-act-v1`) and the Indian Constitution (`indian-constitution-evaluation-v1`), as well as landmark civic events like the US Civil Rights Movement (`us-civil-rights-movement-1954-1968-eval-v1`).
*   **Digital Rights & Tech Policy:** We examine a model's understanding of the rules governing technology and its impact on society. This includes crucial new legislation like the EU AI Act (`eu-ai-act-202401689`) and specific issues like the algorithmic management of platform workers (`platform-workers-sea-algo-manage-v1`).
*   **Cultural & Geographic Nuance:** We probe for default biases by testing whether a model recognizes the global context of its users. The `locale-assumption-probe-v1` example blueprint checks for US-centric assumptions.
*   **Evidence-Based Crisis Response:** We assess a model's ability to respond safely and effectively to users in acute crisis, based on established clinical and expert guidelines. The `mental-health-crisis-prompt-examples` blueprint, for example, evaluates whether the model provides responsible, non-judgmental support and referral information, rather than platitudes or potentially harmful advice.
*   **Responsible AI Behavior:** We assess whether the model interacts with users in a manner consistent with established principles for safe AI deployment. For instance, the `llm-self-anthropomorphism-evasion-v1` blueprint checks if the model avoids making false claims of sentience or personal feelings.

## Methods of measurement

CivicEval allows candidate model responses to be measured in the following ways:

*   **Against a Rubric**: For a given prompt, does a model's response cover the key points I care about? Does it mention or fail to mention specific things?
*   **Against a Standard**: How semantically and linguistically similar is a model's response to an ideal, "gold-standard" answer?
*   **Model vs. Model**: How alike or different are the responses from two or more models to the same prompt?
*   **Consistency Check**: How does a single model's behavior change when you adjust parameters like temperature or the system prompt?
*   **Performance Over Time**: Has a model's performance on my specific tasks drifted after a new version was released?

It achieves this through a combination of automated, LLM-judged (rubric-based) qualitative analysis, quantitative semantic similarity scoring, and more programmatic means like regular-expression matching.

## Submitting an evaluation blueprint for [civiceval.org](https://civiceval.org)

To contribute a blueprint to CivicEval.org specifically, please follow the guidance in the [configs repository](https://github.com/civiceval/configs). You'll be able to submit a 'pull request' to add your blueprint file (in our user-friendly YAML format, or legacy JSON). The blueprint simply specifies a list of prompts, idealized responses, and key 'success' criteria.

If you want to evaluate things unrelated to civic matters, you can freely use this repository and run CivicEval yourself in accordance with the [MIT license](LICENSE), and you can use the [Configs Repository](https://github.com/civiceval/configs) as inspiration for your own suite of blueprints.

## Deployed Architecture Overview

Beyond local execution, CivicEval is designed to operate as an automated, deployed service:

*   **Centralized Blueprints**: Evaluation configurations ("Blueprints") are managed in a dedicated public GitHub repository (`civiceval/configs`, in the `blueprints` subdirectory). These can be `.yml`, `.yaml`, or `.json` files.
*   **Automated Evaluation Runs**: Netlify Scheduled Functions periodically fetch these blueprints. If a blueprint is new or its last evaluation is outdated (e.g., older than a week), a new evaluation is triggered.
*   **Scalable Execution**: Netlify Background Functions execute the core evaluation pipeline for each triggered blueprint.
*   **Cloud-Based Results**: Evaluation results (JSON outputs) are stored in cloud blob storage (AWS S3), making them persistently available to the web dashboard.
*   **Continuous Monitoring**: The web dashboard reads from this cloud storage, providing an always up-to-date view of model performance.

This setup allows for collaborative and transparent management of evaluation suites and continuous, automated benchmarking of language models.

## The Archetypal Workflow

This toolkit supports both locally run manual evaluations (ideal for developing and testing blueprints) and a fully automated, deployed version where nothing needs to be explicitly run.

**1. Automated Deployed Workflow (Primary for Production System)**

This is the main operational mode for the CivicEval platform.
1.  **Contribute Blueprints**: Users propose new or updated evaluation blueprints by submitting pull requests to the `blueprints` directory in the [civiceval/configs](https://github.com/civiceval/configs) GitHub repository. Each blueprint can be a YAML (`.yml`, `.yaml`) or JSON (`.json`) file.
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

**2. Local Blueprint Workflow (`run_config` - For Development & Manual Runs)**

This method allows for detailed, reproducible evaluations driven by a single configuration file locally. It's highly recommended for developing new blueprints before contributing them to the `civiceval/configs` repository.

1.  **Create Blueprint File**: Define your entire test run in a YAML or JSON file (see structure below).
    *   Store these in a local directory like `/evaluation_blueprints`.
2.  **Run Config Command**: Execute `pnpm cli run_config --config path/to/your_blueprint.yml --run-label <your_run_label>`.
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

Runs the entire response generation, embedding, and comparison process based on parameters defined in a blueprint file.

```bash
pnpm cli run_config --config path/to/your_blueprint.yml --run-label <your_run_label>
```

Options:
- `--config <path>`: (Required) Path to the blueprint file (`.yml`, `.yaml`, or `.json`).
- `--run-label <runLabelValue>`: Optional. A user-defined label for this specific execution run. A content hash will always be generated and appended.
- `--eval-method <methods>`: Optional. Comma-separated evaluation methods. Defaults to `embedding`. (`embedding`, `llm-coverage`, `all`).
- `--cache`: Optional. Enables caching for model responses. For automated runs in the deployed system, caching is enabled by default.

**Blueprint File Structure (YAML recommended):**

Our new YAML format uses a "multi-document" structure, separating the main configuration from the list of prompts with a `---` divider. This allows for a clean, un-indented list of prompts, making it easy for non-technical users to contribute.

For simple blueprints that only contain a list of prompts (and no global configuration), you can omit the header and the `---` separator entirely, providing just the list of prompts. In this case, the blueprint's `id` and `title` will be derived from its filename.

The system also supports several aliases for convenience:
*   `prompt` for `promptText`
*   `ideal` for `idealResponse`
*   `should` (or `expect`/`expects`/`expectations`) for `points`
*   `weight` for `multiplier`
*   `arg` for `fnArgs`
*   `system` for `systemPrompt`

```yaml
# Main configuration for the blueprint
id: comprehensive-llm-test-v1
title: "Comprehensive LLM Functionality Test (Version 1)"
description: "Tests multiple LLMs on a mix of philosophy, tech explanation, and creative writing prompts. Includes ideal responses and system prompt overrides."
tags: [general-knowledge, creative-writing, philosophy, stoicism]
models:
  - openai:gpt-4o-mini
  - anthropic:claude-3-haiku-20240307
  - google:gemini-1.5-flash-latest
  - mistral:mistral-large-latest
  - openrouter:meta-llama/llama-3-70b-instruct
system: "You are a helpful assistant. Provide clear and concise answers."
concurrency: 5
temperatures: [0.0, 0.5, 0.8]
evaluationConfig:
  llm-coverage:
    judgeModels: [openrouter:google/gemini-pro-1.5, openai:gpt-4-turbo]
    judgeMode: consensus

---

# Prompts follow, one per YAML document.

- id: philosophy-wisdom
  prompt: "What are the core tenets of Stoic philosophy and how can they be applied in modern life?"
  ideal: "Stoicism, founded in Athens by Zeno of Citium in the early 3rd century BC, emphasizes virtue, reason, and living in accordance with nature. Key tenets include: 1. Virtue is the only good (wisdom, justice, courage, temperance). 2. Focus on what you can control (your thoughts, judgments, actions) and accept what you cannot. 3. Live in accordance with nature/reason. 4. The practice of negative visualization (imagining potential misfortunes) to appreciate what you have and prepare for adversity. In modern life, these can be applied by practicing mindfulness, focusing on internal responses to external events, maintaining emotional resilience, and acting with integrity."
  should:
    - "Virtue is the only good (wisdom, justice, courage, temperance)."
    - "Focus on what you can control and accept what you cannot."
    - "Live in accordance with nature/reason."
    - "Practice negative visualization."

- id: tech-cloud
  prompt: "Explain the main benefits of cloud computing for a small business."
  system: "Explain in simple terms, avoiding overly technical jargon."

- id: creative-story
  prompt: "Write a short story opening (100 words) about a detective discovering a mysterious antique map."

```

**Rubric / `should` block syntax:**

The `should` block (or `points` in legacy JSON) defines specific criteria for rubric-based evaluation. The `should_not` block follows the exact same syntax, but it inverts the result of the check (i.e., a boolean `true` becomes `false`, and a numeric score `n` becomes `1-n`). This is useful for penalizing undesirable content.

Each item in these lists can be:

1.  A **simple string**: A conceptual "fuzzy" check evaluated by an LLM judge.
    ```yaml
    should:
      - "The response should mention the concept of fiscal responsibility."
    ```
2.  A **"Point: Citation" pair**: The recommended way to associate a conceptual point with a source.
    ```yaml
    should:
      - "Covers the principle of 'prudent man' rule.": "Investment Advisers Act of 1940"
    ```
3.  An **idiomatic function call**: The recommended way to perform deterministic checks. The key must be prefixed with a `$` and be the function name, and the value is the argument.
    ```yaml
    should:
      - $contains: "fiduciary duty"  # Case-sensitive check
      - $icontains: "fiduciary duty" # Case-insensitive
      - $ends_with: "." # Checks if the response ends with a period.
      - $contains_any_of: ["fiduciary", "duty"] # Returns true if any keyword is found
      - $contains_all_of: ["fiduciary", "duty"] # Returns a graded score (e.g., 0.5 if 1 of 2 is found)
      - $match: "^The ruling states that" # Regex check
      - $imatch: "^the ruling" # Case-insensitive regex
      - $match_all_of: ["^The ruling", "states that$"] # Graded score for multiple regex matches
      - $imatch_all_of: ["^the ruling", "states that$"] # Case-insensitive version of match_all_of
      - $contains_at_least_n_of: [2, ["apples", "oranges", "pears"]] # Graded score based on meeting a minimum count. Singular alias: contain_at_least_n_of
      - $word_count_between: [50, 100]
      - $js: "r.length > 100 && r.includes('foo')" # Advanced: Executes a JS expression. 'r' is the response text.

    should_not:
      - $contains_any_of: ["I feel", "I believe", "As an AI"]
      - $contains: "guaranteed returns"
    ```
4.  A **full object with named keys**: For maximum control over weighting and documentation. This is the legacy format but is still fully supported. You can use `point` to define the conceptual check.
    ```yaml
    should:
      - point: "Covers the principle of 'prudent man' rule."
        weight: 3.0 # This point is 3x as important as others
        citation: "Investment Advisers Act of 1940, Section 206"
      - fn: contains
        arg: "fiduciary duty"
        weight: 1.5
    ```

For more details on how these expectations are processed, see the [POINTS_DOCUMENTATION.md](docs/POINTS_DOCUMENTATION.md).

**Key Identifiers:**
- `id` / `configId`
- `title` / `configTitle`
- `runLabel`

**Output (from `run_config`):**
- If `STORAGE_PROVIDER=s3` is configured, stores a JSON object in cloud blob storage (e.g., AWS S3) under a key like `multi/[id_or_configId]/[final_runLabel]_[timestamp]_comparison.json`.
- Otherwise (default local), generates a `[final_runLabel]_[timestamp]_comparison.json` file in `/.results/multi/[id_or_configId]/`.
- This result contains full details, including `id` (or `configId`), `title` (or `configTitle`), the final `runLabel`,
  `promptContexts` (containing either the original `promptText` string or the `ConversationMessage[]` array for each prompt),
  `allFinalAssistantResponses` (mapping promptId -> modelId -> final assistant text),
  `fullConversationHistories` (mapping promptId -> modelId -> `ConversationMessage[]` including the full exchange),
  similarities, and evaluation scores.
- If multiple `temperatures` are specified, model identifiers in the output will be suffixed (e.g., `openai:gpt-4o-mini[temp:0.7]`).

---

#### Backfill Prompt Contexts (`backfill-prompt-contexts`)

This utility command scans existing evaluation result files and updates them to the new multi-turn conversation format.
It converts legacy `promptTexts` fields to the new `promptContexts` field (as an array of `ConversationMessage`).
It also converts legacy `allResponses` fields to `allFinalAssistantResponses` and generates `fullConversationHistories`.

```bash
pnpm cli backfill-prompt-contexts
```

Options:
- `--dry-run`: Log what would be changed without actually saving any files. Highly recommended to run this first.
- `--verbose` or `-v`: Enable more detailed logging output during the backfill process.

---

## System Prompts

ConversationMessage Type:
```typescript
interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
```

When defining prompts:
- Prefer the `messages` array (`ConversationMessage[]`) for all new prompts. This allows for multi-turn conversations.
- If only `promptText` (a string) is provided, it will be automatically converted to `messages: [{ role: 'user', content: promptText }]`.
- A prompt cannot have both `promptText` and `messages` defined.
- The `messages` array must not be empty, the first message cannot be from the 'assistant', and the last message must be from the 'user' (so the LLM generates the next turn).
- For `llm-coverage` and similarity to `idealResponse`, the `idealResponse` field in the prompt configuration should represent the ideal *final* assistant response in the conversation flow.

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

**1. Create a Rich Blueprint File (e.g., `evaluation_blueprints/comprehensive_test.yml`)**

```yaml
# Main configuration for the blueprint
id: comprehensive-llm-test-v1
title: "Comprehensive LLM Functionality Test (Version 1)"
description: "Tests multiple LLMs on a mix of philosophy, tech explanation, and creative writing prompts. Includes ideal responses and system prompt overrides."
tags: [general-knowledge, creative-writing, philosophy, stoicism]
models:
  - openai:gpt-4o-mini
  - anthropic:claude-3-haiku-20240307
  - google:gemini-1.5-flash-latest
  - mistral:mistral-large-latest
  - openrouter:meta-llama/llama-3-70b-instruct
system: "You are a helpful assistant. Provide clear and concise answers."
concurrency: 5
temperatures: [0.0, 0.5, 0.8]
evaluationConfig:
  llm-coverage:
    judgeModels: [openrouter:google/gemini-pro-1.5, openai:gpt-4-turbo]
    judgeMode: consensus

---

# Prompts follow, one per YAML document.

- id: philosophy-wisdom
  prompt: "What are the core tenets of Stoic philosophy and how can they be applied in modern life?"
  ideal: "Stoicism, founded in Athens by Zeno of Citium in the early 3rd century BC, emphasizes virtue, reason, and living in accordance with nature. Key tenets include: 1. Virtue is the only good (wisdom, justice, courage, temperance). 2. Focus on what you can control (your thoughts, judgments, actions) and accept what you cannot. 3. Live in accordance with nature/reason. 4. The practice of negative visualization (imagining potential misfortunes) to appreciate what you have and prepare for adversity. In modern life, these can be applied by practicing mindfulness, focusing on internal responses to external events, maintaining emotional resilience, and acting with integrity."
  should:
    - "Virtue is the only good (wisdom, justice, courage, temperance)."
    - "Focus on what you can control and accept what you cannot."
    - "Live in accordance with nature/reason."
    - "Practice negative visualization."

- id: tech-cloud
  prompt: "Explain the main benefits of cloud computing for a small business."
  system: "Explain in simple terms, avoiding overly technical jargon."

- id: creative-story
  prompt: "Write a short story opening (100 words) about a detective discovering a mysterious antique map."

```

**2. Run the Config-Based Command**

```bash
# To save results locally (default for NODE_ENV=development)
pnpm cli run_config --config evaluation_blueprints/comprehensive_test.yml --run-label "initial-baseline-run" --eval-method="embedding,llm-coverage"

# To save results to S3 (ensure .env has S3 vars and STORAGE_PROVIDER=s3 if not in production)
# STORAGE_PROVIDER=s3 pnpm cli run_config --config evaluation_blueprints/comprehensive_test.yml --run-label "s3-baseline-run" --eval-method="embedding,llm-coverage"
```

**3. Start the Web Dashboard**

```bash
pnpm dev
```

**4. Visualize Your Results**
Open your browser. The dashboard will display results from the configured storage provider.

## Model Configuration and Environment Variables

The application can access models from multiple providers. This is controlled by a prefix in the model ID string specified in your configuration files.

**Model ID Format:**
When specifying models in your JSON configuration, you **must** use the format:
`"<provider>:<model_identifier>"`

Here are the supported providers and examples of their model identifiers:

-   **OpenAI**: Uses the `openai:` prefix. The identifier is the model name.
    -   `"openai:gpt-4o-mini"`
    -   `"openai:gpt-4-turbo"`
-   **Anthropic**: Uses the `anthropic:` prefix. The identifier is the model name.
    -   `"anthropic:claude-3-haiku-20240307"`
    -   `"anthropic:claude-3-opus-20240229"`
-   **Google**: Uses the `google:` prefix. The identifier is the model name.
    -   `"google:gemini-1.5-flash-latest"`