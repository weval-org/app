'use client';

import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import BenchmarkCard from '@/app/components/home/BenchmarkCard';
import Icon from '@/components/ui/icon';

const ITEMS_PER_PAGE = 20;

interface BenchmarkListPageProps {
    blueprints: BlueprintSummaryInfo[];
}

function matchesQuery(bp: BlueprintSummaryInfo, q: string): boolean {
    const lower = q.toLowerCase();
    const fields = [
        bp.title,
        bp.configTitle,
        bp.description,
        ...(bp.tags || []),
        typeof bp.author === 'string' ? bp.author : (bp.author as any)?.name,
    ];
    return fields.some(f => f && f.toLowerCase().includes(lower));
}

export function BenchmarkListPage({ blueprints }: BenchmarkListPageProps) {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        if (!query.trim()) return blueprints;
        return blueprints.filter(bp => matchesQuery(bp, query.trim()));
    }, [blueprints, query]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const displayResults = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const handleQueryChange = (value: string) => {
        setQuery(value);
        setPage(1); // reset to first page on new search
    };

    return (
        <div>
            <div className="mb-8">
                <div className="relative flex gap-3">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Icon name="search" className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <Input
                            type="search"
                            placeholder="Filter benchmarks by title, author, tags..."
                            value={query}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            className="w-full text-base p-4 pl-12 pr-4"
                        />
                    </div>
                    {query && (
                        <Button
                            onClick={() => handleQueryChange('')}
                            variant="outline"
                            className="px-4"
                        >
                            Clear
                        </Button>
                    )}
                </div>
            </div>

            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                    {query.trim() ? (
                        <span>Found {filtered.length} result{filtered.length === 1 ? '' : 's'} for &quot;{query.trim()}&quot;</span>
                    ) : (
                        <span>Showing {Math.min(startIndex + 1, filtered.length)}-{Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)} of {filtered.length} benchmarks</span>
                    )}
                </div>
                {totalPages > 1 && (
                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            disabled={currentPage <= 1}
                            onClick={() => setPage(p => p - 1)}
                            size="sm"
                        >
                            <Icon name="arrow-left" className="w-4 h-4 mr-2" />
                            Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            disabled={currentPage >= totalPages}
                            onClick={() => setPage(p => p + 1)}
                            size="sm"
                        >
                            Next
                            <Icon name="arrow-right" className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                )}
            </div>

            {displayResults.length > 0 ? (
                <>
                    <div className="space-y-4">
                        {displayResults.map(bp => (
                            <BenchmarkCard key={bp.configId} blueprint={bp} />
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-4 mt-8">
                            <Button
                                variant="outline"
                                disabled={currentPage <= 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                <Icon name="arrow-left" className="w-4 h-4 mr-2" />
                                Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                Page {currentPage} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                disabled={currentPage >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Next
                                <Icon name="arrow-right" className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-16">
                    <Icon name="search-x" className="mx-auto h-16 w-16 text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-semibold">No Benchmarks Found</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {query.trim() ? (
                            <>Your search for &quot;{query.trim()}&quot; did not match any benchmarks.</>
                        ) : (
                            <>No benchmark evaluations available yet.</>
                        )}
                    </p>
                </div>
            )}
        </div>
    );
}
