import { NextResponse } from 'next/server';
import { configure } from '@/cli/config';
import { guessModel } from '@/lib/experiments/guess/model-guessor';
import { splitIntoParagraphs, shouldSplitIntoParagraphs } from '@/lib/experiments/guess/paragraph-splitter';

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
    try {
        const body = await req.json().catch(() => ({}));
        const text: string = body?.text || '';
        const mode: 'quick' | 'thorough' = body?.mode || 'quick';

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return NextResponse.json(
                { error: 'Text is required' },
                { status: 400 }
            );
        }

        // Select models based on mode
        const models = mode === 'quick' ? QUICK_MODELS : THOROUGH_MODELS;

        // Configure logger
        configure({
            errorHandler: (e) => console.error('[Guess][Run][error]', e.message),
            logger: {
                info: (m: string) => console.log('[Guess][Run][info]', m),
                warn: (m: string) => console.warn('[Guess][Run][warn]', m),
                error: (m: string) => console.error('[Guess][Run][error]', m),
                success: (m: string) => console.log('[Guess][Run][success]', m),
            },
        });

        // Split into paragraphs if appropriate
        let textSet: Set<string>;
        if (shouldSplitIntoParagraphs(text)) {
            textSet = splitIntoParagraphs(text);
        } else {
            textSet = new Set([text]);
        }

        // Run the model guessor (no progress callback for non-streaming)
        const results = await guessModel(textSet, models, () => {});

        // Transform results for frontend
        // Convert distance (0-2, lower=better) to similarity (0-1, higher=better)
        const transformedResults = results.map((result, index) => ({
            modelId: result.modelId,
            similarity: 1 - (result.avgDistance / 2), // Normalize to 0-1 range
            rank: index + 1,
            avgDistance: result.avgDistance,
            minDistance: result.minDistance,
            maxDistance: result.maxDistance,
            samples: result.samples,
        }));

        return NextResponse.json({
            results: transformedResults,
            totalModels: results.length,
        });

    } catch (error: any) {
        console.error('[Guess][Run] Error:', error);
        return NextResponse.json(
            { error: error?.message || 'Model guessing failed' },
            { status: 500 }
        );
    }
}
