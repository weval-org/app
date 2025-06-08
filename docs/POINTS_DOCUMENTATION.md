# Understanding the `points` System

This document provides a detailed breakdown of the `points` system, which is the core of CivicEval's rubric-based evaluation capabilities. It explains how to define evaluation criteria (points) in a blueprint and how the codebase processes them to generate a final score.

### Part 1: How to Define a `Point` (The Blueprint)

From the perspective of a user creating a blueprint file, you have three flexible ways to define an evaluation criterion, or a "point." This is defined in the `points` array for any given prompt.

The `PointDefinition` type allows for these three formats:

1.  **Simple String**: This is the most common format. It defines a conceptual key point that you want the model's response to cover. The evaluation is "fuzzy" and semantic, performed by an LLM judge.
    ```json
    "points": [
      "This is a simple key point, treated with default multiplier 1."
    ]
    ```
    *   **What it means**: "I expect the model's response to semantically contain the concept described in this string."

2.  **Function Tuple `[string, any]`**: This is a shortcut for defining a programmatic, deterministic check.
    ```json
    "points": [
      ["contains", "mandatory keyword"]
    ]
    ```
    *   **What it means**: "I want to execute the built-in function named `contains` and pass it the model's response along with the argument `"mandatory keyword"`. This will return a `true`/`false` result."

3.  **Full `PointObject`**: This provides the most control, allowing you to specify a multiplier, a citation, and explicitly choose between text-based or function-based evaluation.
    ```json
    "points": [
      {
        "text": "This is a very important conceptual point that must be covered.",
        "multiplier": 3.0,
        "citation": "Project requirements, section 2.1a"
      },
      {
        "fn": "matches",
        "fnArgs": "^The response must start with this phrase",
        "multiplier": 0.5,
        "citation": "Style guide rule #5"
      }
    ]
    ```
    *   **What it means**: This allows fine-grained control. The `text` field signals an LLM-judged evaluation, while the `fn` field signals a direct function call. The `multiplier` weights this point's score when calculating the final average, and `citation` is for documentation.

---

### Part 2: What Happens in the Codebase (The Journey of a Point)

When you run `pnpm cli run_config`, here is the step-by-step journey your `points` definitions take through the system.

#### Step 1: Loading and Initial Validation

The process starts in `src/cli/commands/run-config.ts`. The `loadAndValidateConfig` function reads your JSON blueprint. At this stage, it mainly validates the overall structure (e.g., that `prompts` is an array) but doesn't deeply inspect the `points` themselves.

#### Step 2: Entering the `LLMCoverageEvaluator`

When the evaluation pipeline runs, if `llm-coverage` is a selected method, the `LLMCoverageEvaluator` class (`src/cli/evaluators/llm-coverage-evaluator.ts`) is instantiated and its `evaluate` method is called. This is where the core logic resides.

The first crucial step inside the evaluator is **normalization**.

#### Step 3: Normalization (`normalizePoints`)

The `LLMCoverageEvaluator` takes the flexible `points` array you defined and converts each entry into a standardized internal format called `NormalizedPoint`. This is handled by the `normalizePoints` method.

This method transforms all three input formats (`string`, `tuple`, `object`) into a single, consistent interface:

```typescript
// src/cli/types/comparison_v2.ts
export interface NormalizedPoint {
    id: string;
    displayText: string;
    multiplier: number;
    citation?: string;
    isFunction: boolean;
    textToEvaluate?: string; // For LLM-based evaluation
    functionName?: string;     // For function-based evaluation
    functionArgs?: any;
}
```

*   A simple string `"Hello"` becomes a `NormalizedPoint` where `isFunction: false`, `textToEvaluate: "Hello"`.
*   A tuple `["contains", "world"]` becomes a `NormalizedPoint` where `isFunction: true`, `functionName: "contains"`, `functionArgs: "world"`.
*   A `PointObject` is mapped directly to these fields.

This step is critical because the rest of the evaluator can now operate on a single, predictable data structure.

#### Step 4: The Two Evaluation Paths

After normalization, the evaluator processes each `NormalizedPoint` for each model's response. It checks the `isFunction` boolean property to decide which path to take.

**Path A: LLM-Based "Fuzzy" Evaluation (if `isFunction: false`)**

