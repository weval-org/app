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
import { useRouter } from 'next/navigation';

const ComparePromptSelector: React.FC = () => {
    const router = useRouter();
    const {
        data,
        configId,
        runLabel,
        timestamp,
        currentPromptId,
    } = useAnalysis();

    const getPromptContextDisplayString = (promptId: string): string => {
        if (!data || !data.promptContexts) return promptId;
        const context = data.promptContexts[promptId];
        if (typeof context === 'string') {
          return context;
        }
        if (Array.isArray(context) && context.length > 0) {
          const lastUserMessage = [...context].reverse().find(msg => msg.role === 'user');
          if (lastUserMessage && typeof lastUserMessage.content === 'string') {
            const text = lastUserMessage.content;
            return `User: ${text.substring(0, 300)}${text.length > 300 ? '...' : ''}`;
          }
          return `Multi-turn context (${context.length} messages)`;
        }
        return promptId;
    };

    if (!data || !data.promptIds || data.promptIds.length === 0) return null;

    const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedPromptId = event.target.value;
      const basePath = `/analysis/${configId}/${runLabel}/${timestamp}/compare`;

      if (selectedPromptId === '__ALL__') {
        window.location.href = basePath;
      } else {
        window.location.href = `${basePath}?prompt=${selectedPromptId}`;
      }
    };

    return (
      <div className="mb-6">
        <label htmlFor="prompt-selector" className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground mb-1">Select Prompt:</label>
        <select
          id="prompt-selector"
          value={currentPromptId || '__ALL__'}
          onChange={handleSelectChange}
          className="block w-full p-2 border border-border dark:border-border rounded-md shadow-sm focus:ring-primary focus:border-primary bg-card dark:bg-card text-card-foreground dark:text-card-foreground text-sm"
        >
          <option value="__ALL__" className="bg-background text-foreground dark:bg-background dark:text-foreground">All Prompts (Grid View)</option>
          {data.promptIds.map(promptId => (
            <option key={promptId} value={promptId} title={getPromptContextDisplayString(promptId)} className="bg-background text-foreground dark:bg-background dark:text-foreground">
              {promptId} - {getPromptContextDisplayString(promptId)}
            </option>
          ))}
        </select>
      </div>
    );
};

const SystemPromptDisplay: React.FC = () => {
    const { data } = useAnalysis();
    const [activeSystemTab, setActiveSystemTab] = useState(0);

    if (!data?.config) return null;

    // Determine system prompts - check multiple sources
    let systems: string[] = [];

    // Check for systems array
    if (Array.isArray(data.config.systems) && data.config.systems.length > 0) {
        systems = data.config.systems.filter((s): s is string => typeof s === 'string' && s !== null);
    }
    // Check for singular system property
    else if (data.config.system && typeof data.config.system === 'string') {
        systems = [data.config.system];
    }

    if (systems.length === 0) return null;

    // If only one system prompt, just display it
    if (systems.length === 1) {
        return (
            <div className="mb-6">
                <label className="block text-sm font-medium text-muted-foreground mb-1">System Prompt:</label>
                <div className="bg-muted/50 border border-border rounded-md p-3">
                    <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">{systems[0]}</pre>
                </div>
            </div>
        );
    }

    // Multiple system prompts - show as tabs
    return (
        <div className="mb-6">
            <label className="block text-sm font-medium text-muted-foreground mb-1">System Prompts:</label>
            <div className="border border-border rounded-md overflow-hidden">
                <div className="flex gap-1 p-1 bg-muted/30 border-b border-border">
                    {systems.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setActiveSystemTab(idx)}
                            className={`px-3 py-1.5 text-xs rounded transition-colors ${
                                activeSystemTab === idx
                                    ? 'bg-primary text-primary-foreground font-semibold'
                                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                            }`}
                        >
                            Variant {idx}
                        </button>
                    ))}
                </div>
                <div className="bg-muted/50 p-3">
                    <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">{systems[activeSystemTab]}</pre>
                </div>
            </div>
        </div>
    );
};

const getScoreColor = (score: number) => {
    if (score >= 0.75) return 'bg-green-600';
    if (score >= 0.5) return 'bg-yellow-600';
    if (score > 0) return 'bg-red-600';
    return 'bg-slate-500';
};

