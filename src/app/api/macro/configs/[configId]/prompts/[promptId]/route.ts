import { NextResponse } from 'next/server';
import { getMacroPromptMapping } from '@/lib/storageService';

export async function GET(_: Request, ctx: { params: Promise<{ configId: string; promptId: string }> }) {
  const params = await ctx.params;
  const mapping = await getMacroPromptMapping(params.configId, params.promptId);
  if (!mapping) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(mapping, { status: 200 });
}


