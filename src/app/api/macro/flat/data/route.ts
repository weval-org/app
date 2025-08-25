import { NextResponse } from 'next/server';
import { getMacroFlatData } from '@/lib/storageService';

export async function GET() {
  const buf = await getMacroFlatData();
  if (!buf) return new NextResponse('Not found', { status: 404 });
  // Cache binary strongly; it only changes when prep runs
  return new NextResponse(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=86400, immutable' } });
}


