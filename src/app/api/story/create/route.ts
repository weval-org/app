import { NextRequest, NextResponse } from 'next/server';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';
import { CREATOR_SYSTEM_PROMPT } from '../utils/prompt-constants';
import { ConversationMessage } from '@/types/shared';
import { parseWevalConfigFromResponse } from '@/app/sandbox/utils/json-response-parser';
import { resilientLLMCall, validateStoryResponse } from '../utils/llm-resilience';

type CreateRequestBody = {
    messages: ConversationMessage[];
};

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
        const body = (await req.json()) as CreateRequestBody;
        const messages = Array.isArray(body?.messages) ? body.messages : [];
        if (messages.length === 0) {
            return NextResponse.json({ error: 'messages[] is required' }, { status: 400 });
        }

        // Keep a moderate context; the creator needs enough detail
        const trimmed = messages.slice(-20).map(m => ({ role: m.role, content: m.content ?? '' }));
        // IMPORTANT: The creator should only see user-provided context, not the orchestrator's assistant prompts.
        const creatorMessages = trimmed.filter(m => m.role === 'user');

        // Log the payload we are about to send to the creator LLM
        try {
            logger.info(`[story:create][payload] about to request creator model`);
            logger.info(`[story:create][payload] systemPrompt.len=${CREATOR_SYSTEM_PROMPT.length} temp=0.0 retries=2 useCache=false`);
            logger.info(`[story:create][payload] messages.len=${trimmed.length} (creator_user_only.len=${creatorMessages.length})`);
            trimmed.forEach((m, idx) => {
                const content = m.content ?? '';
                const head = content.slice(0, 200).replace(/\n/g, '\\n');
                logger.info(`[story:create][payload] m${idx} role=${m.role} len=${content.length} head=${head}`);
            });
            creatorMessages.forEach((m, idx) => {
                const content = m.content ?? '';
                const head = content.slice(0, 200).replace(/\n/g, '\\n');
                logger.info(`[story:create][payload] creator.m${idx} role=${m.role} len=${content.length} head=${head}`);
            });
        } catch {}

        const raw = await resilientLLMCall({
            messages: creatorMessages,
            systemPrompt: CREATOR_SYSTEM_PROMPT,
            temperature: 0.0,
            useCache: false,
            maxRetries: 2,
            backoffMs: 1500,
        });

        const logDiagnostics = (label: string, text: string) => {
            try {
                const snippet = text?.slice(0, 1200) || '';
                const hasJsonTag = /<JSON>[\s\S]*?<\/JSON>/i.test(text || '');
                const hasCodeFence = /```/.test(text || '');
                const length = (text || '').length;
                logger.warn(`[story:create][diag] ${label}: len=${length}, hasJsonTag=${hasJsonTag}, hasCodeFence=${hasCodeFence}`);
                logger.warn(`[story:create][diag] ${label}: first_1200=\n${snippet}`);
            } catch {}
        };

        if (!validateStoryResponse(raw, 'json')) {
            logDiagnostics('invalid_format_response', raw || '');
            throw new Error('The model did not return valid JSON format.');
        }

        let parsed;
        try {
            parsed = await parseWevalConfigFromResponse(raw);
        } catch (e) {
            logDiagnostics('parse_exception_primary', raw || '');
            // One more attempt: explicitly request re-emission of JSON only
            const retryRaw = await resilientLLMCall({
                messages: [
                    ...creatorMessages,
                    { role: 'user', content: 'Re-emit ONLY the JSON object between <JSON> and </JSON> with no commentary.' }
                ],
                systemPrompt: CREATOR_SYSTEM_PROMPT,
                temperature: 0.0,
                useCache: false,
                maxRetries: 1,
                backoffMs: 1000,
            });
            
            if (!validateStoryResponse(retryRaw, 'json')) {
                logDiagnostics('invalid_format_retry', retryRaw || '');
                throw new Error('The model did not return valid JSON format on retry.');
            }
            parsed = await parseWevalConfigFromResponse(retryRaw);
            if (parsed.validationError) {
                logger.warn(`[story:create][diag] retry_validation_error: ${parsed.validationError}`);
                logDiagnostics('retry_validation_error_raw', retryRaw || '');
            }
        }

        if (process.env.NODE_ENV === 'development') {
            logger.info('[story:create] raw length=' + raw.length);
            logger.info('[story:create] parsed.sanitized? ' + Boolean(parsed.sanitized));
        }

        if (parsed.validationError) {
            logger.warn(`[story:create][diag] validation_error: ${parsed.validationError}`);
            logDiagnostics('validation_error_raw', raw || '');
        }

        return NextResponse.json({
            data: parsed.data,
            yaml: parsed.yaml,
            sanitized: parsed.sanitized,
            validationError: parsed.validationError,
            raw,
        });
    } catch (err: any) {
        logger.error(`[story:create] failed: ${err?.message || err}`);
        return NextResponse.json({ error: 'Failed to create evaluation.' }, { status: 500 });
    }
}


