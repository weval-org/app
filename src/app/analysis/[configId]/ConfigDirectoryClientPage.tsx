'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { prettifyTag } from '@/app/utils/tagUtils';
import { ConfigDirectoryEntry } from '@/lib/storageService';
import { fromSafeTimestamp, formatTimestampForDisplay } from '@/lib/timestampUtils';
import Icon from '@/components/ui/icon';
import ResponseRenderer from '@/app/components/ResponseRenderer';

interface ConfigDirectoryClientPageProps {
    prefix: string;
    configs: ConfigDirectoryEntry[];
}

const ConfigDirectoryClientPage: React.FC<ConfigDirectoryClientPageProps> = ({
    prefix,
    configs,
}) => {
    // Convert prefix to display path (e.g., "compass__" -> "compass/")
    const displayPath = useMemo(() => {
        return prefix.slice(0, -2).replace(/__/g, '/') + '/';
    }, [prefix]);

    // Build breadcrumbs for nested directories (e.g., "compass__personality__" -> compass/ > personality/)
    const breadcrumbItems = useMemo(() => {
        const items = [{ label: 'Home', href: '/' }];
        // Remove trailing __ and split by __
        const parts = prefix.slice(0, -2).split('__');
        let accumulated = '';
        for (let i = 0; i < parts.length; i++) {
            accumulated += (i > 0 ? '__' : '') + parts[i];
            items.push({
                label: parts[i] + '/',
                href: `/analysis/${accumulated}__`,
            });
        }
        return items;
    }, [prefix]);

    // Sort configs by latest run timestamp (newest first), then alphabetically
    const sortedConfigs = useMemo(() => {
        return [...configs].sort((a, b) => {
            if (a.latestRunTimestamp && b.latestRunTimestamp) {
                const aTime = new Date(fromSafeTimestamp(a.latestRunTimestamp)).getTime();
                const bTime = new Date(fromSafeTimestamp(b.latestRunTimestamp)).getTime();
                if (aTime !== bTime) return bTime - aTime;
            } else if (a.latestRunTimestamp) {
                return -1;
            } else if (b.latestRunTimestamp) {
                return 1;
            }
            return a.title.localeCompare(b.title);
        });
    }, [configs]);

    return (
        <div className="mx-auto p-4 md:p-6 lg:p-8 space-y-8">
            <Breadcrumbs items={breadcrumbItems} />

            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">
                    Blueprints in {displayPath}
                </h1>
                <p className="text-muted-foreground">
                    {configs.length} {configs.length === 1 ? 'blueprint' : 'blueprints'}
                </p>
            </div>

            {configs.length === 0 ? (
                <Card>
                    <CardContent className="py-12">
                        <div className="text-center">
                            <Icon name="folder-open" className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-muted-foreground">
                                No blueprints found with prefix &quot;{prefix}&quot;
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {sortedConfigs.map((config) => {
                        const latestRunUrl = config.latestRunTimestamp && config.latestRunLabel
                            ? `/analysis/${config.configId}/${config.latestRunLabel}/${config.latestRunTimestamp}`
                            : `/analysis/${config.configId}`;

                        return (
                            <Card key={config.configId}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-lg">
                                                <Link
                                                    href={latestRunUrl}
                                                    className="hover:underline text-primary"
                                                >
                                                    {config.title}
                                                </Link>
                                            </h3>
                                            {config.description && (
                                                <div className="text-sm text-muted-foreground mt-1 line-clamp-3 prose prose-sm dark:prose-invert max-w-none">
                                                    <ResponseRenderer content={config.description} />
                                                </div>
                                            )}
                                            {config.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-3">
                                                    {config.tags.slice(0, 5).map((tag) => (
                                                        <Badge key={tag} variant="secondary" className="text-xs">
                                                            {prettifyTag(tag)}
                                                        </Badge>
                                                    ))}
                                                    {config.tags.length > 5 && (
                                                        <Badge variant="outline" className="text-xs">
                                                            +{config.tags.length - 5}
                                                        </Badge>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right text-sm shrink-0 space-y-1">
                                            {config.latestHybridScore !== null && (
                                                <div className="font-semibold text-base">
                                                    {(config.latestHybridScore * 100).toFixed(1)}%
                                                </div>
                                            )}
                                            {config.latestRunTimestamp && (
                                                <div className="text-xs text-muted-foreground">
                                                    {formatTimestampForDisplay(fromSafeTimestamp(config.latestRunTimestamp))}
                                                </div>
                                            )}
                                            {config.runCount > 1 && (
                                                <Link
                                                    href={`/analysis/${config.configId}`}
                                                    className="text-xs text-muted-foreground hover:text-primary hover:underline block"
                                                >
                                                    All {config.runCount} runs
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ConfigDirectoryClientPage;
