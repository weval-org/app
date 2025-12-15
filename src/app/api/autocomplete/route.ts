import { NextResponse } from 'next/server';
import { getAutocompleteIndex } from '@/lib/storageService';

// Cache the index for 5 minutes
export const revalidate = 300;

export async function GET() {
    try {
        const index = await getAutocompleteIndex();

        if (!index) {
            return NextResponse.json(
                { error: 'Autocomplete index not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(index, {
            headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
            },
        });
    } catch (error: any) {
        console.error('Autocomplete API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
