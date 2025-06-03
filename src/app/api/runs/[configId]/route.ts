import { NextRequest, NextResponse } from 'next/server';
import { listRunsForConfig, getResultByFileName } from '@/lib/storageService';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import { ComparisonDataV2 } from '@/app/utils/types'; // For typing the result of getResultByFileName

export const revalidate = 3600;

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ configId: string }> } 
) {
    const params = await context.params;
    const { configId } = params;

    if (!configId || typeof configId !== 'string') {
        return NextResponse.json({ error: 'Config ID must be a string' }, { status: 400 });
    }

    try {
        // listRunsForConfig returns { runLabel: string; timestamp: string | null; fileName: string; }[] | null
        const runsFromStorage = await listRunsForConfig(configId);

        if (runsFromStorage === null) {
            console.warn(`[API /api/runs/[configId]] listRunsForConfig returned null for configId: ${configId}.`);
            return NextResponse.json({ error: `Could not retrieve run data for configId ${configId}.` }, { status: 404 });
        }

        // Filter out runs with null timestamps. The remaining structure is compatible enough
        // with EnhancedRunInfo for the properties used by RunLabelInstancesPage (runLabel, timestamp, fileName).
        // Other EnhancedRunInfo fields like numPrompts, numModels, hybridScoreStats are not directly available
        // from listRunsForConfig and are not strictly needed by the consuming page as it primarily lists instances.
        const validRuns = runsFromStorage
            .filter(run => run.timestamp !== null)
            .map(run => ({
                ...run,
                timestamp: run.timestamp!, // Assert non-null here after filter
            })) as EnhancedRunInfo[]; // Cast, acknowledging some EnhancedRunInfo fields might be undefined

        let configTitle: string | null = null;
        if (validRuns.length > 0) {
            // Attempt to get configTitle from the first available run file
            const firstRunFileName = validRuns[0].fileName;
            if (firstRunFileName) {
                const firstRunData = await getResultByFileName(configId, firstRunFileName) as ComparisonDataV2 | null;
                if (firstRunData) {
                    configTitle = firstRunData.config?.title || firstRunData.configTitle || null;
                }
            }
        }

        return NextResponse.json({ runs: validRuns, configTitle }, { status: 200 });

    } catch (error: any) {
        console.error(`[API /api/runs/[configId]] Error fetching runs for configId ${configId}:`, error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
} 