import { NextRequest, NextResponse } from 'next/server';
import { dispatchMakeApiCall } from '@/lib/llm-clients/client-dispatcher';
import { LLMApiCallOptions } from '@/lib/llm-clients/types';
import { getModelResponse } from '@/cli/services/llm-service';
import { checkForErrors } from '@/cli/utils/response-utils';
import { parseWevalConfigFromResponse } from '@/app/sandbox/utils/json-response-parser';
import { fromZodError } from 'zod-validation-error';
import { z } from 'zod';

// Define the structure of the incoming request
interface AutoCreateRequest {
    goal: string;
}

// This is the core of the feature. A well-crafted prompt is crucial.
const META_PROMPT = `
You are an expert in AI evaluation and a master of the Weval blueprint format. Your task is to take a user's high-level goal and convert it into a detailed, high-quality Weval blueprint structure.

**YOUR TASK:**

1.  **Analyze the User's Goal:** Deeply analyze the user's request.
2.  **Create 1-3 Distinct, Self-Contained Prompts:** Deconstruct the goal into 1 to 3 distinct, specific prompts. 
    *   **CRITICAL:** The prompts must be standalone questions or challenges. They must not refer to "the article," "the provided text," or any other context outside of the prompt itself. They should be directly usable to test a model's general knowledge.
3.  **Define High-Quality Criteria (CRITICAL):** For each prompt, you must define 'points' criteria.
    *   **Be Specific and Self-Contained:** Each criterion must be a clear, fully-qualified statement that can be understood and judged without needing to re-read the original prompt. Imagine a "blind" judge who only sees the model's response and the criterion.
    *   **Include Both Positive and Negative Criteria:** Use positive statements to describe both what responses should include AND what they should avoid. For negative criteria, phrase them as "does not..." or "avoids..." statements.
    *   **Good Example:** Instead of a vague criterion like "Mentions the four virtues," use a specific one like "Identifies the four cardinal Stoic virtues as wisdom, justice, courage, and temperance."
    *   **Good Example (Negative):** "Does not misattribute concepts from other philosophies, such as Epicureanism's pursuit of pleasure."
4.  **Generate JSON Structure:** Output a complete blueprint configuration as JSON.
5.  **JSON Structure Format:**
    *   \`title\`: string - blueprint title
    *   \`description\`: string - blueprint description  
    *   \`models\`: array of strings - can be empty []
    *   \`prompts\`: array of prompt objects with:
        - \`id\`: unique identifier string
        - \`promptText\`: the actual prompt/question string
        - \`idealResponse\`: optional ideal response string
        - \`points\`: array of criteria (strings)
6.  **Output Format:**
    *   You MUST wrap your JSON output within \`<JSON>\` and \`</JSON>\` tags.
    *   Do NOT use markdown code fences.

**EXAMPLE:**

**User Goal:** "Test if a model can explain Stoicism and its modern applications."

**Your Output:**
<JSON>
{
  "title": "Introduction to Stoic Philosophy",
  "description": "Tests a model's ability to explain the core tenets of Stoicism and their application in modern life.",
  "models": [],
  "prompts": [
    {
      "id": "stoic-core-tenets",
      "promptText": "What are the core tenets of Stoic philosophy?",
      "idealResponse": "The core tenets of Stoicism include the dichotomy of control (focusing on what is up to us), the practice of virtues (wisdom, justice, courage, temperance), and viewing nature as a rational and ordered system.",
      "points": [
        "Explains the dichotomy of control, which separates what we can influence from what we cannot",
        "Mentions the four cardinal virtues: wisdom, justice, courage, and temperance",
        "Describes the concept of living in accordance with nature as a rational and ordered system",
        "Does not confuse Stoicism with being emotionless or suppressing all feelings",
        "Does not misattribute concepts from other philosophies, such as Epicureanism's pursuit of pleasure"
      ]
    },
    {
      "id": "stoic-workplace-application", 
      "promptText": "How can someone apply Stoic principles to deal with a stressful situation at work?",
      "idealResponse": "A person could apply Stoicism by focusing on their own actions and responses, which are within their control, rather than the external events or other people's behavior. They could practice temperance to manage their emotional reactions and use wisdom to find a constructive path forward.",
      "points": [
        "Connects the dichotomy of control to a specific workplace action, like focusing on one's own performance instead of office gossip",
        "Provides a practical example of applying at least one Stoic virtue, such as using courage to address a difficult colleague constructively",
        "Does not suggest bottling up emotions or ignoring the problem entirely, which is a misinterpretation of Stoic practice",
        "Avoids giving generic, non-Stoic advice like 'just relax' or 'try not to think about it'"
      ]
    }
  ]
}
</JSON>

Now, here is the user's request. Generate the complete blueprint structure as JSON strictly following all rules.
`;

const GENERATOR_MODEL = 'openrouter:google/gemini-2.5-flash-preview-05-20';

const autoCreateSchema = z.object({
    goal: z.string().min(1, 'Goal is required'),
});

export async function POST(req: NextRequest) {
    try {
        const { goal } = (await req.json()) as AutoCreateRequest;

        if (!goal || typeof goal !== 'string' || goal.trim() === '') {
            return NextResponse.json({ error: 'Goal is required.' }, { status: 400 });
        }
        
        const generatedYaml = await getModelResponse({
            modelId: GENERATOR_MODEL,
            messages: [{ role: 'user', content: goal }],
            systemPrompt: META_PROMPT,
            temperature: 0.2,
            useCache: false, // Always generate fresh for this feature
        });

        if (checkForErrors(generatedYaml)) {
            throw new Error(`The YAML generation model returned an error: ${generatedYaml}`);
        }

        const configParseResult = await parseWevalConfigFromResponse(generatedYaml);

        return NextResponse.json({ 
            yaml: configParseResult.yaml, 
            sanitized: configParseResult.sanitized,
            validationError: configParseResult.validationError
        });

    } catch (error: any) {
        console.error('[Auto-Create Error]', error);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
} 