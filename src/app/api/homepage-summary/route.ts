import { NextResponse } from 'next/server';
import { getHomepageSummary } from '@/lib/storageService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await getHomepageSummary();
    if (!summary) {
      return NextResponse.json({ error: 'Homepage summary not found.' }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[API/homepage-summary] Error fetching homepage summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
