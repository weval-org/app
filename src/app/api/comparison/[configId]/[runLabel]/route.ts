import { NextRequest, NextResponse } from 'next/server';
import { listRunsForConfig, getResultByFileName } from '@/lib/storageService';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { calculatePerModelHybridScoresForRun } from '@/app/utils/calculationUtils';
import { fromSafeTimestamp } from '@/lib/timestampUtils';

export const revalidate = 3600; // Revalidate once per hour (Next.js built-in caching)

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ configId: string, runLabel: string }> }
) {
    const { configId, runLabel: routeRunLabel } = await context.params;

    if (typeof configId !== 'string' || typeof routeRunLabel !== 'string') { // Simpler check, no timestamp
        return NextResponse.json({ error: 'Config ID and Run Label must be strings' }, { status: 400 });
    }

    // If this route is ever used, it implies fetching the *latest* run for a given runLabel, or an aggregate.
    // For simplicity and to avoid ambiguity, this example will assume it tries to fetch the *latest* if multiple timestamps exist.
    // However, this is non-trivial to determine without more info. The [timestamp] route is more explicit.
    console.log(`[API Analysis] Fetching data for ${configId}/${routeRunLabel} (latest instance)...`);

    try {
        const allRunsForConfig = await listRunsForConfig(configId);

        if (!allRunsForConfig || allRunsForConfig.length === 0) {
            console.log(`[App API Comparison] No runs found at all for configId: ${configId} from storage.`);
            return NextResponse.json({ error: `No runs found for configId ${configId}` }, { status: 404 });
        }

        console.log(`[App API Comparison] Runs found for configId '${configId}' by listRunsForConfig:`, 
            JSON.stringify(allRunsForConfig.map(r => ({ rl: r.runLabel, ts: r.timestamp, fn: r.fileName })), null, 2)
        );
        console.log(`[App API Comparison] routeRunLabel from URL to match: '${routeRunLabel}'`);

        // Filter runs for the given runLabel and find the one with the latest timestamp
        const runsForThisLabel = allRunsForConfig
            .filter(run => run.runLabel === routeRunLabel && run.timestamp)
            .sort((a, b) => new Date(fromSafeTimestamp(b.timestamp!)).getTime() - new Date(fromSafeTimestamp(a.timestamp!)).getTime());

        if (runsForThisLabel.length === 0) {
            console.log(`[App API Comparison] No specific run found for configId '${configId}' and base runLabel '${routeRunLabel}' with a valid timestamp.`);
            return NextResponse.json({ error: `Comparison data not found for ${configId}/${routeRunLabel}` }, { status: 404 });
        }

        const specificRun = runsForThisLabel[0]; // Get the latest one

        console.log(`[App API Comparison] Specific matching run (latest for runLabel) for ${configId}/${routeRunLabel} is file: ${specificRun.fileName} with timestamp ${specificRun.timestamp}`);

        const jsonData = await getResultByFileName(configId, specificRun.fileName);

        if (!jsonData) {
            console.log(`[API Analysis] Data not found for file: ${specificRun.fileName} in configId: ${configId}`);
            return NextResponse.json({ error: `Comparison data file not found for ${configId}/${routeRunLabel} (latest instance, file: ${specificRun.fileName})` }, { status: 404 });
        }

        // Calculate per-model hybrid scores and add them to jsonData
        if (jsonData.evaluationResults && jsonData.effectiveModels && jsonData.promptIds) {
            // Inject prompt weights into coverage map for weighted averaging support
            try {
                const weightMap: Record<string, number> = {};
                jsonData.config?.prompts?.forEach((p: any) => {
                    if (p && typeof p.id === 'string') {
                        const w = p.weight;
                        if (typeof w === 'number' && !isNaN(w) && w > 0) {
                            weightMap[p.id] = w;
                        }
                    }
                });
                if (Object.keys(weightMap).length > 0 && jsonData.evaluationResults.llmCoverageScores) {
                    (jsonData.evaluationResults.llmCoverageScores as any).__promptWeights = weightMap;
                    console.log(`[API Comparison] ✅ Prompt weights attached for ${Object.keys(weightMap).length} prompts: ${JSON.stringify(weightMap)}`);
                } else {
                    console.log(`[API Comparison] ⚖️  NO prompt weights found in this run's config - all prompts will use default weight of 1.0`);
                }
            } catch {}

            const perModelScores = calculatePerModelHybridScoresForRun(
                jsonData.evaluationResults.perPromptSimilarities,
                jsonData.evaluationResults.llmCoverageScores,
                jsonData.effectiveModels,
                jsonData.promptIds,
                IDEAL_MODEL_ID
            );
            if (!jsonData.evaluationResults) {
                jsonData.evaluationResults = {}; 
            }
            jsonData.evaluationResults.perModelHybridScores = perModelScores;
        }
        
        return NextResponse.json(jsonData, { status: 200 });
    } catch (error: any) {
        console.error(`[App API Comparison] Error fetching data for ${configId}/${routeRunLabel}:`, error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
} 