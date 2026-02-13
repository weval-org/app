import React from 'react';
import { getAllBlueprintSummaries, EnhancedComparisonConfigInfo } from '@/app/utils/homepageDataUtils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { processBlueprintSummaries } from '@/app/utils/blueprintSummaryUtils';
import { BenchmarkListPage } from './BenchmarkListPage';
import Icon from '@/components/ui/icon';
import type { Metadata } from 'next';

export const revalidate = 3600; // Revalidate once per hour

export const metadata: Metadata = {
    title: 'Benchmarks | weval',
    description: 'Academic benchmark evaluations derived from published research papers, tested across leading AI models.',
};

function isBenchmarkEvaluation(config: EnhancedComparisonConfigInfo): boolean {
    const configId = config.id || config.configId || '';
    return configId.startsWith('benchmarks__');
}

export default async function BenchmarksPage() {
    const rawConfigs = await getAllBlueprintSummaries();

    const allConfigs = rawConfigs.filter(isBenchmarkEvaluation);

    allConfigs.sort((a, b) => {
        const dateA = a.latestRunTimestamp ? new Date(fromSafeTimestamp(a.latestRunTimestamp)).getTime() : 0;
        const dateB = b.latestRunTimestamp ? new Date(fromSafeTimestamp(b.latestRunTimestamp)).getTime() : 0;
        return dateB - dateA;
    });

    // Process all benchmarks — dataset is small enough for client-side search + pagination
    const blueprints = processBlueprintSummaries(allConfigs);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-background dark:to-muted/20 bg-gradient-to-br from-background to-muted/10" />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-3xl font-bold tracking-tight">Benchmarks</h2>
                    <Button asChild variant="ghost">
                        <Link href="/">
                            <Icon name="arrow-left" className="w-4 h-4 mr-2" />
                            Back to Home
                        </Link>
                    </Button>
                </div>
                <p className="text-muted-foreground mb-8 max-w-2xl">
                    Evaluations derived from published academic papers, testing AI model capabilities across standardized benchmarks. {blueprints.length} benchmark{blueprints.length === 1 ? '' : 's'} tracked.
                </p>

                <BenchmarkListPage blueprints={blueprints} />
            </main>
        </div>
    );
}
