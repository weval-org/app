import { NextRequest, NextResponse } from 'next/server';
import { dispatchMakeApiCall } from '@/lib/llm-clients/client-dispatcher';
import { LLMApiCallOptions } from '@/lib/llm-clients/types';
import * as yaml from 'js-yaml';

// Define the structure of the incoming request
interface AutoCreateRequest {
    goal: string;
}

// This is the core of the feature. A well-crafted prompt is crucial.
const META_PROMPT = `
You are an expert in AI evaluation and a master of the Weval blueprint format. Your task is to take a user's high-level goal and convert it into a detailed, high-quality Weval blueprint in YAML format.

**WEVAL BLUEPRINT YAML STRUCTURE:**

The blueprint has two parts separated by \`---\`:
1.  **Header:** A configuration object containing the blueprint's title and description.
2.  **Prompts:** A list of prompt objects.

**HEADER FIELDS:**
- \`title\`: (Required) A human-readable title for the blueprint.
- \`description\`: (Required) A one or two-sentence description of what the blueprint tests.

**PROMPT FIELDS:**
Each prompt in the list is an object with:
- \`prompt\`: (Required) The specific instruction or question for the model. For multi-line prompts, use the YAML literal block scalar \`|\`.
- \`ideal\`: (Optional) A "gold-standard" answer to compare against. Also use \`|\` for multi-line content.
- \`should\`: (Required) A list of rubric items. These are conceptual checks for what a good response MUST contain.
- \`should_not\`: (Optional) A list of rubric items for what a good response MUST NOT contain.

**YOUR TASK:**

1.  **Understand the User's Goal:** Deeply analyze the user's request.
2.  **Deconstruct into Prompts:** Break down the goal into 1-3 distinct, specific prompts. A good blueprint tests a concept from multiple angles.
3.  **Create High-Quality Rubrics:** For each prompt, define clear, conceptual \`should\` and \`should_not\` criteria. This is the most important part. Good rubrics test for reasoning, nuance, and safety, not just keyword matching.
4.  **Generate the YAML:** Output a SINGLE, complete YAML code block.
5.  **Formatting Rules:**
    - Use double quotes for all strings where necessary.
    - Use the literal block scalar \`|\` for any multi-line strings, especially for \`prompt\` and \`ideal\`.
    - **CRITICAL:** You MUST wrap your entire YAML output within \`<YAML>\` and \`</YAML>\` tags.

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
    - "Explains the dichotomy of control"
    - "Mentions the four cardinal virtues"
    - "Describes the concept of living in accordance with nature"
  should_not:
    - "Confuses Stoicism with being emotionless"
    - "Misattributes concepts from other philosophies like Epicureanism"

- prompt: "How can someone apply Stoic principles to deal with a stressful situation at work?"
  ideal: |
    A person could apply Stoicism by focusing on their own actions and responses, which are within their control, rather than the external events or other people's behavior. They could practice temperance to manage their emotional reactions and use wisdom to find a constructive path forward.
  should:
    - "Connects the dichotomy of control to a specific workplace action"
    - "Provides a practical example of applying at least one Stoic virtue"
    - "Emphasizes internal response over external events"
  should_not:
    - "Suggests bottling up emotions or ignoring the problem entirely"
    - "Gives generic, non-Stoic advice like 'just relax'"
</YAML>

Now, here is the user's request. Generate the YAML blueprint strictly following all rules.
`;


export async function POST(req: NextRequest) {
    try {
        const { goal } = (await req.json()) as AutoCreateRequest;

        if (!goal || typeof goal !== 'string' || goal.trim() === '') {
            return NextResponse.json({ error: 'Goal is required.' }, { status: 400 });
        }
        
        // Use a powerful model for this task
        const modelId = 'openrouter:google/gemini-2.5-flash-preview-05-20'; 

        const clientOptions: Omit<LLMApiCallOptions, 'modelName'> & { modelId: string } = {
            modelId: modelId,
            messages: [{ role: 'user', content: goal }],
            systemPrompt: META_PROMPT,
            maxTokens: 4000, // Allow for a detailed blueprint
            temperature: 0.2, // Low temperature for more predictable, structured output
        };

        const response = await dispatchMakeApiCall(clientOptions);

        if (response.error) {
            console.error(`[Auto-Create API] LLM Error: ${response.error}`);
            return NextResponse.json({ error: `LLM Error: ${response.error}` }, { status: 500 });
        }
        
        let yamlContent = response.responseText;

        // The LLM should return YAML inside <YAML> tags. We need to extract it.
        const yamlRegex = /<YAML>([\s\S]*?)<\/YAML>/;
        const match = yamlContent.match(yamlRegex);

        if (match && match[1]) {
            yamlContent = match[1].trim();
        } else {
            // If no tags are found, this is an issue with the LLM not following instructions.
            // Be defensive and try to parse the whole response, but warn about it.
            console.warn("[Auto-Create API] LLM response did not contain <YAML> tags. This indicates a prompt-following issue. Attempting to parse the whole response as a fallback.");
        }

        // Validate the generated YAML
        try {
            // Use loadAll to correctly handle multi-document YAML (header + prompts)
            yaml.loadAll(yamlContent);
        } catch (e: any) {
            console.error(`[Auto-Create API] Generated content is not valid YAML. Error: ${e.message}`);
            console.error(`[Auto-Create API] Invalid YAML content: \n${yamlContent}`);
            return NextResponse.json({ error: 'The AI returned invalid YAML. Please try again or rephrase your goal.' }, { status: 500 });
        }

        return NextResponse.json({ yaml: yamlContent });

    } catch (error: any) {
        console.error(`[Auto-Create API] Top-level error: ${error.message}`);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
} 