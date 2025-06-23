'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getModelDisplayLabel, ParsedModelId } from '@/app/utils/modelIdUtils';
import { AllCoverageScores, AllFinalAssistantResponses } from '@/app/(full)/analysis/types';

const XIcon = dynamic(() => import("lucide-react").then((mod) => mod.X));
const ArrowLeft = dynamic(() => import("lucide-react").then((mod) => mod.ArrowLeft));
const ArrowRight = dynamic(() => import("lucide-react").then((mod) => mod.ArrowRight));

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
    markdownModule: { ReactMarkdown: any, RemarkGfm: any } | null;
    onClearFocus: () => void;
    onSwitchFocus: (direction: 'prev' | 'next') => void;
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
    markdownModule,
    onClearFocus,
    onSwitchFocus,
}) => {
    if (!markdownModule) {
        // or a loading spinner
        return <p className="p-4 text-muted-foreground italic">Loading view...</p>;
    }
    const { ReactMarkdown, RemarkGfm } = markdownModule;
    const focusedModelParsed = parsedModelsMap[focusedModelId];

    if (!focusedModelParsed) return null;

    return (
        <div className="overflow-x-auto rounded-md ring-1 ring-border dark:ring-slate-700 shadow-md">
            <div className="p-4 bg-muted/50 dark:bg-slate-800/50 border-b border-border dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-lg font-semibold">
                    Focus View: <span className="text-primary text-primary">{getModelDisplayLabel(focusedModelParsed)}</span>
                </h3>
                <div className="flex items-center space-x-3">

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClearFocus}
                        className="text-primary hover:text-primary/80 hover:bg-primary/10"
                    >
                        <XIcon className="w-4 h-4 mr-1.5" />
                        Clear Focus
                    </Button>
                </div>
            </div>
            <table className="border-collapse text-xs w-full">
                <thead>
                    <tr className="bg-muted dark:bg-slate-800">
                        <th className="border border-border dark:border-slate-700 p-2 text-center font-semibold w-20">Avg %</th>
                        <th className="border border-border dark:border-slate-700 p-2 text-left font-semibold w-1/4">Prompt</th>
                        <th className="border border-border dark:border-slate-700 p-2 text-left font-semibold w-1/3">Model Response</th>
                        <th className="border border-border dark:border-slate-700 p-2 text-left font-semibold w-1/3">Key Point Breakdown</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-slate-700">
                    {sortedPromptIds.map((promptId) => {
                        const avgScore = calculatePromptAverage(promptId);
                        const result = allCoverageScores[promptId]?.[focusedModelId];
                        const response = allFinalAssistantResponses[promptId]?.[focusedModelId];

                        return (
                            <tr key={promptId} className="hover:bg-muted/50 dark:hover:bg-slate-700/30 transition-colors duration-100 align-top">
                                <td className="border-x border-border dark:border-slate-700 p-2 text-center align-middle font-medium">
                                    {avgScore !== null ? (
                                        <span className={`inline-block px-1.5 py-0.5 rounded-md text-white dark:text-slate-50 text-[10px] font-semibold ${avgScore >= 75 ? 'bg-highlight-success/90' : avgScore >= 50 ? 'bg-highlight-warning/90' : 'bg-highlight-error/90'}`}>
                                            {avgScore.toFixed(0)}%
                                        </span>
                                    ) : <span className="text-muted-foreground dark:text-slate-500">-</span>}
                                </td>
                                <td className="border-x border-border dark:border-slate-700 p-2 text-left align-middle">
                                    <Link
                                        href={`/analysis/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(safeTimestampFromParams)}?prompt=${encodeURIComponent(promptId)}`}
                                        className="block text-primary text-primary hover:text-primary/80 dark:hover:text-sky-300 hover:underline cursor-pointer"
                                        title={`View details for: ${getPromptText(promptId)}`}
                                    >
                                        <span className="block truncate text-xs text-muted-foreground dark:text-slate-500">{promptId}</span>
                                        <span className="whitespace-normal line-clamp-3">{getPromptText(promptId)}</span>
                                    </Link>
                                </td>
                                <td className="border-x border-border dark:border-slate-700 p-0 text-left align-middle">
                                    <div className="max-h-48 overflow-y-auto custom-scrollbar p-2 prose prose-sm dark:prose-invert max-w-none">
                                        {response ? <ReactMarkdown remarkPlugins={[RemarkGfm]}>{response}</ReactMarkdown> : <p className="italic text-muted-foreground">Response not available.</p>}
                                    </div>
                                </td>
                                <td className="border-x border-border dark:border-slate-700 p-2 text-left align-middle">
                                    {!result || 'error' in result || !result.pointAssessments || result.pointAssessments.length === 0 ? (
                                        <p className="italic text-muted-foreground text-xs">No key point assessments available.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {result.pointAssessments.map((assessment, idx) => {
                                                const isPresent = assessment.coverageExtent !== undefined && assessment.coverageExtent > 0.3;
                                                return (
                                                    <div key={idx} className={`p-1.5 rounded border-l-4 ${isPresent ? 'border-highlight-success/80' : 'border-highlight-error/80'}`}>
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <div className="flex justify-between items-center text-xs cursor-default">
                                                                        <p className="flex-grow line-clamp-2">{assessment.keyPointText}</p>
                                                                        <Badge variant={isPresent ? 'default' : 'destructive'} className={`ml-2 flex-shrink-0 ${isPresent ? 'bg-highlight-success/80 hover:bg-highlight-success/70 text-white' : ''}`}>{(assessment.coverageExtent! * 100).toFixed(0)}%</Badge>
                                                                    </div>
                                                                </TooltipTrigger>
                                                                <TooltipContent className="max-w-md">
                                                                    <p className="font-bold">{assessment.keyPointText}</p>
                                                                    <p className="mt-1"><span className="font-semibold">Score:</span> {(assessment.coverageExtent! * 100).toFixed(1)}%</p>
                                                                    {assessment.reflection && <p className="mt-1"><span className="font-semibold">Reflection:</span> <span className="italic">{assessment.reflection}</span></p>}
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}; 