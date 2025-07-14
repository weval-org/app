'use client'

import { useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { RefactoredAggregateAnalysisView } from '@/app/analysis/components/RefactoredAggregateAnalysisView';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import RefactoredAnalysisPageHeader from '@/app/analysis/components/RefactoredAnalysisPageHeader';
import RefactoredModelPerformanceModal from '@/app/analysis/components/RefactoredModelPerformanceModal';
import RefactoredPromptDetailModal from '@/app/analysis/components/RefactoredPromptDetailModal';
import RefactoredModelEvaluationDetailModal from '@/app/analysis/components/RefactoredModelEvaluationDetailModal';
import CoverageHeatmapCanvas from '@/app/analysis/components/CoverageHeatmapCanvas';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

const Loader2 = dynamic(() => import("lucide-react").then((mod) => mod.Loader2))
const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle))
const AlertTriangle = dynamic(() => import("lucide-react").then((mod) => mod.AlertTriangle))
const ArrowLeft = dynamic(() => import("lucide-react").then(mod => mod.ArrowLeft));

export const SandboxClientPage: React.FC = () => {
    const { 
        data, 
        loading, 
        error, 
        promptNotFound,
        pageTitle,
        currentPromptId,
        displayedModels,
        modelPerformanceModal,
        closeModelPerformanceModal,
        promptDetailModal,
        closePromptDetailModal,
    } = useAnalysis();

    useEffect(() => {
        if (pageTitle) {
            document.title = pageTitle;
        }
    }, [pageTitle]);

    const headerWidgetContent = useMemo(() => {
        if (currentPromptId || !data?.evaluationResults?.llmCoverageScores || !data.promptIds || displayedModels.filter(m => m !== IDEAL_MODEL_ID).length === 0) {
          return null;
        }
        return (
          <CoverageHeatmapCanvas
            allCoverageScores={data.evaluationResults.llmCoverageScores as any} 
            promptIds={data.promptIds}
            models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
            width={100}
            height={50}
            className="rounded-md border border-border dark:border-border shadow-sm"
          />
        );
    }, [currentPromptId, data, displayedModels]);
     
    if (loading) {
        return (
          <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg text-muted-foreground">Loading analysis data...</p>
          </div>
        )
    }

    if (error) {
        return (
            <Alert variant="destructive" className="max-w-2xl mx-auto my-10">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error Loading Data</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }
      
    if (promptNotFound) {
        return (
          <Alert variant="destructive" className="max-w-2xl mx-auto my-10">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Prompt Not Found</AlertTitle>
            <AlertDescription>
              The prompt ID <code className="font-mono bg-muted px-1 py-0.5 rounded">{currentPromptId}</code> was not found in this evaluation run.
            </AlertDescription>
          </Alert>
        )
    }

    if (!data) return null; 

    return (
        <div className="mx-auto p-4 md:p-6 lg:p-8 space-y-8">
            <Alert className="border-primary/50 bg-primary/5">
                <AlertTriangle className="h-4 w-4 text-primary" />
                <AlertTitle className="text-primary font-semibold">Sandbox Studio Test Results</AlertTitle>
                <AlertDescription className="text-sm">
                    <p>This is a temporary result page for your test run. These results will be automatically deleted after one week.</p>
                    <Button asChild variant="link" className="p-0 h-auto mt-2 text-primary font-semibold text-sm">
                        <Link href="/sandbox-refactor">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Return to Sandbox Studio
                        </Link>
                    </Button>
                </AlertDescription>
            </Alert>
            <RefactoredAnalysisPageHeader headerWidget={headerWidgetContent} />
            <RefactoredAggregateAnalysisView />

            <div className="mt-12 text-center border-t border-border pt-8">
                <Button asChild size="lg">
                    <Link href="/sandbox-refactor">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Return to Sandbox Studio
                    </Link>
                </Button>
            </div>

            <RefactoredModelPerformanceModal />
            <RefactoredPromptDetailModal />
            <RefactoredModelEvaluationDetailModal />
        </div>
    );
}; 