// Obsolete endpoint (tiled). Keep returning 404 to indicate flat-only.
import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ error: 'Tiled macro index removed. Use /api/macro/flat/*.' }, { status: 404 });
}