This path is for `text`-based points and is the most complex.

1.  **Function Call**: The evaluator calls the `evaluateSinglePoint` method.
2.  **Prompt Construction**: This method constructs a highly detailed prompt for a "judge" LLM. The prompt includes the original prompt context, the model's full response, and—most importantly—the single key point (`textToEvaluate`) it needs to assess.

    ```typescript
    // Snippet from the prompt in src/cli/evaluators/llm-coverage-evaluator.ts
    const pointwisePrompt = \`
    Given the following <MODEL_RESPONSE> which was generated in response to the <ORIGINAL_PROMPT>:
    //...
    Now, carefully assess ONLY the following <KEY_POINT>:
    
    <KEY_POINT>
    \${keyPointText}
    </KEY_POINT>
    
    //... Scoring guidelines ...
    
    Your output MUST strictly follow this XML format:
    <reflection>Your 1-2 sentence reflection and reasoning for the score...</reflection>
    <coverage_extent>A numerical score from 0.0 to 1.0...</coverage_extent>
    \`;
    ```

3.  **LLM Judge**: It sends this prompt to a powerful judge model (e.g., `openrouter:google/gemini-2.5-flash-preview-05-20`, `openrouter:openai/gpt-4.1-mini`). The code includes a list of models to try and has retry logic for robustness.
4.  **Parsing the Result**: The judge LLM returns an XML string. The code parses the `<coverage_extent>` (a score from 0.0 to 1.0) and the `<reflection>` (the LLM's reasoning for the score). This becomes a `PointAssessment`.

**Path B: Function-Based "Exact" Evaluation (if `isFunction: true`)**

This path is for `fn`-based points and is deterministic.

1.  **Function Lookup**: The evaluator uses the `functionName` from the `NormalizedPoint` to look up the corresponding function in the `pointFunctions` object (imported from `@/point-functions`). The `README` confirms this includes functions like `contains` and `matches`.
2.  **Direct Execution**: The code directly executes the looked-up function, passing it the model's response text and the `functionArgs` from the `NormalizedPoint`.
3.  **Result Handling**: The function is expected to return:
    *   A `boolean`: `true` is converted to a score of 1, `false` to 0.
    *   A `number` between 0.0 and 1.0: This is used directly as the score.
    *   An `{error: string}` object: This results in a score of 0.
    The result and a brief description (e.g., "Function 'contains' evaluated to true.") are packaged into a `PointAssessment`.

#### Step 5: Aggregation and Final Score

For each model response, after all its `points` have been evaluated down one of the two paths:

1.  **Collect Assessments**: The system collects all the individual `PointAssessment` objects.
2.  **Calculate Average**: It calculates the final `avgCoverageExtent`. This is a **weighted average**. The `coverageExtent` of each point is multiplied by its `multiplier` (which defaults to 1), and the sum is divided by the sum of all multipliers. This is why a `multiplier` of `3.0` makes a point three times as important as a standard point.
3.  **Package Result**: The final average score, plus the list of all individual `PointAssessment` objects, is packaged into a `CoverageResult` object.

---

### Part 3: The Final Output

This `CoverageResult` object is stored in the final output JSON file under the `evaluationResults.llmCoverageScores` path.

Your final `[runLabel]_[timestamp]_comparison.json` file will contain a structure like this:

```json
{
  // ... other top-level fields
  "evaluationResults": {
    "llmCoverageScores": {
      "prompt-unique-id-1": {
        "openrouter:openai/gpt-4o-mini": {
          "keyPointsCount": 4,
          "avgCoverageExtent": 0.88,
          "pointAssessments": [
            {
              "keyPointText": "Virtue is the only good (wisdom, justice, courage, temperance).",
              "coverageExtent": 1.0,
              "reflection": "The model explicitly lists the four virtues as the sole good.",
              "multiplier": 1
            },
            {
              "keyPointText": "Function: contains(\\"mandatory keyword\\")",
              "coverageExtent": 1,
              "reflection": "Function 'contains' evaluated to true. Score: 1",
              "multiplier": 1
            }
            // ... more assessments
          ]
        }
        // ... other models
      }
      // ... other prompts
    }
  }
}
```

This provides complete traceability, from the overall average score right down to the score and reasoning for each individual point you defined in your blueprint. 