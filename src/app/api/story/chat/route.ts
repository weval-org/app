import { NextRequest, NextResponse } from 'next/server';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';
import { ORCHESTRATOR_SYSTEM_PROMPT } from '../utils/prompt-constants';
import { ConversationMessage } from '@/types/shared';
import { resilientLLMCall, validateStoryResponse } from '../utils/llm-resilience';
import { chatRequestSchema, validateAndSanitizeMessages } from '../utils/validation';
import { CONTROL_SIGNALS } from '../utils/control-signals';
import { storyCircuitBreakers } from '../utils/circuit-breaker';

type ChatRequestBody = {
    messages: ConversationMessage[];
    blueprintYaml?: string; // hidden context to pass in
};

export async function POST(req: NextRequest) {
    const logger = await getLogger('story:chat');
    configure({
        logger: {
            info: (m) => logger.info(m),
            warn: (m) => logger.warn(m),
            error: (m) => logger.error(m),
            success: (m) => logger.info(m),
        },
        errorHandler: (err) => logger.error(`[story:chat] error: ${err?.message || err}`),
    });

    try {
        const body = await req.json();
        const validationResult = chatRequestSchema.safeParse(body);
        
        if (!validationResult.success) {
            logger.warn(`[story:chat] validation failed: ${validationResult.error.message}`);
            return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
        }

        const { messages: rawMessages, blueprintYaml } = validationResult.data;
        const messages = validateAndSanitizeMessages(rawMessages);

        if (messages.length === 0) {
            return NextResponse.json({ error: 'No valid messages provided' }, { status: 400 });
        }

        // Keep a short context window (last 12 turns) for cost/perf
        const trimmed = messages.slice(-12);
        const hiddenCtx = blueprintYaml ? [{ role: 'user', content: `${CONTROL_SIGNALS.BLUEPRINT_YAML_START}${blueprintYaml}${CONTROL_SIGNALS.BLUEPRINT_YAML_END}` } as ConversationMessage] : [];
        const finalMsgs = hiddenCtx.concat(trimmed);

        const reply = await storyCircuitBreakers.chat.execute(() =>
            resilientLLMCall({
                messages: finalMsgs,
                systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
                temperature: 0.2,
                useCache: false,
                maxRetries: 1,
                backoffMs: 1000,
            })
        );

        if (!validateStoryResponse(reply, 'chat')) {
            throw new Error('Invalid response format from orchestrator');
        }

        if (process.env.NODE_ENV === 'development') {
            logger.info(`[story:chat] tokens~=n/a len=${reply.length}`);
        }

        return NextResponse.json({ reply });
    } catch (err: any) {
        logger.error(`[story:chat] failed: ${err?.message || err}`);
        return NextResponse.json({ error: 'Failed to get assistant reply.' }, { status: 500 });
    }
}


