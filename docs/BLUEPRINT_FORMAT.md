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
| `author` | `string \| object` | **(Optional)** Attribution for the blueprint author. Can be a simple string name or an object with `name`, `url`, and `image_url` fields. |
| `references` / `citations` | `string \| object \| array` | **(Optional)** One or more citations or references this blueprint is based on. Can be a single string/object, or an array of strings/objects. Each object should have a `title` (alias: `name`) and an optional `url`. All aliases are accepted: `reference`, `citation`, `references`, `citations`. |
| `tags` | `string[]` | **(Optional)** An array of tags for categorizing and filtering blueprints on the homepage. |
| `models` | `string[] \| object[]` | **(Optional)** An array of model identifiers to run the evaluation against. Can include standard model strings in the format `provider:model` (e.g., `openai:gpt-4o-mini`) and/or custom model definition objects for arbitrary HTTP endpoints. If omitted, defaults to `["CORE"]`. See detailed model configuration below. |
| `system` | `string` | **(Optional)** A global system prompt to be used for all prompts in the blueprint, unless overridden at the prompt level. Aliased as `systemPrompt`. |
| `temperature` | `number` | **(Optional)** A single temperature setting to run for each model. This is overridden if the `temperatures` array is present. |
| `temperatures`| `number[]` | **(Optional)** An array of temperature settings to run for each model. This will create separate evaluations for each temperature. **Note:** Using this feature will append a suffix like `[temp:0.5]` to the model ID in the final output file, creating a unique identifier for each run variant. |
| `evaluationConfig` | `object` | **(Optional)** Advanced configuration for evaluation methods. For example, you can specify judge models for `llm-coverage`. |
| `point_defs` | `object` | **(Optional)** Map of reusable point-function snippets. Keys are definition names; values are either JavaScript strings (expanded as `$js`) or full point objects. Reuse them inside prompts with `$ref`. |
| `tools` | `object[]` | **(Optional)** Trace-only tool inventory for tool-use evaluation. Each tool has `{ name: string, description?: string, schema?: object }` (JSON Schema for arguments, recommended). |
| `toolUse` | `object` | **(Optional)** Tool-use policy (trace-only). Supported keys: `{ enabled?: boolean, mode?: 'trace-only', maxSteps?: number, outputFormat?: 'json-line' }`. Default mode is trace-only; no execution is performed. |
| `context` | `object` | **(Optional)** Frozen, deterministic data available to prompts (e.g., a small corpus). Shape is user-defined. |
| `render_as` | `string` | **(Optional)** Sets the default rendering mode for all prompts in the blueprint. Can be `markdown`, `html`, or `plaintext`. Defaults to `markdown`. Overridden by prompt-level `render_as`. |
| `noCache` | `boolean` | **(Optional)** If `true`, sets the default caching behavior for all prompts to `noCache`. This can be overridden by a per-prompt `noCache` setting. This only affects the initial model response generation, not subsequent evaluation steps like `llm-coverage`, which have their own caching. |

### Model Configuration

The `models` field supports both standard model identifiers and custom model definitions for maximum flexibility.

#### Standard Model Identifiers

Standard model identifiers are strings in the format `provider:model` with no spaces:

```yaml
models:
  - openai:gpt-4o-mini
  - anthropic:claude-3-haiku-20240307
  - google:gemini-1.5-flash-latest
  - mistral:mistral-large-latest
  - together:meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo
  - xai:grok-beta
  - openrouter:google/gemini-pro
```

The system will attempt to gracefully correct common formatting errors, but adhering to the standard format is recommended.

#### Custom Model Definitions

For local models, custom endpoints, or proxies, you can define arbitrary HTTP-compatible models using object syntax:

```yaml
models:
  - openai:gpt-4o-mini  # Standard model
  
  # Local LLaMA model via Ollama with parameter control
  - id: 'local:llama3-8b'
    url: 'http://localhost:11434/v1/chat/completions'
    modelName: 'llama3:instruct'
    inherit: 'openai'
    headers:
      Authorization: 'Bearer whatever-i-want'
    parameters:
      max_tokens: 150      # Override system default
      stream: null         # Remove stream parameter entirely
      
  # Local completions-format model
  - id: 'local:llama-completions'
    url: 'http://localhost:4891/v1/completions'
    modelName: 'llama-3-8b-instruct'
    inherit: 'openai'
    format: 'completions'
    parameters:
      max_tokens: 100
      stream: null
      temperature: 0.7
  
  # Custom Anthropic-compatible proxy
  - id: 'proxy:claude-sonnet'
    url: 'https://my-proxy.com/v1/messages'
    modelName: 'claude-3-sonnet-20240229'
    inherit: 'anthropic'
    headers:
      X-API-Key: '${PROXY_API_KEY}'
      X-Custom-Header: 'value'
```

