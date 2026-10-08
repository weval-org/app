'use client';

import React, { useMemo } from 'react';
import AnalysisPageHeader from '@/app/analysis/components/AnalysisPageHeader';
import BlueprintRunsTable from '@/app/analysis/components/BlueprintRunsTable';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import Icon from '@/components/ui/icon';
import { buildConfigBreadcrumbs } from '@/app/utils/blueprintIdUtils';

interface ConfigRunsClientPageProps {
    configId: string;
    configTitle: string;
    description?: string;
    tags?: string[];
    author?: string | { name: string; url?: string; image_url?: string };
    reference?: string | { title: string; url?: string };
    runs: EnhancedRunInfo[];
}

const ConfigRunsClientPage: React.FC<ConfigRunsClientPageProps> = ({
    configId,
    configTitle,
    description,
    tags,
    author,
    reference,
    runs,
}) => {
    const breadcrumbItems = useMemo(() => [
        { label: 'Home', href: '/' },
        ...buildConfigBreadcrumbs(configId, configTitle),
    ], [configId, configTitle]);

    const pageTitle = useMemo(() => `${configTitle} - All Runs`, [configTitle]);

    return (
        <AnalysisProvider
            configId={configId}
            configTitle={configTitle}
            description={description}
            tags={tags}
            author={author}
            reference={reference}
            pageTitle={pageTitle}
            breadcrumbItems={breadcrumbItems}
        >
            <div className="mx-auto p-4 md:p-6 lg:p-8 space-y-8">
                <AnalysisPageHeader />

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold tracking-tight">Runs</h2>
                    {runs.length === 0 ? (
                        <div className="text-center py-10 bg-card/50 dark:bg-card/40 rounded-lg shadow-md">
                            <Icon name="history" className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-muted-foreground">No runs have been recorded for this blueprint yet.</p>
                        </div>
                    ) : (
                        <BlueprintRunsTable configId={configId} runs={runs} />
                    )}
                </section>
            </div>
        </AnalysisProvider>
    );
};

export default ConfigRunsClientPage;
