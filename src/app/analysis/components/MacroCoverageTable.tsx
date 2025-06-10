'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getGradedCoverageColor } from '../utils/colorUtils';
import { getModelDisplayLabel, parseEffectiveModelId, ParsedModelId } from '../../utils/modelIdUtils';

// Dynamically import icons (though not used directly in segments, maybe in future tooltips?)
const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle));

// Outlier definition threshold
const OUTLIER_THRESHOLD_STD_DEV = 1.5;

// Type definitions (can be shared or imported if defined centrally)
interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    reflection?: string;
    error?: string;
    multiplier?: number;
    citation?: string;
}
type CoverageResult = {
    keyPointsCount: number;
    avgCoverageExtent?: number;
    pointAssessments?: PointAssessment[];
} | { error: string } | null;

type AllCoverageScores = Record<string, Record<string, CoverageResult>>; // promptId -> modelId -> CoverageResult

interface MacroCoverageTableProps {
    allCoverageScores: AllCoverageScores | undefined | null;
    promptIds: string[];
    promptTexts: Record<string, string> | undefined | null;
    models: string[]; // List of non-ideal model IDs
    configId: string;
    runLabel: string;
    safeTimestampFromParams: string;
    onCellClick?: (promptId: string, modelId: string) => void;
}

const MacroCoverageTable: React.FC<MacroCoverageTableProps> = ({
    allCoverageScores,
    promptIds,
    promptTexts,
    models,
    configId,
    runLabel,
    safeTimestampFromParams,
    onCellClick,
}) => {

    if (!allCoverageScores || promptIds.length === 0 || models.length === 0) {
        return <p className="p-4 text-muted-foreground italic">Macro coverage data not available.</p>;
    }

    const calculateModelAverageCoverage = React.useCallback((modelId: string): number | null => {
        if (!allCoverageScores) return null;
        let totalAvgExtent = 0;
        let validPromptsCount = 0;
        promptIds.forEach(promptId => {
            const result = allCoverageScores[promptId]?.[modelId];
            if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                totalAvgExtent += result.avgCoverageExtent;
                validPromptsCount++;
            }
        });
        return validPromptsCount > 0 ? (totalAvgExtent / validPromptsCount) : null;
    }, [allCoverageScores, promptIds]);

    const calculatePromptAverage = React.useCallback((promptId: string): number | null => {
        const promptScores = allCoverageScores?.[promptId];
        if (!promptScores) return null;
        let totalAvgExtent = 0;
        let validModelsCount = 0;
        models.forEach(modelId => {
            const result = promptScores[modelId];
            if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                totalAvgExtent += result.avgCoverageExtent;
                validModelsCount++;
            }
        });
        return validModelsCount > 0 ? (totalAvgExtent / validModelsCount) * 100 : null;
    }, [allCoverageScores, models]);

    const memoizedHeaderData = React.useMemo(() => {
        const parsedModelsMap: Record<string, ParsedModelId> = {};
        models.forEach(id => { parsedModelsMap[id] = parseEffectiveModelId(id); });

        const localSortedModels = [...models].sort((a, b) => {
            const avgA = calculateModelAverageCoverage(a);
            const avgB = calculateModelAverageCoverage(b);
            if (avgA === null && avgB === null) return 0;
            if (avgA === null) return 1;
            if (avgB === null) return -1;
            return avgB - avgA;
        });

        const baseModelGlobalIndexMap: Record<string, number> = {};
        const uniqueBaseIdsInOrder: string[] = [];
        localSortedModels.forEach(modelId => {
            const baseId = parsedModelsMap[modelId].baseId;
            if (!baseModelGlobalIndexMap.hasOwnProperty(baseId)) {
                baseModelGlobalIndexMap[baseId] = uniqueBaseIdsInOrder.length;
                uniqueBaseIdsInOrder.push(baseId);
            }
        });

        const baseModelVariantCounts: Record<string, number> = {};
        models.forEach(modelId => {
            const baseId = parsedModelsMap[modelId].baseId;
            baseModelVariantCounts[baseId] = (baseModelVariantCounts[baseId] || 0) + 1;
        });

        const baseIdToVisualGroupStyleMap: Record<string, string> = {};
        const borderColors = [
            'border-t-sky-500 dark:border-t-sky-400', 'border-t-emerald-500 dark:border-t-emerald-400',
            'border-t-violet-500 dark:border-t-violet-400', 'border-t-rose-500 dark:border-t-rose-400',
            'border-t-amber-500 dark:border-t-amber-400', 'border-t-red-500 dark:border-t-red-400',
            'border-t-orange-500 dark:border-t-orange-400', 'border-t-teal-500 dark:border-t-teal-400',
            'border-t-indigo-500 dark:border-t-indigo-400', 'border-t-pink-500 dark:border-t-pink-400',
            'border-t-lime-500 dark:border-t-lime-400', 'border-t-cyan-500 dark:border-t-cyan-400'
        ];
        const baseBorderClass = 'border-t-4'; // User changed to border-t-4
        let colorIdx = 0;
        uniqueBaseIdsInOrder.forEach(baseId => {
            if (baseModelVariantCounts[baseId] > 1) {
                baseIdToVisualGroupStyleMap[baseId] = `${baseBorderClass} ${borderColors[colorIdx % borderColors.length]}`;
                colorIdx++;
            }
        });

        return {
            localSortedModels,
            parsedModelsMap,
            baseModelGlobalIndexMap,
            baseIdToVisualGroupStyleMap
        };
    }, [models, calculateModelAverageCoverage]);

    const { 
        localSortedModels, 
        parsedModelsMap, 
        baseModelGlobalIndexMap, 
        baseIdToVisualGroupStyleMap 
    } = memoizedHeaderData;

    const { promptStats } = React.useMemo(() => {
        const newPromptStats = new Map<string, { avg: number | null, stdDev: number | null }>();
        if (!allCoverageScores) return { promptStats: newPromptStats };

        promptIds.forEach(promptId => {
            const scoresForPrompt: number[] = [];
            models.forEach(modelId => {
                const result = allCoverageScores[promptId]?.[modelId];
                if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                    scoresForPrompt.push(result.avgCoverageExtent);
                }
            });
            if (scoresForPrompt.length > 0) {
                const sum = scoresForPrompt.reduce((acc, score) => acc + score, 0);
                const avg = sum / scoresForPrompt.length;
                let stdDev: number | null = null;
                if (scoresForPrompt.length >= 2) {
                    const sqDiffs = scoresForPrompt.map(score => Math.pow(score - avg, 2));
                    const variance = sqDiffs.reduce((acc, sqDiff) => acc + sqDiff, 0) / scoresForPrompt.length;
                    stdDev = Math.sqrt(variance);
                } else {
                    stdDev = 0;
                }
                newPromptStats.set(promptId, { avg, stdDev });
            } else {
                newPromptStats.set(promptId, { avg: null, stdDev: null });
            }
        });
        return { promptStats: newPromptStats };
    }, [allCoverageScores, promptIds, models]);

    const getPromptText = (promptId: string): string => {
        return promptTexts?.[promptId] || promptId;
    };

    const sortedPromptIds = [...promptIds].sort((a, b) => {
        const avgScoreA = calculatePromptAverage(a);
        const avgScoreB = calculatePromptAverage(b);
        if (avgScoreA === null && avgScoreB === null) return 0;
        if (avgScoreA === null) return 1;
        if (avgScoreB === null) return -1;
        return avgScoreB - avgScoreA;
    });

    const renderSegments = (promptId: string, modelId: string) => {
        const result = allCoverageScores[promptId]?.[modelId];
        if (!result) return <div title="Result missing" className="w-full h-full flex items-center justify-center bg-muted/50 dark:bg-slate-700/50"><span className="text-xs text-muted-foreground dark:text-slate-500">?</span></div>;
        if ('error' in result) return <div title={result.error} className="w-full h-full flex items-center justify-center bg-destructive/30 dark:bg-red-900/40"><AlertCircle className="w-4 h-4 text-destructive dark:text-red-300" /></div>;
        if (!result.pointAssessments || result.pointAssessments.length === 0) return <div title="No key points/assessments" className="w-full h-full flex items-center justify-center bg-highlight-warning/30 dark:bg-yellow-800/30"><span className="text-xs text-highlight-warning dark:text-yellow-400">!</span></div>;

        const assessments = result.pointAssessments;
        const nKeyPoints = assessments.length;

        // Calculate total multiplier for this prompt's assessments
        const totalMultiplier = assessments.reduce((sum, assessment) => sum + (assessment.multiplier ?? 1), 0);

        const pointsConsideredPresentCount = assessments.filter(pa => pa.coverageExtent !== undefined && pa.coverageExtent > 0.3).length;
        const tooltipText = `Avg. Extent: ${result.avgCoverageExtent !== undefined ? (result.avgCoverageExtent * 100).toFixed(1) + '%' : 'N/A'}\n(${pointsConsideredPresentCount}/${nKeyPoints} points considered present with extent > 0.3)`;

        return (
            <div className="flex w-full h-6 rounded-sm overflow-hidden ring-1 ring-border/50 dark:ring-slate-600/50" title={tooltipText}>
                {assessments.map((assessment, index) => {
                    const isConsideredPresent = assessment.coverageExtent !== undefined && assessment.coverageExtent > 0.3;
                    const bgColorClass = getGradedCoverageColor(isConsideredPresent, assessment.coverageExtent);
                    const pointMultiplier = assessment.multiplier ?? 1;
                    const segmentWidthPercent = totalMultiplier > 0 ? (pointMultiplier / totalMultiplier) * 100 : (1 / nKeyPoints) * 100;
                    
                    let pointTooltip = `(model: ${getModelDisplayLabel(parsedModelsMap[modelId])})\nKey Point ${index + 1}/${nKeyPoints}: "${assessment.keyPointText}"\nConsidered Present: ${isConsideredPresent ? 'Yes' : 'No'}`;
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
                            style={{ width: `${segmentWidthPercent}%`, borderRight: index < nKeyPoints - 1 ? '1px solid var(--border-contrast)' : 'none' }}
                        />
                    );
                })}
            </div>
        );
    };

    const headerCellStyle = "border border-border dark:border-slate-700 px-2 py-2.5 text-center font-semibold align-bottom";
    const modelNameHeaderStyle = `${headerCellStyle} text-foreground dark:text-slate-200 break-all w-36`;
    const mIndexHeaderStyle = `${headerCellStyle} text-foreground dark:text-slate-200 break-words`;
    const stickyHeaderBase = "sticky left-0 z-20 bg-muted dark:bg-slate-800";
    const firstColStickyHeader = `${headerCellStyle} text-primary dark:text-sky-300 ${stickyHeaderBase} w-16`;
    const secondColStickyHeader = `${headerCellStyle} text-primary dark:text-sky-300 ${stickyHeaderBase} left-0 w-96 text-left`; // Adjusted left for 4rem width of first col (w-16)

    const modelAvgScoreHeaderBase = "border-x border-b border-border dark:border-slate-700 px-2 py-1.5 text-center text-[10px]";
    const firstColModelAvgSticky = `${modelAvgScoreHeaderBase} font-semibold text-primary/80 dark:text-sky-300/80 sticky left-0 z-20 bg-muted/70 dark:bg-slate-800/70 w-16`;
    const secondColModelAvgSticky = `${modelAvgScoreHeaderBase} font-semibold text-primary/80 dark:text-sky-300/80 sticky left-0 z-20 bg-muted/70 dark:bg-slate-800/70 w-96`;

    return (
        <div className="overflow-x-auto rounded-md ring-1 ring-border dark:ring-slate-700 shadow-md">
            <table className="border-collapse text-xs table-fixed">
                <thead>
                    {/* Row 1: M-Indices */}
                    <tr className="bg-muted dark:bg-slate-800">
                        <th className={`${firstColStickyHeader} border-t-transparent`}></th>
                        <th className={`${secondColStickyHeader} border-t-transparent`}></th>
                        {localSortedModels.map(modelId => {
                            const parsed = parsedModelsMap[modelId];
                            const globalIndex = baseModelGlobalIndexMap[parsed.baseId];
                            const visualGroupStyle = baseIdToVisualGroupStyleMap[parsed.baseId] || 'border-t-border dark:border-t-slate-700';
                            return (
                                <th 
                                    key={`m-index-header-${modelId}`}
                                    className={`${mIndexHeaderStyle} ${visualGroupStyle}`}
                                    title={`Base Model Index for: ${parsed.baseId}`}
                                >
                                    {globalIndex !== undefined ? `[M${globalIndex}]` : ''}
                                </th>
                            );
                        })}
                    </tr>
                    {/* Row 2: Model Names */}
                    <tr className="bg-muted dark:bg-slate-800">
                        <th className={`${firstColStickyHeader} border-t-0`}>Avg %</th>
                        <th className={`${secondColStickyHeader} border-t-0`}>Prompt</th>
                        {localSortedModels.map(modelId => {
                            const parsed = parsedModelsMap[modelId];
                            const shortDisplayLabel = getModelDisplayLabel(parsed, { hideProvider: true });
                            const fullDisplayLabel = getModelDisplayLabel(parsed);
                            return (
                                <th 
                                  key={modelId} 
                                  className={`${modelNameHeaderStyle} border-t-0`}
                                  title={fullDisplayLabel}
                                >
                                    {shortDisplayLabel}
                                </th>
                            );
                        })}
                    </tr>
                    {/* Row 3: Model Avg Scores */}
                    <tr className="bg-muted/70 dark:bg-slate-800/70">
                        <th className={firstColModelAvgSticky}>Model Avg</th>
                        <th className={secondColModelAvgSticky}></th>
                        {localSortedModels.map(modelId => {
                            const modelAvgCoverage = calculateModelAverageCoverage(modelId);
                            return (
                                 <th key={`${modelId}-avg-score`} className={`${modelAvgScoreHeaderBase} font-medium text-foreground dark:text-slate-200 w-36`}>
                                      {modelAvgCoverage !== null ? (
                                          <span className={`inline-block px-1 py-0.5 rounded-md text-white dark:text-slate-50 font-semibold 
                                            ${(modelAvgCoverage * 100) >= 75 ? 'bg-highlight-success/80 dark:bg-green-600/70' : 
                                             (modelAvgCoverage * 100) >= 50 ? 'bg-highlight-warning/80 dark:bg-amber-600/70' : 
                                             (modelAvgCoverage * 100) > 0 ? 'bg-highlight-error/80 dark:bg-red-600/70' : 
                                             'bg-muted/80 dark:bg-slate-600/50'}`}>
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
                                        <span className={`inline-block px-1.5 py-0.5 rounded-md text-white dark:text-slate-50 text-[10px] font-semibold 
                                            ${avgScore >= 75 ? 'bg-highlight-success/90 dark:bg-green-600/80' : 
                                             avgScore >= 50 ? 'bg-highlight-warning/90 dark:bg-amber-600/80' : 
                                             'bg-highlight-error/90 dark:bg-red-600/80'}`}>
                                            {avgScore.toFixed(0)}%
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground dark:text-slate-500">-</span>
                                    )}
                                </td>
                                <td className="border-x border-border dark:border-slate-700 px-3 py-2 text-left align-middle sticky left-0 z-10 bg-card/90 dark:bg-slate-800/90 hover:bg-muted/60 dark:hover:bg-slate-700/50 w-96">
                                    <Link
                                        href={`/analysis/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(safeTimestampFromParams)}?prompt=${encodeURIComponent(promptId)}`}
                                        className="block text-primary dark:text-sky-400 hover:text-primary/80 dark:hover:text-sky-300 hover:underline cursor-pointer text-xs"
                                        title={`View details for: ${getPromptText(promptId)}`}
                                    >
                                        <span className="block truncate text-xs text-muted-foreground dark:text-slate-500">
                                            {promptId}
                                        </span>
                                        <span className="whitespace-normal line-clamp-1">
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
                                    let isOutlier = false;
                                    let outlierReason = "";
                                    if (cellScoreNum !== null) {
                                        const pStats = promptStats.get(promptId);
                                        let isRowOutlier = false;
                                        if (pStats && pStats.avg !== null && pStats.stdDev !== null && pStats.stdDev > 1e-9) { 
                                            if (Math.abs(cellScoreNum - pStats.avg) > OUTLIER_THRESHOLD_STD_DEV * pStats.stdDev) {
                                                isRowOutlier = true;
                                            }
                                        }
                                        if (isRowOutlier) {
                                            isOutlier = true;
                                            outlierReason = pStats && pStats.avg !== null ? `Outlier: Score (${(cellScoreNum * 100).toFixed(1)}%) deviates significantly from prompt average (${(pStats.avg * 100).toFixed(1)}%).` : `Outlier: Score (${(cellScoreNum * 100).toFixed(1)}%) deviates significantly from prompt average.`;
                                        }
                                    }
                                    const cellClasses = [
                                        "border-x border-border dark:border-slate-700",
                                        "p-0 align-middle", // Changed padding to 0
                                        onCellClick ? "cursor-pointer" : "",
                                    ].filter(Boolean).join(" ");
                                    return (
                                        <td
                                            key={`${promptId}-${modelId}`}
                                            className={cellClasses}
                                            style={isOutlier ? { position: 'relative' } : undefined}
                                            title={isOutlier ? outlierReason : undefined}
                                            onClick={() => {
                                                if (onCellClick) {
                                                    onCellClick(promptId, modelId);
                                                }
                                            }}
                                        >
                                            {isOutlier && (
                                                <div
                                                    title="Outlier marker"
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        width: 0,
                                                        height: 0,
                                                        borderStyle: 'solid',
                                                        borderWidth: '5px 5px 0 0',
                                                        borderColor: 'rgba(239, 68, 68, 0.85) transparent transparent transparent',
                                                        zIndex: 10,
                                                    }}
                                                />
                                            )}
                                            <div className={`relative flex items-center px-2 py-1 h-full ${onCellClick ? "hover:bg-muted/70 dark:hover:bg-slate-700/60 transition-all duration-150" : ""}`}>
                                                <div className="flex-grow">
                                                    {renderSegments(promptId, modelId)}
                                                </div>
                                                {cellScoreNum !== null && (
                                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                        <span className="opacity-80 font-mono text-xs font-semibold text-white/90  rounded-sm px-1 py-0.5">
                                                            {(cellScoreNum * 100).toFixed(0)}<span className="text-[9px] ">%</span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
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