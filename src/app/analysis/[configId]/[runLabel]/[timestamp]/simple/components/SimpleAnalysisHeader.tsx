'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { prettifyTag, normalizeTag } from '@/app/utils/tagUtils';
import Icon from '@/components/ui/icon';
import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';

export const SimpleAnalysisHeader: React.FC = () => {
    const { data, configId, runLabel, timestamp } = useAnalysis();

    if (!data) return null;

    const { config } = data;
    const title = config.title || config.id;
    const description = config.description;
    const tags = config.tags || [];

    return (
        <div className="space-y-6 mb-12">
            {/* Title and subtitle */}
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold text-foreground">
                    {title}
                </h1>
                <p className="text-sm text-muted-foreground">
                    AI Model Performance Analysis
                </p>
            </div>

            {/* Description */}
            {description && (
                <div className="max-w-none">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed">
                        <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                            {description}
                        </ReactMarkdown>
                    </div>
                </div>
            )}

            {/* Tags and Actions Row */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Tags */}
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
                </div>

                {/* Quick Actions */}
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
            </div>
        </div>
    );
};
