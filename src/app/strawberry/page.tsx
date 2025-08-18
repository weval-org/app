import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listRunsForConfig, getCoreResult } from '@/lib/storageService';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import Client from './Client';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: 'Strawberry — Aggregate Results',
        description: 'Aggregate performance on the Strawberry test (latest run).',
    };
}

async function getLatestStrawberryRun() {
    const configId = 'strawberry';
    const runs = await listRunsForConfig(configId);
    if (!runs || runs.length === 0) return null;

    const withParsed = runs
        .filter(r => !!r.timestamp)
        .map(r => ({
            ...r,
            ts: new Date(fromSafeTimestamp(r.timestamp!)).getTime(),
        }))
        .sort((a, b) => b.ts - a.ts);

    const latest = withParsed[0];
    if (!latest?.timestamp) return null;

    const data = await getCoreResult(configId, latest.runLabel, latest.timestamp);
    if (!data) return null;

    return {
        configId,
        runLabel: latest.runLabel,
        timestamp: latest.timestamp,
        data,
    };
}

export default async function StrawberryPage() {
    const latest = await getLatestStrawberryRun();
    if (!latest) notFound();

    return (
        <div className="min-h-screen w-full">
            <Client
                configId={latest.configId}
                runLabel={latest.runLabel}
                timestamp={latest.timestamp}
                data={latest.data}
            />
        </div>
    );
}


