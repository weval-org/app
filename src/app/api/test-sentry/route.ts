import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Intentional test error for Sentry
  throw new Error('Test error from /api/test-sentry - Sentry integration working!');
}
