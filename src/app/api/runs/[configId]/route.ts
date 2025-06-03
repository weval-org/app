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

    try {
        const [runsFromStorage, homepageSummary] = await Promise.all([
            listRunsForConfig(configId),
            getHomepageSummary()
        ]);

        if (runsFromStorage === null) {
            console.warn(`[API /api/runs/[configId]] listRunsForConfig returned null for configId: ${configId}.`);
            return NextResponse.json({ error: `Could not retrieve run data for configId ${configId}.` }, { status: 404 });
        }

        const validRuns = runsFromStorage
            .filter(run => run.timestamp !== null)
            .map(run => ({
                ...run,
                timestamp: run.timestamp!,
            })) as EnhancedRunInfo[];

        let configTitle: string | null = null;
        let configDescription: string | null = null;
        let configTags: string[] | null = null;

        if (homepageSummary && homepageSummary.configs) {
            const summaryConfig = homepageSummary.configs.find(c => c.configId === configId || c.id === configId);
            if (summaryConfig) {
                configTitle = summaryConfig.title || summaryConfig.configTitle || null;
                configDescription = summaryConfig.description || null;
                configTags = summaryConfig.tags || null;
                console.log(`[API /api/runs/[configId]] Found metadata for ${configId} in homepage_summary.json`);
            } else {
                console.warn(`[API /api/runs/[configId]] Config ${configId} not found in homepage_summary.json. Metadata will be null.`);
            }
        } else {
            console.warn(`[API /api/runs/[configId]] Homepage summary not available or has no configs. Metadata will be null.`);
        }

        return NextResponse.json({ runs: validRuns, configTitle, configDescription, configTags }, { status: 200 });

    } catch (error: any) {
        console.error(`[API /api/runs/[configId]] Error fetching runs for configId ${configId}:`, error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
} 