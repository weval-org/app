import { NextRequest, NextResponse } from 'next/server';

/**
 * Debug endpoint to check environment variables available to the app
 */
export async function GET(req: NextRequest) {
  const hasToken = !!process.env.BACKGROUND_FUNCTION_AUTH_TOKEN;
  const tokenLength = process.env.BACKGROUND_FUNCTION_AUTH_TOKEN?.length || 0;
  const tokenPrefix = process.env.BACKGROUND_FUNCTION_AUTH_TOKEN?.substring(0, 10) || 'N/A';

  return NextResponse.json({
    hasToken,
    tokenLength,
    tokenPrefix: hasToken ? tokenPrefix + '...' : 'N/A',
    allEnvVars: Object.keys(process.env).filter(k =>
      k.includes('BACKGROUND') ||
      k.includes('TOKEN') ||
      k.includes('NEXT_PUBLIC') ||
      k.includes('URL')
    ).sort()
  });
}
