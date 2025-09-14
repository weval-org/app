import { NextRequest, NextResponse } from 'next/server';
import { getJsonFile } from '@/lib/storageService';

const STORAGE_PREFIX = 'api-runs';

type Status = 'pending' | 'running' | 'completed' | 'failed';

interface StatusFile {
    status: Status;
    lastUpdated: string;
    message?: string;
    payload?: Record<string, any>;
}

export async function GET(
    req: NextRequest,
    { params }: { params: any }
) {
    const { runId } = await params;

    if (!runId) {
        return NextResponse.json({ error: 'Bad Request: Missing runId' }, { status: 400 });
    }

    const statusFilePath = `${STORAGE_PREFIX}/${runId}/status.json`;

    try {
        const statusData = await getJsonFile(statusFilePath) as StatusFile | null;

        if (statusData) {
            return NextResponse.json(statusData);
        } else {
            // If the status file doesn't exist yet, it's pending.
            return NextResponse.json({
                status: 'pending',
                message: 'Evaluation run is queued and waiting to start.',
                lastUpdated: new Date().toISOString(),
            });
        }
    } catch (error: any) {
        // A generic error could mean the file doesn't exist, which we treat as 'pending'.
        // More specific error handling could be added here if storageService provides error types.
        if (error.message.includes('not found') || error.code === 'ENOENT') {
             return NextResponse.json({
                status: 'pending',
                message: 'Evaluation run is queued and waiting to start.',
                lastUpdated: new Date().toISOString(),
            });
        }

        console.error(`[API Status] Error fetching status for runId ${runId}:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
