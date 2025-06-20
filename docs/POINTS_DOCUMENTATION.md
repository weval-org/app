# Understanding the `should` System

This document provides a detailed breakdown of the `should` system (formerly `points` and `expect`), which is the core of Weval's rubric-based evaluation capabilities. It explains how to define evaluation criteria in a blueprint and how the codebase processes them to generate a final score.

### Part 1: How to Define an Expectation (The Blueprint)

From the perspective of a user creating a blueprint file (`.yml`), you have several flexible ways to define an evaluation criterion, or an "expectation." This is defined in the `should` block for any given prompt. (`expect`, `expects`, and `expectations` are also supported as aliases for backward compatibility).

The `should` block accepts a list where each item can be in one of these formats:

1.  **Simple String**: This is the most common format. It defines a conceptual key point that you want the model's response to cover. The evaluation is "fuzzy" and semantic, performed by an LLM judge.
    ```yaml
    should:
      - "This is a simple key point, treated with default weight 1."
    ```
    *   **What it means**: "The response should semantically contain the concept described in this string."

2.  **Idiomatic Function Call**: This is a clean, readable way to define a programmatic, deterministic check. You use the function's name as the key.
    ```yaml
    should:
      - contain: "mandatory keyword"
      - not_contain: "forbidden word"
      - match: "^The response must start with this"
      - not_match: "this pattern must not appear"
    ```
    *   **What it means**: "The response should pass a check against the built-in function (e.g., `contain`)."

3.  **Full `Point` Object**: This provides the most control, allowing you to specify a weight, a citation, and explicitly choose between text-based or function-based evaluation.
    ```yaml
    should:
      - point: "This is a very important conceptual point that must be covered."
        weight: 3.0 # 'weight' is an alias for the internal 'multiplier'
        citation: "Project requirements, section 2.1a"
      
      - fn: "match"
        arg: "^The response must start with this phrase" # 'arg' is an alias for 'fnArgs'
        weight: 0.5
        citation: "Style guide rule #5"
    ```
    *   **What it means**: This allows fine-grained control. The `text` field signals an LLM-judged evaluation, while the `fn` field signals a direct function call. The `weight` (`multiplier`) weights this point's score when calculating the final average, and `citation` is for documentation.

---

### Part 2: What Happens in the Codebase (The Journey of an Expectation)

When you run an evaluation, here is the step-by-step journey your `should` definitions take through the system.

#### Step 1: Reading the Blueprint File

The process starts in one of two places:
*   **Local CLI**: `src/cli/commands/run-config.ts` reads the specified blueprint file (e.g., `my-blueprint.yml`).
*   **Deployed System**: `netlify/functions/fetch-and-schedule-evals.ts` fetches the raw content of blueprint files from the `weval/configs` GitHub repository.

#### Step 2: Parsing and Normalization (`blueprint-parser.ts`)

