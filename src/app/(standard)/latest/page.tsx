import React from 'react';
import { getLatestRunsSummary } from '@/lib/storageService';
import Link from 'next/link';
import CIPLogo from '@/components/icons/CIPLogo';
import { Button } from '@/components/ui/button';
import LatestEvaluationRunsSection, { DisplayableRunInstanceInfo } from '@/app/components/home/LatestEvaluationRunsSection';
import dynamic from 'next/dynamic';

const ArrowLeft = dynamic(() => import('lucide-react').then((mod) => mod.ArrowLeft));

export const revalidate = 60; // Revalidate every 60 seconds

export default async function LatestPage() {
    const latestRunsSummary = await getLatestRunsSummary();

    // The data from getLatestRunsSummary is already in the correct format.
    const latestRuns: DisplayableRunInstanceInfo[] = latestRunsSummary.runs;
    
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
                <LatestEvaluationRunsSection latestRuns={latestRuns} />
            </main>
        </div>
    );
} 