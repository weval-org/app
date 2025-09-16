import { NextResponse } from 'next/server';
import { getPromptResponses } from '@/lib/storageService';

type RouteParams = {
    params: {
        configId: string;
        runLabel: string;
        timestamp: string;
    };
};

type BatchRequestBody = {
    pairs: { promptId: string; modelId: string }[];
};

export async function POST(request: Request, { params }: RouteParams) {
    const { configId, runLabel, timestamp } = params;

    try {
        const { pairs }: BatchRequestBody = await request.json();
        if (!Array.isArray(pairs)) {
            return NextResponse.json({ error: 'Missing "pairs" array in request body' }, { status: 400 });
        }

        const responsesByPrompt = new Map<string, string[]>();
        for (const pair of pairs) {
            if (pair.promptId && pair.modelId) {
                if (!responsesByPrompt.has(pair.promptId)) {
                    responsesByPrompt.set(pair.promptId, []);
                }
                responsesByPrompt.get(pair.promptId)!.push(pair.modelId);
            }
        }

        const flattenedResponses: Record<string, string> = {};

        for (const [promptId, modelIds] of responsesByPrompt.entries()) {
            const promptResponses = await getPromptResponses(configId, runLabel, timestamp, promptId);
            if (promptResponses) {
                for (const modelId of modelIds) {
                    if (promptResponses[modelId] !== undefined) {
                        flattenedResponses[`${promptId}:${modelId}`] = promptResponses[modelId];
                    }
                }
            }
        }

        return NextResponse.json(flattenedResponses);

    } catch (error) {
        console.error(`[API - Batch Responses] Error fetching data for ${configId}/${runLabel}/${timestamp}:`, error);
        return NextResponse.json({ error: 'Failed to fetch batch response data' }, { status: 500 });
    }
}