##### Custom Model Object Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Unique identifier for this custom model (e.g., `'local:llama3-8b'`) |
| `url` | `string` | ✅ | Full HTTP endpoint URL for the model API |
| `modelName` | `string` | ✅ | Model name to send in API requests |
| `inherit` | `string` | ✅ | API format to inherit: `'openai'`, `'anthropic'`, `'google'`, `'mistral'`, `'together'`, `'xai'`, or `'openrouter'` |
| `format` | `string` | ❌ | API endpoint format: `'chat'` (default) or `'completions'` |
| `promptFormat` | `string` | ❌ | For completions format: `'conversational'` (adds "User: ... Assistant:") or `'raw'` (uses prompt text directly) |
| `headers` | `object` | ❌ | Additional HTTP headers to include in requests |
| `parameters` | `object` | ❌ | Parameter overrides. Set values or use `null` to exclude parameters entirely |
| `parameterMapping` | `object` | ❌ | Map standard parameter names to provider-specific names |

##### Inheritance Patterns

The `inherit` field determines the request/response format:

- **`'openai'`** - OpenAI ChatCompletions format (messages array, system prompt, temperature, etc.)
- **`'anthropic'`** - Anthropic Messages format (separate system field, filtered messages)
- **`'google'`** - Google Gemini format (contents array, generationConfig, systemInstruction)
- **`'mistral'`** - Mistral format (similar to OpenAI)
- **`'together'`**, **`'xai'`**, **`'openrouter'`** - OpenAI-compatible formats

##### Parameter Control

The `parameters` field provides fine-grained control over API request parameters. You can override system defaults, add custom parameters, or exclude parameters entirely.

```yaml
models:
  # Clean parameter overrides (recommended approach)
  - id: 'local:controlled-model'
    url: 'http://localhost:8080/v1/chat/completions'
    modelName: 'custom-model'
    inherit: 'openai'
    parameters:
      max_tokens: 100         # Override system default (usually 1500)
      temperature: 0.9        # Override system default
      stream: null            # Remove stream parameter entirely
      stop: ['END', 'STOP']   # Add custom stop sequences
      custom_param: 'value'   # Add provider-specific parameter
      
  # Using null to exclude unwanted parameters
  - id: 'local:minimal-model'
    url: 'http://localhost:8080/v1/completions'
    modelName: 'minimal-model'
    inherit: 'openai'
    format: 'completions'
    parameters:
      max_tokens: 50
      stream: null            # Exclude stream
      top_p: null            # Exclude top_p
      frequency_penalty: null # Exclude frequency_penalty
```

**Parameter Behavior:**
- **Set values**: Any non-null value overrides the system default
- **`null` values**: Completely remove the parameter from the request
- **Falsy values**: `0`, `false`, `""`, and `undefined` are preserved as valid parameter values
- **Final precedence**: `parameters` field has the highest precedence and will override all system-generated values

##### Parameter Mapping

You can also remap standard parameter names to provider-specific names using `parameterMapping`:

```yaml
models:
  - id: 'custom:mapped-params'
    url: 'https://special-api.com/generate'
    modelName: 'special-model'
    inherit: 'openai'
    parameterMapping:
      temperature: 'heat'          # temperature → heat
      maxTokens: 'token_limit'     # maxTokens → token_limit
      topP: 'nucleus_sampling'     # topP → nucleus_sampling
    parameters:
      heat: 0.9                   # Uses mapped name
      token_limit: 200            # Uses mapped name
      custom_param: 'value'       # Direct parameter
```

##### Reasoning Model Support

Custom models support advanced reasoning parameters:

```yaml
models:
  # OpenAI-style reasoning model
  - id: 'local:reasoning-model'
    url: 'http://localhost:8080/v1/chat/completions'
    modelName: 'o1-local'
    inherit: 'openai'
    # Will handle reasoningEffort parameter as 'reasoning_effort'
    
  # Anthropic-style thinking model
  - id: 'custom:thinking-claude'
    url: 'https://thinking-api.com/v1/messages'
    modelName: 'thinking-claude-3'
    inherit: 'anthropic'
    # Will handle thinkingBudget parameter as 'thinking' object
```

