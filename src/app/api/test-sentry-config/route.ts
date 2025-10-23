import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({
    hasSentryDsn: !!process.env.SENTRY_DSN,
    hasPublicSentryDsn: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    nodeEnv: process.env.NODE_ENV,
    context: process.env.CONTEXT,
    sentryDsnPrefix: process.env.SENTRY_DSN?.substring(0, 20) + '...',
  });
}
