import { NextRequest, NextResponse } from 'next/server';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';
import { CREATOR_SYSTEM_PROMPT } from '../utils/prompt-constants';
import { parseWevalConfigFromResponse } from '@/app/sandbox/utils/json-response-parser';
import { resilientLLMCall, validateStoryResponse } from '../utils/llm-resilience';
import { z } from 'zod';

const createRequestSchema = z.object({
  summary: z.string().min(10, 'Summary must be at least 10 characters long.'),
});

export async function POST(req: NextRequest) {
    const logger = await getLogger('story:create');
    configure({
        logger: {
            info: (m) => logger.info(m),
            warn: (m) => logger.warn(m),
            error: (m) => logger.error(m),
            success: (m) => logger.info(m),
        },
        errorHandler: (err) => logger.error(`[story:create] error: ${err?.message || err}`),
    });

    try {
        const body = await req.json();
        const validationResult = createRequestSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid request: summary is required.' }, { status: 400 });
        }
        
        const { summary } = validationResult.data;

        const creatorMessages = [
            { role: 'user' as const, content: JSON.stringify({ summary }) }
        ];

        logger.info(`[story:create][payload] summary.len=${summary.length}`);

        const raw = await resilientLLMCall({
            messages: creatorMessages,
            systemPrompt: CREATOR_SYSTEM_PROMPT,
            temperature: 0.0,
            useCache: false,
            maxRetries: 2,
            backoffMs: 1500,
        });

        if (!validateStoryResponse(raw, 'json')) {
            logger.warn(`[story:create][diag] invalid_format_response len=${(raw || '').length}`);
            throw new Error('The model did not return valid JSON format.');
        }

        const parsed = await parseWevalConfigFromResponse(raw);
        if (parsed.validationError) {
            logger.warn(`[story:create][diag] validation_error: ${parsed.validationError}`);
        }

        return NextResponse.json({
            data: parsed.data,
            yaml: parsed.yaml,
            sanitized: parsed.sanitized,
            validationError: parsed.validationError,
        });
    } catch (err: any) {
        logger.error(`[story:create] failed: ${err?.message || err}`);
        return NextResponse.json({ error: 'Failed to create evaluation.' }, { status: 500 });
    }
}


