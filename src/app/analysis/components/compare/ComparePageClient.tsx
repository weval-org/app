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
import Breadcrumbs from '@/app/components/Breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { prettifyTag, normalizeTag } from '@/app/utils/tagUtils';
import CIPLogo from '@/components/icons/CIPLogo';

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

  const CELL_SIZE = '400px';
  const cardContentStyle = {
    height: CELL_SIZE,
    overflowY: 'auto' as 'auto',
  };

  const showLoading = (isLoading || isQueued) && !response;

  return (
    <td ref={cellRef} className="p-2 border border-border" style={{minWidth: CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE}}>
      {coverageScore !== null && coverageScore !== undefined && hasBeenInView.current && !showLoading && (
          <div
              className={`absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full text-xs font-semibold text-white shadow-md ${getScoreColor(coverageScore)}`}
              title={`Coverage Score: ${(coverageScore * 100).toFixed(1)}%`}
          >
              {Math.round(coverageScore * 100)}
          </div>
      )}
      <div className="h-full cursor-pointer relative" onClick={() => response && onClick()}>
        {showLoading ? (
            <Card className="h-full bg-muted/20 overflow-hidden" style={{height: CELL_SIZE}}>
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
          <Card className="h-full bg-muted/20" style={{height: CELL_SIZE}} />
        )}
      </div>
    </td>
  );
};

export const ComparePageClient: React.FC = () => {
    const { data, pageTitle, breadcrumbItems, isSandbox, configId, runLabel, timestamp, sandboxId, workshopId, wevalId, fetchModalResponseBatch, openModelEvaluationDetailModal, currentPromptId } = useAnalysis();
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

        // Filter promptIds based on currentPromptId query parameter
        const promptIdsToShow = currentPromptId
            ? data.promptIds.filter(id => id === currentPromptId)
            : data.promptIds;

        const prompts = promptIdsToShow.map(promptId => {
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
    }, [data, currentPromptId]);

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

    // Determine the back link - if workshop, link to workshop results; if sandbox, link to sandbox results; otherwise standard analysis
    const backLink = workshopId && wevalId
        ? `/workshop/${workshopId}/weval/${wevalId}`
        : sandboxId
        ? `/sandbox/results/${sandboxId}`
        : `/analysis/${configId}/${runLabel}/${timestamp}`;

    const backLinkText = workshopId && wevalId
        ? 'Back to Workshop Results'
        : sandboxId
        ? 'Back to Results'
        : 'Advanced Analysis';

    const unifiedTags = useMemo(() => {
        if (!data?.config?.tags) return [];
        return data.config.tags;
    }, [data?.config?.tags]);

    return (
        <div className="bg-slate-50 dark:bg-slate-900 h-screen flex flex-col overflow-hidden">
            <header className="flex-none bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-border">
                <div className="w-full px-4 sm:px-6 lg:px-8 py-3">
                    {!isSandbox && breadcrumbItems && breadcrumbItems.length > 0 && (
                        <div className="mb-2">
                            <Breadcrumbs items={breadcrumbItems} className="text-xs" />
                        </div>
                    )}

                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-4 mb-3">
                                {/* Logo section */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <CIPLogo className="w-6 h-6 text-foreground flex-shrink-0" />
                                    <Link href="/">
                                        <h2 className="text-xl font-bold text-foreground hover:text-primary transition-colors">
                                            <span style={{ fontWeight: 700 }}>w</span>
                                            <span style={{ fontWeight: 200 }}>eval</span>
                                        </h2>
                                    </Link>
                                </div>

                                {/* Vertical separator */}
                                <div className="h-8 w-px bg-border flex-shrink-0" />

                                {/* Title section */}
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="min-w-0">
                                        <h1 className="text-base font-bold tracking-tight truncate sm:text-lg" title={pageTitle}>
                                            {pageTitle}
                                        </h1>
                                        <p className="text-xs text-muted-foreground">Comparison View</p>
                                    </div>
                                </div>
                            </div>

                            {/* Author badge */}
                            {data?.config?.author && (
                                <div className="mt-3">
                                    {(() => {
                                        const a: any = (data.config as any).author;
                                        const name: string = typeof a === 'string' ? a : a.name;
                                        const url: string | undefined = typeof a === 'string' ? undefined : a.url;
                                        const imageUrl: string | undefined = typeof a === 'string' ? undefined : a.image_url;
                                        const content = (
                                            <span className="text-xs text-foreground">
                                                {imageUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={imageUrl} alt={name} className="h-4 w-4 rounded-full border border-border inline mr-1 align-text-bottom" />
                                                ) : (
                                                    <Icon name="user" className="w-3 h-3 text-foreground inline mr-1 align-text-bottom" />
                                                )}
                                                <span className="font-medium">{name}</span>
                                            </span>
                                        );
                                        return (
                                            <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 border border-border/60 text-xs">
                                                {url ? (
                                                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                                        {content}
                                                    </a>
                                                ) : content}
                                            </span>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Tags */}
                            {unifiedTags && unifiedTags.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                    {unifiedTags.map(tag => (
                                        <Link href={`/tags/${normalizeTag(tag)}`} key={tag}>
                                            <Badge variant="secondary" className="text-xs px-1.5 py-0 hover:bg-primary/20 transition-colors">{prettifyTag(tag)}</Badge>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                            {sandboxId && (
                                <Button asChild variant="outline" size="sm" className="text-xs">
                                    <Link href="/sandbox">
                                        <Icon name="flask-conical" className="w-3.5 h-3.5 mr-1.5" />
                                        Sandbox
                                    </Link>
                                </Button>
                            )}
                            <Button asChild variant="outline" size="sm" className="text-xs">
                                <Link href={backLink}>
                                    <Icon name="sliders-horizontal" className="w-3.5 h-3.5 mr-1.5" />
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
                                <th className="bg-slate-100 dark:bg-slate-800 border border-border p-2 sticky top-0 left-0 z-40 shadow-sm bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-sm" style={{minWidth: '400px', width: '400px'}}>
                                    <span className="text-sm font-semibold">Prompts</span>
                                </th>
                                {models.map(modelId => {
                                    const parsed = parseModelIdForDisplay(modelId);
                                    const displayLabel = getModelDisplayLabel(parsed, { prettifyModelName: true });
                                    return (
                                        <th key={modelId} className="bg-slate-100 dark:bg-slate-800 p-0 border border-border sticky top-0 z-30 shadow-sm bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-sm" style={{minWidth: '400px', width: '400px'}}>
                                            <div className="p-2 truncate font-semibold text-sm" title={getModelDisplayLabel(modelId)}>
                                                {displayLabel}
                                            </div>
                                        </th>
                                    )
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {prompts.map(prompt => {
                                // Dynamic font sizing based on text length
                                const textLength = prompt.text.length;
                                let fontSize = 'text-base'; // default
                                if (textLength < 50) {
                                    fontSize = 'text-xl';
                                } else if (textLength < 100) {
                                    fontSize = 'text-lg';
                                } else if (textLength < 200) {
                                    fontSize = 'text-base';
                                } else {
                                    fontSize = 'text-sm';
                                }

                                return (
                                <tr key={prompt.id}>
                                    <th className="bg-slate-100 dark:bg-slate-800 border border-border p-4 align-top sticky left-0 z-20 shadow-sm bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-sm" style={{minWidth: '400px', width: '400px', height: '400px'}}>
                                        <div className={`font-medium ${fontSize} text-left leading-relaxed`} title={prompt.text}>
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
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </main>

            <SpecificEvaluationModal />
        </div>
    );
};
