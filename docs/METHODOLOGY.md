# Weval Evaluation Methodology

## 1. Introduction

This document provides a detailed technical overview of the data processing pipeline, statistical methods, and scoring mechanisms used in the Weval platform. Its purpose is to ensure full transparency, enabling users and researchers to understand how our metrics are derived, and to be aware of the underlying assumptions and limitations of the approach. All evaluation blueprints contributed to the public repository at [github.com/weval-org/configs](https://github.com/weval-org/configs) are dedicated to the public domain via Creative Commons Zero (CC0).

## 2. Architecture and Data Flow

The Weval platform is a multi-stage pipeline that transforms a high-level evaluation "blueprint" into a rich set of quantitative and qualitative results. It is designed to be highly modular, supporting different evaluation methods and storage backends.

For a detailed visual representation of the entire process, including the execution loops and data transformations, please see our [**Architecture and Data Flow diagram**](ARCHITECTURE.md).

## 3. The Evaluation Pipeline

The platform operates on a multi-stage pipeline that proceeds from a user-defined "blueprint" to a rich, quantitative analysis.

1.  **Blueprint Definition**: An evaluation begins with a YAML or JSON blueprint file that specifies the models to test, a series of prompts (test cases), evaluation methods (`embedding`, `llm-coverage`), and parameters like temperature.
2.  **Response Generation**: The system executes the blueprint, collecting responses from each specified model variation for every prompt.
3.  **Evaluation Execution**: The collected responses are processed by the chosen evaluation methods.
4.  **Results Aggregation & Storage**: The outputs are combined into a single JSON result file containing raw responses, similarity matrices, coverage scores, and metadata.
5.  **Statistical Summarization**: After a run, summary files are updated with pre-calculated statistics (e.g., average scores, standard deviations, drift detection) to power the web dashboard.

## 4. Core Evaluation Metrics

The platform's analysis is primarily built upon two quantitative methods.

### 4.1. Semantic Similarity (`embedding` method)

This method quantifies the semantic closeness between model responses and a potential "ideal" answer.

*   **Process**: Every model's textual response is converted into a high-dimensional vector using a text embedding model (e.g., OpenAI's `text-embedding-ada-002`).
*   **Mathematics**: The similarity between any two response vectors, $\mathbf{A}$ and $\mathbf{B}$, is calculated using **Cosine Similarity**:
    $$ \text{Similarity}(\mathbf{A}, \mathbf{B}) = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|} $$
    This yields a score between 0 and 1, where 1 indicates identical semantic meaning. This process produces a pairwise similarity matrix for each prompt.

### 4.2. Rubric-Based Coverage (`llm-coverage` method)

This method uses a powerful "judge" LLM to score a model's response against a structured, qualitative rubric defined in the blueprint. This is Weval's primary method for measuring nuanced performance against specific criteria.

#### Judge Prompting and Classification

A specific, structured prompt is used to elicit a judgment for each individual point in the rubric.

*   **System Prompt Persona**: The judge is instructed to act as an "expert evaluator and examiner" and to adhere strictly to the task and output format.
*   **Task Definition**: The judge is presented with the model's response (`<TEXT>`) and a single criterion (`<CRITERION>`) and is asked to classify the degree to which the criterion is present in the text according to a 5-point scale.
*   **The 5-Point Scale**: The judge must choose one of the following five classes:
    *   `CLASS_ABSENT`: The criterion is not found or addressed.
    *   `CLASS_SLIGHTLY_PRESENT`: The criterion is very slightly or tangentially touched upon.
    *   `CLASS_PARTIALLY_PRESENT`: Some core aspects are present, but significant parts are missing.
    *   `CLASS_MAJORLY_PRESENT`: The main substance is present, but minor details might be missing.
    *   `CLASS_FULLY_PRESENT`: The criterion is fully expressed in the text.

#### Mathematical Scoring of Rubric Points

The judge's categorical classification is mapped to a quantitative score.

*   **Numerical Mapping**: The classification is mapped to a linear, equidistant numerical scale:
    *   `CLASS_ABSENT` -> **0.0**
    *   `CLASS_SLIGHTLY_PRESENT` -> **0.25**
    *   `CLASS_PARTIALLY_PRESENT` -> **0.50**
    *   `CLASS_MAJORLY_PRESENT` -> **0.75**
    *   `CLASS_FULLY_PRESENT` -> **1.0**
*   **Score Inversion (`should_not`)**: For criteria that penalize undesirable content, the score is inverted. For an original score $S_{\text{orig}}$, the final score is $S_{\text{final}} = 1 - S_{\text{orig}}$.
*   **Weighted Aggregation**: A blueprint can assign a `multiplier` (weight) to each point. The final rubric score for a model on a prompt (`avgCoverageExtent`) is the weighted average of all point scores. For $N$ points with score $S_i$ and weight $w_i$:
    $$ \text{avgCoverageExtent} = \frac{\sum_{i=1}^{N} S_i \cdot w_i}{\sum_{i=1}^{N} w_i} $$

