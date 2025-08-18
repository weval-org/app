# Weval Evaluation Methodology

## 1. Introduction

This document provides a detailed technical overview of the data processing pipeline, statistical methods, and scoring mechanisms used in the Weval platform. Its purpose is to ensure full transparency, enabling users and researchers to understand how our metrics are derived, and to be aware of the underlying assumptions and limitations of the approach. All evaluation blueprints contributed to the public repository at [github.com/weval-org/configs](https://github.com/weval-org/configs) are dedicated to the public domain via Creative Commons Zero (CC0).

## 2. Architecture and Data Flow

The Weval platform is a multi-stage pipeline that transforms a high-level evaluation "blueprint" into a rich set of quantitative and qualitative results. It is designed to be highly modular, supporting different evaluation methods and storage backends.

For a detailed visual representation of the entire process, including the execution loops and data transformations, please see our [**Architecture and Data Flow diagram**](ARCHITECTURE.md).

## 3. The Evaluation Pipeline

The platform operates on a multi-stage pipeline that proceeds from a user-defined "blueprint" to a rich, quantitative analysis.

1.  **Blueprint Definition**: An evaluation begins with a YAML or JSON blueprint file that specifies the models to test, a series of prompts (test cases), evaluation methods (`embedding`, `llm-coverage`), and parameters like temperature. For a detailed guide on the blueprint syntax, see the [Blueprint Format Documentation](BLUEPRINT_FORMAT.md).
2.  **Response Generation**: The system executes the blueprint, collecting responses from each specified model variation for every prompt.
3.  **Evaluation Execution**: The collected responses are processed by the chosen evaluation methods.
4.  **Results Aggregation & Storage**: The outputs are combined into a single JSON result file containing raw responses, similarity matrices, coverage scores, and metadata.
5.  **Statistical Summarization**: After a run, summary files are updated with pre-calculated statistics (e.g., average scores, standard deviations, drift detection) to power the web dashboard.

## 4. Core Evaluation Metrics

The platform's analysis is primarily built upon two quantitative methods.

### 4.1. Semantic Similarity (`embedding` method)

This method quantifies the semantic closeness between model responses and a potential "ideal" answer.

*   **Process**: Every model's textual response is converted into a high-dimensional vector using a text embedding model (e.g., OpenAI's `text-embedding-3-small`).
*   **Mathematics**: The similarity between any two response vectors, $\mathbf{A}$ and $\mathbf{B}$, is calculated using **Cosine Similarity**:
    ```math
    \text{Similarity}(\mathbf{A}, \mathbf{B}) = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|}
    ```
    This yields a score between 0 and 1, where 1 indicates identical semantic meaning. This process produces a pairwise similarity matrix for each prompt.

### 4.2. Rubric-Based Coverage (`llm-coverage` method)

This method uses a powerful "judge" LLM to score a model's response against a structured, qualitative rubric defined in the blueprint. This is Weval's primary method for measuring nuanced performance against specific criteria.

#### Multi-Approach Judging & Consensus

To ensure robustness and mitigate against the biases of a single evaluation method, Weval employs a multi-judge consensus model by default. Instead of relying on a single perspective, it queries multiple judge configurations in parallel and averages their scores. Each judge configuration is a combination of an LLM (`model`) and an `approach`.

This is configured via the `judges` property in a blueprint's `evaluationConfig`:

```yaml
evaluationConfig:
  llm-coverage:
    judges:
      - { model: 'openai:gpt-4o', approach: 'holistic' }
      - { model: 'anthropic:claude-3-opus', approach: 'holistic' }
      - { model: 'openrouter:google/gemini-pro-1.5', approach: 'prompt-aware' }
```

If no `judges` are specified, the system uses a default set designed to provide a balanced evaluation:
1.  **`prompt-aware` approach (default):** A judge sees the response, the criterion, and the original user prompt. This allows the judge to consider the criterion in the context of the user's request.
2.  **`holistic` approach (default):** A judge sees the response, the criterion, the user prompt, and *all other criteria* in the rubric. This provides the richest context, allowing the judge to assess the point as part of a whole, which can be useful for identifying redundancy or assessing trade-offs.

