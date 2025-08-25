import { NextResponse } from 'next/server';
import { getMacroFlatManifest } from '@/lib/storageService';

export async function GET() {
  const m = await getMacroFlatManifest();
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const res = NextResponse.json(m, { status: 200 });
  // Short cache with SWR – manifest changes when prep runs
  res.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res;
}


