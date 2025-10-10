import { NextResponse } from 'next/server';
import { getRegressionsSummary } from '@/lib/storageService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await getRegressionsSummary();
    if (!summary) {
      return NextResponse.json({ error: 'Regressions summary not found.' }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[API/regressions-summary] Error fetching regressions summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