The **`standard`** approach (criterion-only) remains supported and can be configured explicitly if desired, but it is not part of the current default set. A backup judge is also used to improve robustness when primary judges fail.

#### Judge Prompting and Classification

A specific, structured prompt is used to elicit a judgment for each individual point in the rubric, tailored to the judge's `approach`.

*   **System Prompt Persona**: The judge is instructed to act as an "expert evaluator and examiner" and to adhere strictly to the task and output format.
*   **Task Definition**: The judge is presented with the model's response (`<TEXT>`) and a single criterion (`<CRITERION>`) and is asked to classify the degree to which the criterion is present in the text according to a 5-point scale. Depending on the `approach`, the original `<PROMPT>` and the full `<CRITERIA_LIST>` may also be included for context.
*   **The 5-Point Scale**: The judge must choose one of the following five classes:
    *   `CLASS_UNMET`: The criterion is not met.
    *   `CLASS_PARTIALLY_MET`: The criterion is partially met.
    *   `CLASS_MODERATELY_MET`: The criterion is moderately met.
    *   `CLASS_MAJORLY_MET`: The criterion is mostly met.
    *   `CLASS_EXACTLY_MET`: The criterion is fully met.

#### Mathematical Scoring of Rubric Points

The judge's categorical classification is mapped to a quantitative score.

*   **Numerical Mapping**: The classification is mapped to a linear, equidistant numerical scale:
    *   `CLASS_UNMET` -> **0.0**
    *   `CLASS_PARTIALLY_MET` -> **0.25**
    *   `CLASS_MODERATELY_MET` -> **0.50**
    *   `CLASS_MAJORLY_MET` -> **0.75**
    *   `CLASS_EXACTLY_MET` -> **1.0**
*   **Score Inversion (`should_not`)**: For criteria that penalize undesirable content, the score is inverted. For an original score $S_{\text{orig}}$, the final score is $S_{\text{final}} = 1 - S_{\text{orig}}$.
*   **Weighted Aggregation**: A blueprint can assign a `multiplier` (weight) to each point. The final rubric score for a model on a prompt (`avgCoverageExtent`) is the weighted average of all point scores. For $N$ points with score $S_i$ and weight $w_i$:
    ```math
    \text{avgCoverageExtent} = \frac{\sum_{i=1}^{N} S_i \cdot w_i}{\sum_{i=1}^{N} w_i}
    ```

*   **Handling of Alternative Paths (OR Logic)**: When a blueprint uses nested lists to define alternative rubric paths, the scoring logic is adjusted to handle the "OR" condition:
    1.  **Path Grouping**: All points are grouped by their path. Points not in a nested list are considered "required."
    2.  **Path Scoring**: The weighted average score for each individual path is calculated using the standard formula above.
    3.  **Best Path Selection**: The system identifies the single path with the highest average score. This becomes the score for the entire alternative path block.
    4.  **Final Aggregation**: The final `avgCoverageExtent` is the weighted average of all "required" points and the score of the single best alternative path. The entire block of alternative paths is treated as a single point with a default weight of 1.

#### Judge Reliability Mechanisms

We recognize that using LLMs as judges is a complex process susceptible to various cognitive biases, such as positional preference, order effects, and sensitivity to prompt phrasing. For a detailed analysis of these challenges, see the Collective Intelligence Project's research on the topic: *[LLM Judges Are Unreliable](https://www.cip.org/blog/llm-judges-are-unreliable)*. The reliability mechanisms below are designed as direct countermeasures to these known issues.

