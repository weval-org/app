import { NextResponse } from 'next/server';
import { getSingleModelResponse } from '@/lib/storageService';

type RouteContext = {
    params: Promise<{
        configId: string;
        runLabel: string;
        timestamp: string;
    }>;
};

type BatchRequestBody = {
    pairs: { promptId: string; modelId: string }[];
};

export async function POST(request: Request, context: RouteContext) {
    const { configId, runLabel, timestamp } = await context.params;

    try {
        const { pairs }: BatchRequestBody = await request.json();
        if (!Array.isArray(pairs)) {
            return NextResponse.json({ error: 'Missing "pairs" array in request body' }, { status: 400 });
        }

        const flattenedResponses: Record<string, string> = {};

        // Fetch each (promptId, modelId) pair using optimized granular access
        for (const pair of pairs) {
            if (pair.promptId && pair.modelId) {
                const response = await getSingleModelResponse(configId, runLabel, timestamp, pair.promptId, pair.modelId);
                if (response !== null) {
                    flattenedResponses[`${pair.promptId}:${pair.modelId}`] = response;
                }
            }
        }

        return NextResponse.json(flattenedResponses);

    } catch (error) {
        console.error(`[API - Batch Responses] Error fetching data for ${configId}/${runLabel}/${timestamp}:`, error);
        return NextResponse.json({ error: 'Failed to fetch batch response data' }, { status: 500 });
    }
}
