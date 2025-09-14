import { NextRequest, NextResponse } from 'next/server';
import { getJsonFile } from '@/lib/storageService';
import path from 'path';

const STORAGE_PREFIX = 'api-runs';

type Status = 'pending' | 'running' | 'completed' | 'failed';

interface StatusFile {
    status: Status;
    lastUpdated: string;
    message?: string;
    payload?: {
        output?: string;
        resultUrl?: string;
        [key: string]: any;
    };
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

        if (!statusData || statusData.status !== 'completed') {
            const message = statusData ? `Status is '${statusData.status}'.` : 'Run is pending.';
            return NextResponse.json({ 
                error: 'Result not ready.',
                message: message,
            }, { status: 202 }); // 202 Accepted indicates the request is fine, but processing isn't complete.
        }
        
        if (!statusData.payload?.output) {
            return NextResponse.json({ error: 'Internal Server Error: Run is complete but output path is missing.' }, { status: 500 });
        }
        
        // The `output` is the full path to the legacy monolithic file, e.g.,
        // `api-runs/RUN_ID/results/live/blueprints/CONFIG_ID/RUNLABEL_TIMESTAMP_comparison.json`
        // We need the path to the `core.json` artefact which is in the same directory.
        const comparisonFilePath = statusData.payload.output;
        const directory = path.dirname(comparisonFilePath);
        const coreFilePath = path.join(directory, 'core.json');

        const resultData = await getJsonFile(coreFilePath);

        if (!resultData) {
            // Fallback for safety, maybe artefacts weren't created
            const legacyResultData = await getJsonFile(comparisonFilePath);
            if (legacyResultData) {
                return NextResponse.json({ 
                    result: legacyResultData,
                    resultUrl: statusData.payload.resultUrl,
                });
            }
            return NextResponse.json({ error: 'Not Found: Result file could not be located.' }, { status: 404 });
        }

        return NextResponse.json({ 
            result: resultData,
            resultUrl: statusData.payload.resultUrl,
        });

    } catch (error: any) {
        console.error(`[API Result] Error fetching result for runId ${runId}:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
