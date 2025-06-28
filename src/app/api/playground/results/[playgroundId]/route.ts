import { NextResponse } from 'next/server';

/**
 * @deprecated This API route is no longer used for rendering playground result pages.
 * The data fetching logic is handled directly within `src/app/playground/results/[playgroundId]/page.tsx`.
 * This file can likely be removed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ playgroundId: string }> }
) {
  const { playgroundId } = await params;

  console.error(
    `[DEPRECATED] The API route at /api/playground/results/[playgroundId]/route.ts was called for ${playgroundId}. ` +
    `This route is deprecated. Data fetching is now handled directly in the page component.`
  );

  return NextResponse.json(
    {
      error: 'This API endpoint is deprecated and should not be used for page data.',
      message: 'Data fetching for playground result pages is handled server-side in the corresponding page.tsx file.'
    },
    { status: 410 } // 410 Gone
  );
}
