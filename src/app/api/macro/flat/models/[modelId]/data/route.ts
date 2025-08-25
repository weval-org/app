import { NextResponse } from 'next/server';
import { getMacroPerModelData } from '@/lib/storageService';

export async function GET(_: Request, ctx: { params: Promise<{ modelId: string }> }) {
  const params = await ctx.params;
  const buf = await getMacroPerModelData(params.modelId);
  if (!buf) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=86400, immutable' } });
}


