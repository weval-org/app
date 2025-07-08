import { NextResponse } from 'next/server';
import { getTags } from '@/lib/tag-service';

export const revalidate = 3600; // Cache for an hour
export const dynamic = 'force-dynamic'; // Prevent build-time timeouts

export async function GET() {
    try {
        const sortedTags = await getTags();
        return NextResponse.json({ tags: sortedTags }, { status: 200 });
    } catch (error: any) {
        console.error('[API /api/tags] Error fetching tags:', error);
        return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
    }
} 