##### Environment Variable Substitution

You can use environment variables in headers and other string fields:

```yaml
models:
  - id: 'private:enterprise-model'
    url: 'https://enterprise-api.com/v1/chat'
    modelName: 'enterprise-gpt'
    inherit: 'openai'
    headers:
      Authorization: 'Bearer ${ENTERPRISE_API_KEY}'
      X-Org-ID: '${ENTERPRISE_ORG_ID}'
```

**Note**: Environment variable substitution is not performed by the blueprint parser itself, but by the runtime environment where the evaluation is executed.

### Prompt Fields

Each item in the list of prompts is an object that can contain the following fields.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | **(Optional)** A unique identifier for the prompt within the blueprint. Useful for tracking a specific prompt's performance over time. **If omitted, a stable ID will be automatically generated by hashing the prompt's content.** |
| `prompt` | `string` | The text of the prompt to be sent to the model for a single-turn conversation. **Required if `messages` is not present.** An alias for the more formal `promptText`. |
| `messages` | `object[]` | An array of message objects for multi-turn conversations. **Required if `prompt` is not present.** Cannot be used with `prompt`. See message formats below. |
| `ideal` | `string` | **(Optional)** A "gold-standard" answer against which model responses can be compared for semantic similarity. An alias for `idealResponse`. |
| `system` | `string` | **(Optional)** A system prompt that overrides the global `system` prompt for this specific prompt only. |
| `citation` / `reference` | `string \| object` | **(Optional)** A citation or reference for the prompt, such as a URL, paper reference, or source documentation. Can be a simple string or an object with `title` (alias: `name`) and `url` fields. Both `citation` and `reference` are accepted as aliases. |
| `should` | `(string \| object)[] \| (string \| object)[][]` | **(Optional)** A list of rubric points for the `llm-coverage` evaluation method. Defines the criteria for a successful response. To define alternative valid paths ("OR" logic), this can be a list of lists. Aliased as `points`, `expect`, `expects`, or `expectations`. See details below. |
| `should_not` | `(string \| object)[] \| (string \| object)[][]` | **(Optional)** A list of rubric points defining criteria that a response **should not** meet. It follows the exact same syntax as the `should` block, including support for a list of lists to create alternative "should not" paths. |
| `weight` | `number` | **(Optional)** Prompt-level importance multiplier used when averaging scores across prompts. Defaults to `1.0`. Valid range: `0.1`–`10`. Aliases: `importance`, `multiplier`. |
| `requiredTools` | `string[]` | **(Optional)** For tool-use scenarios, list of tools that must be called in the emitted trace. |
| `prohibitedTools` | `string[]` | **(Optional)** For tool-use scenarios, tools that must not be called. |
| `maxCalls` | `number` | **(Optional)** Per-prompt cap for tool calls expected in the emitted trace. |
| `render_as` | `string` | **(Optional)** Sets the rendering mode for this specific prompt's output, overriding the global setting. Can be `markdown`, `html`, or `plaintext`. |
| `noCache` | `boolean` | **(Optional)** If `true`, forces a fresh generation for this prompt, overriding the global `--cache` flag. Defaults to `false`. |

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
  # You can also leave an assistant turn as null to generate it during the run:
  - assistant: null
  - user: 'And then what happened?'

## Sequential multi-turn with assistant: null (generated turns)

You can model realistic, multi-turn conversations and have the candidate model generate one or more assistant turns during execution by placing `assistant: null` in the `messages` array. The pipeline will:

- Generate a response at each `assistant: null`, append it to the working history, and continue.
- If the final message is a user message, implicitly generate a final assistant turn (as if there were a trailing `assistant: null`).
- Use the concatenation of all generated assistant turns as the subject text for evaluation (function checks and LLM-judged points).
- Save the full conversation history (original messages plus generated turns) for each prompt×model.

Example:

```yaml
- id: clarify-taxes
  description: The assistant should ask clarifying questions before offering guidance. We evaluate over the aggregated generated content across turns.
  messages:
    - user: I need help with my taxes.
    - assistant: null          # model generates turn 1
    - user: I changed jobs mid-year and moved states.
    - assistant: null          # model generates turn 2
    - user: Anything else I should consider?  # implicit final assistant generation
  should:
    - Asks at least one clarifying question before giving suggestions.
    - $word_count_between: [30, 500]
  should_not:
    - $matches: "(?i)not a (financial|tax) advisor" # example negative check
```

