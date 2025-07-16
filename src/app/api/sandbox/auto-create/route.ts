import { NextRequest, NextResponse } from 'next/server';
import { LLMApiCallOptions } from '@/lib/llm-clients/types';
import { getModelResponse } from '@/cli/services/llm-service';
import { checkForErrors } from '@/cli/utils/response-utils';
import { parseWevalConfigFromResponse } from '@/app/sandbox/utils/json-response-parser';
import { fromZodError } from 'zod-validation-error';
import { z } from 'zod';
import {
    EXPERT_PREAMBLE,
    CRITERIA_QUALITY_INSTRUCTION,
    JSON_OUTPUT_INSTRUCTION,
    FULL_BLUEPRINT_JSON_STRUCTURE,
    SELF_CONTAINED_PROMPTS_INSTRUCTION,
    AUTO_CREATE_EXAMPLE
} from '../utils/prompt-constants';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';

// Define the structure of the incoming request
interface AutoCreateRequest {
    goal: string;
}

// This is the core of the feature. A well-crafted prompt is crucial.
const META_PROMPT = `
${EXPERT_PREAMBLE} Your task is to take a user's high-level goal and convert it into a detailed, high-quality Weval blueprint structure.

**YOUR TASK:**

1.  **Analyze the User's Goal:** Deeply analyze the user's request.
2.  **Create 1-3 Distinct, Self-Contained Prompts:** Deconstruct the goal into 1 to 3 distinct, specific prompts. 
    *   **CRITICAL:** The prompts must be standalone questions or challenges. They must not refer to "the article," "the provided text," or any other context outside of the prompt itself. They should be directly usable to test a model's general knowledge.
3.  **Define High-Quality Criteria (CRITICAL):** For each prompt, you must define 'points' criteria.
${CRITERIA_QUALITY_INSTRUCTION}
4.  **Generate JSON Structure:** Output a complete blueprint configuration as JSON.
5.  **JSON Structure Format:**
${FULL_BLUEPRINT_JSON_STRUCTURE}
6.  **Output Format:**
${JSON_OUTPUT_INSTRUCTION}

${AUTO_CREATE_EXAMPLE}

Now, here is the user's request. Generate the complete blueprint structure as JSON strictly following all rules.
`;

const GENERATOR_MODEL = 'openrouter:google/gemini-2.5-flash';

const autoCreateSchema = z.object({
    goal: z.string().min(1, 'Goal is required'),
});

export async function POST(req: NextRequest) {
    try {
        const logger = await getLogger('sandbox:auto-create');
        // HACK: Initialize the CLI config for the web context
        configure({
            logger: {
                info: (msg) => logger.info(msg),
                warn: (msg) => logger.warn(msg),
                error: (msg) => logger.error(msg),
                success: (msg) => logger.info(msg), // Route success to info
            },
            errorHandler: (err) => {
                logger.error(`CLI operation failed: ${err.message}`);
                // In a web context, we might not want to exit the process
            },
        });

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