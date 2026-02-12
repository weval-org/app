'use client';

import { Button } from '@/components/ui/button';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import Icon from '@/components/ui/icon';

export function PaginationControls({ currentPage, totalPages, basePath = '/all' }: { currentPage: number; totalPages: number; basePath?: string }) {
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;

    return (
        <div className="flex justify-center items-center gap-4 mt-8">
            <Button asChild variant="outline" disabled={!hasPrevPage}>
                <Link href={hasPrevPage ? `${basePath}?page=${currentPage - 1}` : '#'}>
                    <Icon name="arrow-left" className="w-4 h-4 mr-2" />
                    Previous
                </Link>
            </Button>
            <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
            </span>
            <Button asChild variant="outline" disabled={!hasNextPage}>
                <Link href={hasNextPage ? `${basePath}?page=${currentPage + 1}` : '#'}>
                    Next
                    <Icon name="arrow-right" className="w-4 h-4 ml-2" />
                </Link>
            </Button>
        </div>
    );
} 