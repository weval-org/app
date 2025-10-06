import { NextRequest, NextResponse } from 'next/server';
import { getResultByFileName, listRunsForConfig } from '@/lib/storageService';
import type { ComparisonDataV2 } from '@/app/utils/types';

export const revalidate = 3600; // Cache for 1 hour

/**
 * API endpoint that returns the complete, unstripped comparison data.
 * This is used when "Run in Sandbox" needs full rubric points that aren't in core.json.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ configId: string; runLabel: string; timestamp: string }> }
) {
  try {
    const { configId, runLabel, timestamp } = await context.params;

    // Get all runs for this config to find the specific file
    const allRuns = await listRunsForConfig(configId);
    
    if (!allRuns || allRuns.length === 0) {
      return NextResponse.json(
        { error: `No runs found for configId ${configId}` },
        { status: 404 }
      );
    }

    // Find the specific run by runLabel and timestamp
    const specificRun = allRuns.find(
      run => run.runLabel === runLabel && run.timestamp === timestamp
    );

    if (!specificRun) {
      return NextResponse.json(
        { error: `Comparison data not found for ${configId}/${runLabel}/${timestamp}` },
        { status: 404 }
      );
    }

    // Fetch the full legacy file which contains all data including rubrics
    const fullData: ComparisonDataV2 | null = await getResultByFileName(
      configId,
      specificRun.fileName
    );

    if (!fullData) {
      return NextResponse.json(
        { error: `Comparison data file not found: ${specificRun.fileName}` },
        { status: 404 }
      );
    }

    const res = NextResponse.json(fullData);
    res.headers.set(
      'Cache-Control',
      'public, max-age=0, s-maxage=3600, stale-while-revalidate=600'
    );
    return res;
  } catch (error) {
    console.error('[Raw API] Error fetching raw comparison data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch raw comparison data' },
      { status: 500 }
    );
  }
}
