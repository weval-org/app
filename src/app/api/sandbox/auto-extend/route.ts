import { NextRequest, NextResponse } from 'next/server';
import { getModelResponse } from '@/cli/services/llm-service';
import { checkForErrors } from '@/cli/utils/response-utils';
import { parsePromptsFromResponse } from '@/app/sandbox/utils/json-response-parser';
import { generateMinimalBlueprintYaml } from '@/app/sandbox/utils/yaml-generator';
import { WevalConfig } from '@/types/shared';
import { z } from 'zod';
import {
    EXPERT_PREAMBLE,
    JSON_OUTPUT_INSTRUCTION,
    PROMPT_OBJECT_JSON_STRUCTURE,
    AUTO_EXTEND_EXAMPLE,
} from '../utils/prompt-constants';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';

const AutoExtendRequestSchema = z.object({
  existingBlueprintContent: z.string().min(1, 'Existing blueprint content cannot be empty.'),
  guidance: z.string().min(1, 'Guidance cannot be empty.'),
});

const META_PROMPT = `
${EXPERT_PREAMBLE} Your task is to take an existing blueprint and create additional prompts that align with the user's guidance.

**YOUR TASK:**

1.  **Analyze the Existing Blueprint and User Guidance:** Deeply analyze the user's request and the provided blueprint.
2.  **Create New Prompts:** Generate only the NEW prompts that should be added to extend the blueprint. Do NOT include existing prompts.
3.  **CRITICAL RULES:**
    *   **ONLY NEW PROMPTS:** Generate only the additional prompts, not the entire blueprint.
    *   **NEW PROMPT IDs:** For each new prompt, assign a unique 'id' (e.g., 'new-prompt-stoic-relationships').
    *   **SELF-CONTAINED:** Each prompt must be standalone and not refer to external context.
4.  **JSON Structure:** Generate valid JSON representing an array of prompt objects.
5.  **Prompt Object Format:**
${PROMPT_OBJECT_JSON_STRUCTURE}
6.  **Output Format:**
${JSON_OUTPUT_INSTRUCTION}

${AUTO_EXTEND_EXAMPLE}

Now, here is the user's request. Generate only the NEW prompts as a JSON array.
`;

const GENERATOR_MODEL = 'openrouter:google/gemini-2.5-flash-preview-05-20';

export async function POST(req: NextRequest) {
    try {
        const logger = await getLogger('sandbox:auto-extend');
        // HACK: Initialize the CLI config for the web context
        configure({
            logger: {
                info: (msg) => logger.info(msg),
                warn: (msg) => logger.warn(msg),
                error: (msg) => logger.error(msg),
                success: (msg) => logger.info(msg),
            },
            errorHandler: (err) => {
                logger.error(`CLI operation failed: ${err.message}`);
            },
        });

        const parseResult = AutoExtendRequestSchema.safeParse(await req.json());
        if (!parseResult.success) {
            return NextResponse.json({ error: 'Invalid request data.' }, { status: 400 });
        }

        const { existingBlueprintContent, guidance } = parseResult.data;
        
        const fullPrompt = `Here is the existing blueprint:\n\n\`\`\`yaml\n${existingBlueprintContent}\n\`\`\`\n\nHere is the guidance on how to extend it (guidance may be empty): "<GUIDANCE>${guidance}</GUIDANCE>"`;

        console.log('Full prompt:', fullPrompt);

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

        const promptsParseResult = await parsePromptsFromResponse(generatedYaml);

        if (promptsParseResult.validationError) {
            return NextResponse.json({ 
                yaml: existingBlueprintContent, 
                sanitized: promptsParseResult.sanitized,
                validationError: promptsParseResult.validationError
            });
        }

        // Parse the existing YAML to get the current config
        let existingConfig: WevalConfig;
        try {
            const yaml = await import('js-yaml');
            const parsed = yaml.load(existingBlueprintContent) as any;
            
            // Handle different YAML formats (header + prompts vs just prompts)
            if (Array.isArray(parsed)) {
                existingConfig = { prompts: parsed, models: [] };
            } else {
                existingConfig = parsed;
                if (!existingConfig.prompts) {
                    existingConfig.prompts = [];
                }
            }
        } catch (error: any) {
            return NextResponse.json({ 
                error: `Failed to parse existing blueprint: ${error.message}` 
            }, { status: 400 });
        }

        // Add the new prompts to the existing config
        const newPrompts = promptsParseResult.data.map(prompt => ({
            id: prompt.id,
            promptText: prompt.promptText,
            idealResponse: prompt.idealResponse || null,
            points: prompt.points || [],
        }));

        existingConfig.prompts.push(...newPrompts);

        // Generate the extended YAML
        const extendedYaml = generateMinimalBlueprintYaml(existingConfig);

        return NextResponse.json({ 
            yaml: extendedYaml, 
            sanitized: promptsParseResult.sanitized,
            validationError: null
        });

    } catch (error: any) {
        console.error('[Auto-Extend Error]', error);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
} 