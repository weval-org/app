import { NextRequest, NextResponse } from 'next/server';
import { listRunsForConfig, getHomepageSummary } from '@/lib/storageService';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';

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

    // Helper to parse runLabel and safe timestamp from fileName
    // Mimics parts of parseFileName from storageService.ts
    const extractRunDetailsFromFileName = (fileName: string): { runLabel: string | null; timestamp: string | null } => {
        const regex = /^(.*?)_([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}(?:-[0-9]{3})?Z)_comparison\.json$/;
        const match = fileName.match(regex);
        if (match && match[1] && match[2]) {
            return { runLabel: match[1], timestamp: match[2] };
        }
        // Fallback for filenames that might not strictly follow the timestamped pattern
        const baseNameNoSuffix = fileName.endsWith('_comparison.json') ? fileName.substring(0, fileName.length - '_comparison.json'.length) : fileName;
        return { runLabel: baseNameNoSuffix, timestamp: null };
    };

    try {
        const [runsFromStorageList, homepageSummary] = await Promise.all([
            listRunsForConfig(configId), // Returns Array<{ runLabel: string; timestamp: string | null; fileName: string }> | null
            getHomepageSummary()         // Returns HomepageSummaryFileContent | null
        ]);

        let runsForResponse: EnhancedRunInfo[] = [];
        let configTitle: string | null = null;
        let configDescription: string | null = null;
        let configTags: string[] | null = null;

        const configMetadataSource = homepageSummary?.configs?.find(c => c.configId === configId || c.id === configId);

        if (configMetadataSource) {
            configTitle = configMetadataSource.title || configMetadataSource.configTitle || null;
            configDescription = configMetadataSource.description || null;
            configTags = configMetadataSource.tags || null;

            if (configMetadataSource.runs && configMetadataSource.runs.length > 0) {
                runsForResponse = configMetadataSource.runs.map(runFromSummary => {
                    const parsedDetails = extractRunDetailsFromFileName(runFromSummary.fileName);
                    // Ensure the timestamp is the safe one expected by the frontend.
                    // runFromSummary.timestamp is the full ISO, runFromSummary.runLabel is base label.
                    return {
                        ...runFromSummary, // Contains all fields including hybridScoreStats, numPrompts etc.
                        runLabel: runFromSummary.runLabel, // Use runLabel from summary (base label)
                        timestamp: parsedDetails.timestamp || '', // Use parsed safe timestamp. Must be non-null string.
                                                                // page.tsx filters on run.timestamp presence.
                        // fileName is already part of runFromSummary
                    };
                }).filter(run => run.timestamp) as EnhancedRunInfo[]; // Filter out runs where safe timestamp couldn't be parsed.
                
                console.log(`[API /api/runs/[configId]] Using ${runsForResponse.length} runs from homepage_summary.json for ${configId}.`);
            } else {
                 console.log(`[API /api/runs/[configId]] Config ${configId} found in summary, but it has no runs listed there.`);
            }
        } else {
            console.warn(`[API /api/runs/[configId]] Config ${configId} not found in homepage_summary.json. Metadata will be null.`);
        }
        
        if (runsForResponse.length === 0 && runsFromStorageList && runsFromStorageList.length > 0) {
            console.warn(`[API /api/runs/[configId]] No runs from summary for ${configId} (or parsing failed). Falling back to basic run list from storage. These runs will lack detailed stats.`);
            runsForResponse = runsFromStorageList
                .filter(run => run.timestamp !== null) // Ensure timestamp from list is non-null
                .map(runFromList => ({
                    runLabel: runFromList.runLabel,
                    timestamp: runFromList.timestamp!, 
                    fileName: runFromList.fileName,
                    numPrompts: undefined,
                    numModels: undefined,
                    hybridScoreStats: undefined, 
                    perModelHybridScores: new Map(),
                })) as EnhancedRunInfo[]; // Cast after ensuring structure matches EnhancedRunInfo minus detailed stats
        } else if (runsForResponse.length === 0 && runsFromStorageList === null && !configTitle) {
            // If listRunsForConfig failed (returned null) AND summary didn't yield anything (no runs, no title)
            console.error(`[API /api/runs/[configId]] Critical: listRunsForConfig returned null AND no metadata/runs found in summary for ${configId}.`);
            return NextResponse.json({ error: `Could not retrieve any run data or metadata for configId ${configId}.` }, { status: 404 });
        }

        return NextResponse.json({ 
            runs: runsForResponse, 
            configTitle, 
            configDescription, 
            configTags 
        }, { status: 200 });

    } catch (error: any) {
        console.error(`[API /api/runs/[configId]] Error fetching runs for configId ${configId}:`, error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
} 