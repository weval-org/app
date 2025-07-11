'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getGradedCoverageColor } from '@/app/analysis/utils/colorUtils';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { AllCoverageScores, AllFinalAssistantResponses } from '@/app/analysis/types';
import { useMacroCoverageData, SortOption } from '@/app/analysis/hooks/useMacroCoverageData';
import { cn } from '@/lib/utils';
import CoverageTableLegend, { ActiveHighlight } from './CoverageTableLegend';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ModelPerformanceModal from './ModelPerformanceModal';
import { ComparisonDataV2 as ImportedComparisonDataV2 } from '@/app/utils/types';

const UsersIcon = dynamic(() => import("lucide-react").then((mod) => mod.Users), { ssr: false });
const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle), { ssr: false });
const AlertTriangleIcon = dynamic(() => import("lucide-react").then((mod) => mod.AlertTriangle), { ssr: false });
const ThermometerIcon = dynamic(() => import("lucide-react").then((mod) => mod.Thermometer), { ssr: false });
const MessageSquareIcon = dynamic(() => import("lucide-react").then((mod) => mod.MessageSquare), { ssr: false });
const UnlinkIcon = dynamic(() => import("lucide-react").then((mod) => mod.Unlink), { ssr: false });
const MedalIcon = dynamic(() => import("lucide-react").then((mod) => mod.Medal), { ssr: false });
const InfoIcon = dynamic(() => import("lucide-react").then((mod) => mod.Info), { ssr: false });
const SearchIcon = dynamic(() => import("lucide-react").then((mod) => mod.Search), { ssr: false });

interface MacroCoverageTableProps {
    allCoverageScores: AllCoverageScores | undefined | null;
    promptIds: string[];
    promptTexts: Record<string, string> | undefined | null;
    promptContexts?: ImportedComparisonDataV2['promptContexts'];
    models: string[]; // List of non-ideal model IDs
    allFinalAssistantResponses?: AllFinalAssistantResponses | null; // Now required for focus mode
    config: ImportedComparisonDataV2['config'];
    configId: string;
    runLabel: string;
    safeTimestampFromParams: string;
    onCellClick?: (promptId: string, modelId: string) => void;
    onModelClick?: (modelId: string) => void;
    onPromptClick?: (promptId: string) => void;
    onModelHover?: (modelId: string | null) => void;
    onActiveHighlightsChange?: (activeHighlights: Set<ActiveHighlight>) => void;
    systemPromptIndex?: number;
    permutationSensitivityMap?: Map<string, 'temp' | 'sys' | 'both'>;
    isSandbox?: boolean;
    sandboxId?: string;
}

