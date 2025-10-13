'use client';

import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import ResponseRenderer, { RenderAsType } from '@/app/components/ResponseRenderer';
import SpecificEvaluationModal from '@/app/analysis/components/SpecificEvaluationModal';

const getScoreColor = (score: number) => {
    if (score >= 0.75) return 'bg-green-600';
    if (score >= 0.5) return 'bg-yellow-600';
    if (score > 0) return 'bg-red-600';
    return 'bg-slate-500';
};

const ModelResponseCell = ({
    promptId,
    modelId,
    onClick,
    onInView,
    isQueued,
    renderAs,
    coverageScore,
}: {
    promptId: string;
    modelId: string;
    onClick: () => void;
    onInView: () => void;
    isQueued: boolean;
    renderAs?: RenderAsType;
    coverageScore?: number | null;
}) => {
  const { getCachedResponse, isLoadingResponse } = useAnalysis();
  const response = getCachedResponse(promptId, modelId);
  const isLoading = isLoadingResponse(promptId, modelId);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const hasBeenInView = useRef(false);
  const responseAvailableRef = useRef<boolean>(!!response);
  const isQueuedRef = useRef<boolean>(!!isQueued);
  const isLoadingRef = useRef<boolean>(!!isLoading);

  useEffect(() => {
    responseAvailableRef.current = !!response && response.trim() !== '';
  }, [response]);
  useEffect(() => {
    isQueuedRef.current = !!isQueued;
  }, [isQueued]);
  useEffect(() => {
    isLoadingRef.current = !!isLoading;
  }, [isLoading]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!hasBeenInView.current) {
            hasBeenInView.current = true;
            if (!responseAvailableRef.current && !isQueuedRef.current && !isLoadingRef.current) {
              onInView();
            }
          }
          if (cellRef.current) {
            observer.unobserve(cellRef.current);
          }
        }
      },
      { rootMargin: '200px' }
    );

    if (cellRef.current) {
      observer.observe(cellRef.current);
    }

    return () => {
      if (cellRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        observer.unobserve(cellRef.current);
      }
    };
  }, [onInView]);

  const cardContentStyle = {
    height: '350px',
    overflowY: 'auto' as 'auto',
  };

  const showLoading = (isLoading || isQueued) && !response;

  return (
    <td ref={cellRef} className="p-2 border border-border relative" style={{minWidth: '250px'}}>
      {coverageScore !== null && coverageScore !== undefined && hasBeenInView.current && !showLoading && (
          <div
              className={`absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full text-xs font-semibold text-white shadow-md ${getScoreColor(coverageScore)}`}
              title={`Coverage Score: ${(coverageScore * 100).toFixed(1)}%`}
          >
              {Math.round(coverageScore * 100)}
          </div>
      )}
      <div className="h-full cursor-pointer" onClick={() => response && onClick()}>
        {showLoading ? (
            <Card className="h-full bg-muted/20 overflow-hidden" style={{height: '350px'}}>
                <CardContent className="p-3">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-2/3" />
                    </div>
                </CardContent>
            </Card>
        ) : (response === null || response.trim() === '') && hasBeenInView.current ? (
            <Card className="h-full bg-muted/50">
                <CardContent className="p-3">
                    <p className="text-muted-foreground italic text-sm">No response available.</p>
                </CardContent>
            </Card>
        ) : response ? (
            <Card className="h-full overflow-hidden">
                <CardContent className="p-3" style={cardContentStyle}>
                    <ResponseRenderer content={response} renderAs={renderAs} />
                </CardContent>
            </Card>
        ) : (
          <Card className="h-full bg-muted/20" style={{height: '350px'}} />
        )}
      </div>
    </td>
  );
};

