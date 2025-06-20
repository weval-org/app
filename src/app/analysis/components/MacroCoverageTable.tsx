'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getGradedCoverageColor } from '@/app/analysis/utils/colorUtils';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { AllCoverageScores, AllFinalAssistantResponses } from '@/app/analysis/types';
import { useMacroCoverageData } from '@/app/analysis/hooks/useMacroCoverageData';
import { FocusView } from './FocusView';
import { cn } from '@/lib/utils';

const UsersIcon = dynamic(() => import("lucide-react").then((mod) => mod.UsersIcon));
const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle));

interface MacroCoverageTableProps {
    allCoverageScores: AllCoverageScores | undefined | null;
    promptIds: string[];
    promptTexts: Record<string, string> | undefined | null;
    models: string[]; // List of non-ideal model IDs
    allFinalAssistantResponses?: AllFinalAssistantResponses | null; // Now required for focus mode
    configId: string;
    runLabel: string;
    safeTimestampFromParams: string;
    onCellClick?: (promptId: string, modelId: string) => void;
    onModelClick?: (modelId: string) => void;
    onPromptClick?: (promptId: string) => void;
    onModelHover?: (modelId: string | null) => void;
}

const MacroCoverageTable: React.FC<MacroCoverageTableProps> = ({
    allCoverageScores,
    promptIds,
    promptTexts,
    models,
    allFinalAssistantResponses,
    configId,
    runLabel,
    safeTimestampFromParams,
    onCellClick,
    onModelClick,
    onPromptClick,
    onModelHover,
}) => {
    const [focusedModelId, setFocusedModelId] = useState<string | null>(null);
    const [markdownModule, setMarkdownModule] = useState<{ ReactMarkdown: any, RemarkGfm: any } | null>(null);

    const {
        localSortedModels,
        parsedModelsMap,
        baseModelGlobalIndexMap,
        baseIdToVisualGroupStyleMap,
        sortedPromptIds,
        promptStats,
        calculateModelAverageCoverage,
        calculatePromptAverage,
        OUTLIER_THRESHOLD_STD_DEV,
        HIGH_DISAGREEMENT_THRESHOLD_STD_DEV
    } = useMacroCoverageData(allCoverageScores, promptIds, models);

    useEffect(() => {
        Promise.all([
            import('react-markdown'),
            import('remark-gfm')
        ]).then(([md, gfm]) => {
            setMarkdownModule({ ReactMarkdown: md.default, RemarkGfm: gfm.default });
        });
    }, []);

    if (!allCoverageScores) {
        return <p className="p-4 text-muted-foreground italic">Macro coverage data not available at all.</p>;
    }
    if (sortedPromptIds.length === 0) {
        return <p className="p-4 text-muted-foreground italic">No prompts available.</p>;
    }
    if (localSortedModels.length === 0 && !focusedModelId) {
        return <p className="p-4 text-muted-foreground italic">No models available.</p>;
    }
    
    const getPromptText = (promptId: string): string => {
        return promptTexts?.[promptId] || promptId;
    };
    
    if (focusedModelId && allFinalAssistantResponses && allCoverageScores) {
        return (
            <FocusView
                focusedModelId={focusedModelId}
                parsedModelsMap={parsedModelsMap}
                allCoverageScores={allCoverageScores}
                allFinalAssistantResponses={allFinalAssistantResponses}
                sortedPromptIds={sortedPromptIds}
                calculatePromptAverage={calculatePromptAverage}
                getPromptText={getPromptText}
                configId={configId}
                runLabel={runLabel}
                safeTimestampFromParams={safeTimestampFromParams}
                onReturn={() => setFocusedModelId(null)}
                markdownModule={markdownModule}
                onClearFocus={() => setFocusedModelId(null)}
                onSwitchFocus={(direction) => {
                    const currentIndex = localSortedModels.indexOf(focusedModelId);
                    if (currentIndex === -1) return;
                    const nextIndex = direction === 'next' 
                        ? (currentIndex + 1) % localSortedModels.length 
                        : (currentIndex - 1 + localSortedModels.length) % localSortedModels.length;
                    setFocusedModelId(localSortedModels[nextIndex]);
                }}
            />
        );
    }

    const renderSegments = (promptId: string, modelId: string) => {
        const result = allCoverageScores[promptId]?.[modelId];
        if (!result) return <div title="Result missing" className="w-full h-full flex items-center justify-center bg-muted/50 dark:bg-slate-700/50"><span className="text-xs text-muted-foreground dark:text-slate-500">?</span></div>;
        if ('error' in result) return <div title={result.error} className="w-full h-full flex items-center justify-center bg-destructive/30 dark:bg-red-900/40"><AlertCircle className="w-4 h-4 text-destructive dark:text-red-300" /></div>;
        if (!result.pointAssessments || result.pointAssessments.length === 0) return <div title="No key points/assessments" className="w-full h-full flex items-center justify-center bg-highlight-warning/30 dark:bg-yellow-800/30"><span className="text-xs text-highlight-warning dark:text-yellow-400">!</span></div>;

        const assessments = result.pointAssessments;
        const nKeyPoints = assessments.length;

        const totalMultiplier = assessments.reduce((sum, assessment) => sum + (assessment.multiplier ?? 1), 0);

        const pointsConsideredPresentCount = assessments.filter(pa => {
            if ((pa as any).isInverted) {
                // For inverted, a high score is good (not present)
                return pa.coverageExtent !== undefined && pa.coverageExtent >= 0.7;
            }
            // For normal, a score > 0.3 is considered present
            return pa.coverageExtent !== undefined && pa.coverageExtent > 0.3;
        }).length;
        const tooltipText = `Avg. Extent: ${result.avgCoverageExtent !== undefined ? (result.avgCoverageExtent * 100).toFixed(1) + '%' : 'N/A'}\n(${pointsConsideredPresentCount}/${nKeyPoints} criteria passed)`;

        return (
            <div className="flex w-full h-6 rounded-sm overflow-hidden ring-1 ring-border/50 dark:ring-slate-600/50" title={tooltipText}>
                {assessments.map((assessment, index) => {
                    let isConsideredPresent: boolean;
                    if ((assessment as any).isInverted) {
                        // For inverted ('should not'), a high score is a pass (good)
                        isConsideredPresent = assessment.coverageExtent !== undefined && assessment.coverageExtent >= 0.7;
                    } else {
                        // For normal ('should'), a score > 0.3 is considered present (good)
                        isConsideredPresent = assessment.coverageExtent !== undefined && assessment.coverageExtent > 0.3;
                    }
                    
                    const bgColorClass = getGradedCoverageColor(isConsideredPresent, assessment.coverageExtent);
                    const pointMultiplier = assessment.multiplier ?? 1;
                    const segmentWidthPercent = totalMultiplier > 0 ? (pointMultiplier / totalMultiplier) * 100 : (1 / nKeyPoints) * 100;
                    
                    let pointTooltip = `(model: ${getModelDisplayLabel(parsedModelsMap[modelId])})\nCriterion ${index + 1}/${nKeyPoints}: "${assessment.keyPointText}"`;

                    if ((assessment as any).isInverted) {
                        pointTooltip += `\nType: Should NOT be present`;
                        pointTooltip += `\nStatus: ${isConsideredPresent ? 'Passed (Not Present)' : 'VIOLATION (Present)'}`;
                    } else {
                        pointTooltip += `\nType: Should be present`;
                        pointTooltip += `\nStatus: ${isConsideredPresent ? 'Present' : 'Not Present'}`;
                    }

                    if (assessment.coverageExtent !== undefined) pointTooltip += `\nExtent: ${(assessment.coverageExtent * 100).toFixed(1)}%`;
                    if (assessment.multiplier && assessment.multiplier !== 1) pointTooltip += `\nMultiplier: x${assessment.multiplier}`;
                    if (assessment.reflection) pointTooltip += `\nReflection: ${assessment.reflection}`;
                    if (assessment.error) pointTooltip += `\nError: ${assessment.error}`;
                    if (assessment.citation) pointTooltip += `\nCitation: ${assessment.citation}`;
                    
                    return (
                        <div
                            key={index}
                            title={pointTooltip}
                            className={`h-full ${bgColorClass} bg-opacity-60 dark:bg-opacity-70`}
                            style={{ width: `${segmentWidthPercent}%`, borderRight: index < nKeyPoints - 1 ? '1px solid #00000030' : 'none' }}
                        />
                    );
                })}
            </div>
        );
    };

    const headerCellStyle = "border border-border dark:border-slate-700 px-2 py-2.5 text-center font-semibold align-bottom";
    const modelNameHeaderStyle = cn(headerCellStyle, "text-foreground dark:text-slate-200 break-all w-36");
    const mIndexHeaderStyle = cn(headerCellStyle, "text-foreground dark:text-slate-200 break-words");
    const stickyHeaderBase = "sticky left-0 z-20 bg-muted dark:bg-slate-800";
    const firstColStickyHeader = cn(headerCellStyle, "text-primary", stickyHeaderBase, "w-16");
    const secondColStickyHeader = cn(headerCellStyle, "text-primary", stickyHeaderBase, "left-0 w-96 text-left");

    const modelAvgScoreHeaderBase = "border-x border-b border-border dark:border-slate-700 px-2 py-1.5 text-center text-[10px]";
    const firstColModelAvgSticky = cn(modelAvgScoreHeaderBase, "font-semibold text-primary/80 dark:text-primary/80 sticky left-0 z-20 bg-muted/70 dark:bg-slate-800/70 w-16");
    const secondColModelAvgSticky = cn(modelAvgScoreHeaderBase, "font-semibold text-primary/80 dark:text-primary/80 sticky left-0 z-20 bg-muted/70 dark:bg-slate-800/70 w-96");

    const handleModelClick = (modelId: string) => {
        if (onModelClick) {
            onModelClick(modelId);
        } else {
            console.warn("onModelClick is not defined");
        }
    };

    const handlePromptClick = (promptId: string) => {
        if (onPromptClick) {
            onPromptClick(promptId);
        } else {
            console.warn("onPromptClick is not defined");
        }
    };

    return (
        <div className="overflow-x-auto rounded-md ring-1 ring-border dark:ring-slate-700 shadow-md">
            <table className="border-collapse text-xs table-fixed">
                <thead>
                    <tr className="bg-muted dark:bg-slate-800">
                        <th className={cn(firstColStickyHeader, "border-t-transparent")}></th>
                        <th className={cn(secondColStickyHeader, "border-t-transparent")}></th>
                        {localSortedModels.map(modelId => {
                            const parsed = parsedModelsMap[modelId];
                            const globalIndex = baseModelGlobalIndexMap[parsed.baseId];
                            const visualGroupStyle = baseIdToVisualGroupStyleMap[parsed.baseId] || 'border-t-border dark:border-t-slate-700';
                            return (
                                <th 
                                    key={`m-index-header-${modelId}`}
                                    className={cn(mIndexHeaderStyle, visualGroupStyle)}
                                    title={`Base Model Index for: ${parsed.baseId}`}
                                >
                                    {globalIndex !== undefined ? `[M${globalIndex}]` : ''}
                                </th>
                            );
                        })}
                    </tr>
                    <tr className="bg-muted dark:bg-slate-800">
                        <th className={cn(firstColStickyHeader, "border-t-0")}>Avg %</th>
                        <th className={cn(secondColStickyHeader, "border-t-0")}>Prompt</th>
                        {localSortedModels.map(modelId => {
                            const parsed = parsedModelsMap[modelId];
                            const shortDisplayLabel = getModelDisplayLabel(parsed, { hideProvider: true });
                            const fullDisplayLabel = getModelDisplayLabel(parsed);
                            return (
                                <th 
                                  key={modelId} 
                                  className={cn(modelNameHeaderStyle, "border-t-0 hover:bg-muted/70 dark:hover:bg-slate-700/60 transition-colors cursor-pointer")}
                                  title={`Click to focus on ${fullDisplayLabel}`}
                                  onClick={() => setFocusedModelId(modelId)}
                                >
                                    {shortDisplayLabel}
                                </th>
                            );
                        })}
                    </tr>
                    <tr className="bg-muted/70 dark:bg-slate-800/70">
                        <th className={firstColModelAvgSticky}>Model Avg</th>
                        <th className={secondColModelAvgSticky}></th>
                        {localSortedModels.map(modelId => {
                            const modelAvgCoverage = calculateModelAverageCoverage(modelId);
                            return (
                                 <th key={`${modelId}-avg-score`} className={cn(modelAvgScoreHeaderBase, "font-medium text-foreground dark:text-slate-200 w-36")}>
                                      {modelAvgCoverage !== null ? (
                                          <span className={cn(
                                                "inline-block px-1 py-0.5 rounded-md text-white dark:text-slate-50 font-semibold",
                                                (modelAvgCoverage * 100) >= 75 ? 'bg-highlight-success/80' : 
                                                (modelAvgCoverage * 100) >= 50 ? 'bg-highlight-warning/80' : 
                                                (modelAvgCoverage * 100) > 0 ? 'bg-highlight-error/80' : 
                                                'bg-muted/80'
                                            )}>
                                            {(modelAvgCoverage * 100).toFixed(1)}%
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground dark:text-slate-500">-</span>
                                    )}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-slate-700">
                    {sortedPromptIds.map((promptId) => {
                        const avgScore = calculatePromptAverage(promptId);
                        return (
                            <tr
                                key={promptId}
                                className="hover:bg-muted/50 dark:hover:bg-slate-700/30 transition-colors duration-100"
                            >
                                <td className="border-x border-border dark:border-slate-700 px-1 py-2 text-center align-middle font-medium sticky left-0 z-10 bg-card/90 dark:bg-slate-800/90 hover:bg-muted/60 dark:hover:bg-slate-700/50 w-16">
                                    {avgScore !== null ? (
                                        <span className={cn(
                                            "inline-block px-1.5 py-0.5 rounded-md text-white dark:text-slate-50 text-[10px] font-semibold",
                                            avgScore >= 75 ? 'bg-highlight-success/90' :
                                            avgScore >= 50 ? 'bg-highlight-warning/90' :
                                            'bg-highlight-error/90'
                                        )}>
                                            {avgScore.toFixed(0)}%
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground dark:text-slate-500">-</span>
                                    )}
                                </td>
                                <td className="border-x border-border dark:border-slate-700 px-3 py-2 text-left align-middle sticky left-0 z-10 bg-card/90 dark:bg-slate-800/90 hover:bg-muted/60 dark:hover:bg-slate-700/50 w-96">
                                    <Link
                                        href={`/analysis/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(safeTimestampFromParams)}?prompt=${encodeURIComponent(promptId)}`}
                                        className="block text-primary hover:text-primary/80 dark:hover:text-primary/80 hover:underline cursor-pointer text-xs"
                                        title={`View details for: ${getPromptText(promptId)}`}
                                    >
                                        <span className="block truncate text-xs text-muted-foreground dark:text-slate-500">
                                            {promptId}
                                        </span>
                                        <span className="whitespace-normal line-clamp-2">
                                            {getPromptText(promptId)}
                                        </span>
                                    </Link>
                                </td>
                                {localSortedModels.map(modelId => {
                                    const result = allCoverageScores[promptId]?.[modelId];
                                    let cellScoreNum: number | null = null;
                                    if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                                        cellScoreNum = result.avgCoverageExtent;
                                    }

                                    let titleText = "";

                                    // Check for outliers
                                    if (cellScoreNum !== null) {
                                        const pStats = promptStats.get(promptId);
                                        if (pStats && pStats.avg !== null && pStats.stdDev !== null && pStats.stdDev > 1e-9) { 
                                            if (Math.abs(cellScoreNum - pStats.avg) > OUTLIER_THRESHOLD_STD_DEV * pStats.stdDev) {
                                                titleText += `Outlier: Score (${(cellScoreNum * 100).toFixed(1)}%) deviates significantly from prompt average (${(pStats.avg * 100).toFixed(1)}%).`;
                                            }
                                        }
                                    }

                                    // Check for high judge disagreement
                                    let hasHighDisagreement = false;
                                    if (result && !('error' in result) && result.pointAssessments) {
                                        for (const assessment of result.pointAssessments) {
                                            if (assessment.individualJudgements && assessment.individualJudgements.length > 1) {
                                                const scores = assessment.individualJudgements.map(j => j.coverageExtent);
                                                const n = scores.length;
                                                const mean = scores.reduce((a, b) => a + b) / n;
                                                const stdDev = Math.sqrt(scores.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
                                                
                                                if (stdDev > HIGH_DISAGREEMENT_THRESHOLD_STD_DEV) {
                                                    hasHighDisagreement = true;
                                                    const disagreementDetails = `High Judge Disagreement: Found on key point "${assessment.keyPointText}". Scores: [${scores.join(', ')}], StdDev: ${stdDev.toFixed(2)}.`;
                                                    if (titleText) titleText += '\\n---\\n';
                                                    titleText += disagreementDetails;
                                                    break; 
                                                }
                                            }
                                        }
                                    }

                                    const isOutlier = titleText.includes('Outlier:');

                                    const cellClasses = [
                                        "border-x border-border dark:border-slate-700",
                                        "p-0 align-middle",
                                        onCellClick ? "cursor-pointer" : "",
                                    ].filter(Boolean).join(" ");

                                    return (
                                        <td 
                                            key={modelId}
                                            className={cn(
                                                cellClasses,
                                                isOutlier ? "bg-red-500/10 dark:bg-red-500/20" : "",
                                                hasHighDisagreement ? "ring-2 ring-offset-1 ring-offset-background dark:ring-offset-slate-800 ring-yellow-500 dark:ring-yellow-400" : ""
                                            )}
                                            onMouseEnter={() => onModelHover && onModelHover(modelId)}
                                            onMouseLeave={() => onModelHover && onModelHover(null)}
                                            onClick={() => {
                                                if (onCellClick) {
                                                    onCellClick(promptId, modelId);
                                                }
                                            }}
                                            title={titleText || undefined}
                                        >
                                            {renderSegments(promptId, modelId)}
                                        </td>
                                    );
                                })}
                            </tr> 
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default MacroCoverageTable; 