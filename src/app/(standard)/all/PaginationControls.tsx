'use client';

import { Button } from '@/components/ui/button';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';

const ArrowLeft = nextDynamic(() => import('lucide-react').then(mod => mod.ArrowLeft));
const ArrowRight = nextDynamic(() => import('lucide-react').then(mod => mod.ArrowRight));

export function PaginationControls({ currentPage, totalPages }: { currentPage: number; totalPages: number }) {
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;

    return (
        <div className="flex justify-center items-center gap-4 mt-8">
            <Button asChild variant="outline" disabled={!hasPrevPage}>
                <Link href={hasPrevPage ? `/all?page=${currentPage - 1}` : '#'}>
                    {ArrowLeft && <ArrowLeft className="w-4 h-4 mr-2" />}
                    Previous
                </Link>
            </Button>
            <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
            </span>
            <Button asChild variant="outline" disabled={!hasNextPage}>
                <Link href={hasNextPage ? `/all?page=${currentPage + 1}` : '#'}>
                    Next
                    {ArrowRight && <ArrowRight className="w-4 h-4 ml-2" />}
                </Link>
            </Button>
        </div>
    );
} 