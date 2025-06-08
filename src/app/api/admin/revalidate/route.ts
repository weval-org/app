import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

// This is the endpoint that can be called to manually trigger a revalidation of a page.
// This is useful for forcing a refresh of the homepage cache after an evaluation has been run.

export async function POST(request: NextRequest) {
  const { secret, path } = await request.json();

  // Use the server-side ADMIN_SECRET_SLUG if available, otherwise fall back to the public one.
  // Note: Using a NEXT_PUBLIC_ variable for a server-side secret check is not ideal,
  // as it's exposed to the client. Prefer setting a dedicated server-side env variable.
  const adminSecret = process.env.ADMIN_SECRET_SLUG || process.env.NEXT_PUBLIC_ADMIN_SECRET_SLUG;

  if (!adminSecret) {
    console.error("Revalidate endpoint: ADMIN_SECRET_SLUG or NEXT_PUBLIC_ADMIN_SECRET_SLUG is not set. Cannot process revalidation.");
    return NextResponse.json({ message: 'Revalidation secret not configured on server.' }, { status: 500 });
  }
  
  if (secret !== adminSecret) {
    return new NextResponse(JSON.stringify({ message: 'Invalid secret token.' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!path || typeof path !== 'string') {
    return NextResponse.json({
      revalidated: false,
      message: 'Missing or invalid `path` to revalidate.',
    }, { status: 400 });
  }

  try {
    // revalidatePath purges the cache for the given path.
    // The next request to this path will trigger a fresh render.
    revalidatePath(path);
    console.log(`[Admin Revalidate] Successfully triggered revalidation for path: ${path}`);
    return NextResponse.json({ revalidated: true, path, now: Date.now() });
  } catch (error: any) {
    console.error(`[Admin Revalidate] Error triggering revalidation for path: ${path}`, error);
    return NextResponse.json({ revalidated: false, path, message: `Revalidation failed: ${error.message}` }, { status: 500 });
  }
} 