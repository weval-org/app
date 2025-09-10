import { NextResponse } from 'next/server';
import { getHomepageSummary } from '@/lib/storageService';

export const dynamic = 'force-dynamic'; // defaults to auto
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tag = searchParams.get('tag');

    try {
        const homepageSummary = await getHomepageSummary();

        if (!homepageSummary) {
            return NextResponse.json({ error: 'Homepage summary not found.' }, { status: 404 });
        }

        let configs = homepageSummary.configs;

        if (tag) {
            configs = configs.filter(config => 
                config.tags?.some(t => t.toLowerCase() === tag.toLowerCase())
            );
        }

        const evaluations = configs.map(config => ({
            id: config.configId,
            title: config.configTitle,
            description: config.description,
            tags: config.tags,
            latestRunTimestamp: config.latestRunTimestamp,
            runs: config.runs.map(run => ({
                runLabel: run.runLabel,
                timestamp: run.timestamp,
                // A link to the detailed endpoint for this run
                url: `/api/evaluations/${config.configId}/${run.runLabel}/${run.timestamp}`,
            })),
        }));

        return NextResponse.json(evaluations);
    } catch (error: any) {
        console.error('[API /evaluations] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
