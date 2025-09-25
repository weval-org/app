import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import yaml from 'js-yaml';
import { ComparisonConfig } from '@/cli/types/cli_types';
import { configure } from '@/cli/config';
import { executeComparisonPipeline } from '@/cli/services/comparison-pipeline-service';
import { generateConfigContentHash } from '@/lib/hash-utils';
import { registerCustomModels } from '@/lib/llm-clients/client-dispatcher';
import type { CustomModelDefinition } from '@/lib/llm-clients/types';

const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY;
const NETLIFY_FUNCTION_URL = `${process.env.NEXT_PUBLIC_APP_URL}/.netlify/functions/execute-api-evaluation-background`;

// Helper to parse blueprint content which could be YAML or JSON
function parseBlueprint(content: string): ComparisonConfig | null {
    try {
        // Try parsing as JSON first
        return JSON.parse(content) as ComparisonConfig;
    } catch (jsonError) {
        try {
            // Fallback to parsing as YAML
            return yaml.load(content) as ComparisonConfig;
        } catch (yamlError) {
            return null;
        }
    }
}


export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    const responseModeHeader = (req.headers.get('X-Response-Mode') || '').toLowerCase();
    const responseModeQuery = (url.searchParams.get('responseMode') || '').toLowerCase();
    const isInline = responseModeHeader === 'inline' || responseModeQuery === 'inline';
    const authHeader = req.headers.get('Authorization');
    const authDisabled = process.env.DISABLE_PUBLIC_API_AUTH === 'true';
    if (!authDisabled) {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized: Missing or invalid Authorization header' }, { status: 401 });
        }
        const apiKey = authHeader.split(' ')[1];
        if (apiKey !== PUBLIC_API_KEY) {
            return NextResponse.json({ error: 'Unauthorized: Invalid API key' }, { status: 401 });
        }
    }

    let blueprintContent;
    try {
        blueprintContent = await req.text();
        if (!blueprintContent) {
            return NextResponse.json({ error: 'Bad Request: Empty request body' }, { status: 400 });
        }
    } catch (error) {
        return NextResponse.json({ error: 'Bad Request: Could not read request body' }, { status: 400 });
    }

    const config = parseBlueprint(blueprintContent);

    if (!config) {
        return NextResponse.json({ error: 'Bad Request: Invalid blueprint format. Could not parse as JSON or YAML.' }, { status: 400 });
    }

    // --- Blueprint Validation ---
    if (!config.models || !Array.isArray(config.models) || config.models.length === 0) {
        const defaultModels = [
            "openai:gpt-4.1-mini",
            "anthropic:claude-3-haiku-20240307",
            'openrouter:google/gemini-flash-1.5'
        ];
        console.log(`[API RUN] No models provided in blueprint. Defaulting to ${defaultModels.length} models.`);
        config.models = defaultModels;
        
        (config as any)._weval_api_defaults_applied = true;
        (config as any).skipExecutiveSummary = true;
        
        if (!config.evaluationConfig) {
            config.evaluationConfig = {};
        }
        if (!config.evaluationConfig['llm-coverage']) {
            config.evaluationConfig['llm-coverage'] = {};
        }
        config.evaluationConfig['llm-coverage'].judgeModels = ['openrouter:google/gemini-2.5-flash'];
        console.log(`[API RUN] Overriding judge model to 'openrouter:google/gemini-2.5-flash'.`);
    }
    if (!config.prompts || !Array.isArray(config.prompts) || config.prompts.length === 0) {
        return NextResponse.json({ error: 'Bad Request: Blueprint must include at least one prompt.' }, { status: 400 });
    }
    // --- End Blueprint Validation ---

    // Add the special tag to isolate this run
    if (!config.tags) {
        config.tags = [];
    }
    config.tags.push('_public_api');

    const runId = uuidv4();

    if (isInline) {
        // --- INLINE MODE (no persistence) ---
        const MAX_INLINE_PROMPTS = 5;
        const MAX_INLINE_MODELS = 3;

        const promptCount = Array.isArray(config.prompts) ? config.prompts.length : 0;
        const modelCount = Array.isArray(config.models) ? config.models.length : 0;
        if (promptCount > MAX_INLINE_PROMPTS || modelCount > MAX_INLINE_MODELS) {
            return NextResponse.json({ 
                error: 'Inline mode limits exceeded.',
                message: `Inline mode supports at most ${MAX_INLINE_PROMPTS} prompts and ${MAX_INLINE_MODELS} models. Received prompts=${promptCount}, models=${modelCount}.`
            }, { status: 400 });
        }

        // Initialize CLI config/logging for serverless context
        try {
            configure({
                errorHandler: (err: Error) => console.error('[API RUN inline] Error:', err.message),
                logger: {
                    info: (...args: any[]) => console.log('[API RUN inline]', ...args),
                    warn: (...args: any[]) => console.warn('[API RUN inline]', ...args),
                    error: (...args: any[]) => console.error('[API RUN inline]', ...args),
                    success: (...args: any[]) => console.log('[API RUN inline]', ...args),
                },
            });
        } catch {}

        // Register any custom models
        try {
            const customModelDefs = (config.models || []).filter(m => typeof m === 'object') as CustomModelDefinition[];
            if (customModelDefs.length > 0) {
                registerCustomModels(customModelDefs);
                console.log(`[API RUN inline] Registered ${customModelDefs.length} custom model definitions.`);
            }
        } catch {}

        // Synthesize messages if only prompt/promptText was provided (match background behavior)
        try {
            if (Array.isArray(config?.prompts)) {
                config.prompts = config.prompts.map((p: any) => {
                    if (!p) return p;
                    if (!Array.isArray(p.messages) || p.messages.length === 0) {
                        const text = typeof p.prompt === 'string' ? p.prompt : (typeof p.promptText === 'string' ? p.promptText : undefined);
                        if (typeof text === 'string' && text.trim().length > 0) {
                            p.messages = [{ role: 'user', content: text }];
                        }
                    }
                    return p;
                });
            }
        } catch (normErr: any) {
            console.warn(`[API RUN inline] Prompt normalization failed: ${normErr?.message || normErr}`);
        }

        // Prepare identifiers similar to background function
        const shortId = runId.split('-')[0];
        const configIdForRun = `api-inline-${shortId}`;
        (config as any).id = configIdForRun;
        const contentHash = generateConfigContentHash(config as any);
        const runLabel = contentHash;

        // Force coverage-only, skip executive summary; use cache
        const { data } = await executeComparisonPipeline(
            config as any,
            runLabel,
            ['llm-coverage'],
            {
                info: (...args: any[]) => console.log('[API RUN inline]', ...args),
                warn: (...args: any[]) => console.warn('[API RUN inline]', ...args),
                error: (...args: any[]) => console.error('[API RUN inline]', ...args),
                success: (...args: any[]) => console.log('[API RUN inline]', ...args),
            } as any,
            undefined,
            undefined,
            true,
            undefined,
            undefined,
            false,
            true,
            undefined,
            undefined,
            undefined,
            true, // noSave
        );

        return NextResponse.json({ result: data, resultUrl: null, runId });
    }

    // --- DEFAULT MODE (async + persisted) ---
    console.log(`[API RUN] Triggering background evaluation for runId: ${runId}`);
    console.log(`[API RUN] Target function URL: ${NETLIFY_FUNCTION_URL}`);

    // Fire-and-forget invocation of the background function (guard for tests)
    try {
        const maybePromise = (globalThis.fetch?.(NETLIFY_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId, config }),
        }) as any);
        if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.catch((error: any) => {
                console.error(`[API RUN] Error invoking background function for runId: ${runId}`, error);
            });
        }
    } catch (error) {
        console.error(`[API RUN] Error invoking background function for runId: ${runId}`, error);
    }

    const statusUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/evaluations/status/${runId}`;
    const resultsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/evaluations/result/${runId}`;
    const viewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api-run/${runId}`;

    return NextResponse.json({ 
        message: 'Evaluation run initiated successfully.',
        runId: runId,
        statusUrl: statusUrl,
        resultsUrl: resultsUrl,
        viewUrl: viewUrl,
    });
}