#### Judge Reliability Mechanisms

*   **Consensus Mode (Default)**: To improve robustness, Weval queries multiple judge models concurrently and averages the scores from all successful responses. This mitigates the impact of a single model's random error or specific bias.
*   **Failover Mode**: The system can be configured to query judges sequentially, using the first valid response it receives.

## 5. Aggregate Statistical Measures

The platform synthesizes raw scores into higher-level, interpretable metrics.

### 5.1. The Hybrid Score

The Hybrid Score is a composite metric designed to provide a single, balanced measure of a model's performance when a blueprint provides an `ideal` response to compare against.

*   **Purpose**: It combines adherence to specific, user-defined criteria (coverage) with overall response quality (similarity to an ideal answer).
*   **Formula**: To combine these two values, Weval uses a **weighted arithmetic mean**. This approach is chosen for its clarity and interpretability. It explicitly states the relative importance of each component. The formula is:
    $$ S_{\text{hybrid}} = (\beta \cdot S_{\text{sim}}) + ((1-\beta) \cdot S_{\text{cov}}) $$
    Where:
    *   $S_{\text{sim}}$ is the semantic similarity score.
    *   $S_{\text{cov}}$ is the rubric coverage score.
    *   $\beta$ is the weighting factor for similarity.

    Weval uses a default weighting of **$\beta = 0.35$ (35% for similarity) and $1-\beta=0.65$ (65% for coverage)**. This reflects the platform's emphasis on rubric-based evaluation as the primary measure of performance, while still valuing the holistic quality captured by semantic similarity.

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
*   **Participation Threshold**: To ensure statistical significance and prevent models from being ranked based on performance in only a few, specialized tests, a model must have participated in a minimum number of evaluation runs to be included on the leaderboard.

## 6. Risks, Assumptions, and Affordances

Weval's methodology is designed to be robust, but like any quantitative system, it operates on a set of assumptions and has inherent limitations. Users should consider the following when interpreting the results.

### 6.1. Foundational Assumptions

The validity of Weval's metrics rests on these core assumptions:

*   **Assumption of Appropriate Weighting in Hybrid Score**: The Hybrid Score's weighted average (35% similarity, 65% coverage) assumes that this is a reasonable and balanced reflection of importance for most general use cases. While this explicit weighting is more transparent than an unweighted mean, the specific ratio may not be optimal for every evaluation's unique goals.
*   **Assumption of Linearity in Score Mapping**: The 5-point categorical scale from the LLM judge is mapped to a linear, equidistant numerical scale. This assumes the qualitative gap between "Absent" and "Slightly Present" is the same as between "Majorly Present" and "Fully Present," which may not be perceptually true.
*   **Assumption of Criterion Independence**: The rubric score (`avgCoverageExtent`) is a weighted average that treats each criterion as an independent variable. It does not account for potential correlations between criteria (e.g., "clarity" and "conciseness").

### 6.2. Known Risks and Limitations for Interpretation

*   **Risk of Masking Nuance**: The Hybrid Score, by design, collapses two distinct performance axes into one number. This can obscure critical insights. A model could score well by excelling on one axis while failing on the other. **It should be used as a high-level indicator, not a substitute for examining the individual score components.**
*   **Risk of Arbitrary Thresholds in Drift Detection**: The thresholds for flagging performance drift (0.05 absolute, 10% relative) are heuristics, not empirically derived from the statistical properties of the platform's data. They are designed to be reasonably conservative but may not be optimal, and the "drift" signal should be treated as a flag for further investigation, not a definitive conclusion.
*   **Risk of Shared Judge Bias**: The `consensus` mode for LLM-judged rubrics reduces noise from any single judge but **does not protect against shared systematic biases**. If all models in the judge pool share the same underlying bias (e.g., political, positional), the consensus score will simply represent the average of that bias.
*   **Risk of Misinterpreting Aggregate Rankings**: High-level platform statistics like "Top Ranked Models" average scores across vastly different and non-commensurate tasks (e.g., legal analysis vs. poetry). This rewards generalist models and can be statistically misleading. **These aggregate views should be interpreted with extreme caution and skepticism.**

### 6.3. Affordances and Recommended Use

*   **Drill Down**: Always supplement high-level metrics like the Hybrid Score by examining the underlying rubric assessments and semantic similarity scores. The richest insights are in the details.
*   **Context is Key**: A model's performance score is only meaningful within the context of the specific blueprint it was tested on. Avoid generalizing performance from one domain to another.
*   **Use for Investigation, Not Final Judgment**: Use the platform's outputs—especially automated signals like drift detection—as a starting point for deeper qualitative investigation, not as a final, decisive verdict on model quality or safety. 