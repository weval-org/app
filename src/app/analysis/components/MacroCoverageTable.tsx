'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getGradedCoverageColor } from '@/app/analysis/utils/colorUtils';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';

// Define AllFinalAssistantResponses type inline
type AllFinalAssistantResponses = Record<string, Record<string, string>>; // promptId -> modelId -> response text
import { useMacroCoverageData, SortOption } from '@/app/analysis/hooks/useMacroCoverageData';
import { cn } from '@/lib/utils';
import CoverageTableLegend, { ActiveHighlight } from '@/app/analysis/components/CoverageTableLegend';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ComparisonDataV2 as ImportedComparisonDataV2, PointAssessment } from '@/app/utils/types';
import { useAnalysis } from '../context/AnalysisContext';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import PromptDetailModal from '@/app/analysis/components/PromptDetailModal';

const UsersIcon = dynamic(() => import("lucide-react").then((mod) => mod.Users), { ssr: false });
const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle), { ssr: false });
const AlertTriangleIcon = dynamic(() => import("lucide-react").then((mod) => mod.AlertTriangle), { ssr: false });
const ThermometerIcon = dynamic(() => import("lucide-react").then((mod) => mod.Thermometer), { ssr: false });
const MessageSquareIcon = dynamic(() => import("lucide-react").then((mod) => mod.MessageSquare), { ssr: false });
const UnlinkIcon = dynamic(() => import("lucide-react").then((mod) => mod.Unlink), { ssr: false });
const MedalIcon = dynamic(() => import("lucide-react").then((mod) => mod.Medal), { ssr: false });
const InfoIcon = dynamic(() => import("lucide-react").then((mod) => mod.Info), { ssr: false });
const SearchIcon = dynamic(() => import("lucide-react").then((mod) => mod.Search), { ssr: false });

// Component for rendering model header cells (both diagonal name and rank/score)
interface ModelHeaderCellProps {
    modelId: string;
    parsedModelsMap: Record<string, any>;
    equalWidthPercent: string;
    modelIdToRank: Record<string, number> | undefined;
    calculateModelAverageCoverage: (modelId: string) => number | null;
    baseIdToVisualGroupStyleMap: Record<string, string>;
    openModelPerformanceModal: (modelId: string) => void;
    isNameHeader?: boolean; // true for diagonal name header, false for rank/score header
    totalModelCount: number; // total number of models to determine if we should use diagonal layout
}

const ModelHeaderCell: React.FC<ModelHeaderCellProps> = ({
    modelId,
    parsedModelsMap,
    equalWidthPercent,
    modelIdToRank,
    calculateModelAverageCoverage,
    baseIdToVisualGroupStyleMap,
    openModelPerformanceModal,
    isNameHeader = false,
    totalModelCount
}) => {
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

    if (isNameHeader) {
        const shortDisplayLabel = getModelDisplayLabel(parsed, {
            hideProvider: true,
            hideModelMaker: true,
            prettifyModelName: true,
            hideSystemPrompt: true,
            hideTemperature: true,
        });
        const fullDisplayLabel = getModelDisplayLabel(parsed);

        // Use simple horizontal headers for 3 or fewer models
        if (totalModelCount <= 3) {
            return (
                <th
                    key={modelId}
                    className="border-b border-border dark:border-slate-700 px-2 py-3 text-center font-semibold cursor-pointer transition-colors duration-200 hover:bg-muted/50"
                    style={{
                        width: `${equalWidthPercent}%`,
                        height: 'auto',
                        minHeight: '60px',
                    }}
                    title={`Click for detailed analysis of ${fullDisplayLabel}`}
                >
                    <div className="text-foreground dark:text-slate-200 text-sm leading-tight">
                        {shortDisplayLabel}
                    </div>
                </th>
            );
        }

        // Use diagonal headers for more than 3 models
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
    }

    // Rank/Score header
    const headerCellStyle = "border border-border dark:border-slate-700 px-2 py-2.5 text-center font-semibold align-bottom overflow-hidden";
    const mIndexHeaderStyle = cn(headerCellStyle, "text-foreground dark:text-slate-200");

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
                onClick={(e) => {
                    e.stopPropagation();
                    openModelPerformanceModal(modelId);
                }}
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
};

