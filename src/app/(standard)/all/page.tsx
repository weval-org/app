import React from 'react';
import { listConfigIds, getConfigSummary } from '@/lib/storageService';
import { EnhancedComparisonConfigInfo } from '@/app/utils/homepageDataUtils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import nextDynamic from 'next/dynamic';
import { PaginationControls } from './PaginationControls';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { normalizeTag } from '@/app/utils/tagUtils';

const ArrowLeft = nextDynamic(() => import('lucide-react').then(mod => mod.ArrowLeft));
const TagIcon = nextDynamic(() => import('lucide-react').then(mod => mod.Tag));

const ITEMS_PER_PAGE = 20;

interface BlueprintIndexItem {
    id: string;
    title: string;
    description: string | null;
    latestRunTimestamp: string | null;
    totalRuns: number;
    tags: string[];
}

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

    const blueprints: BlueprintIndexItem[] = results
        .filter((summary): summary is EnhancedComparisonConfigInfo => summary !== null)
        .map(summary => ({
            id: summary.configId,
            title: summary.title || summary.configTitle || summary.configId,
            description: summary.description || null,
            latestRunTimestamp: summary.latestRunTimestamp,
            totalRuns: summary.runs?.length || 0,
            tags: summary.tags || [],
        }));
        
    // Sort by latest run to ensure the most recently active blueprints are at the top
    blueprints.sort((a, b) => {
        const dateA = a.latestRunTimestamp ? new Date(fromSafeTimestamp(a.latestRunTimestamp)).getTime() : 0;
        const dateB = b.latestRunTimestamp ? new Date(fromSafeTimestamp(b.latestRunTimestamp)).getTime() : 0;
        return dateB - dateA;
    });

    // Create a Set of all unique, non-featured tags
    const allTags = new Set<string>();
    blueprints.forEach(config => {
        config.tags.forEach(tag => {
            if (!tag.startsWith('_')) {
                allTags.add(tag);
            }
        });
    });
    const sortedTags = Array.from(allTags).sort((a, b) => a.localeCompare(b));

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-background dark:to-muted/20 bg-gradient-to-br from-background to-muted/10" />
            
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-bold tracking-tight">All Evaluation Blueprints ({allConfigIds.length})</h2>
                    <Button asChild variant="ghost">
                        <Link href="/">
                            {ArrowLeft && <ArrowLeft className="w-4 h-4 mr-2" />}
                            Back to Home
                        </Link>
                    </Button>
                </div>
                
                <div className="space-y-4">
                    {blueprints.map(bp => (
                        <Link key={bp.id} href={`/analysis/${bp.id}`} className="block">
                            <div className="bg-card/80 dark:bg-card/60 p-5 rounded-lg border border-border dark:border-border/60 shadow-sm hover:shadow-md hover:border-primary/30 dark:hover:border-primary/50 transition-all duration-200">
                                <h3 className="font-semibold text-lg text-primary">{bp.title}</h3>
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{bp.description || 'No description available.'}</p>
                                <div className="text-xs text-muted-foreground/80 dark:text-muted-foreground/80 mt-3 flex items-center justify-between">
                                    <span>
                                        <strong>{bp.totalRuns}</strong> {bp.totalRuns === 1 ? 'run' : 'runs'} recorded
                                    </span>
                                    {bp.latestRunTimestamp && (
                                        <span>Last run: {new Date(fromSafeTimestamp(bp.latestRunTimestamp)).toLocaleDateString()}</span>
                                    )}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

                {totalPages > 1 && (
                    <PaginationControls currentPage={currentPage} totalPages={totalPages} />
                )}

                {sortedTags.length > 0 && (
                    <section id="tags-section" className="mt-12">
                        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-6">Browse by Tag</h2>
                        <div className="flex flex-wrap gap-2">
                            {sortedTags.map(tag => (
                                <Link href={`/tags/${normalizeTag(tag)}`} key={tag}>
                                    <div className="bg-card/80 dark:bg-card/60 p-5 rounded-lg border border-border dark:border-border/60 shadow-sm hover:shadow-md hover:border-primary/30 dark:hover:border-primary/50 transition-all duration-200">
                                        <div className="flex items-center gap-2">
                                            {TagIcon && <TagIcon className="w-4 h-4 text-primary" />}
                                            <h3 className="font-medium text-foreground">{tag}</h3>
                                        </div>
                                        <div className="text-xs text-muted-foreground/80 dark:text-muted-foreground/80 mt-3 flex items-center justify-between">
                                            {/* Future: could add blueprint count per tag here */}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
} 