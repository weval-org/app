import { NextRequest, NextResponse } from 'next/server';
import { listRunsForConfig, getResultByFileName } from '@/lib/storageService';

export const revalidate = 3600; // Revalidate once per hour (Next.js built-in caching)

export async function GET(
    request: NextRequest, 
    context: { params: Promise<{ configId: string, runLabel: string, timestamp: string }> } 
) {
    const { configId, runLabel: routeRunLabel, timestamp: routeTimestamp } = await context.params;

    if (typeof configId !== 'string' || typeof routeRunLabel !== 'string' || typeof routeTimestamp !== 'string') {
        return NextResponse.json({ error: 'Config ID, Run Label, and Timestamp must be strings' }, { status: 400 });
    }

    console.log(`[API Analysis] Fetching data for ${configId}/${routeRunLabel}/${routeTimestamp}...`);

    try {
        const allRunsForConfig = await listRunsForConfig(configId);

        if (!allRunsForConfig || allRunsForConfig.length === 0) {
            console.log(`[App API Comparison] No runs found at all for configId: ${configId} from storage.`);
            return NextResponse.json({ error: `No runs found for configId ${configId}` }, { status: 404 });
        }

        console.log(`[App API Comparison] Runs found for configId '${configId}' by listRunsForConfig:`, 
            JSON.stringify(allRunsForConfig.map(r => ({ rl: r.runLabel, ts: r.timestamp, fn: r.fileName })), null, 2)
        );
        console.log(`[App API Comparison] routeRunLabel from URL to match: '${routeRunLabel}', routeTimestamp: '${routeTimestamp}'`);

        // Filter runs to find the exact match.
        // The run.runLabel from listRunsForConfig is the base run label.
        // run.timestamp from storageService is expected to be in 'safe' format
        // Convert run.timestamp to safe format for comparison
        const specificRun = allRunsForConfig.find(run => {
            // routeTimestamp is already in 'safe' format from the URL (due to HomePageClient change)
            // run.timestamp from storageService is expected to be in 'safe' format
            // Convert run.timestamp to safe format for comparison
            const safeRunTimestampFromStorage = run.timestamp; // run.timestamp is assumed to be already safe
            const isMatch = run.runLabel === routeRunLabel && safeRunTimestampFromStorage === routeTimestamp;
            
            if (isMatch) {
                 console.log(`[App API Comparison] Found exact match: fileName '${run.fileName}' for runLabel '${run.runLabel}', routeTimestamp (safe) '${routeTimestamp}', converted run.timestamp (safe) '${safeRunTimestampFromStorage}'`);
            }
            return isMatch;
        });

        if (!specificRun) {
            console.log(`[App API Comparison] No specific run found for configId '${configId}', base runLabel '${routeRunLabel}', and timestamp '${routeTimestamp}'. Available timestamps for this runLabel: ${allRunsForConfig.filter(r => r.runLabel === routeRunLabel).map(r => r.timestamp).join(', ')}`);
            return NextResponse.json({ error: `Comparison data not found for ${configId}/${routeRunLabel}/${routeTimestamp}` }, { status: 404 });
        }

        console.log(`[App API Comparison] Specific matching run for ${configId}/${routeRunLabel}/${routeTimestamp} is file: ${specificRun.fileName}`);

        const jsonData = await getResultByFileName(configId, specificRun.fileName);

        if (!jsonData) {
            console.log(`[API Analysis] Data not found for file: ${specificRun.fileName} in configId: ${configId}`);
            return NextResponse.json({ error: `Comparison data file not found for ${configId}/${routeRunLabel}/${routeTimestamp} (file: ${specificRun.fileName})` }, { status: 404 });
        }
        
        return NextResponse.json(jsonData, { status: 200 });
    } catch (error: any) {
        console.error(`[App API Comparison] Error fetching data for ${configId}/${routeRunLabel}/${routeTimestamp}:`, error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
} 