export const ComparePageClient: React.FC = () => {
    const { data, pageTitle, configId, runLabel, timestamp, sandboxId, fetchModalResponseBatch, openModelEvaluationDetailModal } = useAnalysis();
    const [loadingQueue, setLoadingQueue] = useState(() => new Set<string>());

    const requestLoad = useCallback((promptId: string, modelId: string) => {
      setLoadingQueue(prev => {
          const newQueue = new Set(prev);
          newQueue.add(`${promptId}:${modelId}`);
          return newQueue;
      });
    }, []);

    useEffect(() => {
        const intervalId = setInterval(() => {
            if (loadingQueue.size > 0) {
                const newQueue = new Set(loadingQueue);
                const batchKeys = Array.from(newQueue).slice(0, 5);

                const batchPairs = batchKeys.map(key => {
                    const separatorIndex = key.indexOf(':');
                    const promptId = key.substring(0, separatorIndex);
                    const modelId = key.substring(separatorIndex + 1);
                    return { promptId, modelId };
                });

                if (fetchModalResponseBatch && batchPairs.length > 0) {
                    fetchModalResponseBatch(batchPairs);
                }

                // Remove only the processed items from the queue
                batchKeys.forEach(key => newQueue.delete(key));
                setLoadingQueue(newQueue);
            }
        }, 200);

        return () => clearInterval(intervalId);
    }, [loadingQueue, fetchModalResponseBatch]);

    const { models, prompts } = useMemo(() => {
        if (!data) {
            return { models: [], prompts: [] };
        }

        const models = data.effectiveModels
            .filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase())
            .sort((a, b) => getModelDisplayLabel(a).localeCompare(getModelDisplayLabel(b)));

        const prompts = data.promptIds.map(promptId => {
            const context = data.promptContexts?.[promptId];
            const promptConfig = data.config.prompts?.find(p => p.id === promptId);
            let displayText = promptId;
            if (typeof context === 'string') {
                displayText = context;
            } else if (Array.isArray(context) && context.length > 0) {
                const lastUserMessage = [...context].reverse().find(msg => msg.role === 'user');
                if (lastUserMessage && typeof lastUserMessage.content === 'string') {
                    displayText = lastUserMessage.content;
                }
            }
            return { id: promptId, text: displayText, renderAs: promptConfig?.render_as as RenderAsType | undefined };
        });

        return { models, prompts };
    }, [data]);

    const handleCellClick = (promptId: string, modelId: string) => {
        openModelEvaluationDetailModal({ promptId, modelId });
    };

    if (!data) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Icon name="loader-2" className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4 text-lg text-muted-foreground">Loading analysis...</p>
            </div>
        );
    }

    // Determine the back link - if sandbox, link to sandbox results; otherwise standard analysis
    const backLink = sandboxId
        ? `/sandbox/results/${sandboxId}`
        : `/analysis/${configId}/${runLabel}/${timestamp}`;

    const backLinkText = sandboxId
        ? 'Back to Results'
        : 'Advanced Analysis';

    return (
        <div className="bg-slate-50 dark:bg-slate-900 h-screen flex flex-col overflow-hidden">
            <header className="flex-none bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-border">
                <div className="w-full px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl font-bold tracking-tight truncate" title={pageTitle}>
                                {pageTitle} - Comparison View
                            </h1>
                        </div>
                        <div className="flex items-center gap-4">
                            {sandboxId && (
                                <Button asChild variant="outline" size="sm">
                                    <Link href="/sandbox">
                                        <Icon name="flask-conical" className="w-4 h-4 mr-2" />
                                        Sandbox Studio
                                    </Link>
                                </Button>
                            )}
                            <Button asChild variant="outline" size="sm">
                                <Link href={backLink}>
                                    <Icon name="sliders-horizontal" className="w-4 h-4 mr-2" />
                                    {backLinkText}
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 min-h-0">
                <div className="h-full overflow-auto relative w-full">
                    <table className="border-separate border-spacing-0 w-full">
                        <thead>
                            <tr>
                                <th className="bg-slate-100 dark:bg-slate-800 border border-border p-2 sticky top-0 left-0 z-40 shadow-sm bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-sm" style={{minWidth: '250px'}}>
                                    <span className="text-sm font-semibold">Prompts</span>
                                </th>
                                {models.map(modelId => {
                                    const parsed = parseModelIdForDisplay(modelId);
                                    const displayLabel = getModelDisplayLabel(parsed, { prettifyModelName: true });
                                    return (
                                        <th key={modelId} className="bg-slate-100 dark:bg-slate-800 p-0 border border-border sticky top-0 z-30 shadow-sm bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-sm" style={{minWidth: '250px'}}>
                                            <div className="p-2 truncate font-semibold text-sm" title={getModelDisplayLabel(modelId)}>
                                                {displayLabel}
                                            </div>
                                        </th>
                                    )
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {prompts.map(prompt => (
                                <tr key={prompt.id}>
                                    <th className="bg-slate-100 dark:bg-slate-800 border border-border p-2 align-top sticky left-0 z-20 shadow-sm bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-sm" style={{minWidth: '250px'}}>
                                        <div className="font-medium text-sm text-left" title={prompt.text}>
                                            {prompt.text}
                                        </div>
                                    </th>
                                    {models.map(modelId => {
                                        const coverageResult = data.evaluationResults?.llmCoverageScores?.[prompt.id]?.[modelId];
                                        const score = (coverageResult && !('error' in coverageResult) && typeof coverageResult.avgCoverageExtent === 'number')
                                            ? coverageResult.avgCoverageExtent
                                            : null;

                                        return (
                                            <ModelResponseCell
                                                key={modelId}
                                                promptId={prompt.id}
                                                modelId={modelId}
                                                onInView={() => requestLoad(prompt.id, modelId)}
                                                isQueued={loadingQueue.has(`${prompt.id}:${modelId}`)}
                                                onClick={() => handleCellClick(prompt.id, modelId)}
                                                renderAs={prompt.renderAs}
                                                coverageScore={score}
                                            />
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>

            <SpecificEvaluationModal />
        </div>
    );
};