*   **Pointwise Scoring Over Pairwise Comparison**: The platform defaults to a pointwise scoring methodology where each response is evaluated against a rubric in isolation. This avoids the significant positional and labeling biases that are well-documented in pairwise (A/B) or ranked-choice comparisons.
*   **Consensus by Default**: To improve robustness, Weval queries all configured judge configurations concurrently and averages the numerical scores from all successful responses. This mitigates the impact of a single model's random error or a single approach's specific bias. The final `judgeModelId` reflects this, e.g., `consensus(standard(modelA), holistic(modelB))`.
*   **Agnostic Scoring Scale**: The classification scale uses neutral terms (`CLASS_UNMET`, `CLASS_MODERATELY_MET`, etc.) to describe the degree to which a criterion is *met*. This is a deliberate choice to avoid the "higher is better" bias common in models trained on review data (e.g., 5/5 stars). The scale is agnostic to whether meeting a criterion is good or bad, which allows for more objective scoring of both desirable (`should`) and undesirable (`should_not`) traits.
*   **Low-Temperature Judging**: By default, all calls to judge LLMs are made with `temperature: 0.0`. This minimizes randomness in the judge's output, making the scoring process more deterministic and repeatable. It ensures that score variations are due to differences in the content being judged, not sampling variability. We acknowledge however that there is a methodological trade-off here, as the judge's output is less "creative" and more deterministic, and won't capture the everyday temperatures these models are run via. However, there is the ability to configure multiple temperature permutations if you should wish to.
*   **Transparent Breakdowns**: The output for each point assessment includes an `individualJudgements` array, detailing the score and reflection from each participating judge. This allows for deep inspection of any disagreements or biases among the judges.

## 5. Aggregate Statistical Measures

The platform synthesizes raw scores into higher-level, interpretable metrics.

### 5.1. The Hybrid Score

The Hybrid Score is a composite metric designed to provide a single, balanced measure of a model's performance when a blueprint provides an `ideal` response to compare against.

*   **Purpose**: It combines adherence to specific, user-defined criteria (coverage) with overall response quality (similarity to an ideal answer).
*   **Formula**: To combine these two values, Weval uses a **weighted arithmetic mean**. This approach is chosen for its clarity and interpretability. It explicitly states the relative importance of each component. The formula is:
    ```math
    S_{\text{hybrid}} = (\beta \cdot S_{\text{sim}}) + ((1-\beta) \cdot S_{\text{cov}})
    ```
    Where:
    *   $S_{\text{sim}}$ is the semantic similarity score.
    *   $S_{\text{cov}}$ is the rubric coverage score.
    *   $\beta$ is the weighting factor for similarity.

    Weval currently uses a default weighting of **$\beta = 0.0$ (0% for similarity) and $1-\beta=1.0$ (100% for coverage)**. In other words, the Hybrid Score equals the coverage score by default. This reflects a deliberate choice to prioritize rubric adherence in the current version. The homepage UI may provide controls to experiment with alternative weightings for exploration, but core calculations default to coverage-only.

*   **(Legacy) Geometric Mean**: Previously, the platform used a geometric mean ($\sqrt{S_{\text{sim}} \cdot S_{\text{cov}}}$). While statistically sound for averaging normalized ratios, it was replaced because the weighted arithmetic mean makes the platform's priorities more explicit and easier for users to understand.

### 5.2. Model Performance Drift Detection

This is a statistical check to flag potential changes in a model's performance over time on an identical test.

*   **Conditions**: The analysis compares multiple runs of the same blueprint version (identical `runLabel`) that use `temperature: 0`. The series of runs must also span at least 23 hours from the oldest to the newest execution.
*   **Process**: For a given model that has participated in all runs in the series, the system finds the run where the model achieved its absolute lowest Hybrid Score and the run where it achieved its absolute highest Hybrid Score.
*   **Statistical Triggers**: A significant drift is flagged only if the difference between this true minimum and maximum score meets **both** of the following conditions:
    1.  The **absolute score change** is $\ge 0.05$.
    2.  The **relative score change** is $\ge 10\%$.
*   **Investigation**: The system highlights the model that meets these criteria and has the largest score range (`max score - min score`). The "Investigate Runs" link will direct you to a side-by-side comparison of the specific runs where the minimum and maximum scores were recorded, ensuring the visualization accurately reflects the detected drift.

