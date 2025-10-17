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

        // Fetch all pairs in parallel for better performance
        const fetchPromises = pairs
            .filter(pair => pair.promptId && pair.modelId)
            .map(async (pair) => {
                const response = await getSingleModelResponse(configId, runLabel, timestamp, pair.promptId, pair.modelId);
                if (response !== null) {
                    return { key: `${pair.promptId}:${pair.modelId}`, response };
                }
                return null;
            });

        const results = await Promise.all(fetchPromises);

        // Populate the flattened responses object
        for (const result of results) {
            if (result !== null) {
                flattenedResponses[result.key] = result.response;
            }
        }

        return NextResponse.json(flattenedResponses);

    } catch (error) {
        console.error(`[API - Batch Responses] Error fetching data for ${configId}/${runLabel}/${timestamp}:`, error);
        return NextResponse.json({ error: 'Failed to fetch batch response data' }, { status: 500 });
    }
}