const GridViewCard = ({
    promptId,
    modelVariants,
    onClick,
    onInView,
    loadingQueue,
    renderAs,
    overlayMode,
}: {
    promptId: string;
    modelVariants: Array<{ modelId: string; temperature?: number; coverageScore?: number | null }>;
    onClick: (modelId: string) => void;
    onInView: (modelId: string) => void;
    loadingQueue: Set<string>;
    renderAs?: RenderAsType;
    overlayMode: boolean;
}) => {
  const { getCachedResponse, isLoadingResponse } = useAnalysis();
  const [activeTab, setActiveTab] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const hasBeenInView = useRef(false);

  const currentVariant = modelVariants[activeTab];
  const parsed = parseModelIdForDisplay(currentVariant.modelId);
  const baseDisplayLabel = getModelDisplayLabel(parsed, { prettifyModelName: true });

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasBeenInView.current) {
          hasBeenInView.current = true;
          // Load all variants when card comes into view
          modelVariants.forEach(variant => {
            const response = getCachedResponse(promptId, variant.modelId);
            const isQueued = loadingQueue.has(`${promptId}:${variant.modelId}`);
            const isLoading = isLoadingResponse(promptId, variant.modelId);
            if (!response && !isQueued && !isLoading) {
              onInView(variant.modelId);
            }
          });
          if (cardRef.current) {
            observer.unobserve(cardRef.current);
          }
        }
      },
      { rootMargin: '200px' }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      if (cardRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        observer.unobserve(cardRef.current);
      }
    };
  }, [promptId, modelVariants, getCachedResponse, loadingQueue, isLoadingResponse, onInView]);

  return (
    <div ref={cardRef} className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
      <Card className="h-full overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
        <div className="border-b border-border bg-slate-100 dark:bg-slate-800 p-2 flex-shrink-0">
          <h3 className="font-semibold text-xs truncate" title={getModelDisplayLabel(currentVariant.modelId)}>
            {baseDisplayLabel}
          </h3>
        </div>

        {modelVariants.length > 1 && (
          <div className="flex gap-1 p-1 border-b border-border bg-muted/30 flex-shrink-0">
            {modelVariants.map((variant, idx) => {
              const temp = variant.temperature ?? 1.0;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveTab(idx)}
                  className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                    activeTab === idx
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                  }`}
                  title={`Temperature: ${temp}`}
                >
                  T:{temp}
                </button>
              );
            })}
          </div>
        )}

        {currentVariant.coverageScore !== null && currentVariant.coverageScore !== undefined && hasBeenInView.current && (
          <div
            className={`absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-full text-xs font-semibold text-white shadow-md ${getScoreColor(currentVariant.coverageScore)}`}
            title={`Coverage Score: ${(currentVariant.coverageScore * 100).toFixed(1)}%`}
          >
            {Math.round(currentVariant.coverageScore * 100)}
          </div>
        )}

        <div className="flex-1 relative overflow-hidden">
          {overlayMode ? (
            // Overlay mode: stack all responses with opacity
            <div className="absolute inset-0 cursor-pointer" onClick={() => onClick(currentVariant.modelId)}>
              {modelVariants.map((variant, idx) => {
                const response = getCachedResponse(promptId, variant.modelId);
                const isLoading = isLoadingResponse(promptId, variant.modelId);
                const isQueued = loadingQueue.has(`${promptId}:${variant.modelId}`);
                const showLoading = (isLoading || isQueued) && !response;
                const opacity = 1 / modelVariants.length;

                return (
                  <div
                    key={variant.modelId}
                    className="absolute inset-0 overflow-y-auto"
                    style={{ opacity }}
                  >
                    {showLoading ? (
                      <CardContent className="p-2">
                        <div className="space-y-2">
                          <Skeleton className="h-3 w-3/4" />
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-5/6" />
                        </div>
                      </CardContent>
                    ) : response ? (
                      <CardContent className="p-2 text-xs">
                        <ResponseRenderer content={response} renderAs={renderAs} />
                      </CardContent>
                    ) : (
                      <CardContent className="p-2">
                        <p className="text-muted-foreground italic text-xs">No response</p>
                      </CardContent>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // Tab mode: show only active variant
            <div className="h-full cursor-pointer overflow-y-auto" onClick={() => onClick(currentVariant.modelId)}>
              {(() => {
                const response = getCachedResponse(promptId, currentVariant.modelId);
                const isLoading = isLoadingResponse(promptId, currentVariant.modelId);
                const isQueued = loadingQueue.has(`${promptId}:${currentVariant.modelId}`);
                const showLoading = (isLoading || isQueued) && !response;

                if (showLoading) {
                  return (
                    <CardContent className="p-2">
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-5/6" />
                      </div>
                    </CardContent>
                  );
                }
                if ((response === null || response.trim() === '') && hasBeenInView.current) {
                  return (
                    <CardContent className="p-2">
                      <p className="text-muted-foreground italic text-xs">No response available.</p>
                    </CardContent>
                  );
                }
                if (response) {
                  return (
                    <CardContent className="p-2 text-xs">
                      <ResponseRenderer content={response} renderAs={renderAs} />
                    </CardContent>
                  );
                }
                return <CardContent className="p-2 bg-muted/20" />;
              })()}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
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
    const [overlayMode, setOverlayMode] = useState(false);

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

    const { models, prompts, modelGroups } = useMemo(() => {
        if (!data) {
            return { models: [], prompts: [], modelGroups: [] };
        }

        const models = data.effectiveModels
            .filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase())
            .sort((a, b) => getModelDisplayLabel(a).localeCompare(getModelDisplayLabel(b)));

        // Group models by base ID (without temperature) for grid view
        const groupMap = new Map<string, Array<{ modelId: string; temperature?: number }>>();
        models.forEach(modelId => {
            const parsed = parseModelIdForDisplay(modelId);
            const baseId = parsed.baseId;
            if (!groupMap.has(baseId)) {
                groupMap.set(baseId, []);
            }
            groupMap.get(baseId)!.push({
                modelId,
                temperature: parsed.temperature,
            });
        });
        // Sort each group by temperature
        groupMap.forEach(group => {
            group.sort((a, b) => (a.temperature ?? 1.0) - (b.temperature ?? 1.0));
        });
        const modelGroups = Array.from(groupMap.entries()).map(([baseId, variants]) => ({
            baseId,
            variants,
        }));

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

        return { models, prompts, modelGroups };
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

            <main className="flex-1 min-h-0 overflow-auto">
                <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-start justify-between gap-4 mb-6">
                        <div className="flex-1">
                            <ComparePromptSelector />
                            <SystemPromptDisplay />
                        </div>
                        {currentPromptId && (
                            <div className="flex-shrink-0 pt-6">
                                <Button
                                    variant={overlayMode ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setOverlayMode(!overlayMode)}
                                    className="text-xs"
                                >
                                    <Icon name={overlayMode ? "layers" : "layers"} className="w-3.5 h-3.5 mr-1.5" />
                                    {overlayMode ? "Overlay On" : "Overlay Off"}
                                </Button>
                            </div>
                        )}
                    </div>

                    {currentPromptId ? (
                        // Grid view for single prompt - using ~10vw per card
                        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(max(10vw, 150px), 1fr))' }}>
                            {modelGroups.map(group => {
                                const promptConfig = data.config.prompts?.find(p => p.id === currentPromptId);
                                const renderAs = promptConfig?.render_as as RenderAsType | undefined;

                                // Build variants with coverage scores
                                const modelVariants = group.variants.map(variant => {
                                    const coverageResult = data.evaluationResults?.llmCoverageScores?.[currentPromptId]?.[variant.modelId];
                                    const score = (coverageResult && !('error' in coverageResult) && typeof coverageResult.avgCoverageExtent === 'number')
                                        ? coverageResult.avgCoverageExtent
                                        : null;
                                    return {
                                        modelId: variant.modelId,
                                        temperature: variant.temperature,
                                        coverageScore: score,
                                    };
                                });

                                return (
                                    <GridViewCard
                                        key={group.baseId}
                                        promptId={currentPromptId}
                                        modelVariants={modelVariants}
                                        onInView={(modelId) => requestLoad(currentPromptId, modelId)}
                                        loadingQueue={loadingQueue}
                                        onClick={(modelId) => handleCellClick(currentPromptId, modelId)}
                                        renderAs={renderAs}
                                        overlayMode={overlayMode}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        // Table view for all prompts
                        <div className="overflow-auto relative w-full">
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
                    )}
                </div>
            </main>

            <SpecificEvaluationModal />
        </div>
    );
};
