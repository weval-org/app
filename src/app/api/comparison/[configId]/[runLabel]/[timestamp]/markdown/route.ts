import { NextRequest, NextResponse } from 'next/server';
import { listRunsForConfig, getResultByFileName } from '@/lib/storageService';
import { generateRunMarkdown } from '@/app/utils/markdownGenerator';
import { ComparisonDataV2 } from '@/app/utils/types';

export const revalidate = 3600;

export async function GET(
    request: NextRequest, 
    context: { params: Promise<{ configId: string, runLabel: string, timestamp: string }> } 
) {
    const { configId, runLabel: routeRunLabel, timestamp: routeTimestamp } = await context.params;

    if (typeof configId !== 'string' || typeof routeRunLabel !== 'string' || typeof routeTimestamp !== 'string') {
        return NextResponse.json({ error: 'Config ID, Run Label, and Timestamp must be strings' }, { status: 400 });
    }

    try {
        const allRunsForConfig = await listRunsForConfig(configId);

        if (!allRunsForConfig || allRunsForConfig.length === 0) {
            return NextResponse.json({ error: `No runs found for configId ${configId}` }, { status: 404 });
        }

        const specificRun = allRunsForConfig.find(run => {
            const safeRunTimestampFromStorage = run.timestamp;
            return run.runLabel === routeRunLabel && safeRunTimestampFromStorage === routeTimestamp;
        });

        if (!specificRun) {
            return NextResponse.json({ error: `Comparison data not found for ${configId}/${routeRunLabel}/${routeTimestamp}` }, { status: 404 });
        }

        const jsonData: ComparisonDataV2 | null = await getResultByFileName(configId, specificRun.fileName);

        if (!jsonData) {
            return NextResponse.json({ error: `Comparison data file not found for ${configId}/${routeRunLabel}/${routeTimestamp} (file: ${specificRun.fileName})` }, { status: 404 });
        }
        
        const { searchParams } = new URL(request.url);
        const truncateLengthStr = searchParams.get('truncate');
        const truncateLength = truncateLengthStr ? parseInt(truncateLengthStr, 10) : undefined;
        
        const markdownContent = await generateRunMarkdown(jsonData, { truncateLength });

        const isTruncated = truncateLength !== undefined;
        const fileName = isTruncated
            ? `${configId}_${routeRunLabel}_${routeTimestamp}_truncated.md`
            : `${configId}_${routeRunLabel}_${routeTimestamp}.md`;

        return new NextResponse(markdownContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/markdown; charset=utf-8',
                'Content-Disposition': `attachment; filename="${fileName}"`,
            },
        });

    } catch (error: any) {
        console.error(`[API Markdown] Error generating markdown for ${configId}/${routeRunLabel}/${routeTimestamp}:`, error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
} 