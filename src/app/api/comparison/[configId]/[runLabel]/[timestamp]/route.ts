import { NextRequest, NextResponse } from 'next/server';

/**
 * @deprecated This API route is no longer used for rendering analysis pages.
 * The data fetching has been moved directly into `src/app/(full)/analysis/[configId]/[runLabel]/[timestamp]/page.tsx`
 * for better performance and to leverage Next.js data caching. This file should be considered for removal.
 */
export async function GET(
    request: NextRequest, 
    context: { params: Promise<{ configId: string, runLabel: string, timestamp: string }> } 
) {
    const { configId, runLabel, timestamp } = await context.params;
    const key = `${configId}/${runLabel}/${timestamp}`;
    
    console.error(
        `[DEPRECATED] The API route at /api/comparison/[...]/route.ts was called for ${key}. ` +
        `This route is deprecated. Data fetching is now handled directly in the page component.`
    );

    return NextResponse.json(
        { 
            error: 'This API endpoint is deprecated and should not be used for page data.',
            message: 'Data fetching for analysis pages is now handled server-side in the corresponding page.tsx file.'
        }, 
        { status: 410 } // 410 Gone
    );
} 