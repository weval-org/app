import { NextRequest, NextResponse } from 'next/server';
import * as yaml from 'js-yaml';
import { getModelResponse } from '@/cli/services/llm-service';
import { checkForErrors } from '@/cli/utils/response-utils';
import { z } from 'zod';

const AutoExtendRequestSchema = z.object({
  existingBlueprintContent: z.string().min(1, 'Existing blueprint content cannot be empty.'),
  guidance: z.string().min(1, 'Guidance cannot be empty.'),
});

const META_PROMPT = `
You are an expert in AI evaluation and a master of the Weval blueprint format. Your task is to take an existing blueprint and extend it based on user guidance.

**YOUR TASK:**

1.  **Analyze the Existing Blueprint and User Guidance:** Deeply analyze the user's request and the provided YAML blueprint.
2.  **Extend the Blueprint:** You can extend the blueprint in two ways:
    *   **Add New Prompts:** Create entirely new, self-contained prompts that align with the user's guidance and complement the existing prompts.
    *   **Add New Criteria to Existing Prompts:** Add new, specific, and self-contained 'should' or 'should_not' criteria to the existing prompts to make them more robust.
3.  **CRITICAL RULES FOR MODIFICATION:**
    *   **ADDITIVE ONLY:** You MUST NOT delete or modify any existing prompts, points, or other properties. Only add new ones.
    *   **PRESERVE IDs:** DO NOT change the 'id' of existing prompts.
    *   **NEW PROMPT IDs:** For any new prompts you create, assign a new, unique 'id' (e.g., 'new-prompt-123').
4.  **Generate the YAML:** Output a SINGLE, complete YAML document containing the entire updated blueprint.
5.  **Format and Quoting (CRITICAL):**
    *   The entire output must be a single, valid YAML document.
    *   **You MUST enclose all string values in double quotes ("").**
    *   For multi-line strings (like in a 'prompt'), use the YAML literal block scalar \`|\`.
    *   You MUST wrap your entire YAML output within \`<YAML>\` and \`</YAML>\` tags. DO NOT use markdown code fences (\`\`\`).

**EXAMPLE OF EXTENDING:**

**User Guidance:** "Add a test for how Stoicism applies to personal relationships."

**Your Output (showing only new additions for brevity, but you must return the full file):**
<YAML>
title: "Introduction to Stoic Philosophy"
description: "Tests a model's ability to explain the core tenets of Stoicism and their application in modern life."
# ... (all existing prompts remain unchanged) ...
---
# ... (existing prompts) ...
- prompt: "How would a Stoic approach a disagreement with a romantic partner?"
  id: "stoic-relationships-disagreement"
  should:
    - "Mentions focusing on one's own responses and communication, which are in one's control."
    - "Suggests using the virtue of justice to understand the partner's perspective fairly."
  should_not:
    - "Advocates for suppressing emotions or avoiding the conversation."
</YAML>

Now, here is the user's request. Generate the complete, extended YAML blueprint strictly following all rules.
`;

const GENERATOR_MODEL = 'openrouter:google/gemini-2.5-flash-preview-05-20';

export async function POST(req: NextRequest) {
    try {
        const parseResult = AutoExtendRequestSchema.safeParse(await req.json());
        if (!parseResult.success) {
            return NextResponse.json({ error: 'Invalid request data.' }, { status: 400 });
        }

        const { existingBlueprintContent, guidance } = parseResult.data;
        
        const fullPrompt = `Here is the existing blueprint:\n\n\`\`\`yaml\n${existingBlueprintContent}\n\`\`\`\n\nHere is the guidance on how to extend it: "<GUIDANCE>"${guidance}"</GUIDANCE>`;

        const generatedYaml = await getModelResponse({
            modelId: GENERATOR_MODEL,
            messages: [{ role: 'user', content: fullPrompt }],
            systemPrompt: META_PROMPT,
            temperature: 0.2,
            useCache: false,
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
        let validationError: string | null = null;

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
                        yaml.loadAll(sanitizedYaml);
                        wasSanitized = true;
                        finalYaml = sanitizedYaml;
                    } catch (e2: any) {
                        validationError = `YAML validation failed: ${e.message}. Auto-sanitization also failed: ${e2.message}`;
                    }
                } else {
                    validationError = `YAML validation failed: ${e.message}`;
                }
            } else {
                validationError = `YAML validation failed: ${e.message}`;
            }
        }

        return NextResponse.json({ 
            yaml: finalYaml, 
            sanitized: wasSanitized,
            validationError: validationError
        });

    } catch (error: any) {
        console.error('[Auto-Extend Error]', error);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
} 