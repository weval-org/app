import { NextRequest, NextResponse } from 'next/server';
import { getSearchIndex } from '@/lib/storageService';
import { SearchableBlueprintSummary } from '@/cli/types/cli_types';

let fuse: any | null = null;
let lastIndexFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getFuseInstance() {
    const now = Date.now();
    if (!fuse || (now - lastIndexFetchTime > CACHE_DURATION)) {
        console.log('Search index is stale or not created, fetching...');
        const searchIndex = await getSearchIndex();
        if (searchIndex) {
            const { default: Fuse } = await import('fuse.js');
            fuse = new Fuse(searchIndex, {
                keys: ['searchText'],
                includeScore: true,
                threshold: 0.6, // More lenient threshold (0.0 = exact match, 1.0 = match anything)
                minMatchCharLength: 2, // Allow shorter matches
                ignoreLocation: false, // Don't consider position in text
                findAllMatches: true, // Find all matches, not just the first
            });
            console.log(`Successfully created Fuse instance with ${searchIndex.length} documents.`);
        } else {
            fuse = null; // Reset if index is not available
            console.log('Search index not found or is empty.');
        }
        lastIndexFetchTime = now;
    }
    return fuse;
}


export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');
        const debug = searchParams.get('debug');

        // Debug mode: return raw search index for inspection
        if (debug === 'index' && process.env.NODE_ENV === 'development') {
            const searchIndex = await getSearchIndex();
            if (!searchIndex) {
                return NextResponse.json({ error: 'Search index not found' }, { status: 404 });
            }
            return NextResponse.json({
                indexSize: searchIndex.length,
                sampleEntries: searchIndex.slice(0, 3), // Show first 3 entries
                allEntries: searchIndex // Full index for download
            }, {
                headers: {
                    'Content-Disposition': 'attachment; filename="search-index-debug.json"',
                },
            });
        }

        // Debug mode: search with detailed results
        if (debug === 'search' && query && process.env.NODE_ENV === 'development') {
            const fuseInstance = await getFuseInstance();
            if (!fuseInstance) {
                return NextResponse.json({ error: 'Search index is not available' }, { status: 503 });
            }

            const results = fuseInstance.search(query);
            return NextResponse.json({
                query,
                totalResults: results.length,
                detailedResults: results.map((result: any) => ({
                    score: result.score,
                    item: result.item,
                    searchTextSnippet: result.item.searchText.substring(0, 200) + '...'
                }))
            });
        }

        if (!query) {
            return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
        }

        const fuseInstance = await getFuseInstance();
        if (!fuseInstance) {
            return NextResponse.json({ error: 'Search index is not available' }, { status: 503 });
        }

        const results = fuseInstance.search(query);
        const searchDocs = results.map((result: any) => result.item);
        
        return NextResponse.json(searchDocs, {
            headers: {
                'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
            },
        });
    } catch (error: any) {
        console.error('Search API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
} 