### 5.3. Platform-Wide Statistics (Leaderboard)

The homepage displays several aggregate statistics, including a leaderboard of top-performing models. This leaderboard is calculated based on the following principles to ensure fairness and relevance:

*   **Metric**: Models are ranked by their **Overall Average Hybrid Score**.
*   **Blueprint Weighting**: To ensure that each evaluation blueprint contributes equally to the final rankings, the leaderboard calculation uses only the **single most recent run** of each unique blueprint. This prevents blueprints that are run more frequently from having an outsized influence on the results.
*   **Calculation**: For each model, the system takes its average Hybrid Score from the latest run of every blueprint it participated in. These scores are then averaged to produce the final `overallAverageScore` used for ranking.
*   **Participation Threshold**: To ensure statistical significance and prevent models from being ranked based on performance in only a few, specialized tests, a model must have participated in a minimum of **10 unique evaluation blueprints** to be included on the leaderboard.

### 5.4. Model Identity Normalization

For cleaner leaderboards and consolidated performance tracking, the platform applies model identity normalization during aggregation and display processes:

**Model Variant Consolidation:**
- Dated versions are normalized to base models (e.g., `grok-4-0709` → `grok-4`, `claude-3-5-haiku-20241022` → `claude-3-5-haiku`)
- Preview/beta versions are consolidated (e.g., `gemini-2.5-flash-preview-05-20` → `gemini-2.5-flash`, `grok-3-mini-beta` → `grok-3-mini`)
- Provider format variations are standardized (e.g., `openrouter:x-ai/grok-3` → `xai:grok-3`)

**Scope and Preservation:**
- **Raw data preservation**: Original model IDs are preserved unchanged in evaluation result files
- **Aggregation-only**: Normalization affects only summary statistics, leaderboards, and model grouping for display
- **Traceability**: Individual evaluation results can always be traced to their exact model variant

**Rationale:** This consolidation prevents model variants that represent the same underlying model capability from fragmenting leaderboard positions, providing users with cleaner, more meaningful performance comparisons while maintaining full data integrity for detailed analysis.

### 5.5. Capability Leaderboards (New)

The "Capability Leaderboards" represent a simplified, high-level aggregation system designed to present model performance across broad, intuitive categories rather than the granular dimension-by-dimension or topic-by-topic breakdowns.

#### 5.5.1. Motivation and Design Philosophy

Traditional leaderboards can overwhelm users with dozens of individual metrics across different dimensions and topics. The capability leaderboards address this by grouping related performance indicators into 5-7 broad "capability buckets" that represent areas most users care about:

* **Helpfulness & Reasoning**: Core problem-solving and task execution abilities
* **Safety & Responsibility**: Avoiding harm and acting ethically
* **Communication Quality**: Clarity, tone, and expressive effectiveness  
* **Trustworthiness & Accuracy**: Reliability and factual correctness
* **Civic & Legal Knowledge**: Understanding of legal, political, and social systems

#### 5.5.2. Data Sources and Methodology

Each capability bucket combines two distinct data sources using weighted averaging:

**Source 1: Dimension Scores (from Executive Summaries)**
* Derived from structured `grades` in evaluation `executiveSummary` fields
* Analyst LLM assigns 1-10 scores across dimensions like "clarity", "helpfulness", "safety"
* Scores are normalized to 0-1 scale: `(score - 1) / 9`
* Each dimension can contribute to multiple capability buckets with different weights

**Source 2: Topic Scores (from Hybrid Scores)**
* Derived from topic-specific hybrid scores across evaluation blueprints
* Uses the standard hybrid score formula: `0.35 × similarity + 0.65 × coverage`
* Topics are matched to capability buckets using normalized topic names (kebab-case → Title Case)
* Each topic can contribute to multiple capability buckets with different weights

#### 5.5.2a. Tag Collection and Auto-Tags

The topic layer draws its tag universe from two complementary sources:

