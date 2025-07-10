'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { CoverageResult } from '@/app/utils/types';
import { EvaluationView } from './SharedEvaluationComponents';

const ArrowLeft = dynamic(() => import("lucide-react").then(mod => mod.ArrowLeft), { ssr: false });

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

interface MobileModelDetailProps {
    modelId: string;
    coverageResult: CoverageResult | undefined;
    response: string;
    onBack: () => void;
}

export const MobileModelDetail: React.FC<MobileModelDetailProps> = ({
    modelId,
    coverageResult,
    response,
    onBack
}) => {
    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    
    const toggleLogExpansion = (index: number) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };

    if (!coverageResult || 'error' in coverageResult) {
        return (
            <div className="h-full flex flex-col min-h-0">
                <div className="flex items-center gap-3 p-4 border-b bg-card flex-shrink-0">
                    <button 
                        onClick={onBack}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-lg transition-colors min-h-[44px]"
                        title="Back to model list"
                    >
                        <ArrowLeft className="h-5 w-5" />
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
                    <ArrowLeft className="h-5 w-5" />
                    <span className="font-medium">Back</span>
                </button>
                <h2 className="font-semibold text-lg truncate flex-1">{getModelDisplayLabel(modelId)}</h2>
            </div>

            {/* Mobile-optimized content */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
                <EvaluationView 
                    assessments={assessments}
                    modelResponse={response}
                    expandedLogs={expandedLogs}
                    toggleLogExpansion={toggleLogExpansion}
                    isMobile={true}
                />
            </div>
        </div>
    );
}; 