const MacroCoverageTable: React.FC<MacroCoverageTableProps> = ({
    allCoverageScores,
    promptIds,
    promptTexts,
    promptContexts,
    models,
    allFinalAssistantResponses,
    config,
    configId,
    runLabel,
    safeTimestampFromParams,
    onCellClick,
    onModelClick,
    onPromptClick,
    onModelHover,
    onActiveHighlightsChange,
    systemPromptIndex,
    permutationSensitivityMap,
    isSandbox,
    sandboxId,
}) => {
    const [selectedModelForModal, setSelectedModelForModal] = useState<string | null>(null);
    const [markdownModule, setMarkdownModule] = useState<{ ReactMarkdown: any, RemarkGfm: any } | null>(null);
    const [sortOption, setSortOption] = useState<SortOption>('alpha-asc');
    const [highlightBestInClass, setHighlightBestInClass] = useState<boolean>(false);
    const [simplifiedView, setSimplifiedView] = useState<boolean>(false);
    const [activeHighlights, setActiveHighlights] = useState<Set<ActiveHighlight>>(new Set());
    const [errorModalOpen, setErrorModalOpen] = useState<boolean>(false);
    const [errorModalContent, setErrorModalContent] = useState<string>('');

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
        HIGH_DISAGREEMENT_THRESHOLD_STD_DEV,
        modelIdToRank,
        promptModelRanks,
    } = useMacroCoverageData(allCoverageScores, promptIds, models, sortOption);

    useEffect(() => {
        Promise.all([
            import('react-markdown'),
            import('remark-gfm')
        ]).then(([md, gfm]) => {
            setMarkdownModule({ ReactMarkdown: md.default, RemarkGfm: gfm.default });
        });
    }, []);

    useEffect(() => {
        const highlights = new Set<ActiveHighlight>();
        if (!allCoverageScores) {
            if (onActiveHighlightsChange) onActiveHighlightsChange(highlights);
            return;
        }

        // Part 1: Populate highlights based on currently visible cells
        sortedPromptIds.forEach(promptId => {
            const pStats = promptStats.get(promptId);
            
            localSortedModels.forEach(modelId => {
                const result = allCoverageScores[promptId]?.[modelId];
                if (!result || 'error' in result) return;
                
                // Check for outliers
                const cellScoreNum = result.avgCoverageExtent;
                if (typeof cellScoreNum === 'number') {
                    if (pStats && pStats.avg !== null && pStats.stdDev !== null && pStats.stdDev > 1e-9) { 
                        if (Math.abs(cellScoreNum - pStats.avg) > OUTLIER_THRESHOLD_STD_DEV * pStats.stdDev) {
                            highlights.add('outlier');
                        }
                    }
                }

                // Check for disagreement and critical failures
                if (result.pointAssessments) {
                    for (const assessment of result.pointAssessments) {
                        if (assessment.individualJudgements && assessment.individualJudgements.length > 1) {
                            const scores = assessment.individualJudgements.map(j => j.coverageExtent);
                            const n = scores.length;
                            const mean = scores.reduce((a, b) => a + b, 0) / n;
                            const stdDev = Math.sqrt(scores.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
                            if (stdDev > HIGH_DISAGREEMENT_THRESHOLD_STD_DEV) {
                                highlights.add('disagreement');
                            }
                        }
                        if ((assessment as any).isInverted) {
                            const isPassing = assessment.coverageExtent !== undefined && assessment.coverageExtent >= 0.7;
                            if (!isPassing) {
                                highlights.add('critical_failure');
                            }
                        }
                    }
                }
            });
        });

        // Part 2: Populate permutation sensitivity highlights from the entire dataset, independent of the current view
        if (permutationSensitivityMap) {
            for (const sensitivity of permutationSensitivityMap.values()) {
                if (sensitivity === 'temp' || sensitivity === 'both') {
                    highlights.add('temp_sensitivity');
                }
                if (sensitivity === 'sys' || sensitivity === 'both') {
                    highlights.add('sys_sensitivity');
                }
            }
        }

        // Set local state for internal legend
        setActiveHighlights(highlights);

        // Also notify parent component
        if (onActiveHighlightsChange) {
            onActiveHighlightsChange(highlights);
        }
    }, [allCoverageScores, sortedPromptIds, localSortedModels, promptStats, onActiveHighlightsChange, OUTLIER_THRESHOLD_STD_DEV, HIGH_DISAGREEMENT_THRESHOLD_STD_DEV, permutationSensitivityMap]);

    if (!allCoverageScores) {
        return <p className="p-4 text-muted-foreground italic">Macro coverage data not available at all.</p>;
    }
    if (sortedPromptIds.length === 0) {
        return <p className="p-4 text-muted-foreground italic">No prompts available.</p>;
    }
    if (localSortedModels.length === 0) {
        return <p className="p-4 text-muted-foreground italic">No models available.</p>;
    }
    
    const promptColWidth = simplifiedView ? '450px' : '200px';
    
    // Calculate minimum width: fixed columns + (model columns × 45px minimum)
    const fixedColsWidth = 50 + parseInt(promptColWidth); // score col (50px) + prompt col
    const modelColsMinWidth = localSortedModels.length * 45; // 45px minimum per model column
    const diagonalHeaderSpace = 70; // space for diagonal header
    const calculatedMinWidth = fixedColsWidth + modelColsMinWidth + diagonalHeaderSpace;

    const promptDisplayClasses = cn(
        "block text-primary hover:text-primary/80 dark:hover:text-primary/80 hover:underline cursor-pointer text-left w-full",
        simplifiedView ? "text-sm" : "text-xs"
    );

    const promptTextContainerClasses = cn(
        "whitespace-normal",
        !simplifiedView && "line-clamp-3"
    );

    const promptTextContainerStyle: React.CSSProperties = simplifiedView
        ? { maxHeight: '16rem', overflowY: 'auto' }
        : { minHeight: "3.5em" };

    const getPromptText = (promptId: string): string => {
        return promptTexts?.[promptId] || promptId;
    };

    const renderSegments = (promptId: string, modelId: string) => {
        const result = allCoverageScores[promptId]?.[modelId];
        if (!result) return (
            <div title="Result missing" className="w-full h-full flex items-center justify-center">
                <span className="px-2 py-1 rounded-md text-white font-semibold text-sm bg-coverage-unmet w-full text-center">?</span>
            </div>
        );
        if ('error' in result) return (
            <div 
                title="Click to view error details" 
                className="w-full h-full flex items-center justify-center cursor-pointer"
                onClick={(e) => {
                    e.stopPropagation(); // Prevent onCellClick from being called
                    setErrorModalContent(result.error || 'Unknown error occurred');
                    setErrorModalOpen(true);
                }}
            >
                <span className="px-2 py-1 rounded-md bg-coverage-grade-0 text-white font-semibold text-sm w-full text-center flex items-center justify-center min-h-[1.5rem]">
                    <AlertCircle className="w-5 h-5" />
                </span>
            </div>
        );
        if (!result.pointAssessments || result.pointAssessments.length === 0) return (
            <div title="No key points/assessments" className="w-full h-full flex items-center justify-center">
                <span className="px-2 py-1 rounded-md text-white font-semibold text-sm bg-coverage-grade-0 w-full text-center">!</span>
            </div>
        );

        const assessments = result.pointAssessments;
        const nKeyPoints = assessments.length;

        const pointsConsideredPresentCount = assessments.filter(pa => {
            if ((pa as any).isInverted) {
                // For inverted, a high score is good (not present)
                return pa.coverageExtent !== undefined && pa.coverageExtent >= 0.7;
            }
            // For normal, a score > 0.3 is considered present
            return pa.coverageExtent !== undefined && pa.coverageExtent > 0.3;
        }).length;
        const tooltipText = `Avg. Extent: ${result.avgCoverageExtent !== undefined ? (result.avgCoverageExtent * 100).toFixed(1) + '%' : 'N/A'}\n(${pointsConsideredPresentCount}/${nKeyPoints} criteria passed)`;

        // Simplified view: show single solid bar based on average coverage
        if (simplifiedView) {
            const avgExtent = result.avgCoverageExtent;
            const bgColorClass = avgExtent !== undefined ? getGradedCoverageColor(true, avgExtent) : 'bg-muted/80';
            
            return (
                <div className="w-full h-full flex items-center justify-center" title={tooltipText}>
                    <span className={`px-2 py-1 rounded-md text-white font-semibold text-sm ${bgColorClass} w-full text-center`}>
                        {avgExtent !== undefined ? `${(avgExtent * 100).toFixed(0)}%` : 'N/A'}
                    </span>
                </div>
            );
        }

        // Detailed view: show individual key point segments
        const totalMultiplier = assessments.reduce((sum, assessment) => sum + (assessment.multiplier ?? 1), 0);

        return (
            <div className="flex w-full h-6 rounded-sm overflow-hidden ring-1 ring-border/50 dark:ring-slate-600/50 max-w-full" title={tooltipText}>
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

    // Calculate equal width percentage for model columns (excluding fixed-width first two columns)
    const modelColumnsCount = localSortedModels.length;
    const equalWidthPercent = modelColumnsCount > 0 ? (100 / modelColumnsCount).toFixed(2) : "100";
    const headerCellStyle = "border border-border dark:border-slate-700 px-2 py-2.5 text-center font-semibold align-bottom overflow-hidden";
    const modelNameHeaderStyle = cn(headerCellStyle, "text-foreground dark:text-slate-200");
    const mIndexHeaderStyle = cn(headerCellStyle, "text-foreground dark:text-slate-200");
    const firstColHeader = cn(headerCellStyle, "text-primary bg-muted");
    const secondColHeader = cn(headerCellStyle, "text-primary bg-muted text-left");

    const modelAvgScoreHeaderBase = "border-x border-b border-border dark:border-slate-700 px-2 py-1.5 text-center text-[10px] overflow-hidden";
    const firstColModelAvg = cn(modelAvgScoreHeaderBase, "font-semibold text-primary/80 dark:text-primary/80 bg-muted/70");
    const secondColModelAvg = cn(modelAvgScoreHeaderBase, "font-semibold text-primary/80 dark:text-primary/80 bg-muted/70");

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
        <div>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                {onCellClick && (
                    <Alert className="bg-sky-50 border border-sky-200 text-sky-900 dark:bg-sky-900/20 dark:border-sky-500/30 dark:text-sky-200 w-auto">
                        <InfoIcon className="h-4 w-4" />
                        <AlertTitle className="font-semibold">Pro Tip</AlertTitle>
                        <AlertDescription>
                            Click on any result cell to open a detailed view.
                        </AlertDescription>
                    </Alert>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:ml-auto">
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="simplified-view"
                            checked={simplifiedView}
                            onCheckedChange={(checked: CheckedState) => setSimplifiedView(checked === true)}
                        />
                        <Label 
                            htmlFor="simplified-view" 
                            className="text-sm font-medium cursor-pointer"
                        >
                            Simplified view
                        </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="highlight-best"
                            checked={highlightBestInClass}
                            onCheckedChange={(checked: CheckedState) => setHighlightBestInClass(checked === true)}
                        />
                        <Label 
                            htmlFor="highlight-best" 
                            className="text-sm font-medium cursor-pointer"
                        >
                            Highlight best performers
                        </Label>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <Label htmlFor="sort-prompts" className="text-sm font-medium">Sort prompts by</Label>
                        <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
                            <SelectTrigger id="sort-prompts" className="w-full sm:w-[240px]">
                                <SelectValue placeholder="Select sort order..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="alpha-asc">Prompt Text (A-Z)</SelectItem>
                                <SelectItem value="alpha-desc">Prompt Text (Z-A)</SelectItem>
                                <SelectItem value="coverage-desc">Highest Avg. Coverage</SelectItem>
                                <SelectItem value="coverage-asc">Lowest Avg. Coverage</SelectItem>
                                <SelectItem value="disagreement-desc">Highest Performance Variance</SelectItem>
                                <SelectItem value="disagreement-asc">Lowest Performance Variance</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <CoverageTableLegend
                simplifiedView={simplifiedView}
                activeHighlights={activeHighlights}
                className="mb-4 p-3 bg-muted/30 dark:bg-slate-800/30 rounded-lg border border-border/50"
            />

            <div className="overflow-x-auto rounded-md dark:ring-slate-700 shadow-md">
                {/* full width but leave space on right for diagonal col header to breathe */}
                <table className="border-collapse text-xs table-fixed" style={{width: `calc(100% - 70px)`, minWidth: `${calculatedMinWidth}px`}}>
                    <thead>
                        <tr className="bg-muted">
                            <th className="border-b border-border dark:border-slate-700" style={{width: "50px"}}></th>
                            <th className="border-b border-border dark:border-slate-700 text-lg" style={{width: promptColWidth}}>Prompts <br/> vs. <br/> Models</th>
                            {localSortedModels.map(modelId => {
                                const parsed = parsedModelsMap[modelId];
                                const shortDisplayLabel = getModelDisplayLabel(parsed, {
                                    hideProvider: true,
                                    hideModelMaker: true,
                                    prettifyModelName: true,
                                    hideSystemPrompt: true,
                                    hideTemperature: true,
                                });
                                const fullDisplayLabel = getModelDisplayLabel(parsed);

                                const rank = modelIdToRank?.[modelId];
                                const getOrdinalSuffix = (n: number) => {
                                    if (n % 100 >= 11 && n % 100 <= 13) return 'th';
                                    switch (n % 10) {
                                        case 1: return 'st';
                                        case 2: return 'nd';
                                        case 3: return 'rd';
                                        default: return 'th';
                                    }
                                };
                                const rankStr = rank ? `${rank}${getOrdinalSuffix(rank)} ` : '';

                                return (
                                    <th
                                        key={modelId}
                                        className="align-bottom cursor-pointer transition-colors duration-200"
                                        style={{
                                            width: `${equalWidthPercent}%`,
                                            height: '160px',
                                            position: 'relative',
                                            padding: 0,
                                            overflow: 'visible',
                                        }}
                                        title={`Click for detailed analysis of ${fullDisplayLabel}`}
                                    >
                                        <div style={{
                                            position: 'relative',
                                            width: '100%',
                                            borderBottom: '1px solid hsl(var(--border))',
                                            height: '100%',
                                            top: 0,
                                            left: 0,
                                        }}>
                                            <div
                                                className=""
                                                style={{
                                                    transform: 'rotate(-45deg)',
                                                    transformOrigin: 'left bottom 0px',
                                                    whiteSpace: 'nowrap',
                                                    position: 'absolute',
                                                    bottom: '0%',
                                                    left: '100%',
                                                    minWidth: '100px',
                                                    maxWidth: '150px',
                                                    paddingLeft: '0px',
                                                    width: 'auto',
                                                    fontWeight: 'normal',
                                                    borderBottom: '1px solid hsl(var(--border))',
                                                    lineHeight: '32px'
                                                }}
                                            >
                                                <span
                                                    className="block text-left font-semibold text-foreground dark:text-slate-200 group-hover:text-primary/80 dark:group-hover:text-primary/80 transition-colors cursor-pointer"
                                                >
                                                    {shortDisplayLabel}
                                                </span>
                                            </div>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                        <tr className="bg-muted">
                            <th className={cn(firstColHeader, "border-t-0")} style={{width: "50px"}}>Score</th>
                            <th className={cn(secondColHeader, "border-t-0")} style={{width: promptColWidth}}></th>
                            {localSortedModels.map(modelId => {
                                const parsed = parsedModelsMap[modelId];
                                const rank = modelIdToRank?.[modelId];
                                const modelAvgCoverage = calculateModelAverageCoverage(modelId);
                                const visualGroupStyle = baseIdToVisualGroupStyleMap[parsed.baseId] || 'border-t-border dark:border-t-slate-700';
                                
                                const getOrdinalSuffix = (n: number) => {
                                    if (n % 100 >= 11 && n % 100 <= 13) return 'th';
                                    switch (n % 10) {
                                        case 1: return 'st';
                                        case 2: return 'nd';
                                        case 3: return 'rd';
                                        default: return 'th';
                                    }
                                };

                                const renderCombinedContent = () => {
                                    let scoreColorClasses = 'text-muted-foreground';
                                    let scoreText = '-';
                                    
                                    if (modelAvgCoverage !== null) {
                                        const score = modelAvgCoverage * 100;
                                        scoreText = `${score.toFixed(1)}%`;
                                        if (score >= 75) {
                                            scoreColorClasses = 'text-green-600 dark:text-green-400';
                                        } else if (score >= 50) {
                                            scoreColorClasses = 'text-yellow-600 dark:text-yellow-400';
                                        } else if (score > 0) {
                                            scoreColorClasses = 'text-red-600 dark:text-red-400';
                                        }
                                    }

                                    const renderSearchButton = () => (
                                        <button 
                                            className="mt-1 px-1.5 py-0.5 bg-primary/10 hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/30 rounded text-primary hover:text-primary/80 transition-colors border border-primary/20 hover:border-primary/40"
                                            onClick={() => setSelectedModelForModal(modelId)}
                                            title={`View detailed analysis for ${getModelDisplayLabel(parsedModelsMap[modelId])}`}
                                        >
                                            {SearchIcon && <SearchIcon className="w-3 h-3" />}
                                        </button>
                                    );

                                    if (!rank) {
                                        return (
                                            <div className="text-center">
                                                <div className="text-xs text-muted-foreground">-</div>
                                                <div className={cn("text-xs font-mono font-semibold", scoreColorClasses)}>
                                                    {scoreText}
                                                </div>
                                                {renderSearchButton()}
                                            </div>
                                        );
                                    }

                                    const rankStr = `${rank}${getOrdinalSuffix(rank)}`;
                                    
                                    if (rank <= 3) {
                                        const colorClass = rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-400' : 'text-amber-600';
                                        return (
                                            <div className="text-center">
                                                <div className="flex items-center justify-center gap-1 mb-0.5">
                                                    {MedalIcon && <MedalIcon className={`w-3 h-3 ${colorClass}`} />}
                                                    <span className="text-xs font-semibold">{rankStr}</span>
                                                </div>
                                                <div className={cn("text-xs font-mono font-semibold", scoreColorClasses)}>
                                                    {scoreText}
                                                </div>
                                                {renderSearchButton()}
                                            </div>
                                        );
                                    }
                                    
                                    return (
                                        <div className="text-center">
                                            <div className="text-xs font-semibold">{rankStr}</div>
                                            <div className={cn("text-xs font-mono font-semibold", scoreColorClasses)}>
                                                {scoreText}
                                            </div>
                                            {renderSearchButton()}
                                        </div>
                                    );
                                };
                                
                                return (
                                    <th 
                                        key={`m-rank-score-header-${modelId}`}
                                        className={cn(mIndexHeaderStyle, visualGroupStyle, 'border-t-0')}
                                        style={{width: `${equalWidthPercent}%`}}
                                        title={`Ranked ${rank ? `${rank}${getOrdinalSuffix(rank)}` : 'unranked'} overall${modelAvgCoverage ? ` with ${(modelAvgCoverage * 100).toFixed(1)}% average coverage` : ''}`}
                                    >
                                        {renderCombinedContent()}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border dark:divide-slate-700">
                        {sortedPromptIds.map((promptId) => {
                            const avgScore = calculatePromptAverage(promptId);
                            let colorClasses = 'bg-muted/80 text-muted-foreground';
                            if (avgScore !== null) {
                                if (avgScore >= 75) {
                                    colorClasses = 'bg-highlight-success/90 text-highlight-success-foreground';
                                } else if (avgScore >= 50) {
                                    colorClasses = 'bg-highlight-warning/90 text-highlight-warning-foreground';
                                } else {
                                    colorClasses = 'bg-highlight-error/90 text-highlight-error-foreground';
                                }
                            }
                            return (
                                <tr
                                    key={promptId}
                                    className="hover:bg-muted/50 dark:hover:bg-slate-700/30 transition-colors duration-100"
                                >
                                    <td className="border-x border-border dark:border-slate-700 px-1 py-2 text-center align-middle font-medium bg-card/90 hover:bg-muted/60 dark:hover:bg-slate-700/50 overflow-hidden" style={{width: "50px"}}>
                                        {avgScore !== null ? (
                                            <span className={cn(
                                                "inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold font-mono",
                                                colorClasses
                                            )}>
                                                {avgScore.toFixed(1)}%
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground dark:text-slate-500">-</span>
                                        )}
                                    </td>
                                    <td className="border-x border-border dark:border-slate-700 px-3 py-2 text-left align-middle bg-card/90  hover:bg-muted/60 dark:hover:bg-slate-700/50 overflow-hidden" style={{width: promptColWidth}}>
                                        {onPromptClick ? (
                                            <button
                                                onClick={() => onPromptClick(promptId)}
                                                className={promptDisplayClasses}
                                                title={`View details for prompt ID ${promptId}: ${getPromptText(promptId)}`}
                                            >
                                                <span className={promptTextContainerClasses} style={promptTextContainerStyle}>
                                                    <small style={{fontSize: "0.8em", fontFamily: "monospace", color: "hsl(var(--muted-foreground))"}}>{promptId}</small><br/>
                                                    {getPromptText(promptId)}
                                                </span>
                                            </button>
                                        ) : (
                                            <Link
                                                href={isSandbox ? `/sandbox/results/${sandboxId}?prompt=${encodeURIComponent(promptId)}` : `/analysis/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(safeTimestampFromParams)}?prompt=${encodeURIComponent(promptId)}`}
                                                className={promptDisplayClasses}
                                                title={`View details for prompt ID ${promptId}: ${getPromptText(promptId)}`}
                                            >
                                                <span className={promptTextContainerClasses} style={promptTextContainerStyle}>
                                                    <small style={{fontSize: "0.8em", fontFamily: "monospace", color: "hsl(var(--muted-foreground))"}}>{promptId}</small><br/>
                                                    {getPromptText(promptId)}
                                                </span>
                                            </Link>
                                        )}
                                    </td>
                                    {localSortedModels.map(modelId => {
                                        const parsedModel = parsedModelsMap[modelId];
                                        const result = allCoverageScores[promptId]?.[modelId];
                                        let cellScoreNum: number | null = null;
                                        if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                                            cellScoreNum = result.avgCoverageExtent;
                                        }

                                        let titleText = "";
                                        let isOutlier = false;

                                        // Check for outliers
                                        if (cellScoreNum !== null) {
                                            const pStats = promptStats.get(promptId);
                                            if (pStats && pStats.avg !== null && pStats.stdDev !== null && pStats.stdDev > 1e-9) { 
                                                if (Math.abs(cellScoreNum - pStats.avg) > OUTLIER_THRESHOLD_STD_DEV * pStats.stdDev) {
                                                    isOutlier = true;
                                                    titleText += `Outlier: Score (${(cellScoreNum * 100).toFixed(1)}%) deviates significantly from prompt average (${(pStats.avg * 100).toFixed(1)}%).`;
                                                }
                                            }
                                        }

                                        // Check for high judge disagreement and critical failures
                                        let hasHighDisagreement = false;
                                        let hasCriticalFailure = false;
                                        if (result && !('error' in result) && result.pointAssessments) {
                                            for (const assessment of result.pointAssessments) {
                                                if (!hasHighDisagreement && assessment.individualJudgements && assessment.individualJudgements.length > 1) {
                                                    const scores = assessment.individualJudgements.map(j => j.coverageExtent);
                                                    const n = scores.length;
                                                    const mean = scores.reduce((a, b) => a + b) / n;
                                                    const stdDev = Math.sqrt(scores.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
                                                    
                                                    if (stdDev > HIGH_DISAGREEMENT_THRESHOLD_STD_DEV) {
                                                        hasHighDisagreement = true;
                                                        const disagreementDetails = `High Judge Disagreement: Found on key point "${assessment.keyPointText}". Scores: [${scores.map(s => s.toFixed(2)).join(', ')}], StdDev: ${stdDev.toFixed(2)}.`;
                                                        if (titleText) titleText += '\n---\n';
                                                        titleText += disagreementDetails;
                                                    }
                                                }
                                                
                                                if (!hasCriticalFailure && (assessment as any).isInverted) {
                                                    const isPassing = assessment.coverageExtent !== undefined && assessment.coverageExtent >= 0.7;
                                                    if (!isPassing) {
                                                        hasCriticalFailure = true;
                                                        const failureDetails = `Critical Failure: Violated a 'should not' constraint: "${assessment.keyPointText}".`;
                                                        if (titleText) titleText += '\n---\n';
                                                        titleText += failureDetails;
                                                    }
                                                }
                                            }
                                        }

                                        const cellClasses = cn(
                                            "border-x border-border dark:border-slate-700",
                                            "p-1 align-middle relative overflow-hidden", // Equal width columns via table-fixed
                                            onCellClick ? "cursor-pointer" : ""
                                        );

                                        const sensitivity = permutationSensitivityMap?.get(`${promptId}:${parsedModel.baseId}`);

                                        // Get rank for enhanced styling
                                        const rank = promptModelRanks?.get(promptId)?.get(modelId);
                                        const isTopPerformer = rank && rank <= 3;
                                        const shouldHighlight = highlightBestInClass && isTopPerformer;

                                        const getEnhancedHighlightBestStyling = () => {
                                            if (!shouldHighlight) return '';

                                            if (rank === 1 
                                                || rank === 2
                                                || rank === 3
                                            ) {
                                                return 'bg-gradient-to-br from-yellow-100 to-yellow-200 dark:from-yellow-900/70 dark:to-yellow-800/70 ring-2 ring-yellow-400/70 dark:ring-yellow-400/60 shadow-lg shadow-yellow-400/40';
                                            }
                                            
                                            return '';
                                        };

                                        return (
                                            <td 
                                                key={modelId}
                                                className={cn(
                                                    cellClasses,
                                                    getEnhancedHighlightBestStyling(),
                                                    shouldHighlight && "transform transition-all duration-300 hover:scale-105"
                                                )}
                                                style={{width: `${equalWidthPercent}%`}}
                                                onMouseEnter={() => onModelHover && onModelHover(modelId)}
                                                onMouseLeave={() => onModelHover && onModelHover(null)}
                                                onClick={() => {
                                                    if (onCellClick) {
                                                        onCellClick(promptId, modelId);
                                                    }
                                                }}
                                                title={titleText || undefined}
                                            >
                                                {/* Only show icons and detailed segments in detailed view */}
                                                {!simplifiedView && (() => {
                                                    if (rank && rank <= 3) {
                                                        const colorClass = rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-400' : 'text-amber-600';
                                                        const enhancedIconSize = shouldHighlight ? 'w-4 h-4' : 'w-3.5 h-3.5';
                                                        return (
                                                            <span 
                                                                className={cn(
                                                                    "absolute top-0.5 left-0.5 transition-all duration-300",
                                                                    shouldHighlight && "drop-shadow-md"
                                                                )} 
                                                                title={`Ranked #${rank} for this prompt`}
                                                            >
                                                                <MedalIcon className={cn(enhancedIconSize, colorClass)} />
                                                            </span>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                
                                                {renderSegments(promptId, modelId)}
                                                
                                                {!simplifiedView && (
                                                    <>
                                                        <div className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5">
                                                            {hasHighDisagreement && UsersIcon && (
                                                                <span title="High judge disagreement on a criterion">
                                                                    <UsersIcon className="w-3 h-3 text-sky-600 dark:text-sky-500" />
                                                                </span>
                                                            )}
                                                            {hasCriticalFailure && AlertTriangleIcon && (
                                                                <span title="Violated a 'should not' constraint">
                                                                    <AlertTriangleIcon className="w-3 h-3 text-red-600 dark:text-red-500" />
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5">
                                                            {isOutlier && UnlinkIcon && (
                                                                <span title="Outlier score (>1.5σ from prompt average)">
                                                                    <UnlinkIcon className="w-3 h-3 text-amber-600 dark:text-amber-500" />
                                                                </span>
                                                            )}
                                                            {(sensitivity === 'temp' || sensitivity === 'both') && ThermometerIcon && (
                                                                <span title="Sensitive to temperature changes">
                                                                    <ThermometerIcon className="w-3 h-3 text-orange-500 dark:text-orange-400" />
                                                                </span>
                                                            )}
                                                            {(sensitivity === 'sys' || sensitivity === 'both') && MessageSquareIcon && (
                                                                <span title="Sensitive to system prompt changes">
                                                                    <MessageSquareIcon className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                                                                </span>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr> 
                            );
                        })}
                    </tbody>
                </table>
            </div>
            
            {selectedModelForModal && allFinalAssistantResponses && promptTexts && (
                <ModelPerformanceModal
                    isOpen={!!selectedModelForModal}
                    onClose={() => setSelectedModelForModal(null)}
                    modelId={selectedModelForModal}
                    parsedModelsMap={parsedModelsMap}
                    allCoverageScores={allCoverageScores}
                    allFinalAssistantResponses={allFinalAssistantResponses}
                    promptIds={sortedPromptIds}
                    promptTexts={promptTexts}
                    calculatePromptAverage={calculatePromptAverage}
                    config={config}
                    promptContexts={promptContexts}
                />
            )}
            
            <Dialog open={errorModalOpen} onOpenChange={setErrorModalOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-destructive" />
                            Error Details
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                            {errorModalContent}
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default MacroCoverageTable; 