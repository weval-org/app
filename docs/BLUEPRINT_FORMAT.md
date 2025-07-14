# Weval Blueprint Format

This document provides a comprehensive guide to creating evaluation blueprints for the Weval suite. Blueprints are configuration files that define a set of prompts, models to test, and the criteria for evaluating the models' responses.

All blueprints contributed to the public repository at [github.com/weval-org/configs](https://github.com/weval-org/configs) are dedicated to the public domain via Creative Commons Zero (CC0).

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
| `id` | `string` | **(DEPRECATED & IGNORED)** This field is ignored. The blueprint's unique ID is now **always** derived from its file path. For example, a file at `blueprints/subdir/my-test.yml` will automatically have the ID `subdir__my-test`. Please remove this field from new blueprints. Aliased as `configId`. |
| `title` | `string` | **(Optional)** A human-readable title for the blueprint, displayed in the UI. If omitted, it defaults to the `id`. Aliased as `configTitle`. |
| `description` | `string` | **(Optional)** A longer description of the blueprint's purpose. Supports Markdown. |
| `tags` | `string[]` | **(Optional)** An array of tags for categorizing and filtering blueprints on the homepage. |
| `models` | `string[]` | **(Optional)** An array of model identifiers to run the evaluation against. Model identifiers must be a single string in the format `provider:model` with no spaces (e.g., `openai:gpt-4o-mini`). The system will attempt to gracefully correct common formatting errors, but adhering to the standard format is recommended. If omitted, defaults to `["CORE"]`. |
| `system` | `string` | **(Optional)** A global system prompt to be used for all prompts in the blueprint, unless overridden at the prompt level. Aliased as `systemPrompt`. |
| `temperature` | `number` | **(Optional)** A single temperature setting to run for each model. This is overridden if the `temperatures` array is present. |
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
| `citation` | `string` | **(Optional)** A citation or reference for the prompt, such as a URL, paper reference, or source documentation. This provides context about where the prompt or expected response comes from. |
| `should` | `(string \| object)[] \| (string \| object)[][]` | **(Optional)** A list of rubric points for the `llm-coverage` evaluation method. Defines the criteria for a successful response. To define alternative valid paths ("OR" logic), this can be a list of lists. Aliased as `points`, `expect`, `expects`, or `expectations`. See details below. |
| `should_not` | `(string \| object)[] \| (string \| object)[][]` | **(Optional)** A list of rubric points defining criteria that a response **should not** meet. It follows the exact same syntax as the `should` block, including support for a list of lists to create alternative "should not" paths. |

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

#### Defining Alternative Rubric Paths (OR logic)

By default, all criteria within a `should` or `should_not` block are treated as an "AND" condition—a response must satisfy all of them to be considered fully successful.

To express an "OR" condition, where a response is considered valid if it satisfies one of several distinct sets of criteria, you can use a **nested list**. Each inner list is a complete, alternative rubric path.

```yaml
should:
  # Path 1: A response is valid if it meets BOTH of these criteria...
  - - "is kind and polite."
    - $contains: "Here is a recipe"

  # OR Path 2: ...or if it meets BOTH of these other criteria.
  - - "is inquisitive and asks a clarifying question."
    - "offers to find a recipe based on user's preferences."

  # OR Path 3: ...or if it just does this one thing.
  - - "politely declines because it cannot guarantee recipe quality."
```

**Scoring Behavior**: When alternative paths are used, the system calculates the average score for *each* path independently. The final score for the entire block is then the **highest** of these path scores.

**Mixing Required and Alternative Paths**

You can also mix required points with a block of alternative paths. This powerful combination allows you to define core criteria that *must* be met, alongside several optional ways to satisfy other parts of the rubric.

When mixing, the score for the alternative path block (the highest-scoring path) is treated as a single point and is averaged with all the other required points.

```yaml
should:
  # This point is ALWAYS required
  - "The response must be in English."

  # This is a block of alternative paths. The score for this block
  # will be the score of the best-performing path inside it.
  - - # Path 1: Direct Answer
      - "Provides the correct answer."
      - $contains: "42"
    - # Path 2: Asks for Clarification
      - "Asks what 'the meaning of life' refers to."

  # This function check is also ALWAYS required
  - $word_count_between: [10, 200]
```

In the example above, the final score will be the average of:
1.  The score for "The response must be in English."
2.  The score for the *best* of (Path 1, Path 2).
3.  The score for the `$word_count_between` check.

**Alternative Paths in `should_not`**

The same logic applies to the `should_not` block. This is useful for defining multiple, distinct failure modes. A response fails if it satisfies *any* of the alternative "should not" paths.

```yaml
should_not:
  # Fail if the response is BOTH rude AND dismissive
  - - "is rude"
    - "is dismissive"

  # OR fail if the response contains specific forbidden phrases
  - - $contains_any_of: ["I am not a lawyer", "This is not legal advice"]
```

If no nesting is used, the block is parsed as a single path, preserving full backward compatibility with older blueprints.

#### Point Definition Formats

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
      # Object syntax (recommended)
      - $contains: "fiduciary duty"  # Case-sensitive check
      - $icontains: "fiduciary duty" # Case-insensitive

      # List-based checks
      - $contains_any_of: ["fiduciary", "duty"]  # True if any are found
      - $contains_all_of: ["fiduciary", "duty"]  # Graded score (0.5 if 1 of 2 is found)
      - $contains_at_least_n_of: [2, ["apples", "oranges", "pears"]]

      # Regex checks
      - $matches: "^The ruling states" # Case-sensitive regex
      - $imatches: "^the ruling"       # Case-insensitive regex
      - $matches_all_of: ["^The ruling", "states that$"] # Graded regex
      - $imatches_all_of: ["^the ruling", "states that$"] # Case-insensitive graded regex

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
      - point: "Covers the principle of 'prudent man' rule."
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
      "citation": "https://www.json.org/",
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
- **Top-Level ID is Ignored**: As with the modern YAML format, the top-level `id` field in a legacy JSON blueprint is also ignored. The blueprint's ID is always derived from its file path.
- **Prompt ID**: The `id` for each individual prompt inside the `prompts` array is still respected and useful for tracking. 