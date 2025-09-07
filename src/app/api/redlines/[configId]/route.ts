import { NextRequest, NextResponse } from 'next/server';
import { getConfigRedlinesFeed } from '@/lib/storageService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
) {
  try {
    const { configId } = await params;
    
    if (!configId) {
      return NextResponse.json({ error: 'configId is required' }, { status: 400 });
    }

    const redlinesFeed = await getConfigRedlinesFeed(configId);
    
    if (!redlinesFeed) {
      return NextResponse.json({ error: 'Redlines not found for this config' }, { status: 404 });
    }

    return NextResponse.json(redlinesFeed);
  } catch (error) {
    console.error('[API] Error fetching config redlines:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
