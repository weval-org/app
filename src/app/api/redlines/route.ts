import { NextResponse } from 'next/server';
import { getRedlinesFeed } from '@/lib/storageService';

export const revalidate = 30;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10)));

    const feed = await getRedlinesFeed();
    if (!feed?.items?.length) {
      return NextResponse.json({ items: [], limit, source: 'feed' });
    }

    return NextResponse.json({ 
      items: feed.items.slice(0, limit), 
      limit, 
      source: 'feed',
      lastUpdated: feed.lastUpdated
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to list Redlines' }, { status: 500 });
  }
}
