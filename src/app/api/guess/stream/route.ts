import { configure } from '@/cli/config';
import { guessModel } from '@/lib/experiments/guess/model-guessor';
import { splitIntoParagraphs, shouldSplitIntoParagraphs } from '@/lib/experiments/guess/paragraph-splitter';
import '@/app/api/guess/error-boundary'; // Activate global error handlers

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QUICK_MODELS = [
    'openrouter:google/gemini-2.5-flash',
    'openrouter:qwen/qwen3-30b-a3b-instruct-2507',
];

const THOROUGH_MODELS = [
    'openrouter:google/gemini-2.5-flash',
    'openrouter:openai/gpt-4.1',
    'openrouter:openai/gpt-5',
    'openrouter:anthropic/claude-sonnet-4',
    'openrouter:x-ai/grok-4',
    'openrouter:mistralai/mistral-medium-3',
    'openrouter:deepseek/deepseek-r1',
    'together:meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
    'openrouter:openai/gpt-4o',
];

export async function POST(req: Request) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    console.log(`[Guess][Stream][${requestId}] ========== STREAM REQUEST START ==========`);

    try {
        const body = await req.json().catch(() => ({}));
        const text: string = body?.text || '';
        const mode: 'quick' | 'thorough' = body?.mode || 'quick';

        console.log(`[Guess][Stream][${requestId}] Received text: ${text.length} characters, mode: ${mode}`);
        console.log(`[Guess][Stream][${requestId}] Text preview: "${text.substring(0, 100)}..."`);

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            console.log(`[Guess][Stream][${requestId}] ❌ Validation failed: Empty text`);
            return new Response(
                JSON.stringify({ error: 'Text is required' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Select models based on mode
        const models = mode === 'quick' ? QUICK_MODELS : THOROUGH_MODELS;
        console.log(`[Guess][Stream][${requestId}] Using ${models.length} models for ${mode} mode`);

        // Configure logger with request ID
        configure({
            errorHandler: (e) => console.error(`[Guess][Stream][${requestId}][error]`, e.message),
            logger: {
                info: (m: string) => console.log(`[Guess][Stream][${requestId}][info]`, m),
                warn: (m: string) => console.warn(`[Guess][Stream][${requestId}][warn]`, m),
                error: (m: string) => console.error(`[Guess][Stream][${requestId}][error]`, m),
                success: (m: string) => console.log(`[Guess][Stream][${requestId}][success]`, m),
            },
        });

        const encoder = new TextEncoder();
        const abortController = new AbortController();

        const stream = new ReadableStream({
            async start(controller) {
                const send = (data: any) => {
                    try {
                    // Sanitize data FIRST to prevent any large objects from being processed
                    const sanitizedData: any = {
                        type: data.type,
                        message: data.message,
                        progress: data.progress,
                        detail: data.detail,
                        error: data.error,
                        errorType: data.errorType,
                    };

                    // Add results only if present and sanitize them
                    if (data.results && Array.isArray(data.results)) {
                        sanitizedData.results = data.results.map((r: any) => ({
                            modelId: r.modelId,
                            similarity: r.similarity,
                            rank: r.rank,
                            avgDistance: r.avgDistance,
                            minDistance: r.minDistance,
                            maxDistance: r.maxDistance,
                            samples: r.samples,
                            // Explicitly exclude embeddings, embedding arrays, etc.
                        }));
                    }

                    // Log progress events (but not every single one to avoid spam)
                    if (sanitizedData.type === 'start' || sanitizedData.type === 'extracting' ||
                        sanitizedData.type === 'embedding' || sanitizedData.type === 'calculating' ||
                        sanitizedData.type === 'complete' || sanitizedData.type === 'error') {
                        console.log(`[Guess][Stream][${requestId}] Progress: ${sanitizedData.type} - ${sanitizedData.message} (${sanitizedData.progress || 0}%)`);
                    } else if (sanitizedData.type === 'generating' && sanitizedData.progress && sanitizedData.progress % 10 === 0) {
                        // Only log every 10% for generation to reduce noise
                        console.log(`[Guess][Stream][${requestId}] Progress: ${sanitizedData.type} - ${sanitizedData.message} (${sanitizedData.progress}%)`);
                    }

                    const payload = `data: ${JSON.stringify(sanitizedData)}\n\n`;

                    // Check payload size before sending (max 1MB to be safe)
                    if (payload.length > 1024 * 1024) {
                        console.error(`[Guess][Stream][${requestId}] ⚠️ Payload too large (${payload.length} bytes), truncating...`);
                        const truncatedData = {
                            type: data.type,
                            message: data.message,
                            progress: data.progress,
                            error: 'Payload too large, data truncated',
                        };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(truncatedData)}\n\n`));
                    } else {
                        controller.enqueue(encoder.encode(payload));
                    }
                } catch (encodeError: any) {
                    console.error(`[Guess][Stream][${requestId}] ❌ Error encoding SSE message:`, encodeError);
                    // Try to send a minimal error message
                    try {
                        const errorPayload = `data: ${JSON.stringify({ type: 'error', error: 'Failed to encode progress update' })}\n\n`;
                        controller.enqueue(encoder.encode(errorPayload));
                    } catch (fallbackError) {
                        console.error(`[Guess][Stream][${requestId}] ❌ Failed to send error message:`, fallbackError);
                    }
                }
            };

            try {
                console.log(`[Guess][Stream][${requestId}] Starting model guessor...`);
                const analysisStartTime = Date.now();

                // Split into paragraphs if appropriate, otherwise treat as single text
                let textSet: Set<string>;
                if (shouldSplitIntoParagraphs(text)) {
                    textSet = splitIntoParagraphs(text);
                    console.log(`[Guess][Stream][${requestId}] Split into ${textSet.size} paragraphs for analysis`);
                } else {
                    textSet = new Set([text]);
                    console.log(`[Guess][Stream][${requestId}] Analyzing as single text`);
                }

                const results = await guessModel(textSet, models, send, {
                    abortSignal: abortController.signal,
                });

                const analysisDuration = Date.now() - analysisStartTime;
                console.log(`[Guess][Stream][${requestId}] Analysis completed in ${analysisDuration}ms`);
                console.log(`[Guess][Stream][${requestId}] Results count: ${results.length}`);

                // Validate results before sending
                if (!results || results.length === 0) {
                    throw new Error('No results generated from analysis');
                }

                // Send final results (without embeddings)
                const transformedResults = results.map((result, index) => ({
                    modelId: result.modelId,
                    similarity: 1 - (result.avgDistance / 2),
                    rank: index + 1,
                    avgDistance: result.avgDistance,
                    minDistance: result.minDistance,
                    maxDistance: result.maxDistance,
                    samples: result.samples,
                }));

                console.log(`[Guess][Stream][${requestId}] Top 3 results:`);
                transformedResults.slice(0, 3).forEach((r, i) => {
                    console.log(`[Guess][Stream][${requestId}]   ${i + 1}. ${r.modelId}: ${(r.similarity * 100).toFixed(1)}% (dist: ${r.avgDistance.toFixed(4)})`);
                });

                send({ type: 'complete', results: transformedResults });

                const totalDuration = Date.now() - startTime;
                console.log(`[Guess][Stream][${requestId}] ========== STREAM REQUEST END (${totalDuration}ms) ==========`);

                controller.close();
            } catch (error: any) {
                const totalDuration = Date.now() - startTime;
                console.error(`[Guess][Stream][${requestId}] ❌ ERROR after ${totalDuration}ms:`, error);
                console.error(`[Guess][Stream][${requestId}] Error type:`, error?.constructor?.name);
                console.error(`[Guess][Stream][${requestId}] Error message:`, error?.message);
                console.error(`[Guess][Stream][${requestId}] Error stack:`, error?.stack);
                console.log(`[Guess][Stream][${requestId}] ========== STREAM REQUEST END (ERROR) ==========`);

                // Send error to client
                try {
                    send({
                        type: 'error',
                        error: error?.message || 'Model guessing failed',
                        errorType: error?.constructor?.name || 'Unknown',
                    });
                } catch (sendError) {
                    console.error(`[Guess][Stream][${requestId}] ❌ Failed to send error to client:`, sendError);
                }

                // Always close the controller
                try {
                    controller.close();
                } catch (closeError) {
                    console.error(`[Guess][Stream][${requestId}] ❌ Failed to close controller:`, closeError);
                }
            }
        },
        cancel(reason) {
            console.log(`[Guess][Stream][${requestId}] ⚠️ Stream cancelled by client:`, reason);
            abortController.abort(reason);
        },
    });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (outerError: any) {
        // Catch any errors that escaped inner try-catch blocks
        const totalDuration = Date.now() - startTime;
        console.error(`[Guess][Stream][${requestId}] ❌ OUTER ERROR after ${totalDuration}ms:`, outerError);
        console.error(`[Guess][Stream][${requestId}] Error type:`, outerError?.constructor?.name);
        console.error(`[Guess][Stream][${requestId}] Error message:`, outerError?.message);
        console.error(`[Guess][Stream][${requestId}] Error stack:`, outerError?.stack);
        console.log(`[Guess][Stream][${requestId}] ========== STREAM REQUEST END (OUTER ERROR) ==========`);

        return new Response(
            JSON.stringify({
                error: outerError?.message || 'An unexpected error occurred',
                errorType: outerError?.constructor?.name || 'Unknown',
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
}
