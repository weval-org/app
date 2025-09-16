import { NextResponse } from 'next/server';
import { getPromptResponses, getCoreResult, getConversationHistory } from '@/lib/storageService';
import { WevalConfig } from '@/types/shared';

type RouteParams = {
    params: {
        configId: string;
        runLabel: string;
        timestamp: string;
        promptId: string;
        modelId: string;
    };
};

export async function GET(request: Request, { params }: RouteParams) {
    const { configId, runLabel, timestamp, promptId, modelId } = params;

    if (!configId || !runLabel || !timestamp || !promptId || !modelId) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    try {
        // Fetch response content
        const responses = await getPromptResponses(configId, runLabel, timestamp, promptId);
        const responseContent = responses ? responses[modelId] : null;

        if (responseContent === undefined || responseContent === null) {
            return NextResponse.json({ error: 'Response not found' }, { status: 404 });
        }

        const coreData = await getCoreResult(configId, runLabel, timestamp);
        const history = await getConversationHistory(configId, runLabel, timestamp, promptId, modelId);
        
        let systemPrompt: string | null = null;
        if (coreData) {
            const config = coreData.config as WevalConfig;
            const promptConfig = config.prompts?.find(p => p.id === promptId);
            systemPrompt = promptConfig?.system ?? config.system ?? null;
        }

        const payload = {
            response: responseContent,
            history: history,
            systemPrompt: systemPrompt,
        };
        
        return NextResponse.json(payload);

    } catch (error) {
        console.error(`[API - Modal Data] Error fetching data for ${configId}/${runLabel}/${timestamp} - ${promptId}/${modelId}:`, error);
        return NextResponse.json({ error: 'Failed to fetch modal data' }, { status: 500 });
    }
}
