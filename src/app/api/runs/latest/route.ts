import { NextResponse } from 'next/server';
import { getLatestRunsSummary } from '@/lib/storageService';

export async function GET() {
  try {
    const latestRunsSummary = await getLatestRunsSummary();
    if (!latestRunsSummary) {
      return NextResponse.json({ message: 'Latest runs summary not found.' }, { status: 404 });
    }
    return NextResponse.json(latestRunsSummary);
  } catch (error) {
    console.error('Error fetching latest runs summary:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
} 