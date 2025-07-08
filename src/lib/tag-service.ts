import { getHomepageSummary } from '@/lib/storageService';

type TagInfo = {
  name: string;
  count: number;
};

export async function getTags(): Promise<TagInfo[]> {
    try {
        const homepageSummary = await getHomepageSummary();

        if (!homepageSummary || !homepageSummary.configs) {
            return [];
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

        return sortedTags;

    } catch (error: any) {
        console.error('[tagService] Error fetching tags:', error);
        return []; // Return empty array on error
    }
} 