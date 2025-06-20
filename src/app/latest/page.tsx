import React from 'react';
import { getLatestRunsSummary } from '@/lib/storageService';
import Link from 'next/link';
import CIPLogo from '@/components/icons/CIPLogo';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import LatestEvaluationRunsSection, { DisplayableRunInstanceInfo } from '@/app/components/home/LatestEvaluationRunsSection';

export const revalidate = 60; // Revalidate every 60 seconds

export default async function LatestPage() {
    const latestRunsSummary = await getLatestRunsSummary();

    // The data from getLatestRunsSummary is already in the correct format.
    const latestRuns: DisplayableRunInstanceInfo[] = latestRunsSummary.runs;
    
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
            
            <header className="w-full bg-header py-4 shadow-sm border-b border-border/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Link href="/" aria-label="Homepage">
                                <CIPLogo className="w-12 h-12 text-foreground" />
                            </Link>
                            <div>
                                <Link href="/">
                                    <h1 className="text-3xl font-bold text-foreground">
                                    <span style={{ fontWeight: 600 }}>w</span><span style={{ fontWeight: 200 }}>eval</span>
                                    </h1>
                                </Link>
                                <Link href="/latest" className="text-base text-muted-foreground leading-tight hover:underline">
                                    Latest Platform Runs
                                </Link>
                            </div>
                        </div>
                         <Button asChild variant="ghost">
                            <Link href="/">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Home
                            </Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
                <LatestEvaluationRunsSection latestRuns={latestRuns} />
            </main>
        </div>
    );
} 