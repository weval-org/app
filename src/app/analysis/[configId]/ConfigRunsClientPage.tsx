'use client';

import React, { useMemo, useState, useCallback } from 'react';
import AnalysisPageHeader from '@/app/analysis/components/AnalysisPageHeader';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { prettifyTag } from '@/app/utils/tagUtils';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import { fromSafeTimestamp, formatTimestampForDisplay } from '@/lib/timestampUtils';
import Icon from '@/components/ui/icon';

interface ConfigRunsClientPageProps {
    configId: string;
    configTitle: string;
    description?: string;
    tags?: string[];
    runs: EnhancedRunInfo[];
    totalRuns: number;
    currentPage: number;
    runsPerPage: number;
}

const ConfigRunsClientPage: React.FC<ConfigRunsClientPageProps> = ({
    configId,
    configTitle,
    description,
    tags,
    runs,
    totalRuns,
    currentPage,
    runsPerPage,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    const breadcrumbItems = useMemo(() => [
        { label: 'Home', href: '/' },
        { label: configTitle, href: `/analysis/${configId}` },
    ], [configId, configTitle]);

    const pageTitle = useMemo(() => `${configTitle} - All Runs`, [configTitle]);

    const filteredRuns = useMemo(() => {
        return runs.filter(run => {
            const matchesSearch = !searchTerm || 
                run.runLabel.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesTags = selectedTags.length === 0 || 
                selectedTags.every(tag => tags?.includes(tag));

            return matchesSearch && matchesTags;
        });
    }, [runs, searchTerm, selectedTags, tags]);

    // Group by runLabel so we can show instance timestamps inline
    const runsByLabel = useMemo(() => {
        const map = new Map<string, EnhancedRunInfo[]>();
        for (const run of filteredRuns) {
            const arr = map.get(run.runLabel) || [];
            arr.push(run);
            map.set(run.runLabel, arr);
        }
        // Sort instances for each label by timestamp desc (newest first)
        for (const [label, arr] of map.entries()) {
            arr.sort((a, b) => {
                const aIso = fromSafeTimestamp(a.timestamp);
                const bIso = fromSafeTimestamp(b.timestamp);
                return new Date(bIso).getTime() - new Date(aIso).getTime();
            });
        }
        // Return as an array of tuples sorted by newest instance per label
        return Array.from(map.entries()).sort(([, aArr], [, bArr]) => {
            const aIso = fromSafeTimestamp(aArr[0].timestamp);
            const bIso = fromSafeTimestamp(bArr[0].timestamp);
            return new Date(bIso).getTime() - new Date(aIso).getTime();
        });
    }, [filteredRuns]);

    const toggleTag = useCallback((tag: string) => {
        setSelectedTags(prev => 
            prev.includes(tag) 
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
    }, []);

    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        runs.forEach(run => {
            // Use the tags from the config if available, otherwise no tags
            tags?.forEach(tag => tagSet.add(tag));
        });
        return Array.from(tagSet).sort();
    }, [runs, tags]);

    return (
        <AnalysisProvider
            configId={configId}
            configTitle={configTitle}
            description={description}
            tags={tags}
            pageTitle={pageTitle}
            breadcrumbItems={breadcrumbItems}
        >
            <div className="mx-auto p-4 md:p-6 lg:p-8 space-y-8">
                <AnalysisPageHeader />
                
                {/* Runs List */}
                <Card>
                    <CardHeader>
                        <CardTitle>Runs ({runsByLabel.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {runsByLabel.length === 0 ? (
                            <div className="text-center py-8">
                                <Icon name="alert-circle" className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                                <p className="text-muted-foreground">No runs found matching your criteria.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {runsByLabel.map(([label, instances]) => {
                                    const latest = instances[0];
                                    const preview = instances.slice(0, 3);
                                    const remaining = Math.max(instances.length - preview.length, 0);
                                    return (
                                        <Card key={label}>
                                            <CardContent className="p-4">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <h3 className="font-semibold text-lg">
                                                            <a 
                                                                href={`/analysis/${configId}/${label}`}
                                                                className="hover:underline text-primary"
                                                            >
                                                                {label}
                                                            </a>
                                                        </h3>
                                                        <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                                                            {latest?.numPrompts && (
                                                                <span>{latest.numPrompts} prompts</span>
                                                            )}
                                                            {latest?.numModels && (
                                                                <span>{latest.numModels} models</span>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2 mt-3">
                                                            {preview.map((inst) => (
                                                                <Button key={inst.timestamp} asChild variant="secondary" size="sm">
                                                                    <a
                                                                        href={`/analysis/${configId}/${label}/${inst.timestamp}`}
                                                                        className="inline-flex items-center gap-2"
                                                                    >
                                                                        <Icon name="history" className="w-4 h-4" />
                                                                        <span>{formatTimestampForDisplay(fromSafeTimestamp(inst.timestamp))}</span>
                                                                        {typeof inst.hybridScoreStats?.average === 'number' && !isNaN(inst.hybridScoreStats.average) && (
                                                                            <span className="text-xs text-muted-foreground">{(inst.hybridScoreStats.average * 100).toFixed(1)}%</span>
                                                                        )}
                                                                    </a>
                                                                </Button>
                                                            ))}
                                                            {remaining > 0 && (
                                                                <Button asChild variant="default" size="sm">
                                                                    <a
                                                                        href={`/analysis/${configId}/${label}`}
                                                                        className="inline-flex items-center gap-1.5"
                                                                    >
                                                                        <Icon name="chevron-right" className="w-4 h-4" />
                                                                        +{remaining} more
                                                                    </a>
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <Button asChild variant="outline" size="sm">
                                                        <a href={`/analysis/${configId}/${label}`}>
                                                            View All
                                                        </a>
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AnalysisProvider>
    );
};

export default ConfigRunsClientPage; 