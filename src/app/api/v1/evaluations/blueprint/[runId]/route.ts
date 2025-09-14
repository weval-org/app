import { NextRequest, NextResponse } from 'next/server';
import { getJsonFile } from '@/lib/storageService';

const STORAGE_PREFIX = 'api-runs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
    const { runId } = await params;

    if (!runId) {
        return NextResponse.json({ error: 'Bad Request: Missing runId' }, { status: 400 });
    }

    try {
        const blueprintPath = `${STORAGE_PREFIX}/${runId}/blueprint.json`;
        const blueprint = await getJsonFile(blueprintPath);

        if (!blueprint) {
            return NextResponse.json({ error: 'Not Found: Blueprint not found for the given runId' }, { status: 404 });
        }

        return NextResponse.json(blueprint);
    } catch (error: any) {
        console.error(`[API Blueprint] Error fetching blueprint for runId ${runId}:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
