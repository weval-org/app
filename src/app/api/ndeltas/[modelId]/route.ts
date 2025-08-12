import { NextRequest, NextResponse } from 'next/server';
import { getModelNDeltas } from '@/lib/storageService';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await context.params;
    const data = await getModelNDeltas(modelId);
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}


