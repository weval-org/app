import { NextResponse } from 'next/server';
import { getMacroPerModelManifest } from '@/lib/storageService';

export async function GET() {
  const m = await getMacroPerModelManifest();
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const res = NextResponse.json(m, { status: 200 });
  res.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res;
}


