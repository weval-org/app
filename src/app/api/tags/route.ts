import { NextResponse } from 'next/server';
import { getHomepageSummary } from '@/lib/storageService';

export const revalidate = 3600; // Cache for an hour

export async function GET() {
    try {
        const homepageSummary = await getHomepageSummary();

        if (!homepageSummary || !homepageSummary.configs) {
            return NextResponse.json({ tags: [] }, { status: 200 });
        }

        const tagCounts: Record<string, number> = {};

        for (const config of homepageSummary.configs) {
            if (config.tags) {
                for (const tag of config.tags) {
                    // We don't want to show internal tags like _featured
                    if (tag.startsWith('_')) {
                        continue;
                    }
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                }
            }
        }

        const sortedTags = Object.entries(tagCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count); // Sort by count descending

        return NextResponse.json({ tags: sortedTags }, { status: 200 });

    } catch (error: any) {
        console.error('[API /api/tags] Error fetching tags:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 