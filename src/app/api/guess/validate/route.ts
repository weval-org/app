import { NextResponse } from 'next/server';
import { configure } from '@/cli/config';
import { getModelResponse } from '@/cli/services/llm-service';

const CLASSIFIER_SYSTEM_PROMPT = `You are a content classifier. Analyze the provided text and classify it into exactly ONE of these categories:

<PROSE/> - Literary, creative, or narrative writing
<TECHNICAL/> - Technical documentation, code explanations, or formal writing
<NORMAL/> - Standard conversational or informational text
<NONSENSICAL/> - Gibberish, random characters, or meaningless content
<OFFENSIVE/> - Hateful, abusive, or inappropriate content

Respond with ONLY the category tag, nothing else.`;

export async function POST(req: Request) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    console.log(`[Guess][Validate][${requestId}] ========== VALIDATION REQUEST START ==========`);

    try {
        const body = await req.json().catch(() => ({}));
        const text: string = body?.text || '';

        console.log(`[Guess][Validate][${requestId}] Received text: ${text.length} characters`);
        console.log(`[Guess][Validate][${requestId}] Text preview: "${text.substring(0, 100)}..."`);

        // Length validation
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            console.log(`[Guess][Validate][${requestId}] ❌ Validation failed: Empty text`);
            return NextResponse.json(
                { valid: false, reason: 'Text is required' },
                { status: 400 }
            );
        }

        if (text.length < 300) {
            console.log(`[Guess][Validate][${requestId}] ❌ Validation failed: Too short (${text.length} < 300)`);
            return NextResponse.json(
                { valid: false, reason: 'Text must be at least 300 characters' },
                { status: 400 }
            );
        }

        if (text.length > 10000) {
            console.log(`[Guess][Validate][${requestId}] ❌ Validation failed: Too long (${text.length} > 10000)`);
            return NextResponse.json(
                { valid: false, reason: 'Text must be less than 10,000 characters' },
                { status: 400 }
            );
        }

        console.log(`[Guess][Validate][${requestId}] ✅ Length validation passed`);
        console.log(`[Guess][Validate][${requestId}] Calling classifier...`);

        // Configure logger
        configure({
            errorHandler: (e) => console.error(`[Guess][Validate][${requestId}][error]`, e.message),
            logger: {
                info: (m: string) => console.log(`[Guess][Validate][${requestId}][info]`, m),
                warn: (m: string) => console.warn(`[Guess][Validate][${requestId}][warn]`, m),
                error: (m: string) => console.error(`[Guess][Validate][${requestId}][error]`, m),
                success: (m: string) => console.log(`[Guess][Validate][${requestId}][success]`, m),
            },
        });

        const classifyStartTime = Date.now();

        // Content classification using existing LLM service
        const classification = await getModelResponse({
            modelId: 'openrouter:google/gemini-2.5-flash',
            systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
            prompt: `Classify this text:\n\n${text}`,
            temperature: 0,
            maxTokens: 50,
            useCache: true,
        });

        const classifyDuration = Date.now() - classifyStartTime;
        console.log(`[Guess][Validate][${requestId}] Classification completed in ${classifyDuration}ms`);
        console.log(`[Guess][Validate][${requestId}] Raw classification: "${classification}"`);

        const normalizedClassification = classification.trim().toUpperCase();
        console.log(`[Guess][Validate][${requestId}] Normalized classification: "${normalizedClassification}"`);

        // Reject nonsensical or offensive content (check for keywords without requiring angle braces)
        if (normalizedClassification.includes('NONSENSICAL')) {
            console.log(`[Guess][Validate][${requestId}] ❌ Content validation failed: NONSENSICAL`);
            const totalDuration = Date.now() - startTime;
            console.log(`[Guess][Validate][${requestId}] ========== VALIDATION REQUEST END (${totalDuration}ms) ==========`);
            return NextResponse.json({
                valid: false,
                reason: 'The text appears to be nonsensical or random. Please provide meaningful LLM-generated text.',
            });
        }

        if (normalizedClassification.includes('OFFENSIVE')) {
            console.log(`[Guess][Validate][${requestId}] ❌ Content validation failed: OFFENSIVE`);
            const totalDuration = Date.now() - startTime;
            console.log(`[Guess][Validate][${requestId}] ========== VALIDATION REQUEST END (${totalDuration}ms) ==========`);
            return NextResponse.json({
                valid: false,
                reason: 'The text contains inappropriate content.',
            });
        }

        // All other classifications (PROSE, TECHNICAL, NORMAL) are accepted
        console.log(`[Guess][Validate][${requestId}] ✅ Content validation passed: ${normalizedClassification}`);
        const totalDuration = Date.now() - startTime;
        console.log(`[Guess][Validate][${requestId}] ========== VALIDATION REQUEST END (${totalDuration}ms) ==========`);

        return NextResponse.json({
            valid: true,
            classification: normalizedClassification,
        });

    } catch (error: any) {
        const totalDuration = Date.now() - startTime;
        console.error(`[Guess][Validate][${requestId}] ❌ ERROR after ${totalDuration}ms:`, error);
        console.error(`[Guess][Validate][${requestId}] Error stack:`, error.stack);
        console.log(`[Guess][Validate][${requestId}] ========== VALIDATION REQUEST END (ERROR) ==========`);
        return NextResponse.json(
            { error: error?.message || 'Validation failed' },
            { status: 500 }
        );
    }
}
