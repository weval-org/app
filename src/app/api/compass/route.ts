import { NextResponse } from 'next/server';
import { getCompassIndex } from '@/lib/storageService';

export async function GET() {
  try {
    const data = await getCompassIndex();
    if (!data) return NextResponse.json({ error: 'Compass index not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load compass index' }, { status: 500 });
  }
}


