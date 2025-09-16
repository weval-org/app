'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { CoverageResult } from '@/app/utils/types';
import { EvaluationView } from './SharedEvaluationComponents';
import Icon from '@/components/ui/icon';
import { RenderAsType } from '@/app/components/ResponseRenderer';

interface MobileModelDetailProps {
    modelId: string;
    coverageResult: CoverageResult | undefined;
    response: string;
    idealResponse?: string;
    configId?: string;
    runLabel?: string;
    timestamp?: string;
    promptId?: string;
    onBack: () => void;
    renderAs?: RenderAsType;
}

export const MobileModelDetail: React.FC<MobileModelDetailProps> = ({
    modelId,
    coverageResult,
    response,
    idealResponse,
    configId,
    runLabel,
    timestamp,
    promptId,
    onBack,
    renderAs,
}) => {
    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    const [history, setHistory] = useState<any[] | null>(null);
    const [historyLoaded, setHistoryLoaded] = useState<boolean>(false);
    
    const toggleLogExpansion = (index: number) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };

    // Fetch conversation history lazily on mobile detail view
    React.useEffect(() => {
        if (!configId || !runLabel || !timestamp || !promptId || historyLoaded) return;
        (async () => {
            try {
                const baseUrl = `/api/comparison/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(timestamp)}`;
                const resp = await fetch(`${baseUrl}/modal-data/${encodeURIComponent(promptId)}/${encodeURIComponent(modelId)}`);
                if (!resp.ok) {
                    setHistory([]);
                    setHistoryLoaded(true);
                    return;
                }
                const json = await resp.json();
                if (Array.isArray(json.history)) setHistory(json.history);
            } catch {
                setHistory([]);
            } finally {
                setHistoryLoaded(true);
            }
        })();
    }, [configId, runLabel, timestamp, promptId, modelId, historyLoaded]);

    if (!coverageResult || 'error' in coverageResult) {
        return (
            <div className="h-full flex flex-col min-h-0">
                <div className="flex items-center gap-3 p-4 border-b bg-card flex-shrink-0">
                    <button 
                        onClick={onBack}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-lg transition-colors min-h-[44px]"
                        title="Back to model list"
                    >
                        <Icon name="arrow-left" className="h-5 w-5" />
                        <span className="font-medium">Back</span>
                    </button>
                    <h2 className="font-semibold text-lg truncate flex-1">{getModelDisplayLabel(modelId)}</h2>
                </div>
                <div className="flex-1 flex items-center justify-center p-4">
                    <div className="text-center">
                        <p className="text-destructive text-lg font-semibold">Error Loading Data</p>
                        <p className="text-muted-foreground mt-2">
                            {coverageResult?.error || 'Unknown error occurred'}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const assessments = coverageResult.pointAssessments || [];

    return (
        <div className="h-full flex flex-col min-h-0">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b bg-card flex-shrink-0">
                <button 
                    onClick={onBack}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-lg transition-colors min-h-[44px]"
                    title="Back to model list"
                >
                    <Icon name="arrow-left" className="h-5 w-5" />
                    <span className="font-medium">Back</span>
                </button>
                <h2 className="font-semibold text-lg truncate flex-1">{getModelDisplayLabel(modelId)}</h2>
            </div>

            {/* Mobile-optimized content */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
                <EvaluationView 
                    assessments={assessments}
                    modelResponse={response}
                    idealResponse={idealResponse}
                    expandedLogs={expandedLogs}
                    toggleLogExpansion={toggleLogExpansion}
                    isMobile={true}
                    generatedHistory={Array.isArray(history) && history.length ? (history as any) : undefined}
                    renderAs={renderAs}
                />
            </div>
        </div>
    );
}; 