const MacroCoverageTable: React.FC = () => {
    const {
        data,
        configId,
        runLabel,
        timestamp: safeTimestampFromParams,
        modelsForMacroTable,
        openModelEvaluationDetailModal,
        handleActiveHighlightsChange,
        activeSysPromptIndex: systemPromptIndex,
        permutationSensitivityMap,
        promptTextsForMacroTable: promptTexts,
        isSandbox,
        sandboxId,
        activeHighlights,
        analysisStats,
        displayedModels,
        openPromptDetailModal,
        promptDetailModal,
        closePromptDetailModal,
        openModelPerformanceModal,
    } = useAnalysis();

    const [selectedModelForModal, setSelectedModelForModal] = useState<string | null>(null);

    const [markdownModule, setMarkdownModule] = useState<{ ReactMarkdown: any, RemarkGfm: any } | null>(null);
    const [sortOption, setSortOption] = useState<SortOption>('alpha-asc');
    const [highlightBestInClass, setHighlightBestInClass] = useState<boolean>(false);
    const [simplifiedView, setSimplifiedView] = useState<boolean>(true);
    const [errorModalOpen, setErrorModalOpen] = useState<boolean>(false);
    const [errorModalContent, setErrorModalContent] = useState<string>('');

    const onCellClick = (promptId: string, modelId: string) => {
        openModelEvaluationDetailModal({ promptId, modelId, variantScores: analysisStats?.perSystemVariantHybridScores });
    };

    const onPromptClick = (promptId: string) => {
        openPromptDetailModal(promptId);
    };

    if (!data) {
        return null;
    }
    const { 
        evaluationResults: { llmCoverageScores: allCoverageScores },
        promptIds,
        promptContexts,
        allFinalAssistantResponses,
        config,
    } = data;

    const models = modelsForMacroTable.filter(m => m !== IDEAL_MODEL_ID);

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
        // Notify parent component when highlights change
        if (handleActiveHighlightsChange) {
            handleActiveHighlightsChange(activeHighlights);
        }
    }, [activeHighlights, handleActiveHighlightsChange]);

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
    const fixedColsWidth = 60 + parseInt(promptColWidth); // score col (50px) + prompt col
    const modelColsMinWidth = localSortedModels.length * 60; // 45px minimum per model column
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
                <div className="w-full h-full flex flex-col items-center justify-center gap-1" title={tooltipText}>
                    <div className={`w-full h-3 rounded-sm ${bgColorClass}`} />
                    <div className="flex items-center gap-1">
                        {InfoIcon && <InfoIcon className="w-3 h-3 text-muted-foreground/60" />}
                        <span className="text-xs text-foreground font-medium">
                            {avgExtent !== undefined ? `${(avgExtent * 100).toFixed(0)}%` : 'N/A'}
                        </span>
                    </div>
                </div>
            );
        }

        // Group assessments by path for detailed view
        const requiredAssessments: PointAssessment[] = [];
        const pathGroups: Record<string, PointAssessment[]> = {};
        
        assessments.forEach(assessment => {
            if (assessment.pathId) {
                if (!pathGroups[assessment.pathId]) {
                    pathGroups[assessment.pathId] = [];
                }
                pathGroups[assessment.pathId].push(assessment);
            } else {
                requiredAssessments.push(assessment);
            }
        });

        // Find best path (same logic as detailed view)
        let bestPathId: string | null = null;
        let bestScore = -1;
        
        Object.entries(pathGroups).forEach(([pathId, pathAssessments]) => {
            const validAssessments = pathAssessments.filter(a => a.coverageExtent !== undefined);
            if (validAssessments.length > 0) {
                const totalScore = validAssessments.reduce((sum, a) => sum + a.coverageExtent!, 0);
                const avgScore = totalScore / validAssessments.length;
                if (avgScore > bestScore) {
                    bestScore = avgScore;
                    bestPathId = pathId;
                }
            }
        });

        const totalMultiplier = assessments.reduce((sum, assessment) => sum + (assessment.multiplier ?? 1), 0);
        const pathEntries = Object.entries(pathGroups).sort((a, b) => {
            // Sort paths by ID, but put best path first
            const aId = parseInt(a[0].split('_')[1] || '0');
            const bId = parseInt(b[0].split('_')[1] || '0');
            if (a[0] === bestPathId) return -1;
            if (b[0] === bestPathId) return 1;
            return aId - bId;
        });

        // Check if we have multiple paths to show striped backgrounds
        const hasMultiplePaths = pathEntries.length > 1 || (pathEntries.length > 0 && requiredAssessments.length > 0);

        // Define path background colors/patterns - MUCH MORE OBVIOUS
        const pathBackgroundStyles = [
            'bg-blue-500/80',      // Path 1 - very obvious blue
            'bg-purple-500/80',    // Path 2 - very obvious purple
            'bg-green-500/80',     // Path 3 - very obvious green
            'bg-orange-500/80',    // Path 4 - very obvious orange
            'bg-pink-500/80',      // Path 5 - very obvious pink
        ];

        // Create background stripe layers if we have multiple paths
        const renderBackgroundStripes = () => {
            if (!hasMultiplePaths) {
                return null;
            }

            const backgroundSegments = [];
            let currentPosition = 0;

            // Add background for required assessments if any
            if (requiredAssessments.length > 0) {
                const requiredMultiplier = requiredAssessments.reduce((sum, assessment) => sum + (assessment.multiplier ?? 1), 0);
                const requiredWidthPercent = totalMultiplier > 0 ? (requiredMultiplier / totalMultiplier) * 100 : 0;
                
                backgroundSegments.push(
                    <div
                        key="required-bg"
                        className="absolute h-full bg-slate-500/80 z-0"
                        style={{
                            left: `${currentPosition}%`,
                            width: `${requiredWidthPercent}%`,
                        }}
                    />
                );
                currentPosition += requiredWidthPercent;
            }

            // Add background for each path
            pathEntries.forEach(([pathId, pathAssessments], index) => {
                const pathMultiplier = pathAssessments.reduce((sum, assessment) => sum + (assessment.multiplier ?? 1), 0);
                const pathWidthPercent = totalMultiplier > 0 ? (pathMultiplier / totalMultiplier) * 100 : 0;
                const isBestPath = pathId === bestPathId;
                
                const bgStyle = pathBackgroundStyles[index % pathBackgroundStyles.length];
                
                backgroundSegments.push(
                    <div
                        key={`path-${pathId}-bg`}
                        className={cn(
                            "absolute z-0",
                            bgStyle
                        )}
                        style={{
                            left: `${currentPosition}%`,
                            width: `${pathWidthPercent}%`,
                            height: '120%', // Make it extend beyond the cell
                            top: '-10%',   // Start above the cell
                        }}
                        title={`Path ${parseInt(pathId.split('_')[1] || '0') + 1}${isBestPath ? ' (Best Path)' : ''}`}
                    />
                );
                currentPosition += pathWidthPercent;
            });

            return backgroundSegments;
        };

        const renderAssessmentSegments = (assessmentList: PointAssessment[], pathLabel?: string, pathIndex?: number) => {
            return assessmentList.map((assessment, index) => {
                const originalIndex = assessments.indexOf(assessment);
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
                
                // Get path indicator classes for top border
                const pathBorderClasses = [
                    'border-t-4 border-blue-500',
                    'border-t-4 border-purple-500', 
                    'border-t-4 border-green-500',
                    'border-t-4 border-orange-500',
                    'border-t-4 border-pink-500'
                ];
                const pathTextClasses = [
                    'text-blue-500',
                    'text-purple-500',
                    'text-green-500', 
                    'text-orange-500',
                    'text-pink-500'
                ];
                const pathBorderClass = pathIndex !== undefined ? pathBorderClasses[pathIndex % pathBorderClasses.length] : null;
                const pathTextClass = pathIndex !== undefined ? pathTextClasses[pathIndex % pathTextClasses.length] : null;
                const isBestPath = assessment.pathId === bestPathId;
                
                let pointTooltip = `(model: ${getModelDisplayLabel(parsedModelsMap[modelId])})\n`;
                
                if (pathLabel) {
                    pointTooltip += `${pathLabel} - Criterion ${index + 1}: "${assessment.keyPointText}"`;
                    if (assessment.pathId === bestPathId) {
                        pointTooltip += '\n✓ BEST PATH';
                    }
                } else {
                    pointTooltip += `Criterion ${originalIndex + 1}: "${assessment.keyPointText}"`;
                }

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
                        key={`${assessment.pathId || 'required'}-${originalIndex}`}
                        title={pointTooltip}
                        className={cn(
                            "h-full bg-opacity-90 dark:bg-opacity-95 relative z-20",
                            bgColorClass,
                            pathBorderClass
                        )}
                        style={{ 
                            width: `${segmentWidthPercent}%`,
                            borderRight: index < assessmentList.length - 1 ? '1px solid #00000020' : 'none'
                        }}
                    >
                        {/* Add path label on first segment of each path */}
                        {index === 0 && pathLabel && pathTextClass && (
                            <div 
                                className={cn(
                                    "font-mono absolute -top-5 left-1/2 -translate-x-1/2 z-30 bg-white dark:bg-gray-800 px-1 rounded-sm border border-gray-200 dark:border-gray-600",
                                    isVeryNarrowLayout ? "text-[9px]" : isNarrowLayout ? "text-[10px]" : "text-xs",
                                    pathTextClass
                                )}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                {pathLabel}{isBestPath ? ' ★' : ''}
                            </div>
                        )}
                    </div>
                );
            });
        };

        const backgroundStripes = renderBackgroundStripes();

        return (
            <div className="relative w-full h-6 rounded-sm ring-1 ring-border/50 dark:ring-slate-600/50 max-w-full" 
                 style={{ marginTop: hasMultiplePaths ? '16px' : '0px', overflow: 'visible' }} 
                 title={tooltipText}>
                {/* Background stripes layer */}
                {backgroundStripes}
                
                {/* Segments layer */}
                <div className="relative z-10 flex h-full">
                    {/* Render required assessments first */}
                    {requiredAssessments.length > 0 && renderAssessmentSegments(requiredAssessments)}
                    
                    {/* Render alternative paths */}
                    {pathEntries.map(([pathId, pathAssessments], pathIndex) => {
                        const pathNumber = parseInt(pathId.split('_')[1] || '0') + 1;
                        const pathLabel = isVeryNarrowLayout ? `${pathNumber}` : `Path ${pathNumber}`;
                        return renderAssessmentSegments(pathAssessments, pathLabel, pathIndex);
                    })}
                    
                    {/* Fallback for when no paths are detected - render all assessments in order */}
                    {requiredAssessments.length === 0 && pathEntries.length === 0 && (
                        assessments.map((assessment, index) => {
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
                                    className={`h-full ${bgColorClass} bg-opacity-90 dark:bg-opacity-95 relative z-20`}
                                    style={{ width: `${segmentWidthPercent}%`, borderRight: index < nKeyPoints - 1 ? '1px solid #00000020' : 'none' }}
                                />
                            );
                        })
                    )}
                </div>
            </div>
        );
    };

    // Calculate equal width percentage for model columns (excluding fixed-width first two columns)
    const modelColumnsCount = localSortedModels.length;
    const equalWidthPercent = modelColumnsCount > 0 ? (100 / modelColumnsCount).toFixed(2) : "100";
    
    // Calculate responsive sizing for path labels (once, not per path)
    const isNarrowByPercent = parseFloat(equalWidthPercent) < 8; // Less than 8% width per column
    const isVeryNarrowByPercent = parseFloat(equalWidthPercent) < 5; // Less than 5% width per column
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768; // Tailwind md breakpoint
    const isSmallMobile = typeof window !== 'undefined' && window.innerWidth < 640; // Tailwind sm breakpoint
    const isNarrowLayout = isNarrowByPercent || isMobile;
    const isVeryNarrowLayout = isVeryNarrowByPercent || isSmallMobile;
    const headerCellStyle = "border border-border dark:border-slate-700 px-2 py-2.5 text-center font-semibold align-bottom overflow-hidden";
    const mIndexHeaderStyle = cn(headerCellStyle, "text-foreground dark:text-slate-200");
    const firstColHeader = cn(headerCellStyle, "text-primary bg-muted");
    const secondColHeader = cn(headerCellStyle, "text-primary bg-muted text-left");

    return (
        <div>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                <Alert className="bg-sky-50 border border-sky-200 text-sky-900 dark:bg-sky-900/20 dark:border-sky-500/30 dark:text-sky-200 w-auto">
                    <InfoIcon className="h-4 w-4" />
                    <AlertTitle className="font-semibold">Pro Tip</AlertTitle>
                    <AlertDescription>
                        Click on any result cell to open a detailed view.
                    </AlertDescription>
                </Alert>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:ml-auto">
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="simplified-view"
                            checked={!simplifiedView}
                            onCheckedChange={(checked: CheckedState) => setSimplifiedView(checked === false)}
                        />
                        <Label 
                            htmlFor="simplified-view" 
                            className="text-sm font-medium cursor-pointer"
                        >
                            Advanced view
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
                            {localSortedModels.map(modelId => (
                                <ModelHeaderCell
                                    key={modelId}
                                    modelId={modelId}
                                    parsedModelsMap={parsedModelsMap}
                                    equalWidthPercent={equalWidthPercent}
                                    modelIdToRank={modelIdToRank}
                                    calculateModelAverageCoverage={calculateModelAverageCoverage}
                                    baseIdToVisualGroupStyleMap={baseIdToVisualGroupStyleMap}
                                    openModelPerformanceModal={openModelPerformanceModal}
                                    isNameHeader={true}
                                    totalModelCount={localSortedModels.length}
                                />
                            ))}
                        </tr>
                        <tr className="bg-muted">
                            <th className={cn(firstColHeader, "border-t-0")} style={{width: "50px"}}>Score</th>
                            <th className={cn(secondColHeader, "border-t-0")} style={{width: promptColWidth}}></th>
                            {localSortedModels.map(modelId => (
                                <ModelHeaderCell
                                    key={`rank-score-${modelId}`}
                                    modelId={modelId}
                                    parsedModelsMap={parsedModelsMap}
                                    equalWidthPercent={equalWidthPercent}
                                    modelIdToRank={modelIdToRank}
                                    calculateModelAverageCoverage={calculateModelAverageCoverage}
                                    baseIdToVisualGroupStyleMap={baseIdToVisualGroupStyleMap}
                                    openModelPerformanceModal={openModelPerformanceModal}
                                    isNameHeader={false}
                                    totalModelCount={localSortedModels.length}
                                />
                            ))}
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
                            "cursor-pointer",
                            "hover:bg-slate-100 dark:hover:bg-slate-700",
                            "hover:shadow-md hover:shadow-primary/10",
                            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1",
                            "transition-all duration-200 ease-in-out",
                            "hover:scale-[1.02] active:scale-[0.98]"
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
                                                onClick={() => onCellClick(promptId, modelId)}
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

            <PromptDetailModal />
        </div>
    );
};

export default MacroCoverageTable; 