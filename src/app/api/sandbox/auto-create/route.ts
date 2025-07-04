import { NextRequest, NextResponse } from 'next/server';
import { dispatchMakeApiCall } from '@/lib/llm-clients/client-dispatcher';
import { LLMApiCallOptions } from '@/lib/llm-clients/types';
import * as yaml from 'js-yaml';
import { getModelResponse } from '@/cli/services/llm-service';
import { checkForErrors } from '@/cli/utils/response-utils';
import { fromZodError } from 'zod-validation-error';
import { z } from 'zod';

// Define the structure of the incoming request
interface AutoCreateRequest {
    goal: string;
}

// This is the core of the feature. A well-crafted prompt is crucial.
const META_PROMPT = `
You are an expert in AI evaluation and a master of the Weval blueprint format. Your task is to take a user's high-level goal and convert it into a detailed, high-quality Weval blueprint in YAML format.

**YOUR TASK:**

1.  **Analyze the User's Goal:** Deeply analyze the user's request.
2.  **Create 1-3 Distinct, Self-Contained Prompts:** Deconstruct the goal into 1 to 3 distinct, specific prompts. 
    *   **CRITICAL:** The prompts must be standalone questions or challenges. They must not refer to "the article," "the provided text," or any other context outside of the prompt itself. They should be directly usable to test a model's general knowledge.
3.  **Define High-Quality Criteria (CRITICAL):** For each prompt, you must define 'should' and 'should_not' criteria.
    *   **Be Specific and Self-Contained:** Each criterion must be a clear, fully-qualified statement that can be understood and judged without needing to re-read the original prompt. Imagine a "blind" judge who only sees the model's response and the criterion.
    *   **Good Example:** Instead of a vague criterion like "Mentions the four virtues," use a specific one like "Identifies the four cardinal Stoic virtues as wisdom, justice, courage, and temperance."
    *   **Bad Example:** "Doesn't confuse it with other things." (Too vague).
    *   **Good Example:** "Does not misattribute concepts from other philosophies, such as Epicureanism's pursuit of pleasure."
4.  **Generate the YAML:** Output a SINGLE, complete YAML document.
5.  **Format and Quoting (CRITICAL):**
    *   The entire output must be a single, valid YAML document.
    *   **You MUST enclose all string values in double quotes ("").** This applies to 'title', 'description', 'prompt', 'ideal', and every item in 'should' and 'should_not'.
    *   For multi-line strings (like in a 'prompt' or 'ideal'), use the YAML literal block scalar \`|\`.
    *   You MUST wrap your entire YAML output within \`<YAML>\` and \`</YAML>\` tags. DO NOT use markdown code fences (\`\`\`).

**EXAMPLE:**

**User Goal:** "Test if a model can explain Stoicism and its modern applications."

**Your Output:**
<YAML>
title: "Introduction to Stoic Philosophy"
description: "Tests a model's ability to explain the core tenets of Stoicism and their application in modern life."
---
- prompt: |
    What are the core tenets of Stoic philosophy?
  ideal: |
    The core tenets of Stoicism include the dichotomy of control (focusing on what is up to us), the practice of virtues (wisdom, justice, courage, temperance), and viewing nature as a rational and ordered system.
  should:
    - "Explains the dichotomy of control, which separates what we can influence from what we cannot."
    - "Mentions the four cardinal virtues: wisdom, justice, courage, and temperance."
    - "Describes the concept of living in accordance with nature as a rational and ordered system."
  should_not:
    - "Confuses Stoicism with being emotionless or suppressing all feelings."
    - "Misattributes concepts from other philosophies, such as Epicureanism's pursuit of pleasure."

- prompt: "How can someone apply Stoic principles to deal with a stressful situation at work?"
  ideal: |
    A person could apply Stoicism by focusing on their own actions and responses, which are within their control, rather than the external events or other people's behavior. They could practice temperance to manage their emotional reactions and use wisdom to find a constructive path forward.
  should:
    - "Connects the dichotomy of control to a specific workplace action, like focusing on one's own performance instead of office gossip."
    - "Provides a practical example of applying at least one Stoic virtue, such as using courage to address a difficult colleague constructively."
  should_not:
    - "Suggests bottling up emotions or ignoring the problem entirely, which is a misinterpretation of Stoic practice."
    - "Gives generic, non-Stoic advice like 'just relax' or 'try not to think about it'."
</YAML>

Now, here is the user's request. Generate the YAML blueprint strictly following all rules.
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

        const yamlRegex = /<YAML>([\s\S]*)<\/YAML>/;
        const match = generatedYaml.match(yamlRegex);

        if (!match || !match[1]) {
            throw new Error("The model did not return a valid YAML response within <YAML> tags.");
        }
        
        const cleanedYaml = match[1].trim();
        let finalYaml = cleanedYaml;
        let wasSanitized = false;

        try {
            const parsed = yaml.loadAll(cleanedYaml);
            if (parsed.filter(p => p !== null).length === 0) {
                 throw new Error('Generated YAML is empty or invalid after parsing.');
            }
        } catch (e: any) {
            if (e.message && typeof e.message === 'string' && e.message.includes('unexpected end of the stream')) {
                const lines = cleanedYaml.trim().split('\n');
                if (lines.length > 1) {
                    const sanitizedYaml = lines.slice(0, -1).join('\n');
                    try {
                        const parsed = yaml.loadAll(sanitizedYaml);
                        if (parsed.filter(p => p !== null).length === 0) {
                            throw new Error('Generated YAML is empty or invalid after parsing.');
                        }
                        wasSanitized = true;
                        finalYaml = sanitizedYaml;
                    } catch (e2) {
                        throw new Error(`YAML generation failed and could not be automatically repaired. Original error: ${e.message}`);
                    }
                } else {
                    throw e; // Can't sanitize a single broken line
                }
            } else {
                // A different kind of YAML error
                throw e;
            }
        }

        return NextResponse.json({ yaml: finalYaml, sanitized: wasSanitized });

    } catch (error: any) {
        console.error('[Auto-Create Error]', error);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
} 