import { NextResponse } from 'next/server';
import { getConfigSummary } from '@/lib/storageService';

export const dynamic = 'force-dynamic'; // defaults to auto

export async function GET(
    request: Request,
    { params }: { params: Promise<{ configId: string }> }
) {
    const { configId } = await params;

    if (!configId) {
        return NextResponse.json({ error: 'Config ID is required.' }, { status: 400 });
    }

    try {
        const configSummary = await getConfigSummary(configId);

        if (!configSummary) {
            return NextResponse.json({ error: `Evaluation config with ID '${configId}' not found.` }, { status: 404 });
        }
        
        // Serialize Map objects for the JSON response
        const serializableRuns = configSummary.runs.map(run => ({
            ...run,
            perModelScores: run.perModelScores ? Object.fromEntries(run.perModelScores) : {},
            perModelHybridScores: run.perModelHybridScores
                ? (run.perModelHybridScores instanceof Map
                    ? Object.fromEntries(run.perModelHybridScores)
                    : run.perModelHybridScores)
                : {},
        }));
        
        const serializableSummary = {
            ...configSummary,
            runs: serializableRuns,
        };

        return NextResponse.json(serializableSummary);
    } catch (error: any) {
        console.error(`[API /evaluations/${configId}] Error:`, error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