1. **Manual Blueprint Tags** – the `tags:` array declared in a blueprint’s YAML header.
2. **Auto-Tags** – during executive-summary generation the analyst LLM inspects the run and injects additional topical labels (e.g., `hallucination`, `mental-health`, `instruction-following`) into the `executiveSummary.structured.autoTags` field.

These two lists are merged, run through `normalizeTag()` (case-folding, kebab-case, trimming) and de-duplicated.  The resulting set of normalized tags is what drives the *topic hybrid scores* used in capability aggregation, ensuring that even un-tagged blueprints are still discoverable by capability buckets.

#### 5.5.3. Aggregation Formula

For each model in each capability bucket, the final score is calculated as:

```math
S_{\text{capability}} = \frac{\sum_{i} (D_i \times w_{d,i}) + \sum_{j} (T_j \times w_{t,j})}{\sum_{i} w_{d,i} + \sum_{j} w_{t,j}}
```

Where:
* $D_i$ = normalized dimension score for dimension $i$
* $T_j$ = topic hybrid score for topic $j$  
* $w_{d,i}$ = weight assigned to dimension $i$ in this capability bucket
* $w_{t,j}$ = weight assigned to topic $j$ in this capability bucket

**Example Weighting Scheme:**
```yaml
Helpfulness & Reasoning:
  dimensions:
    - helpfulness: 1.0x weight
    - adherence: 1.0x weight  
    - depth: 0.75x weight
  topics:
    - "Instruction Following & Prompt Adherence": 1.0x weight
    - "Reasoning": 1.0x weight
    - "Coding": 0.75x weight
```

#### 5.5.4. Quality Assurance Mechanisms

**Minimum Participation Thresholds:**
To prevent artificially inflated scores from limited data, models must meet both criteria to appear in capability leaderboards:
* **≥10 total contributing runs** across all topics/dimensions for this capability
* **≥5 unique evaluation configs** (estimated from run distribution)

**Data Validation:**
* Topic names are normalized using `normalizeTopicKey()` to handle kebab-case → Title Case conversion
* Models with insufficient data are excluded with detailed logging: `"✗ model-name: score% → Excluded: needs ≥X runs (has Y)"`
* Only successful dimension/topic matches contribute to the weighted average

#### 5.5.5. Interpretation Guidelines and Limitations

**Strengths:**
* **Intuitive Categories**: Broad buckets are more accessible than dozens of individual metrics
* **Multi-Modal Scoring**: Combines both rubric-based assessment and semantic similarity
* **Quality Filters**: Minimum thresholds ensure statistical reliability
* **Transparency**: Full weighting schemes and calculation methods are documented

**Important Limitations:**
* **Information Loss**: Aggregation inevitably obscures nuanced performance differences
* **Arbitrary Weighting**: The specific weights (e.g., "depth: 0.75x") are design decisions, not empirically derived
* **Heterogeneous Data Mixing**: Combining 1-10 dimension scores with 0-1 hybrid scores assumes these scales are meaningfully comparable
* **Cross-Domain Averaging**: Models may excel in narrow domains but appear mediocre when averaged across broad categories
* **Limited Coverage**: Only includes models/topics with sufficient evaluation data

**Recommended Use:**
* Use as a **high-level screening tool**, not definitive ranking
* **Always drill down** to examine individual dimension and topic performance  
* **Consider domain-specific needs** - a model's capability ranking may not reflect its suitability for your specific use case
* **Interpret scores relative to peer models**, not as absolute measures of capability

#### 5.5.6. Technical Implementation Notes

The capability leaderboards are calculated in `calculateCapabilityLeaderboards()` within the summary calculation pipeline. Key implementation details:

*   **Topic Normalization**: Uses `normalizeTopicKey()` from `tagUtils` to convert kebab-case topic keys to match capability bucket definitions
*   **Weight Table Location**: Capability and weight definitions live in `src/lib/capabilities.ts` (`CAPABILITY_BUCKETS` constant). Editing this file updates both the backend aggregation and the front-end labels/icons in real time.
*   **Calculation Timing**: Computed during `backfill-summary` and `run-config` operations
*   **Storage**: Saved in `homepage-summary.json` as `capabilityLeaderboards` array
*   **Display Thresholds**: UI applies same ≥10 runs, ≥5 configs filter as calculation logic

