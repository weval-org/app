import React from 'react';
import { listConfigIds, getConfigSummary } from '@/lib/storageService';
import { EnhancedComparisonConfigInfo } from '@/app/utils/homepageDataUtils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import nextDynamic from 'next/dynamic';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { normalizeTag } from '@/app/utils/tagUtils';
import { processBlueprintSummaries, BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import DetailedBlueprintCard from '@/app/components/home/DetailedBlueprintCard';
import { SearchEvaluations } from './SearchEvaluations';

const ArrowLeft = nextDynamic(() => import('lucide-react').then(mod => mod.ArrowLeft));
const TagIcon = nextDynamic(() => import('lucide-react').then(mod => mod.Tag));

const ITEMS_PER_PAGE = 20;

export default async function AllBlueprintsPage(props: {
    searchParams: Promise<{ page?: string }>;
}) {
    const searchParams = await props.searchParams;
    const page = parseInt(searchParams?.page || '1', 10);
    const allConfigIds = await listConfigIds();
    const totalPages = Math.ceil(allConfigIds.length / ITEMS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(page, totalPages));

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedConfigIds = allConfigIds.slice(startIndex, endIndex);

    const blueprintPromises = paginatedConfigIds.map(async (id) => {
        const summary = await getConfigSummary(id);
        return summary;
    });

    const results = await Promise.all(blueprintPromises);

    const filteredResults = results.filter((summary): summary is EnhancedComparisonConfigInfo => summary !== null);
    const blueprints: BlueprintSummaryInfo[] = processBlueprintSummaries(filteredResults);
        
    // Sort by latest run to ensure the most recently active blueprints are at the top
    blueprints.sort((a, b) => {
        const dateA = a.latestRunTimestamp ? new Date(fromSafeTimestamp(a.latestRunTimestamp)).getTime() : 0;
        const dateB = b.latestRunTimestamp ? new Date(fromSafeTimestamp(b.latestRunTimestamp)).getTime() : 0;
        return dateB - dateA;
    });

    // Create a Set of all unique, non-featured tags
    const allTags = new Set<string>();
    blueprints.forEach(config => {
        if (config.tags) {
            config.tags.forEach(tag => {
                if (!tag.startsWith('_')) {
                    allTags.add(tag);
                }
            });
        }
    });
    const sortedTags = Array.from(allTags).sort((a, b) => a.localeCompare(b));

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-background dark:to-muted/20 bg-gradient-to-br from-background to-muted/10" />
            
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-bold tracking-tight">All Evaluations ({allConfigIds.length})</h2>
                    <Button asChild variant="ghost">
                        <Link href="/">
                            {ArrowLeft && <ArrowLeft className="w-4 h-4 mr-2" />}
                            Back to Home
                        </Link>
                    </Button>
                </div>
                
                <SearchEvaluations 
                    initialBlueprints={blueprints} 
                    currentPage={currentPage}
                    totalPages={totalPages}
                />
            </main>
        </div>
    );
} 