Notes and guarantees:

- Validation allows `assistant: null`. All other roles must have non-empty string content.
- If the last authored assistant message is a string (non-null), that message may be used as the final output if no generation is needed at the end.
- Judges always receive the full transcript with clear markers; UI shows authored nulls as “assistant: null — to be generated” and displays the generated thread where available.
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
      # $js can also return { score, explain } to customise the reflection text.
      - $ref: scoreBand          # Reuse a point defined in point_defs

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

## JSON Blueprint Format

While YAML is recommended, JSON is fully supported. JSON blueprints must be a single object with a top-level `prompts` array. All fields and aliases documented above apply equally to JSON.

### Minimal JSON

```json
{
  "title": "My First Blueprint",
  "models": ["openai:gpt-4o-mini"],
  "prompts": [
    { "id": "p1", "promptText": "What is the capital of France?" },
    { "id": "p2", "promptText": "What is 2 + 2?" }
  ]
}
```

### Rich JSON example (aliases, points, and messages)

```json
{
  "title": "Normalization Test",
  "systemPrompt": "Global system prompt",
  "point_defs": { "scoreBand": "return 1;" },
  "prompts": [
    {
      "id": "p1",
      "messages": [
        { "role": "user", "content": "Hello" },
        { "role": "assistant", "content": "Hi there" }
      ],
      "idealResponse": "Ideal response",
      "points": [
        "A simple conceptual point.",
        { "Covers the 'prudent man' rule.": "Investment Advisers Act of 1940" },
        { "$contains": "fiduciary" },
        { "fn": "ends_with", "fnArgs": "." }
      ],
      "should_not": [ { "$contains": "guarantee" } ],
      "noCache": false
    }
  ]
}
```

### Notes

- JSON must be a single object with a top-level `prompts` array. Streams/lists of documents are YAML-only conveniences.
- Aliases supported: `promptText` → `prompt`, `idealResponse` → `ideal`, `reference`/`citation` (string or object). Point-object aliases: `weight` ↔ `multiplier`, `arg` ↔ `fnArgs`.
- `messages` accepts the same formats as YAML; `assistant: null` is allowed to request generated turns; `ai` is an alias for `assistant`.
- `render_as` and `noCache` are supported globally and per-prompt with the same semantics as YAML.
- Reusable definitions via `point_defs` work the same; reference them inside points with `$ref`.

---

## Tool-Use (Trace-Only) Support

Weval supports evaluating tool-use without executing any tools. Models are instructed to emit a normalized, machine-parseable tool-call trace, which is parsed and scored deterministically.

### How it works

- Declare tools and policy in the blueprint header using `tools` and `toolUse` (see table above). The default and only implemented mode is **trace-only**.
- In your prompt/system message, require the model to output each tool call as a single line prefixed by `TOOL_CALL`, followed by a JSON object with `name` and `arguments`:

```
TOOL_CALL {"name":"<tool>","arguments":{...}}
```

- Weval parses these lines from the assistant content and stores them in the result as `toolCalls` (no execution and no extra turns are performed).

### Minimal example

```yaml
# Header
title: "Tool-Use: Calculator & Retrieval (trace-only)"
models:
  - openai:gpt-4o-mini
tools:
  - name: calculator
    description: "Evaluate arithmetic expressions."
    schema:
      type: object
      properties: { expression: { type: string } }
      required: [expression]
toolUse:
  enabled: true
  mode: trace-only
  maxSteps: 2
  outputFormat: json-line
---
# Prompts
- id: calc-1
  messages:
    - system: |
        Emit each tool call on its own line:
        TOOL_CALL {"name":"<tool>","arguments":{...}}
        Do not output any other text.
    - user: "What is (312*49) - 777?"
  should:
    - $tool_called: "calculator"
    - $tool_args_match: { name: "calculator", where: { expression: "(312*49)-777" } }
    - $tool_call_count_between: [1, 1, "calculator"]
```

### Scoring tool-use

You can use these point functions in `should`/`should_not`:

- `$tool_called(toolName: string)`
- `$tool_args_match({ name: string, where: object|string })` – partial object match or boolean JS expression against `args`
- `$tool_call_count_between([min, max, name?])`
- `$tool_call_order(["toolA","toolB", ...])`

These checks operate on the parsed `toolCalls` trace only; they do not execute tools and are fully deterministic.