This multi-stage derivation process—from raw LLM outputs → dimension grades → topic scores → weighted capability aggregates—represents multiple layers of interpretation and should be understood as a **commentary on model performance patterns** rather than ground truth about model capabilities.

### 5.6. Dimension Champions

The "Dimension Champions" section of the homepage highlights models that exhibit exceptional performance in specific qualitative areas.

*   **Data Source**: This metric is derived exclusively from the structured `grades` provided in the `executiveSummary` of evaluation runs. In these runs, a "judge" LLM assigns a 1-10 score to a model's response across various dimensions (e.g., Clarity, Adherence, Safety).
*   **Eligibility Criteria**: To qualify as a potential champion for a specific dimension, a model must have been graded for that dimension in at least **5 unique evaluation blueprints (configs)**. This ensures that a champion has demonstrated broad, cross-domain competence rather than narrow excellence on a single task.
*   **Champion Selection**: For each dimension, the system calculates the average score for all eligible models. The model with the highest average score is declared the "Dimension Champion" for that category.

### 5.7. Qualitative Analysis via Executive Summary

For certain blueprints, an additional layer of qualitative analysis is performed by an "analyst" LLM to generate an **Executive Summary**. This process adds a rich, human-readable interpretation on top of the quantitative scores.

*   **The Analyst Model**: Gemini-2.5-flash is enlisted to act as an expert analyst. Its task is not to participate in the evaluation, but to analyze its results.
*   **The Prompt [see here](https://github.com/weval-org/app/blob/main/src/cli/services/executive-summary-service.ts)**: The service constructs a single, comprehensive prompt containing:
    1.  The full data from the evaluation run, including every prompt and every model's response.
    2.  A detailed set of grading criteria and scoring guidance, instructing the analyst on how to score models on a 1-10 scale across dimensions like Clarity, Adherence, and Safety.
    3.  A strict command to output its analysis in a structured, XML-like format.
*   **Structured Output**: The analyst model returns a detailed summary that includes:
    *   **Qualitative Insights**: Key findings, strengths, weaknesses, and interesting patterns observed during the evaluation.
    *   **Quantitative Grades**: A grade for every participating model across every dimension.
*   **Parsing and Storage**: The system parses this structured text response into a JSON object, which is then stored as the `executiveSummary` field in the result file. This data is the source for the "Dimension Champions" metric.

#### 5.7.1. Model Anonymization to Reduce LLM Bias

To ensure objective analysis, we employ anonymization during executive summary generation. This addresses the well-documented phenomenon where LLMs exhibit bias based on recognizable model names or providers.

**The Bias Problem**: LLMs may have preconceptions about specific models (e.g., "GPT-4o is creative" or "Claude is empathetic") that influence their analysis. This can lead to biased assessments where brand recognition overshadows actual performance.

**The Anonymization Solution**: Before sending evaluation data to the analyst LLM, all model identifiers are systematically anonymized using **opaque, high-numbered IDs** and a structured output format:

*   **Provider vs. Maker Distinction**: The system distinguishes between API *providers* (like `openrouter`, `anthropic`) and model *makers* (the companies that created the models like OpenAI, Google, Anthropic). 
*   **Provider Elimination**: All provider references are stripped as they are implementation details irrelevant to performance analysis.
*   **Opaque ID Assignment**: Components receive non-sequential, high-numbered anonymous IDs to avoid semantic confusion (e.g., `MK_5000` for makers, `MD_6000` for models, `S_7000` for system prompts, `T_8000` for temperatures).

**Anonymization Format**: All references use opaque IDs that prevent the LLM from inferring real identities:
```
Original: openai:gpt-4o[sys:1][temp:0.7], anthropic:claude-3-5-sonnet[sys:0]
Anonymized: MK_5001/MD_6001 (sys:S_7000, temp:T_8000), MK_5000/MD_6000 (sys:S_7001)
```

**Structured Output**: The analyst LLM uses XML-like tags to reference models:
```xml
<ref maker="MK_5000" model="MD_6000" />          <!-- Base model reference -->
<ref maker="MK_5001" model="MD_6001" sys="S_7000" temp="T_8000" />  <!-- Variant reference -->
<grade maker="MK_5000" model="MD_6000">...</grade>  <!-- Model grading -->
```

**Deanonymization**: After analysis, structured tags are converted to human-readable text with clickable links for the UI. The LLM's expressiveness is preserved while ensuring reliable parsing.

**Why this is important**: This approach eliminates brand bias while preserving the ability to identify meaningful patterns within maker families. The structured output format ensures reliable parsing while maintaining the analyst LLM's natural expressiveness. The analyst's conclusions are based purely on observed performance rather than preconceptions.


## 6. Risks, Assumptions, and Affordances

Weval's methodology is designed to be robust, but like any quantitative system, it operates on a set of assumptions and has inherent limitations. Users should consider the following when interpreting the results.

### 6.1. Foundational Assumptions

The validity of Weval's metrics rests on these core assumptions:

*   **Assumption of Appropriate Weighting in Hybrid Score**: The Hybrid Score's weighted average (35% similarity, 65% coverage) assumes that this is a reasonable and balanced reflection of importance for most general use cases. While this explicit weighting is more transparent than an unweighted mean, the specific ratio may not be optimal for every evaluation's unique goals.
*   **Assumption of Linearity in Score Mapping**: The 5-point categorical scale from the LLM judge is mapped to a linear, equidistant numerical scale. This assumes the qualitative gap between "Absent" and "Slightly Present" is the same as between "Majorly Present" and "Fully Present," which may not be perceptually true.
*   **Assumption of Criterion Independence**: The rubric score (`avgCoverageExtent`) is a weighted average that treats each criterion as an independent variable. It does not account for potential correlations between criteria (e.g., "clarity" and "conciseness").
*   **Assumption of Effective Bias Reduction via Anonymization**: The model anonymization system assumes that removing real model names and providers significantly reduces analyst LLM bias, while preserving maker-level information provides meaningful comparative insights. This assumes that brand bias is primarily driven by explicit name recognition rather than subtle patterns in response style that might persist even when anonymized.

### 6.2. Known Risks and Limitations for Interpretation

*   **Risk of Masking Nuance**: The Hybrid Score, by design, collapses two distinct performance axes into one number. This can obscure critical insights. A model could score well by excelling on one axis while failing on the other. **It should be used as a high-level indicator, not a substitute for examining the individual score components.**
*   **Risk of Arbitrary Thresholds in Drift Detection**: The thresholds for flagging performance drift (0.05 absolute, 10% relative) are heuristics, not empirically derived from the statistical properties of the platform's data. They are designed to be reasonably conservative but may not be optimal, and the "drift" signal should be treated as a flag for further investigation, not a definitive conclusion.
*   **Risk of Misinterpreting Aggregate Rankings**: High-level platform statistics like "Top Ranked Models" average scores across vastly different and non-commensurate tasks (e.g., legal analysis vs. poetry). This rewards generalist models and can be statistically misleading. **These aggregate views should be interpreted with extreme caution and skepticism.**

### 6.3. Affordances and Recommended Use

*   **Drill Down**: Always supplement high-level metrics like the Hybrid Score by examining the underlying rubric assessments and semantic similarity scores. The richest insights are in the details.
*   **Context is Key**: A model's performance score is only meaningful within the context of the specific blueprint it was tested on. Avoid generalizing performance from one domain to another.
*   **Use for Investigation, Not Final Judgment**: Use the platform's outputs—especially automated signals like drift detection—as a starting point for deeper qualitative investigation, not as a final, decisive verdict on model quality or safety. 