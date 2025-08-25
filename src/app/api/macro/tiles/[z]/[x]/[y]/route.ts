import { NextResponse } from 'next/server';
import { getMacroTile } from '@/lib/storageService';

export async function GET(_: Request, ctx: { params: Promise<{ z: string; x: string; y: string }> }) {
  const params = await ctx.params;
  const z = parseInt(params.z, 10);
  const x = parseInt(params.x, 10);
  const y = parseInt(params.y, 10);
  const buf = await getMacroTile(z, x, y);
  if (!buf) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}


