'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useAnalysis } from '@/app/analysis/context/AnalysisContext'
import { SimpleAnalysisHeader } from './components/SimpleAnalysisHeader'
import { SimpleResultsGrid } from './components/SimpleResultsGrid'
import { SimpleModelLeaderboard } from './components/SimpleModelLeaderboard'
import { SimpleInsights } from './components/SimpleInsights'
import ModelPerformanceModal from '@/app/analysis/components/ModelPerformanceModal'
import PromptPerformanceModal from '@/app/analysis/components/PromptPerformanceModal'
import SpecificEvaluationModal from '@/app/analysis/components/SpecificEvaluationModal'
import Icon from '@/components/ui/icon'

export const SimpleClientPage: React.FC = () => {
    const { 
        data, 
        loading, 
        error, 
        promptNotFound,
        configId,
        runLabel,
        timestamp,
        pageTitle,
        currentPromptId,
    } = useAnalysis();

    useEffect(() => {
        if (pageTitle) {
            document.title = `${pageTitle} - Simple View`;
        }
    }, [pageTitle]);
     
    if (loading) {
        return (
          <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
            <Icon name="loader-2" className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg text-muted-foreground">Loading analysis...</p>
          </div>
        )
    }

    if (error) {
        return (
            <Alert variant="destructive" className="max-w-2xl mx-auto my-10">
                <Icon name="alert-circle" className="h-4 w-4" />
                <AlertTitle>Error Loading Data</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }
      
    if (promptNotFound) {
        return (
          <Alert variant="destructive" className="max-w-2xl mx-auto my-10">
            <Icon name="alert-circle" className="h-4 w-4" />
            <AlertTitle>Prompt Not Found</AlertTitle>
            <AlertDescription>
              The prompt ID <code className="font-mono bg-muted px-1 py-0.5 rounded">{currentPromptId}</code> was not found in this evaluation run.
              <Link href={`/analysis/${configId}/${runLabel}/${timestamp}/simple`}>
                <Button variant="link" className="p-0 h-auto ml-1">Clear prompt selection</Button>
              </Link>
            </AlertDescription>
          </Alert>
        )
    }

    if (!data) {
        return null; 
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
            <style jsx global>{`
                .prose {
                    color: hsl(var(--foreground));
                }
                .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
                    color: hsl(var(--foreground));
                    font-weight: 600;
                }
                .prose p {
                    margin-bottom: 1em;
                    line-height: 1.6;
                }
                .prose ul, .prose ol {
                    margin: 1em 0;
                    padding-left: 1.5em;
                }
                .prose li {
                    margin: 0.5em 0;
                }
                .prose a {
                    color: hsl(var(--primary));
                    text-decoration: underline;
                    text-underline-offset: 2px;
                }
                .prose a:hover {
                    color: hsl(var(--primary)) / 0.8;
                }
                .prose code {
                    background: hsl(var(--muted));
                    padding: 0.2em 0.4em;
                    border-radius: 0.25em;
                    font-size: 0.9em;
                }
                .prose blockquote {
                    border-left: 4px solid hsl(var(--border));
                    padding-left: 1em;
                    margin: 1em 0;
                    font-style: italic;
                    color: hsl(var(--muted-foreground));
                }
            `}</style>
            <div className="container mx-auto px-4 py-8 max-w-7xl">
                <SimpleAnalysisHeader />
                
                <div className="space-y-8">
                    <SimpleModelLeaderboard />
                    <SimpleResultsGrid />
                    <SimpleInsights />
                </div>

                {/* Modals */}
                <ModelPerformanceModal />
                <PromptPerformanceModal />
                <SpecificEvaluationModal />
            </div>
        </div>
    )
}
