'use client';

import React, { useMemo, useState, useCallback } from 'react';
import RefactoredAnalysisPageHeader from '@/app/analysis/components/RefactoredAnalysisPageHeader';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { prettifyTag } from '@/app/utils/tagUtils';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import { fromSafeTimestamp, formatTimestampForDisplay } from '@/lib/timestampUtils';
import dynamic from 'next/dynamic';
const AlertCircle = dynamic(() => import('lucide-react').then(mod => mod.AlertCircle), { ssr: false });

interface RefactorConfigRunsClientPageProps {
    configId: string;
    configTitle: string;
    description?: string;
    tags?: string[];
    runs: EnhancedRunInfo[];
    totalRuns: number;
    currentPage: number;
    runsPerPage: number;
}

const RefactorConfigRunsClientPage: React.FC<RefactorConfigRunsClientPageProps> = ({
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
            <RefactoredAnalysisPageHeader />
            
            <div className="space-y-6 my-8">

                {/* Runs List */}
                <Card>
                    <CardHeader>
                        <CardTitle>Runs ({filteredRuns.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {filteredRuns.length === 0 ? (
                            <div className="text-center py-8">
                                <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                                <p className="text-muted-foreground">No runs found matching your criteria.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredRuns.map((run) => (
                                    <Card key={`${run.runLabel}-${run.timestamp}`}>
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <h3 className="font-semibold text-lg">
                                                        <a 
                                                            href={`/analysis/${configId}/${run.runLabel}`}
                                                            className="hover:underline text-primary"
                                                        >
                                                            {run.runLabel}
                                                        </a>
                                                    </h3>
                                                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                                                        <span>
                                                            {formatTimestampForDisplay(fromSafeTimestamp(run.timestamp))}
                                                        </span>
                                                        {run.numPrompts && (
                                                            <span>{run.numPrompts} prompts</span>
                                                        )}
                                                        {run.numModels && (
                                                            <span>{run.numModels} models</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Button asChild variant="outline" size="sm">
                                                    <a href={`/analysis/${configId}/${run.runLabel}`}>
                                                        View Runs
                                                    </a>
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AnalysisProvider>
    );
};

export default RefactorConfigRunsClientPage; 