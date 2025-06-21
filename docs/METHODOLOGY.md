# Weval Evaluation Methodology

## 1. Introduction

This document provides a detailed technical overview of the data processing pipeline, statistical methods, and scoring mechanisms used in the Weval platform. Its purpose is to ensure full transparency, enabling users and researchers to understand how our metrics are derived, and to be aware of the underlying assumptions and limitations of the approach. All evaluation blueprints contributed to the public repository at [github.com/weval-org/configs](https://github.com/weval-org/configs) are dedicated to the public domain via Creative Commons Zero (CC0).

## 2. The Evaluation Pipeline

The platform operates on a multi-stage pipeline that proceeds from a user-defined "blueprint" to a rich, quantitative analysis.

1.  **Blueprint Definition**: An evaluation begins with a YAML or JSON blueprint file that specifies the models to test, a series of prompts (test cases), evaluation methods (`embedding`, `llm-coverage`), and parameters like temperature.
2.  **Response Generation**: The system executes the blueprint, collecting responses from each specified model variation for every prompt.
3.  **Evaluation Execution**: The collected responses are processed by the chosen evaluation methods.
4.  **Results Aggregation & Storage**: The outputs are combined into a single JSON result file containing raw responses, similarity matrices, coverage scores, and metadata.
5.  **Statistical Summarization**: After a run, summary files are updated with pre-calculated statistics (e.g., average scores, standard deviations, drift detection) to power the web dashboard.

## 3. Core Evaluation Metrics

The platform's analysis is primarily built upon two quantitative methods.

### 3.1. Semantic Similarity (`embedding` method)

This method quantifies the semantic closeness between model responses and a potential "ideal" answer.

*   **Process**: Every model's textual response is converted into a high-dimensional vector using a text embedding model (e.g., OpenAI's `text-embedding-ada-002`).
*   **Mathematics**: The similarity between any two response vectors, \(\mathbf{A}\) and \(\mathbf{B}\), is calculated using **Cosine Similarity**:
    \[ \text{Similarity}(\mathbf{A}, \mathbf{B}) = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|} \]
    This yields a score between 0 and 1, where 1 indicates identical semantic meaning. This process produces a pairwise similarity matrix for each prompt.

### 3.2. Rubric-Based Coverage (`llm-coverage` method)

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
*   **Score Inversion (`should_not`)**: For criteria that penalize undesirable content, the score is inverted. For an original score \(S_{\text{orig}}\), the final score is \(S_{\text{final}} = 1 - S_{\text{orig}}\).
*   **Weighted Aggregation**: A blueprint can assign a `multiplier` (weight) to each point. The final rubric score for a model on a prompt (`avgCoverageExtent`) is the weighted average of all point scores. For \(N\) points with score \(S_i\) and weight \(w_i\):
    \[ \text{avgCoverageExtent} = \frac{\sum_{i=1}^{N} S_i \cdot w_i}{\sum_{i=1}^{N} w_i} \]

#### Judge Reliability Mechanisms

*   **Consensus Mode (Default)**: To improve robustness, Weval queries multiple judge models concurrently and averages the scores from all successful responses. This mitigates the impact of a single model's random error or specific bias.
*   **Failover Mode**: The system can be configured to query judges sequentially, using the first valid response it receives.

## 4. Aggregate Statistical Measures

The platform synthesizes raw scores into higher-level, interpretable metrics.

### 4.1. The Hybrid Score

The Hybrid Score is a composite metric designed to provide a single, balanced measure of a model's performance.

*   **Purpose**: It combines adherence to specific criteria (coverage) with overall response quality (similarity to an ideal answer).
*   **Formula**: It is the unweighted arithmetic mean of the semantic similarity to the ideal response (\(S_{\text{sim}}\)) and the average rubric coverage score (\(S_{\text{cov}}\)):
    \[ S_{\text{hybrid}} = \frac{S_{\text{sim}} + S_{\text{cov}}}{2} \]

### 4.2. Model Performance Drift Detection

This is a statistical check to flag potential changes in a model's performance over time on an identical test.

*   **Conditions**: The analysis compares runs of the same blueprint (`runLabel`) with `temperature: 0` that are separated by at least 23 hours.
*   **Statistical Triggers**: A significant drift is flagged only if **both** of the following conditions are met between the oldest and newest runs:
    1.  The **absolute score change** is \(\ge 0.05\).
    2.  The **relative score change** is \(\ge 10\%\).
*   **Metric**: The system highlights the model that meets these criteria and has the largest score range (max score - min score) across its runs.

## 5. Risks, Assumptions, and Affordances

Weval's methodology is designed to be robust, but like any quantitative system, it operates on a set of assumptions and has inherent limitations. Users should consider the following when interpreting the results.

### 5.1. Foundational Assumptions

The validity of Weval's metrics rests on these core assumptions:

*   **Assumption of Equal Weighting in Hybrid Score**: The Hybrid Score gives equal (1:1) weight to semantic similarity and rubric coverage. This may not be appropriate for all use cases, where one dimension might be significantly more important than the other.
*   **Assumption of Linearity in Score Mapping**: The 5-point categorical scale from the LLM judge is mapped to a linear, equidistant numerical scale. This assumes the qualitative gap between "Absent" and "Slightly Present" is the same as between "Majorly Present" and "Fully Present," which may not be perceptually true.
*   **Assumption of Criterion Independence**: The rubric score (`avgCoverageExtent`) is a weighted average that treats each criterion as an independent variable. It does not account for potential correlations between criteria (e.g., "clarity" and "conciseness").

### 5.2. Known Risks and Limitations for Interpretation

*   **Risk of Masking Nuance**: The Hybrid Score, by design, collapses two distinct performance axes into one number. This can obscure critical insights. A model could score well by excelling on one axis while failing on the other. **It should be used as a high-level indicator, not a substitute for examining the individual score components.**
*   **Risk of Arbitrary Thresholds in Drift Detection**: The thresholds for flagging performance drift (0.05 absolute, 10% relative) are heuristics, not empirically derived from the statistical properties of the platform's data. They are designed to be reasonably conservative but may not be optimal, and the "drift" signal should be treated as a flag for further investigation, not a definitive conclusion.
*   **Risk of Shared Judge Bias**: The `consensus` mode for LLM-judged rubrics reduces noise from any single judge but **does not protect against shared systematic biases**. If all models in the judge pool share the same underlying bias (e.g., political, positional), the consensus score will simply represent the average of that bias.
*   **Risk of Misinterpreting Aggregate Rankings**: High-level platform statistics like "Top Ranked Models" average scores across vastly different and non-commensurate tasks (e.g., legal analysis vs. poetry). This rewards generalist models and can be statistically misleading. **These aggregate views should be interpreted with extreme caution and skepticism.**

### 5.3. Affordances and Recommended Use

*   **Drill Down**: Always supplement high-level metrics like the Hybrid Score by examining the underlying rubric assessments and semantic similarity scores. The richest insights are in the details.
*   **Context is Key**: A model's performance score is only meaningful within the context of the specific blueprint it was tested on. Avoid generalizing performance from one domain to another.
*   **Use for Investigation, Not Final Judgment**: Use the platform's outputs—especially automated signals like drift detection—as a starting point for deeper qualitative investigation, not as a final, decisive verdict on model quality or safety. 