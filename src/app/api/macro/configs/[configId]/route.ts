import { NextResponse } from 'next/server';
import { getMacroConfigMapping } from '@/lib/storageService';

export async function GET(_: Request, ctx: { params: Promise<{ configId: string }> }) {
  const params = await ctx.params;
  const mapping = await getMacroConfigMapping(params.configId);
  if (!mapping) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(mapping, { status: 200 });
}


