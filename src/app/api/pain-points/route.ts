import { NextResponse } from 'next/server';
import { getPainPointsSummary } from '@/lib/storageService';

export const revalidate = 60; // Revalidate every 60 seconds

export async function GET() {
  try {
    const summary = await getPainPointsSummary();
    if (!summary) {
      return NextResponse.json(
        { painPoints: [], generatedAt: null },
        { status: 200 },
      );
    }
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('Error fetching pain points summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pain points data' },
      { status: 500 },
    );
  }
}
