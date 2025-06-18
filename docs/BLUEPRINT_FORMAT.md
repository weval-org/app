# CivicEval Blueprint Format

This document provides a comprehensive guide to creating evaluation blueprints for the CivicEval suite. Blueprints are configuration files that define a set of prompts, models to test, and the criteria for evaluating the models' responses.

While the system maintains support for a legacy JSON format, the recommended and most user-friendly format is **YAML**.

---

## YAML Blueprint Format (Recommended)

Our YAML format is designed for clarity and ease of contribution, especially for non-technical users. It can be structured in a few flexible ways.

### Blueprint Structures

The system can parse YAML blueprints in three main structures:

**1. Config Header + Prompts (Multi-Document)**

This is the recommended structure for most blueprints. The first YAML document contains the global configuration, and the second document contains the list of prompts. The two are separated by a `---` line.

```yaml
# Configuration Header (First YAML Document)
id: my-blueprint-v1
title: "My First Blueprint"
models:
  - openai:gpt-4o-mini
---
# List of Prompts (Second YAML Document)
- id: p1
  prompt: "What is the capital of France?"
- id: p2
  prompt: "What is 2 + 2?"
```

**2. Stream of Prompt Documents**

For simple blueprints that don't need a global configuration header, you can provide a stream of individual prompt objects, each separated by `---`. The blueprint's `id` and `title` will be automatically derived from its filename.

```yaml
# Each prompt is its own YAML document
prompt: "First prompt"
ideal: "An ideal response for the first prompt."
---
prompt: "Second prompt"
should:
  - "The second prompt should do this."
  - "And also this."
---
prompt: "Third prompt"
```

**3. List of Prompts Only (Single Document)**

You can also provide a single YAML document that is just a list of prompt objects. This is functionally equivalent to the "Stream of Prompt Documents" structure and is also ideal for simple, header-less blueprints.

```yaml
# A single YAML document containing a list of prompts
- prompt: "What are the three primary colors?"
- prompt: "What is the square root of 16?"
```

**4. Single-Document with `prompts` key**

For consistency with the JSON format, you can define the entire blueprint as a single YAML document and place the prompts inside a `prompts` array. Both structures are fully supported.

```yaml
# Single YAML document with a 'prompts' key
id: my-blueprint-v1
title: "My First Blueprint"
models:
  - openai:gpt-4o-mini
prompts:
  - id: p1
    prompt: "What is the capital of France?"
  - id: p2
    prompt: "What is 2 + 2?"
```

**How the Parser Interprets Structures**

The system automatically detects the structure of your YAML blueprint. This "smart parsing" makes it easy to write simple or complex blueprints without changing formats.

-   If the first YAML document in a file (i.e., everything before the first `---`) contains global configuration keys like `id`, `title`, or `models`, it is treated as the **Configuration Header**. All subsequent YAML documents in the file are then treated as a list of prompts.
-   If the first document does *not* appear to be a configuration header (e.g., it contains prompt-level keys like `prompt` or `should`), the parser assumes there is no global config. In this case, **all** documents in the file are treated as a stream of individual prompts.

### Configuration Header Fields

The following fields can be included in the header section (Structure 1) or the main object (Structure 4).

| Field | Type | Description |
|---|---|---|
| `id` | `string` | **(Optional)** A unique identifier for the blueprint. If omitted, it will be derived from the filename. Aliased as `configId`. |
| `title` | `string` | **(Optional)** A human-readable title for the blueprint, displayed in the UI. If omitted, it defaults to the `id`. Aliased as `configTitle`. |
| `description` | `string` | **(Optional)** A longer description of the blueprint's purpose. Supports Markdown. |
| `tags` | `string[]` | **(Optional)** An array of tags for categorizing and filtering blueprints on the homepage. |
| `models` | `string[]` | **(Optional)** An array of model identifiers to run the evaluation against. Model identifiers must be a single string in the format `provider:model` with no spaces (e.g., `openai:gpt-4o-mini`). The system will attempt to gracefully correct common formatting errors, but adhering to the standard format is recommended. If omitted, defaults to `["CORE"]`. |
| `system` | `string` | **(Optional)** A global system prompt to be used for all prompts in the blueprint, unless overridden at the prompt level. Aliased as `systemPrompt`. |
| `concurrency` | `number` | **(Optional)** The number of parallel requests to make to the LLM APIs. Defaults to 10. |
| `temperatures`| `number[]` | **(Optional)** An array of temperature settings to run for each model. This will create separate evaluations for each temperature. **Note:** Using this feature will append a suffix like `[temp:0.5]` to the model ID in the final output file, creating a unique identifier for each run variant. |
| `evaluationConfig` | `object` | **(Optional)** Advanced configuration for evaluation methods. For example, you can specify judge models for `llm-coverage`. |

### Prompt Fields

Each item in the list of prompts is an object that can contain the following fields.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | **(Optional)** A unique identifier for the prompt within the blueprint. Useful for tracking a specific prompt's performance over time. **If omitted, a stable ID will be automatically generated by hashing the prompt's content.** |
| `prompt` | `string` | The text of the prompt to be sent to the model for a single-turn conversation. **Required if `messages` is not present.** An alias for the more formal `promptText`. |
| `messages` | `object[]` | An array of message objects for multi-turn conversations. **Required if `prompt` is not present.** Cannot be used with `prompt`. See message formats below. |
| `ideal` | `string` | **(Optional)** A "gold-standard" answer against which model responses can be compared for semantic similarity. An alias for `idealResponse`. |
| `system` | `string` | **(Optional)** A system prompt that overrides the global `system` prompt for this specific prompt only. |
| `should` | `(string \| object)[]` | **(Optional)** A list of rubric points for the `llm-coverage` evaluation method. Defines the criteria for a successful response. Aliased as `points`, `expect`, `expects`, or `expectations`. See details below. |
| `should_not` | `(string \| object)[]` | **(Optional)** A list of rubric points defining criteria that a response **should not** meet. It follows the exact same syntax as the `should` block, but the result of each check is inverted (a match becomes a failure, and a non-match becomes a success). |

