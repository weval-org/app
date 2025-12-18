import React from 'react';
import { getAllBlueprintSummaries, EnhancedComparisonConfigInfo } from '@/app/utils/homepageDataUtils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { processBlueprintSummaries, BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import { SearchEvaluations } from './SearchEvaluations';
import Icon from '@/components/ui/icon';

const ITEMS_PER_PAGE = 20;

// Config ID prefixes that indicate non-public evaluations
const EXCLUDED_CONFIG_ID_PREFIXES = ['_pr_', '_staging_', '_test_', 'api-run-', 'sandbox-'];

// Tags that indicate non-public/internal evaluations
const EXCLUDED_TAGS = ['_test', '_sandbox_test'];

function isPublicEvaluation(config: EnhancedComparisonConfigInfo): boolean {
    const configId = config.id || config.configId || '';
    // Check config ID prefix
    if (EXCLUDED_CONFIG_ID_PREFIXES.some(prefix => configId.startsWith(prefix))) {
        return false;
    }
    // Check tags
    if (config.tags && config.tags.some(tag => EXCLUDED_TAGS.includes(tag))) {
        return false;
    }
    return true;
}

export default async function AllBlueprintsPage(props: {
    searchParams: Promise<{ page?: string }>;
}) {
    const searchParams = await props.searchParams;
    const page = parseInt(searchParams?.page || '1', 10);
    const rawConfigs = await getAllBlueprintSummaries();

    // Filter out internal/sandbox configs
    const allConfigs = rawConfigs.filter(isPublicEvaluation);

    // Sort all configs by latest run before pagination to ensure consistency
    allConfigs.sort((a, b) => {
        const dateA = a.latestRunTimestamp ? new Date(fromSafeTimestamp(a.latestRunTimestamp)).getTime() : 0;
        const dateB = b.latestRunTimestamp ? new Date(fromSafeTimestamp(b.latestRunTimestamp)).getTime() : 0;
        return dateB - dateA;
    });

    const totalItems = allConfigs.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(page, totalPages));

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedConfigs = allConfigs.slice(startIndex, endIndex);

    const blueprints: BlueprintSummaryInfo[] = processBlueprintSummaries(paginatedConfigs);
        
    // The sorting is now done before pagination, so this is not needed.
    // blueprints.sort((a, b) => {
    //     const dateA = a.latestRunTimestamp ? new Date(fromSafeTimestamp(a.latestRunTimestamp)).getTime() : 0;
    //     const dateB = b.latestRunTimestamp ? new Date(fromSafeTimestamp(b.latestRunTimestamp)).getTime() : 0;
    //     return dateB - dateA;
    // });

    // Create a Set of all unique, non-featured tags from ALL configs, not just the paginated ones
    const allTags = new Set<string>();
    allConfigs.forEach(config => {
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
                    <h2 className="text-3xl font-bold tracking-tight">All Evaluations ({totalItems})</h2>
                    <Button asChild variant="ghost">
                        <Link href="/">
                            <Icon name="arrow-left" className="w-4 h-4 mr-2" />
                            Back to Home
                        </Link>
                    </Button>
                </div>
                
                <SearchEvaluations
                    initialBlueprints={blueprints}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                />
            </main>
        </div>
    );
} 