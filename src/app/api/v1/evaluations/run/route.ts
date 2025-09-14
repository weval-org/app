import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import yaml from 'js-yaml';
import { ComparisonConfig } from '@/cli/types/cli_types';

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
