// Shared instructions for LLMs generating Weval blueprints.

export const EXPERT_PREAMBLE = `You are an expert in AI evaluation and a master of the Weval blueprint format.`;

export const SELF_CONTAINED_PROMPTS_INSTRUCTION = `
*   **CRITICAL:** The prompts must be standalone questions or challenges. They must not refer to "the article," "the provided text," or any other context outside of the prompt itself. They should be directly usable to test a model's general knowledge.
*   **Bad Example:** "According to the article, why did the company fail?"
*   **Good Example:** "What were the primary reasons for the failure of the company 'Global MegaCorp' in 2023, and what role did its CEO play?"`;


export const CRITERIA_QUALITY_INSTRUCTION = `
*   **Be Specific and Self-Contained:** Each criterion must be a clear, fully-qualified statement that can be understood and judged without needing to re-read the original prompt. Imagine a "blind" judge who only sees the model's response and the criterion.
*   **Alternative Paths (OR logic):** If there are multiple distinct, valid ways to answer a prompt, use a nested array for the \`points\` field. Each inner array represents a complete "alternative path." A response is considered fully correct if it satisfies all criteria in at least ONE of the paths. This is useful for questions with no single right answer, like matters of opinion, strategy, or topics with multiple valid interpretations.
*   **Include Both Positive and Negative Criteria:** Use positive statements to describe both what responses should include AND what they should avoid. For negative criteria, phrase them as "does not..." or "avoids..." statements.
*   **Good Example (Simple):** Instead of a vague criterion like "Mentions the four virtues," use a specific one like "Identifies the four cardinal Stoic virtues as wisdom, justice, courage, and temperance."
*   **Good Example (Negative):** "Does not misattribute concepts from other philosophies, such as Epicureanism's pursuit of pleasure."`;

export const JSON_OUTPUT_INSTRUCTION = `
*   You MUST wrap your JSON output within \`<JSON>\` and \`</JSON>\` tags.
*   Do NOT use markdown code fences.`;

export const FULL_BLUEPRINT_JSON_STRUCTURE = `
*   \`title\`: string - blueprint title
*   \`description\`: string - blueprint description  
*   \`systems\`: array of strings (optional) - multiple system prompt variants to test. Each variant will be evaluated separately, allowing comparison of how different system prompts affect model performance
*   \`models\`: array of strings - can be empty []
*   \`prompts\`: array of prompt objects with:
    - \`id\`: unique identifier string
    - \`promptText\`: the actual prompt/question string
    - \`idealResponse\`: optional ideal response string
    - \`points\`: array of strings for simple rubrics, OR an array of arrays of strings for rubrics with alternative paths.`;

export const PROMPT_OBJECT_JSON_STRUCTURE = `
*   \`id\`: unique identifier string
*   \`promptText\`: the actual prompt/question string
*   \`idealResponse\`: optional ideal response string
*   \`points\`: array of "should" criteria (strings), or an array of arrays for alternative paths. Include both positive requirements and negative requirements phrased as "does not..." or "avoids..." statements.`;

export const AUTO_CREATE_EXAMPLE = `
**EXAMPLE:**

**User Goal:** "Test a model's ability to explain technical concepts simply, and also to provide good recipes while handling ambiguity."

**Your Output:**
<JSON>
{
  "title": "Concept Explanation and Recipe Generation",
  "description": "Tests a model's ability to explain concepts and to provide recipes directly or ask clarifying questions.",
  "systems": [
    "You are a helpful assistant. Provide clear, concise responses that are accessible to a general audience.",
    "You are an expert educator. Break down complex topics into simple, understandable explanations suitable for beginners."
  ],
  "models": [],
  "prompts": [
    {
      "id": "stoic-core-tenets",
      "promptText": "What are the core tenets of Stoic philosophy?",
      "idealResponse": "The core tenets of Stoicism include the dichotomy of control, the practice of virtues, and viewing nature as a rational system.",
      "points": [
        "Explains the dichotomy of control (what we can/cannot control)",
        "Mentions the four cardinal virtues: wisdom, justice, courage, and temperance",
        "Does not confuse Stoicism with being emotionless"
      ]
    },
    {
      "id": "pancake-recipe-request",
      "promptText": "What is a good recipe for pancakes?",
      "points": [
        [
            "Contains a list of ingredients that includes eggs, flour, and milk",
            "Provides specific measurements for ingredients (e.g., '1 cup of flour', '2 eggs')",
            "Offers at least one common dietary variant (e.g., gluten-free, vegan)"
        ],
        [
            "Asks the user for more information to tailor the recipe, such as what kind of pancakes they prefer (e.g., American, crepes)",
            "Mentions that different types of pancakes exist",
            "Asks about any dietary requirements or preferences"
        ]
      ]
    }
  ]
}
</JSON>

Note: This example includes 'systems' because the user's goal involves testing "simple explanations" - comparing how different educational approaches (general assistant vs expert educator) affect the clarity of explanations. For most blueprints, you should omit the 'systems' field entirely.
`;

export const AUTO_EXTEND_EXAMPLE = `
**EXAMPLE:**

**User Guidance:** "Add a test for providing recipes that handles ambiguity well."

**Your Output:**
<JSON>
[
  {
    "id": "pancake-recipe-request",
    "promptText": "What is a good recipe for pancakes?",
    "points": [
      [
        "Contains a list of ingredients that includes eggs, flour, and milk",
        "Provides specific measurements for ingredients (e.g., '1 cup of flour', '2 eggs')",
        "Offers at least one common dietary variant (e.g., gluten-free, vegan)"
      ],
      [
        "Asks the user for more information to tailor the recipe, such as what kind of pancakes they prefer (e.g., American, crepes)",
        "Mentions that different types of pancakes exist",
        "Asks about any dietary requirements or preferences"
      ]
    ]
  }
]
</JSON>
`;
