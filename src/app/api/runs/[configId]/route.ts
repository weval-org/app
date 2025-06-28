import { NextRequest, NextResponse } from 'next/server';
import { getConfigSummary } from '@/lib/storageService';

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ configId: string }> } 
) {
    const params = await context.params;
    const { configId } = params;
    const { searchParams } = new URL(request.url);
    const runLabelFilter = searchParams.get('runLabel');

    if (!configId || typeof configId !== 'string') {
        return NextResponse.json({ error: 'Config ID must be a string' }, { status: 400 });
    }

    try {
        // The primary source of truth is now the per-config summary file.
        const configSummary = await getConfigSummary(configId);

        if (!configSummary) {
            // If no summary exists, it implies no runs have been processed for this configId,
            // or a backfill is needed. We can treat this as not found.
            console.warn(`[API /api/runs/[configId]] No config-summary.json found for ${configId}. A backfill might be required if runs exist.`);
            return NextResponse.json({ error: `Could not retrieve run data for configId ${configId}.` }, { status: 404 });
        }

        // Extract all necessary info directly from the config summary.
        const configTitle = configSummary.title || configSummary.configTitle || null;
        const configDescription = configSummary.description || null;
        const configTags = configSummary.tags || null;
        
        // The runs are already enhanced and sorted within the summary object.
        let runsForResponse = configSummary.runs || [];
        
        console.log(`[API /api/runs/[configId]] Using ${runsForResponse.length} runs from config-summary.json for ${configId}.`);

        let finalRuns = runsForResponse;
        if (runLabelFilter) {
            finalRuns = finalRuns.filter(run => run.runLabel === runLabelFilter);
            console.log(`[API /api/runs/[configId]] Filtered for runLabel '${runLabelFilter}', sending ${finalRuns.length} runs.`);
        }

        return NextResponse.json({ 
            runs: finalRuns, 
            configTitle, 
            configDescription, 
            configTags 
        }, { status: 200 });

    } catch (error: any) {
        console.error(`[API /api/runs/[configId]] Error fetching runs for configId ${configId}:`, error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
} 