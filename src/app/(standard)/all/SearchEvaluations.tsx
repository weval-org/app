'use client';

import React, { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import DetailedBlueprintCard from '@/app/components/home/DetailedBlueprintCard';
import { Skeleton } from '@/components/ui/skeleton';
import { PaginationControls } from './PaginationControls';
import Icon from '@/components/ui/icon';

const ITEMS_PER_PAGE = 20;

const BlueprintCardSkeleton = () => (
    <div className="bg-card/80 dark:bg-card/70 ring-1 ring-border dark:ring-border/70 rounded-lg p-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-grow space-y-3">
            <Skeleton className="h-6 w-3/4 rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-5/6 rounded-md" />
            <div className="flex gap-2 pt-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
            </div>
        </div>
        <div className="flex-shrink-0 w-full sm:w-56">
            <Skeleton className="h-full w-full min-h-[120px] rounded-md" />
        </div>
    </div>
);

interface SearchEvaluationsProps {
    initialBlueprints: BlueprintSummaryInfo[];
    currentPage: number;
    totalPages: number;
    totalItems: number;
}

export function SearchEvaluations({ initialBlueprints, currentPage, totalPages, totalItems: propTotalItems }: SearchEvaluationsProps) {
    const [query, setQuery] = useState('');
    const [searchQuery, setSearchQuery] = useState(''); // The actual query used for search
    const [searchResults, setSearchResults] = useState<BlueprintSummaryInfo[]>([]);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [isPending, startTransition] = useTransition();

    // When not searching: server already paginated, use initialBlueprints directly
    // When searching: do client-side pagination on search results
    const searchResultCount = searchResults.length;
    const effectiveTotalPages = isSearchActive ? Math.ceil(searchResultCount / ITEMS_PER_PAGE) : totalPages;
    const effectiveTotalItems = isSearchActive ? searchResultCount : propTotalItems;

    // For display text: calculate the range being shown
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;

    // Results to display: server-paginated blueprints OR client-paginated search results
    const displayResults = isSearchActive ? searchResults.slice(0, ITEMS_PER_PAGE) : initialBlueprints;

    const performSearch = async (searchTerm: string) => {
        if (searchTerm.length > 2) {
            setIsSearchActive(true);
            startTransition(async () => {
                const response = await fetch(`/api/search?q=${searchTerm}`);
                const results: BlueprintSummaryInfo[] = await response.json();
                setSearchResults(results);
            });
        } else if (searchTerm.length === 0) {
            setIsSearchActive(false);
            setSearchResults([]);
        }
    };

    const handleSearch = () => {
        setSearchQuery(query);
        performSearch(query);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearch();
        }
    };

    const handleClearSearch = () => {
        setQuery('');
        setSearchQuery('');
        setIsSearchActive(false);
        setSearchResults([]);
    };

    return (
        <div>
            <div className="mb-8 relative">
                <div className="relative flex gap-3">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            {isPending ? (
                                <Icon name="loader-2" className="h-5 w-5 text-muted-foreground animate-spin" />
                            ) : (
                                <Icon name="search" className="h-5 w-5 text-muted-foreground" />
                            )}
                        </div>
                        <Input
                            type="search"
                            placeholder="Search evaluations by title, description, tags, or summary content..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className={`w-full text-base p-4 pl-12 pr-4 ${isPending ? 'opacity-75' : ''}`}
                            disabled={isPending}
                        />
                    </div>
                    <Button 
                        onClick={handleSearch}
                        disabled={isPending || query.length <= 2}
                        variant="default"
                        className="px-6"
                    >
                        {isPending ? (
                            <Icon name="loader-2" className="h-4 w-4 animate-spin" />
                        ) : (
                            'Search'
                        )}
                    </Button>
                    {isSearchActive && (
                        <Button 
                            onClick={handleClearSearch}
                            variant="outline"
                            className="px-4"
                        >
                            Clear
                        </Button>
                    )}
                </div>
                {isPending && searchQuery.length > 2 && (
                    <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-primary/10 dark:bg-primary/20 border border-primary/20 rounded-md backdrop-blur-sm">
                        <div className="flex items-center justify-center space-x-2 text-sm text-primary font-medium">
                            <Icon name="loader-2" className="h-4 w-4 animate-spin" />
                            <span>Searching evaluations...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Results summary and top pagination */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                    {isSearchActive ? (
                        <span>Found {effectiveTotalItems} result{effectiveTotalItems === 1 ? '' : 's'} for &quot;{searchQuery}&quot;</span>
                    ) : (
                        <span>Showing {startIndex + 1}-{Math.min(endIndex, effectiveTotalItems)} of {effectiveTotalItems} evaluations</span>
                    )}
                </div>
                {!isSearchActive && effectiveTotalPages > 1 && !isPending && (
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={effectiveTotalPages}
                    />
                )}
            </div>

            {isPending ? (
                <div className="space-y-4 opacity-60">
                    <BlueprintCardSkeleton />
                    <BlueprintCardSkeleton />
                    <BlueprintCardSkeleton />
                </div>
            ) : displayResults.length > 0 ? (
                <>
                    <div className="space-y-4">
                        {displayResults.map(bp => (
                            <DetailedBlueprintCard key={bp.configId} blueprint={bp} />
                        ))}
                    </div>

                    {!isSearchActive && effectiveTotalPages > 1 && (
                        <div className="mt-8">
                            <PaginationControls
                                currentPage={currentPage}
                                totalPages={effectiveTotalPages}
                            />
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-16">
                    <Icon name="search-x" className="mx-auto h-16 w-16 text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-semibold">No Evaluations Found</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {isSearchActive ? (
                            <>Your search for &quot;{searchQuery}&quot; did not match any evaluations.</>
                        ) : (
                            <>No evaluations available.</>
                        )}
                    </p>
                </div>
            )}
        </div>
    );
} 