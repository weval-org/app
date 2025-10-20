'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Link from 'next/link';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { prettifyTag, normalizeTag } from '@/app/utils/tagUtils';
import Icon from '@/components/ui/icon';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import RemarkGfmPlugin from 'remark-gfm';

export const SimpleAnalysisHeader: React.FC = () => {
    const { data, configId, runLabel, timestamp } = useAnalysis();

    if (!data) return null;

    const { config } = data;
    const title = config.title || config.id;
    const description = config.description;
    const tags = config.tags || [];

    // Check if this is a workshop run (ephemeral, different storage pattern)
    const isWorkshopRun = configId?.startsWith('workshop_');

    return (
        <div className="space-y-6 mb-12">
            {/* Title and subtitle */}
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold text-foreground">
                    {title}
                </h1>
            </div>

            {/* Author badge */}
            {(config as any)?.author && (
                <div className="flex justify-center">
                    {(() => {
                        const a: any = (config as any).author;
                        const name: string = typeof a === 'string' ? a : a.name;
                        const url: string | undefined = typeof a === 'string' ? undefined : a.url;
                        const imageUrl: string | undefined = typeof a === 'string' ? undefined : a.image_url;
                        const content = (
                            <span className="text-sm text-foreground">
                                {imageUrl ? (
                                    <img src={imageUrl} alt={name} className="h-5 w-5 rounded-full border border-border inline mr-1 align-text-bottom" />
                                ) : (
                                    <Icon name="user" className="w-4 h-4 text-foreground inline mr-1 align-text-bottom" />
                                )}
                                By: <span className="font-bold">{name}</span>
                            </span>
                        );
                        return (
                            <span className="inline-flex items-center rounded-full bg-muted/60 px-2.5 py-1 border border-border/60" title="Blueprint author">
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

            {/* References */}
            {(config as any)?.references && Array.isArray((config as any).references) && (config as any).references.length > 0 && (
                <div className="flex justify-center">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center text-sm text-foreground mr-1">
                            <Icon name="book-open" className="w-4 h-4 text-foreground inline mr-1.5 align-text-bottom" />
                            <span>Reference{((config as any).references.length > 1 ? 's' : '')}:</span>
                        </div>
                        {(config as any).references.map((r: any, index: number) => {
                            const title: string = typeof r === 'string' ? r : (r.title || r.name);
                            const url: string | undefined = typeof r === 'string' ? undefined : r.url;
                            const maxLength = 45;
                            const displayTitle = title.length > maxLength ? `${title.substring(0, maxLength)}...` : title;
                            const content = (
                                <span className="font-bold text-sm">{displayTitle}</span>
                            );
                            return (
                                <TooltipProvider key={index}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="inline-flex items-center rounded-full bg-muted/60 px-2.5 py-1 border border-border/60 cursor-pointer">
                                                {url ? (
                                                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                                        {content}
                                                    </a>
                                                ) : content}
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="max-w-md">{title}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Description */}
            {description && (
                <div className="max-w-none">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed">
                        <ResponseRenderer content={description} />
                    </div>
                </div>
            )}

            {/* Tags and Actions Row */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Tags and Eval Methods */}
                <div className="flex flex-wrap items-center gap-2">
                    {tags.map(tag => (
                        <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs"
                        >
                            {prettifyTag(tag)}
                        </Badge>
                    ))}

                    {/* Evaluation Methods Badges */}
                    {data?.evalMethodsUsed && data.evalMethodsUsed.length > 0 && (
                        <>
                            <span className="text-xs text-muted-foreground mx-1">•</span>
                            <span className="text-xs text-muted-foreground">Evaluation:</span>
                            {data.evalMethodsUsed.map(method => (
                                <Badge
                                    key={method}
                                    variant="outline"
                                    className="text-xs"
                                    title={method === 'llm-coverage' ? 'Rubric-based LLM evaluation' : 'Semantic similarity via embeddings'}
                                >
                                    <Icon
                                        name={method === 'llm-coverage' ? 'check-circle' : 'git-compare-arrows'}
                                        className="w-3 h-3 mr-1"
                                    />
                                    {method === 'llm-coverage' ? 'LLM Coverage' : 'Embeddings'}
                                </Badge>
                            ))}
                        </>
                    )}
                    {(!data?.evalMethodsUsed || data.evalMethodsUsed.length === 0) && (
                        <>
                            <span className="text-xs text-muted-foreground mx-1">•</span>
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                                <Icon name="x-circle" className="w-3 h-3 mr-1" />
                                No Evaluation
                            </Badge>
                        </>
                    )}
                </div>

                {/* Quick Actions - Only show for non-workshop runs */}
                {!isWorkshopRun && (
                    <div className="flex flex-wrap items-center gap-2">
                        <Button asChild variant="outline" size="sm" className="gap-2">
                            <Link href={`/analysis/${configId}/${runLabel}/${timestamp}`}>
                                <Icon name="sliders-horizontal" className="w-4 h-4" />
                                Advanced Analysis
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="gap-2">
                            <Link href={`/analysis/${configId}/${runLabel}/${timestamp}/thread`}>
                                <Icon name="git-merge" className="w-4 h-4" />
                                Conversation Tree
                            </Link>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
