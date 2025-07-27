'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import CIPLogo from '@/components/icons/CIPLogo';
import { Button } from '@/components/ui/button';
import LatestEvaluationRunsSection, { DisplayableRunInstanceInfo } from '@/app/components/home/LatestEvaluationRunsSection';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const ArrowLeft = dynamic(() => import('lucide-react').then((mod) => mod.ArrowLeft));

export default function LatestPage() {
    const [latestRuns, setLatestRuns] = useState<DisplayableRunInstanceInfo[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLatestRuns = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch('/api/runs/latest');
                if (!response.ok) {
                    throw new Error('Failed to fetch latest runs.');
                }
                const data = await response.json();
                setLatestRuns(data.runs);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchLatestRuns();
    }, []);
    
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-background dark:to-muted/20 bg-gradient-to-br from-background to-slate-100" />
            
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
                <div className="flex justify-end mb-8">
                    <Button asChild variant="ghost">
                        <Link href="/">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Home
                        </Link>
                    </Button>
                </div>
                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                ) : error ? (
                    <div className="text-red-500 text-center">{error}</div>
                ) : latestRuns ? (
                    <LatestEvaluationRunsSection latestRuns={latestRuns} />
                ) : null}
            </main>
        </div>
    );
} 