This is a critical new step. The raw content of the file (whether it's our new YAML format or legacy JSON) is passed to the `parseAndNormalizeBlueprint` function in `src/lib/blueprint-parser.ts`.

This single utility is responsible for:
1.  **Parsing**: It detects the file type and parses the content, handling the multi-document YAML structure.
2.  **Normalization**: It takes the flexible, user-friendly format and transforms it into the strict, internal `ComparisonConfig` object. This is where:
    *   `prompt` is converted to `promptText`.
    *   `ideal` is converted to `idealResponse`.
    *   `should`/`expect`/`expects`/`expectations` is converted to `points`.
    *   All the different expectation syntaxes (strings, idiomatic functions, full objects) are converted into a consistent internal format (`Point` objects).
    *   Function names like `contain`, `match`, `not_contain`, and `not_match` are normalized to their internal counterparts (`contains`, `matches`, `not_contains`, `not_match`).

After this step, the rest of the system operates on a predictable, standardized `ComparisonConfig` object, regardless of how the blueprint was originally authored.

#### Step 3: Entering the `LLMCoverageEvaluator`

When the evaluation pipeline runs, if `llm-coverage` is a selected method, the `LLMCoverageEvaluator` class (`src/cli/evaluators/llm-coverage-evaluator.ts`) is instantiated. Its `evaluate` method is called, receiving the now-normalized `points` array.

#### Step 4: The Two Evaluation Paths

The `LLMCoverageEvaluator` iterates through each `Point` object for a given model response. It checks if the point has a `fn` property to decide which path to take.

**Path A: LLM-Based "Fuzzy" Evaluation (if `fn` is NOT present)**

This path is for `text`-based points and is the most complex.

1.  **Function Call**: The evaluator calls the `evaluateSinglePoint` method.
2.  **Prompt Construction**: This method constructs a highly detailed prompt for a "judge" LLM. The prompt includes the original prompt context, the model's full response, and—most importantly—the single key point (`text`) it needs to assess.

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

3.  **LLM Judge**: It sends this prompt to a powerful judge model. The code includes a list of models to try and has retry logic for robustness.
4.  **Parsing the Result**: The judge LLM returns an XML string. The code parses the `<coverage_extent>` (a score from 0.0 to 1.0) and the `<reflection>` (the LLM's reasoning for the score). This becomes a `PointAssessment`.

**Path B: Function-Based "Exact" Evaluation (if `fn` IS present)**

This path is for `fn`-based points and is deterministic.

1.  **Function Lookup**: The evaluator uses the `fn` property from the `Point` to look up the corresponding function in the `pointFunctions` object (imported from `@/point-functions`). This includes functions like `contains`, `matches`, `not_contains`, `not_match`, etc.
2.  **Direct Execution**: The code directly executes the looked-up function, passing it the model's response text and the `fnArgs` from the `Point`.
3.  **Result Handling**: The function is expected to return:
    *   A `boolean`: `true` is converted to a score of 1, `false` to 0.
    *   A `number` between 0.0 and 1.0: This is used directly as the score.
    *   An `{error: string}` object: This results in a score of 0.
    The result and a brief description (e.g., "Function 'contains' evaluated to true.") are packaged into a `PointAssessment`.

#### Step 5: Aggregation and Final Score

For each model response, after all its `points` have been evaluated down one of the two paths:

1.  **Collect Assessments**: The system collects all the individual `PointAssessment` objects.
2.  **Calculate Average**: It calculates the final `avgCoverageExtent`. This is a **weighted average**. The `coverageExtent` of each point is multiplied by its `multiplier` (which defaults to 1), and the sum is divided by the sum of all multipliers. This is why a `weight` of `3.0` makes a point three times as important as a standard point.
3.  **Package Result**: The final average score, plus the list of all individual `PointAssessment` objects, is packaged into a `CoverageResult` object.

---

### Part 3: The Final Output

This `CoverageResult` object is stored in the final output JSON file under the `evaluationResults.llmCoverageScores` path.

Your final `[runLabel]_[timestamp]_comparison.json` file will contain a structure like this, which provides complete traceability from the overall average score right down to the score and reasoning for each individual expectation you defined in your blueprint.
```json
{
  // ... other top-level fields
  "evaluationResults": {
    "llmCoverageScores": {
      "prompt-unique-id-1": {
        "openrouter:openai/gpt-4o-mini": {
          "keyPointsCount": 2,
          "avgCoverageExtent": 0.88,
          "pointAssessments": [
            {
              "keyPointText": "Defines it as a data serialization standard",
              "coverageExtent": 1.0,
              "reflection": "The model explicitly stated that YAML is a data serialization standard.",
              "multiplier": 1
            },
            {
              "keyPointText": "Function: contains(\\"human-friendly\\")",
              "coverageExtent": 1,
              "reflection": "Function 'contains' evaluated to true. Score: 1",
              "multiplier": 1.5
            }
          ]
        }
      }
    }
  }
}
``` 