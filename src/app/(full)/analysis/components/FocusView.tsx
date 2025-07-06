'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AllCoverageScores, AllFinalAssistantResponses } from '../types';
import { ParsedModelId } from '@/app/utils/modelIdUtils';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import Link from 'next/link';
import ModelEvaluationDetailModalV2 from './ModelEvaluationDetailModalV2';

const Loader2 = dynamic(() => import("lucide-react").then((mod) => mod.Loader2));
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfm = dynamic(() => import('remark-gfm'), { ssr: false });
const ArrowLeft = dynamic(() => import("lucide-react").then((mod) => mod.ArrowLeft));
const ArrowRight = dynamic(() => import("lucide-react").then((mod) => mod.ArrowRight));
const X = dynamic(() => import("lucide-react").then((mod) => mod.X)); 

interface FocusViewProps {
    focusedModelId: string;
    parsedModelsMap: Record<string, ParsedModelId>;
    allCoverageScores: AllCoverageScores;
    allFinalAssistantResponses: AllFinalAssistantResponses;
    sortedPromptIds: string[];
    calculatePromptAverage: (promptId: string) => number | null;
    getPromptText: (promptId: string) => string;
    configId: string;
    runLabel: string;
    safeTimestampFromParams: string;
    onReturn: () => void;
    onClearFocus: () => void;
    onSwitchFocus: (direction: 'next' | 'prev') => void;
}

export const FocusView: React.FC<FocusViewProps> = ({
    focusedModelId,
    parsedModelsMap,
    allCoverageScores,
    allFinalAssistantResponses,
    sortedPromptIds,
    calculatePromptAverage,
    getPromptText,
    configId,
    runLabel,
    safeTimestampFromParams,
    onReturn,
    onClearFocus,
    onSwitchFocus,
}) => {
    
    return (
        <div className="p-4 bg-background dark:bg-slate-900 rounded-lg shadow-inner-lg">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={onClearFocus} title="Exit focus view">
                        <X className="w-4 h-4" />
                    </Button>
                    <div>
                        <h3 className="text-lg font-bold text-primary">Focus Mode</h3>
                        <p className="text-sm text-muted-foreground">Detailed view for: <span className="font-semibold text-foreground">{getModelDisplayLabel(parsedModelsMap[focusedModelId])}</span></p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => onSwitchFocus('prev')} title="Previous Model">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                     <Button variant="outline" size="icon" onClick={() => onSwitchFocus('next')} title="Next Model">
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>
            
            <div className="space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                {sortedPromptIds.map(promptId => {
                    const response = allFinalAssistantResponses[promptId]?.[focusedModelId];
                    const result = allCoverageScores[promptId]?.[focusedModelId];
                    
                    if (!response) {
                        return (
                            <Card key={promptId} className="border-dashed">
                                <CardHeader>
                                    <CardTitle className="text-sm">
                                         <Link href={`/analysis/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(safeTimestampFromParams)}?prompt=${encodeURIComponent(promptId)}`}>
                                            {getPromptText(promptId)}
                                        </Link>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-muted-foreground italic">No response available.</p>
                                </CardContent>
                            </Card>
                        )
                    }

                    return (
                        <Card key={promptId}>
                            <CardHeader>
                                <CardTitle className="text-base font-semibold hover:underline">
                                    <Link href={`/analysis/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(safeTimestampFromParams)}?prompt=${encodeURIComponent(promptId)}`}>
                                        {getPromptText(promptId)}
                                    </Link>
                                </CardTitle>
                                {result && 'error' in result && <p className="text-destructive text-sm">Error: {result.error}</p>}
                                {result && !('error' in result) && result.avgCoverageExtent !== undefined && (
                                     <CardDescription>
                                        Average Coverage Extent: {(result.avgCoverageExtent * 100).toFixed(1)}%
                                    </CardDescription>
                                )}
                            </CardHeader>
                            <CardContent>
                                <ReactMarkdown remarkPlugins={[RemarkGfm as any]} className="prose prose-sm dark:prose-invert max-w-none">{response}</ReactMarkdown>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    );
}; 