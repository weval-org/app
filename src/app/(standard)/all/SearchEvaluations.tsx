'use client';

import React, { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import DetailedBlueprintCard from '@/app/components/home/DetailedBlueprintCard';
import { Skeleton } from '@/components/ui/skeleton';
import { PaginationControls } from './PaginationControls';
import dynamic from 'next/dynamic';

const SearchX = dynamic(() => import('lucide-react').then(mod => mod.SearchX));
const Search = dynamic(() => import('lucide-react').then(mod => mod.Search));
const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));

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
}

export function SearchEvaluations({ initialBlueprints, currentPage, totalPages }: SearchEvaluationsProps) {
    const [query, setQuery] = useState('');
    const [searchQuery, setSearchQuery] = useState(''); // The actual query used for search
    const [allResults, setAllResults] = useState<BlueprintSummaryInfo[]>(initialBlueprints);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [isPending, startTransition] = useTransition();
    
    // Calculate pagination for current results
    const totalItems = allResults.length;
    const calculatedTotalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const effectiveCurrentPage = isSearchActive ? 1 : currentPage; // Always start search results at page 1
    const effectiveTotalPages = isSearchActive ? calculatedTotalPages : totalPages;
    
    const startIndex = (effectiveCurrentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedResults = allResults.slice(startIndex, endIndex);

    const performSearch = async (searchTerm: string) => {
        if (searchTerm.length > 2) {
            setIsSearchActive(true);
            startTransition(async () => {
                const response = await fetch(`/api/search?q=${searchTerm}`);
                const searchResults: BlueprintSummaryInfo[] = await response.json();
                setAllResults(searchResults);
            });
        } else if (searchTerm.length === 0) {
            setIsSearchActive(false);
            setAllResults(initialBlueprints);
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
        setAllResults(initialBlueprints);
    };

    return (
        <div>
            <div className="mb-8 relative">
                <div className="relative flex gap-3">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            {isPending ? (
                                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                            ) : (
                                <Search className="h-5 w-5 text-muted-foreground" />
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
                            <Loader2 className="h-4 w-4 animate-spin" />
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
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Searching evaluations...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Results summary */}
            <div className="mb-6 text-sm text-muted-foreground">
                {isSearchActive ? (
                    <span>Found {totalItems} result{totalItems === 1 ? '' : 's'} for &quot;{searchQuery}&quot;</span>
                ) : (
                    <span>Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems} evaluations</span>
                )}
            </div>

            {isPending ? (
                <div className="space-y-4 opacity-60">
                    <BlueprintCardSkeleton />
                    <BlueprintCardSkeleton />
                    <BlueprintCardSkeleton />
                </div>
            ) : paginatedResults.length > 0 ? (
                <>
                    <div className="space-y-4">
                        {paginatedResults.map(bp => (
                            <DetailedBlueprintCard key={bp.configId} blueprint={bp} />
                        ))}
                    </div>
                    
                    {!isSearchActive && effectiveTotalPages > 1 && (
                        <div className="mt-8">
                            <PaginationControls 
                                currentPage={effectiveCurrentPage} 
                                totalPages={effectiveTotalPages}
                            />
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-16">
                    <SearchX className="mx-auto h-16 w-16 text-muted-foreground/50" />
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