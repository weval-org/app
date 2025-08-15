import { NextResponse } from 'next/server';
import { getVibesIndex } from '@/lib/storageService';

export async function GET() {
  try {
    const data = await getVibesIndex();
    if (!data) {
      return NextResponse.json({ error: 'Vibes index not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load vibes index' }, { status: 500 });
  }
}


