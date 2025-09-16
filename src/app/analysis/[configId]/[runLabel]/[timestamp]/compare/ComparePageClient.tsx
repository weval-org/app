'use client';

import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import ResponseRenderer, { RenderAsType } from '@/app/components/ResponseRenderer';

const ModelResponseCell = ({ 
    promptId, 
    modelId,
    onClick,
    onInView,
    isQueued,
    renderAs,
}: { 
    promptId: string;
    modelId: string;
    onClick: (response: string, renderAs: RenderAsType) => void;
    onInView: () => void;
    isQueued: boolean;
    renderAs?: RenderAsType;
}) => {
  const { getCachedResponse, isLoadingResponse } = useAnalysis();
  const response = getCachedResponse(promptId, modelId);
  const isLoading = isLoadingResponse(promptId, modelId);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const hasBeenInView = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!hasBeenInView.current) {
            hasBeenInView.current = true;
            onInView();
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
    <td ref={cellRef} className="p-2 border border-border" style={{minWidth: '250px', maxWidth: '250px'}}>
      <div className="h-full cursor-pointer" onClick={() => response && onClick(response, renderAs || 'markdown')}>
        {showLoading ? (
            <Card className="h-full bg-muted/50 flex items-center justify-center">
                <Icon name="loader-2" className="h-6 w-6 animate-spin text-primary" />
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
    const { data, pageTitle, configId, runLabel, timestamp, fetchModalResponseBatch } = useAnalysis();
    const [modalContent, setModalContent] = useState<{ title: string; content: string; renderAs: RenderAsType } | null>(null);
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

    const handleCellClick = (response: string, modelId: string, promptText: string, renderAs: RenderAsType) => {
        setModalContent({
            title: `Response from ${getModelDisplayLabel(modelId, { prettifyModelName: true })} for prompt: "${promptText}"`,
            content: response,
            renderAs: renderAs,
        });
    };

    if (!data) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Icon name="loader-2" className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4 text-lg text-muted-foreground">Loading analysis...</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-50 dark:bg-slate-900 min-h-screen">
            <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-border">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl font-bold tracking-tight truncate" title={pageTitle}>
                                {pageTitle} - Comparison View
                            </h1>
                        </div>
                        <div className="flex items-center gap-4">
                            <Button asChild variant="outline" size="sm">
                                <Link href={`/analysis/${configId}/${runLabel}/${timestamp}`}>
                                    <Icon name="sliders-horizontal" className="w-4 h-4 mr-2" />
                                    Advanced Analysis
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="p-4 sm:p-6 lg:p-8">
                <div className="overflow-x-auto relative">
                    <table className="border-collapse table-fixed">
                        <thead>
                            <tr>
                                <th className="bg-slate-100 dark:bg-slate-800 border border-border p-2" style={{width: '250px'}}>
                                    <span className="text-sm font-semibold">Prompts</span>
                                </th>
                                {models.map(modelId => {
                                    const parsed = parseModelIdForDisplay(modelId);
                                    const displayLabel = getModelDisplayLabel(parsed, { prettifyModelName: true });
                                    return (
                                        <th key={modelId} className="bg-slate-100 dark:bg-slate-800 p-0 border border-border" style={{minWidth: '250px', maxWidth: '250px'}}>
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
                                    <th className="bg-slate-100 dark:bg-slate-800 border border-border p-2 align-top" style={{width: '250px'}}>
                                        <div className="font-medium text-sm text-left" title={prompt.text}>
                                            {prompt.text}
                                        </div>
                                    </th>
                                    {models.map(modelId => (
                                        <ModelResponseCell
                                            key={modelId}
                                            promptId={prompt.id}
                                            modelId={modelId}
                                            onInView={() => requestLoad(prompt.id, modelId)}
                                            isQueued={loadingQueue.has(`${prompt.id}:${modelId}`)}
                                            onClick={(response, renderAs) => handleCellClick(response, modelId, prompt.text, renderAs)}
                                            renderAs={prompt.renderAs}
                                        />
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>

            <Dialog open={!!modalContent} onOpenChange={() => setModalContent(null)}>
              <DialogContent className="max-w-4xl w-[90vw] h-[90vh] flex flex-col">
                  <DialogHeader>
                      <DialogTitle className="truncate">{modalContent?.title}</DialogTitle>
                  </DialogHeader>
                  <div className="mt-4 flex-1 overflow-y-auto">
                      <ResponseRenderer content={modalContent?.content || ''} renderAs={modalContent?.renderAs} />
                  </div>
              </DialogContent>
            </Dialog>
        </div>
    );
};
