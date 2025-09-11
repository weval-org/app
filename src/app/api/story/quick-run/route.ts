import { NextResponse } from 'next/server';

// This stub exists to satisfy Next's type generation for .next/types.
// The real quick-run endpoints are in subroutes: /quick-run/start and /quick-run/status/[runId]
// We return 404 for direct access to /quick-run.

export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export const dynamic = 'force-dynamic';


