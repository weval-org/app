import { NextRequest, NextResponse } from 'next/server';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';
import { ORCHESTRATOR_SYSTEM_PROMPT, ORCHESTRATOR_SYSTEM_PROMPT_CLARIFICATION } from '../utils/prompt-constants';
import { ConversationMessage } from '@/types/shared';
import { chatRequestSchema, validateAndSanitizeMessages } from '../utils/validation';
import { streamModelResponse } from '@/cli/services/llm-service';
import { resilientLLMCall, FALLBACK_MODELS } from '../utils/llm-resilience';

export const runtime = 'nodejs';

type ChatRequestBody = {
    messages: ConversationMessage[];
    // System status context
    blueprintYaml?: string;
    quickRunResult?: object;
    uiContext?: {
        pageName: string;
        pageUrl: string;
        availableActions: string[];
    };
    // flag to disable streaming for simple calls
    noStream?: boolean;
    // Dev-only: add an artificial delay (ms) between streamed chunks to visualize streaming
    debugStreamDelayMs?: number;
};

// Builds the structured prompt for the orchestrator
function buildOrchestratorPrompt(
    messages: ConversationMessage[],
    blueprintYaml?: string,
    quickRunResult?: object,
    uiContext?: { pageName: string; pageUrl: string; availableActions: string[] }
): ConversationMessage[] {
    const history = messages.slice(-12);
    const lastMessage = history[history.length - 1];

    let systemStatus = '';

    // UI Context - always include if provided
    if (uiContext) {
        systemStatus += `**UI Context:**\n`;
        systemStatus += `- Page: ${uiContext.pageName}\n`;
        systemStatus += `- URL: ${uiContext.pageUrl}\n`;
        systemStatus += `- Available actions: ${uiContext.availableActions.join(', ')}\n\n`;
    }

    if (blueprintYaml) {
        systemStatus += `The user is working on the following evaluation outline:\n\n${blueprintYaml}\n\n`;
    }
    if (quickRunResult) {
        systemStatus += `The user just ran a quick test. Here is a summary of the results:\n\n${JSON.stringify(quickRunResult, null, 2)}`;
    }

    if (lastMessage?.role === 'user') {
        // Last message is from the user, so we modify it.
        const modifiedMessage = {
            ...lastMessage,
            content: `<SYSTEM_STATUS>\n${systemStatus.trim()}\n</SYSTEM_STATUS>\n<USER_MESSAGE>\n${lastMessage.content}\n</USER_MESSAGE>`
        };
        // Replace the last message with the modified one.
        return [...history.slice(0, -1), modifiedMessage];
    } else {
        // Last message is from the assistant, or history is empty.
        // This is a system-triggered event. Append a new user message with status only.
        const systemUserMessage = {
            role: 'user' as const,
            content: `<SYSTEM_STATUS>\n${systemStatus.trim()}\n</SYSTEM_STATUS>\n<USER_MESSAGE>\n</USER_MESSAGE>`
        };
        return [...history, systemUserMessage];
    }
}

export async function POST(req: NextRequest) {
    const logger = await getLogger('story:chat:stream');
    configure({
        logger: {
            info: (m) => logger.info(m),
            warn: (m) => logger.warn(m),
            error: (m) => logger.error(m),
            success: (m) => logger.info(m),
        },
        errorHandler: (err) => logger.error(`[story:chat:stream] error: ${err?.message || err}`),
    });

    try {
        const body: ChatRequestBody = await req.json();
        const validationResult = chatRequestSchema.safeParse(body);
        
        if (!validationResult.success) {
            logger.warn(`[story:chat:stream] validation failed: ${validationResult.error.message}`);
            return new Response(JSON.stringify({ error: 'Invalid request format' }), { status: 400 });
        }

        const { messages: rawMessages, blueprintYaml, quickRunResult, uiContext } = validationResult.data;
        const messages = validateAndSanitizeMessages(rawMessages);

        if (messages.length === 0) {
            return new Response(JSON.stringify({ error: 'No valid messages provided' }), { status: 400 });
        }

        // Count user messages to determine which prompt to use
        const userMessageCount = messages.filter(m => m.role === 'user').length;
        const systemPrompt = userMessageCount < 3
            ? ORCHESTRATOR_SYSTEM_PROMPT_CLARIFICATION
            : ORCHESTRATOR_SYSTEM_PROMPT;

        logger.info(`[story:chat] Using ${userMessageCount < 3 ? 'CLARIFICATION' : 'FULL'} prompt (user messages: ${userMessageCount})`);

        const finalMsgs = buildOrchestratorPrompt(messages, blueprintYaml ?? undefined, quickRunResult, uiContext);
        
        // Handle non-streaming case for quick run follow-up
        if (body.noStream) {
            logger.info('[story:chat] Handling non-streaming request');
            const reply = await resilientLLMCall({
                messages: finalMsgs,
                systemPrompt: systemPrompt,
                temperature: 0.2,
                useCache: false,
            });
            return NextResponse.json({ reply });
        }

        const llmStream = streamModelResponse({
            messages: finalMsgs,
            modelId: FALLBACK_MODELS[0], // Use the primary model for orchestration
            systemPrompt: systemPrompt,
            temperature: 0.2,
        });

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                const rawDelay = (process.env.NODE_ENV === 'development')
                    ? (Number(body.debugStreamDelayMs) || Number(process.env.DEBUG_STREAM_DELAY_MS) || 0)
                    : 0;
                const delay = Number.isFinite(rawDelay) && rawDelay > 0 ? rawDelay : 0;
                for await (const chunk of llmStream) {
                    if (chunk.type === 'content') {
                        if (delay > 0) {
                            await new Promise((r) => setTimeout(r, delay));
                        }
                        controller.enqueue(encoder.encode(chunk.content));
                    } else if (chunk.type === 'error') {
                        // Send error as a special control signal that the client can parse
                        const errorSignal = `<STREAM_ERROR>${chunk.error}</STREAM_ERROR>`;
                        controller.enqueue(encoder.encode(errorSignal));
                        controller.close();
                        return;
                    }
                }
                controller.close();
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });

    } catch (err: any) {
        logger.error(`[story:chat:stream] failed: ${err?.message || err}`);
        return new Response(JSON.stringify({ error: 'Failed to get assistant reply.' }), { status: 500 });
    }
}


