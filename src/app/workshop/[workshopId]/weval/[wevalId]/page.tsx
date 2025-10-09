'use client';

import { use, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatWorkshopId } from '@/lib/workshop-utils';
import { toSafeTimestamp } from '@/lib/timestampUtils';
import { Users, ExternalLink, AlertCircle, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';
import { SimpleClientPage } from '@/app/analysis/[configId]/[runLabel]/[timestamp]/simple/SimpleClientPage';
import { WorkshopResultsErrorBoundary } from './WorkshopResultsErrorBoundary';

interface PageProps {
  params: Promise<{ workshopId: string; wevalId: string }>;
}

export default function WevalViewPage({ params }: PageProps) {
  const { workshopId, wevalId } = use(params);
  const [weval, setWeval] = useState<any | null>(null);
  const [execution, setExecution] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Fetch weval data
  const fetchWevalData = async () => {
    console.log('[Workshop Weval] Fetching data for:', { workshopId, wevalId });
    try {
      const response = await fetch(`/api/workshop/weval/${workshopId}/${wevalId}`);
      console.log('[Workshop Weval] API response status:', response.status);

      if (!response.ok) {
        throw new Error('Failed to load weval');
      }

      const data = await response.json();
      console.log('[Workshop Weval] Received data:', {
        hasWeval: !!data.weval,
        hasExecution: !!data.execution,
        executionStatus: data.execution?.status,
        hasResult: !!data.execution?.result,
        wevalExecutionRunId: data.weval?.executionRunId,
        wevalExecutionStatus: data.weval?.executionStatus,
      });

      setWeval(data.weval);
      setExecution(data.execution);

      // If execution is running, start polling
      if (data.execution && ['pending', 'running', 'generating_responses', 'evaluating', 'saving'].includes(data.execution.status)) {
        console.log('[Workshop Weval] Execution is running, starting poll');
        setPolling(true);
      } else {
        console.log('[Workshop Weval] Execution not running, stopping poll');
        setPolling(false);
      }
    } catch (err: any) {
      console.error('[Workshop Weval] Error fetching data:', err);
      setError(err.message || 'Failed to load weval');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWevalData();
  }, [workshopId, wevalId]);

  // Poll for execution status
  useEffect(() => {
    if (!polling) return;

    const interval = setInterval(() => {
      fetchWevalData();
    }, 3000);

    return () => clearInterval(interval);
  }, [polling]);

  // Retry execution
  const handleRetry = async () => {
    setRetrying(true);
    try {
      const response = await fetch(`/api/workshop/weval/${workshopId}/${wevalId}/retry`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to retry execution');
      }

      // Refetch weval data to get updated execution info
      await fetchWevalData();
    } catch (err: any) {
      alert('Failed to retry execution: ' + err.message);
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading weval...</p>
      </div>
    );
  }

  if (error || !weval) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-4">
        <Card className="p-6 max-w-md">
          <div className="flex items-start gap-3 text-destructive mb-4">
            <AlertCircle className="h-5 w-5 mt-0.5" />
            <div>
              <h2 className="font-semibold mb-1">Unable to Load Weval</h2>
              <p className="text-sm">{error || 'This weval may not exist or has been removed.'}</p>
            </div>
          </div>
          <Button asChild className="w-full">
            <a href="/">Go to Homepage</a>
          </Button>
        </Card>
      </div>
    );
  }

  // Check execution status from both sources (execution API or stored in weval)
  const executionStatus = execution?.status || weval.executionStatus || 'unknown';
  const isExecuting = ['pending', 'running', 'generating_responses', 'evaluating', 'saving'].includes(executionStatus);
  const hasError = executionStatus === 'error';
  const hasResults = executionStatus === 'complete' && execution?.result;

  // Distinguish between "never started" vs "can't load results"
  const neverStarted = !weval.executionRunId;
  const cannotLoadResults = weval.executionRunId && !execution && !isExecuting && !hasError && !hasResults;

  console.log('[Workshop Weval] UI State:', {
    executionStatus,
    isExecuting,
    hasError,
    hasResults,
    neverStarted,
    cannotLoadResults,
    resultDataKeys: execution?.result ? Object.keys(execution.result) : null,
    resultType: execution?.result ? typeof execution.result : null,
  });

  // Always show blueprint in a two-column layout
  const renderLayout = () => {
    return (
      <div className="flex flex-col h-screen">
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-xl font-semibold mb-1">
                  <a href="/" className="hover:underline">Weval</a>
                  {' / '}
                  <a href="/workshop" className="hover:underline">Workshop</a>
                </h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="font-mono">{formatWorkshopId(workshopId)}</span>
                  <span className="mx-2">•</span>
                  <span>by {weval.authorName}</span>
                </div>
              </div>
              <Button variant="default" size="sm" asChild>
                <a href={`/workshop/${workshopId}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Create Your Own
                </a>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="h-full max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: Blueprint (Always Shown) */}
            <div className="overflow-y-auto">
              <Card className="p-6">
                <h2 className="text-2xl font-semibold mb-4">Test Plan</h2>

                <div className="mb-6 p-4 rounded-lg bg-accent/30 border border-accent/40">
                  <p className="text-sm font-medium text-foreground">
                    {weval.description}
                  </p>
                </div>

                <div className="space-y-4">
                  {(weval.blueprint.prompts || []).map((p: any, idx: number) => (
                    <Card key={p.id || idx} className="p-4 bg-background/50">
                      <div className="font-semibold text-base mb-3 text-primary">
                        Question #{idx + 1} for the AI
                      </div>
                      <p className="font-medium text-base text-foreground/90 mb-3">
                        {p.promptText}
                      </p>
                      {Array.isArray(p.points) && p.points.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                            What to Look For:
                          </h4>
                          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                            {(Array.isArray(p.points[0]) ? p.points[0] : p.points).map((pt: any, idx: number) => (
                              <li key={idx}>
                                {typeof pt === 'string' ? pt : pt?.text || String(pt)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </Card>
            </div>

            {/* RIGHT: Status or Results */}
            <div className="overflow-y-auto">
              {isExecuting && (
                <Card className="p-8">
                  <div className="flex flex-col items-center text-center">
                    <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
                    <h2 className="text-2xl font-semibold mb-2">
                      {executionStatus === 'saving' ? 'Finalizing Results' : 'Evaluation Running'}
                    </h2>
                    <p className="text-muted-foreground mb-4">
                      {executionStatus === 'saving'
                        ? 'Aggregating results and preparing the analysis...'
                        : execution?.message || 'Testing this evaluation against multiple AI models...'
                      }
                    </p>
                    {execution?.progress && (
                      <div className="w-full max-w-md mt-4">
                        <div className="flex justify-between text-sm text-muted-foreground mb-2">
                          <span>Progress</span>
                          <span>{execution.progress.completed} / {execution.progress.total}</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(execution.progress.completed / execution.progress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-4">
                      This page will auto-refresh when results are ready
                    </p>
                  </div>
                </Card>
              )}

              {hasError && (
                <Card className="p-8">
                  <div className="flex flex-col items-center text-center">
                    <XCircle className="h-16 w-16 text-destructive mb-4" />
                    <h2 className="text-2xl font-semibold mb-2">Evaluation Failed</h2>
                    <p className="text-muted-foreground mb-4">
                      {execution?.message || 'An error occurred while running this evaluation.'}
                    </p>
                    <Button asChild className="mt-4">
                      <a href={`/workshop/${workshopId}`}>Try Creating Another</a>
                    </Button>
                  </div>
                </Card>
              )}

              {neverStarted && (
                <Card className="p-8">
                  <div className="flex flex-col items-center text-center">
                    <XCircle className="h-16 w-16 text-destructive mb-4" />
                    <h2 className="text-2xl font-semibold mb-2">Execution Failed to Start</h2>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      The evaluation could not be started. This may be due to a server error or configuration issue. The test plan is still valid.
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={handleRetry} disabled={retrying}>
                        {retrying ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Retrying...
                          </>
                        ) : (
                          'Retry Execution'
                        )}
                      </Button>
                      <Button variant="outline" asChild>
                        <a href={`/workshop/${workshopId}`}>Create New</a>
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {cannotLoadResults && (
                <Card className="p-8">
                  <div className="flex flex-col items-center text-center">
                    <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
                    <h2 className="text-2xl font-semibold mb-2">Unable to Load Results</h2>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      The evaluation was started but results cannot be retrieved. This may be a temporary issue with the results API, or the run data may have been deleted.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => window.location.reload()}>
                        Refresh Page
                      </Button>
                      <Button asChild>
                        <a href={`/workshop/${workshopId}`}>Create New Evaluation</a>
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {hasResults && (() => {
                console.log('[Workshop Weval] Rendering results with AnalysisProvider:', {
                  configId: `workshop_${workshopId}`,
                  runLabel: wevalId,
                  timestamp: toSafeTimestamp(weval.createdAt),
                  hasResultData: !!execution?.result,
                  resultKeys: execution?.result ? Object.keys(execution.result).slice(0, 10) : [],
                });
                return (
                  <div className="h-full">
                    <WorkshopResultsErrorBoundary workshopId={workshopId}>
                      <AnalysisProvider
                        initialData={execution.result}
                        configId={`workshop_${workshopId}`}
                        runLabel={wevalId}
                        timestamp={toSafeTimestamp(weval.createdAt)}
                      >
                        <SimpleClientPage />
                      </AnalysisProvider>
                    </WorkshopResultsErrorBoundary>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return renderLayout();
}