#### Message Formats (`messages` array)

You can define conversation messages in two ways:

**1. Formal Syntax (Recommended for clarity)**

```yaml
messages:
  - role: 'user'
    content: 'Tell me about the Roman Empire.'
  - role: 'assistant'
    content: 'The Roman Empire was one of the most powerful economic, cultural, and military forces in the world.'
  - role: 'user'
    content: 'What was its capital?'
```

**2. Shorthand Syntax (Convenient for quick authoring)**

You can also use a more compact format where the role is the key. `ai` is also supported as an alias for `assistant`.

```yaml
messages:
  - user: 'Tell me about the Roman Empire.'
  - assistant: 'The Roman Empire was one of the most powerful economic, cultural, and military forces in the world.'
  - user: 'What was its capital?'
```

### The `should` and `should_not` Rubrics

These blocks define the criteria for rubric-based evaluation. The `should` block defines positive criteria (what a good response includes), while the `should_not` block defines negative criteria (what a good response avoids). The `should_not` block follows the exact same syntax, but it inverts the result of each check.

Each item in these arrays is a point definition, processed in the following order of precedence:

1.  **Plain Language Rubric (LLM-Judged Check)**: This is the simplest and most powerful way to create a rubric. Each string is a criterion that an AI "judge" will evaluate for its conceptual presence in the model's response.
    ```yaml
    should:
      - "be empathetic and understanding."
      - "acknowledge the user's difficulty."
    ```

2.  **Point with Citation (Recommended Shorthand)**: For the common case of adding a citation to a conceptual point, you can use a direct key-value pair. This supports multi-line strings for complex criteria using YAML block syntax.
    ```yaml
    should:
      - "Covers the principle of 'prudent man' rule.": "Investment Advisers Act of 1940"
      - ? |
          The response must detail the three core duties of a fiduciary:
          1. The Duty of Care
          2. The Duty of Loyalty
        : "SEC Rule on Fiduciary Duty"
    ```

3.  **Idiomatic Function (Deterministic Check)**: A quick way to perform exact, programmatic checks. **All idiomatic function calls must be prefixed with a `$`** to distinguish them from citable points.
    ```yaml
    should:
      # Simple presence
      - $contains: "fiduciary duty"  # Case-sensitive check
      - $icontains: "fiduciary duty" # Case-insensitive
      - $ends_with: "."

      # List-based checks
      - $contains_any_of: ["fiduciary", "duty"]  # True if any are found
      - $contains_all_of: ["fiduciary", "duty"]  # Graded score (0.5 if 1 of 2 is found)
      - $contains_at_least_n_of: [2, ["apples", "oranges", "pears"]]

      # Regex checks
      - $match: "^The ruling states" # Case-sensitive regex
      - $imatch: "^the ruling"       # Case-insensitive regex
      - $match_all_of: ["^The ruling", "states that$"] # Graded regex
      - $imatch_all_of: ["^the ruling", "states that$"] # Case-insensitive graded regex

      # Other checks
      - $word_count_between: [50, 100]
      - $js: "r.length > 100" # Advanced JS expression

    should_not:
      - $contains_any_of: ["I feel", "I believe", "As an AI"]
      - $contains: "guaranteed returns"
    ```
4.  **Full Object (Maximum Control)**: For weighting points or adding citations. This is the most verbose, legacy-compatible format.
    ```yaml
    should:
      - text: "Covers the principle of 'prudent man' rule."
        weight: 3.0 # This point is 3x as important
      - fn: "contains"
        arg: "fiduciary duty"
        weight: 1.5
        citation: "Investment Advisers Act of 1940"
    ```
    *Note: `weight` is an alias for `multiplier`, `arg` for `fnArgs`.*

For more details, see the [POINTS_DOCUMENTATION.md](POINTS_DOCUMENTATION.md).

---

## Legacy JSON Blueprint Format

The system remains backwardly compatible with the original JSON format.

### JSON Structure

```json
{
  "id": "legacy-json-test-v1",
  "title": "Legacy JSON Test",
  "models": [
    "openai:gpt-4o-mini"
  ],
  "prompts": [
    {
      "id": "p1-json",
      "promptText": "What is JSON?",
      "idealResponse": "A lightweight data-interchange format.",
      "points": [
        { "text": "It is a data-interchange format", "multiplier": 1.0 }
      ],
      "should_not": [
          { "fn": "contains", "fnArgs": "YAML" }
      ]
    }
  ]
}
```

### Key Differences from YAML

- **Single Object**: The entire blueprint is a single JSON object.
- **Formal Field Names**: While some aliases work, the canonical field names are `promptText`, `idealResponse`, and `points`.
- **No Multi-Document**: There is no `---` separator. Prompts are nested within the `"prompts"` array.
- **ID is Required**: In the legacy format, the top-level `id` and the `id` for each prompt are generally expected. The automatic prompt ID generation was added with the YAML format in mind. 