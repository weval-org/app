'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { getGradedCoverageColor } from '../utils/colorUtils';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { Badge } from '@/components/ui/badge';

const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle));
const CheckCircle2 = dynamic(() => import("lucide-react").then((mod) => mod.CheckCircle2));
const XCircle = dynamic(() => import("lucide-react").then((mod) => mod.XCircle));

// Reuse types from page.tsx or define locally if needed
interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    reflection?: string;
    error?: string;
    multiplier?: number;
    citation?: string;
    isInverted?: boolean;
}

// Match CoverageResult from page.tsx
type CoverageResult = {
    keyPointsCount: number;
    avgCoverageExtent?: number;
    pointAssessments?: PointAssessment[];
} | { error: string } | null;

interface KeyPointCoverageTableProps {
    coverageScores: Record<string, CoverageResult> | undefined | null; // ModelId -> CoverageResult
    models: string[]; // List of non-ideal model IDs
    onCellClick?: (modelId: string, assessment: PointAssessment | null) => void;
    onModelHeaderClick?: (modelId: string) => void;
}

const KeyPointCoverageTable: React.FC<KeyPointCoverageTableProps> = ({
    coverageScores,
    models,
    onCellClick,
    onModelHeaderClick,
}) => {
    const criteriaData = React.useMemo(() => {
        if (!coverageScores || !models || models.length === 0) return null;

        let firstModelAssessments: PointAssessment[] | undefined;
        for (const modelId of models) {
            const modelResult = coverageScores[modelId];
            if (modelResult && !('error' in modelResult) && modelResult.pointAssessments && modelResult.pointAssessments.length > 0) {
                firstModelAssessments = modelResult.pointAssessments;
                break;
            }
        }

        if (!firstModelAssessments) {
            const wasAnyModelProcessed = models.some(modelId => coverageScores[modelId]);
            return wasAnyModelProcessed ? [] : null;
        }
        
        // Return the full assessment object for each unique key point
        const seenTexts = new Set<string>();
        return firstModelAssessments.filter(pa => {
            if (seenTexts.has(pa.keyPointText)) {
                return false;
            }
            seenTexts.add(pa.keyPointText);
            return true;
        });
    }, [coverageScores, models]);


    if (criteriaData === null) { 
        return <p className="p-4 text-muted-foreground italic">Coverage data not available for this prompt.</p>;
    }
    
    if (criteriaData.length === 0) {
        return <p className="p-4 text-muted-foreground italic">No evaluation criteria or point assessments found to display for this prompt.</p>;
    }

    const findAssessment = (modelId: string, keyPointText: string): PointAssessment | 'error' | 'missing' | null => {
        if (!coverageScores) return 'missing'; // Guard against null/undefined coverageScores
        const modelResult = coverageScores[modelId];
        if (!modelResult) return 'missing'; 
        if ('error' in modelResult) return 'error'; 
        if (!modelResult.pointAssessments) return null; 

        return modelResult.pointAssessments.find(pa => pa.keyPointText === keyPointText) || null;
    };

    return (
        <div className="overflow-x-auto rounded-md ring-1 ring-border dark:ring-slate-700 shadow-md">
            <table className="min-w-full border-collapse text-xs table-fixed">
                <thead>
                    <tr className="bg-muted dark:bg-slate-800">
                        <th className="border border-border dark:border-slate-700 px-3 py-2.5 text-left font-semibold text-primary dark:text-sky-300 sticky left-0 bg-muted dark:bg-slate-800 z-10 w-[40%]">Evaluation Criterion</th>
                        {models.map(modelId => {
                            const modelDisplayLabel = getModelDisplayLabel(modelId, {hideProvider: true});
                            const headerClasses = "border border-border dark:border-slate-700 px-2 py-2.5 text-center font-semibold text-foreground dark:text-slate-200 whitespace-nowrap w-24";
                            const isClickable = !!onModelHeaderClick;
                            return (
                                <th 
                                    key={modelId} 
                                    className={`${headerClasses} ${isClickable ? 'cursor-pointer hover:bg-muted/70 dark:hover:bg-slate-700/50 transition-colors' : ''}`}
                                    title={`${modelDisplayLabel}${isClickable ? ' (Click to view full response & all assessments)' : ''}`}
                                    onClick={() => {
                                        if (isClickable && onModelHeaderClick) {
                                            onModelHeaderClick(modelId);
                                        }
                                    }}
                                >
                                    {modelDisplayLabel}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-slate-700">
                    {criteriaData.map((criterion, index) => (
                        <tr key={index} className="hover:bg-muted/50 dark:hover:bg-slate-700/30 transition-colors duration-100">
                            <td 
                                className="border-x border-border dark:border-slate-700 px-3 py-2 text-left align-top sticky left-0 bg-card/90 dark:bg-slate-800/90 hover:bg-muted/60 dark:hover:bg-slate-700/50 z-10 w-[40%] backdrop-blur-sm"
                                title={criterion.citation || criterion.keyPointText}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span 
                                        className="block text-foreground dark:text-slate-100 whitespace-normal overflow-hidden text-ellipsis"
                                        style={{
                                            display: '-webkit-box',
                                            WebkitBoxOrient: 'vertical',
                                            WebkitLineClamp: 3,
                                        }}
                                    >
                                        {criterion.keyPointText}
                                    </span>
                                    <div className="flex flex-col items-end gap-1">
                                        {criterion.isInverted && (
                                            <Badge variant="destructive" className="text-xs font-normal whitespace-nowrap" title="This is a 'should not' criterion. Presence of this content is penalized.">
                                                NOT
                                            </Badge>
                                        )}
                                        {criterion.multiplier && criterion.multiplier !== 1 && (
                                            <Badge variant="secondary" className="text-xs font-normal whitespace-nowrap" title={`Score for this criterion is weighted by a multiplier of ${criterion.multiplier}`}>
                                                &times;{criterion.multiplier}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                {criterion.citation && (
                                    <p className="text-xs text-muted-foreground/80 dark:text-slate-400/80 mt-1.5 italic border-l-2 border-border/70 pl-2">
                                        {criterion.citation}
                                    </p>
                                )}
                            </td>
                            {models.map(modelId => {
                                const assessment = findAssessment(modelId, criterion.keyPointText);
                                let cellContent: React.ReactNode = null;
                                let titleText = 'No data';
                                const isClickable = !!onCellClick;
                                let cellBgClass = 'bg-muted/40 dark:bg-slate-700/40';
                                let textColorClass = '';

                                if (assessment === 'error') {
                                    cellContent = AlertCircle && <AlertCircle className="w-4 h-4 mx-auto text-destructive-foreground" />;
                                    cellBgClass = 'bg-destructive/30 dark:bg-red-900/30';
                                    titleText = 'Error processing coverage for this model.';
                                } else if (assessment === 'missing') {
                                    cellContent = <span className="text-muted-foreground dark:text-slate-500">N/A</span>;
                                    titleText = 'Coverage data missing for this model.';
                                } else if (!assessment) {
                                    cellContent = <span className="text-yellow-700 dark:text-yellow-400">?</span>;
                                    cellBgClass = 'bg-highlight-warning/20 dark:bg-yellow-800/20';
                                    titleText = 'Assessment data for this specific key point not found.';
                                } else {
                                    const extentValue = assessment.coverageExtent;
                                    const reflection = assessment.reflection;
                                    const error = assessment.error;
                                    const isConsideredPresent = extentValue !== undefined && extentValue > 0.3; // Client-side determination
                                    const isInverted = assessment.isInverted;
                                    
                                    if (error) { // Prioritize displaying an error for the specific point
                                        cellContent = AlertCircle && <AlertCircle className="w-4 h-4 mx-auto text-destructive-foreground" />;
                                        cellBgClass = 'bg-destructive/30 dark:bg-red-900/30';
                                        titleText = `Error: ${error}`;
                                        if (reflection) titleText += `\nReflection: ${reflection}`;                                       
                                    } else if (isInverted) {
                                        const isViolation = extentValue !== undefined && extentValue < 0.7;
                                        cellBgClass = getGradedCoverageColor(!isViolation, extentValue); // A passing (high) score is green, a violation (low) is red

                                        if (isViolation) {
                                            cellContent = AlertCircle && <AlertCircle className="w-4 h-4 mx-auto text-destructive-foreground" />;
                                            titleText = 'Violation: Undesirable content was detected.';
                                        } else {
                                            cellContent = CheckCircle2 && <CheckCircle2 className="w-4 h-4 mx-auto text-white dark:text-green-200" />;
                                            titleText = 'Passed: Undesirable content was not detected.';
                                        }
                                    }
                                    else if (!isConsideredPresent) {
                                        if (XCircle) cellContent = <XCircle className="w-4 h-4 mx-auto text-destructive-foreground" />;
                                        titleText = `Not Met`;
                                        cellBgClass = getGradedCoverageColor(false, extentValue);
                                    } else { // isConsideredPresent is true
                                        cellBgClass = getGradedCoverageColor(true, extentValue);
                                        if (extentValue === 1.0) {
                                            if (CheckCircle2) cellContent = <CheckCircle2 className="w-4 h-4 mx-auto text-white dark:text-green-200" />;
                                            titleText = `Fully Met`;
                                        } else { 
                                            textColorClass = 'text-white dark:text-slate-50'; 
                                            if (extentValue !== undefined) {
                                                cellContent = <span className={`font-medium ${textColorClass} text-[11px]`}>{extentValue.toFixed(2)}</span>;
                                                titleText = `Partially Met`;
                                            } else {
                                                cellContent = <span className={`font-medium ${textColorClass} text-[11px]`}>?</span>; // Should not happen if isConsideredPresent is true
                                                titleText = `Met (Extent N/A)`;
                                            }
                                        }
                                    }
                                    
                                    if (extentValue !== undefined && !error) { // Add extent to title if no specific point error
                                        titleText += ` (Extent: ${extentValue.toFixed(2)})`;
                                    }
                                    if (assessment.multiplier && assessment.multiplier !== 1) {
                                        titleText += `\nMultiplier: x${assessment.multiplier}`;
                                    }
                                    if (reflection && !error) { // Add reflection to title if no specific point error
                                        titleText += `\nReflection: ${reflection}`;
                                    }
                                    if (assessment.citation) {
                                        titleText += `\nCitation: ${assessment.citation}`;
                                    }
                                }

                                return (
                                    <td 
                                        key={`${modelId}-${index}`} 
                                        className={`border-x border-border dark:border-slate-700 p-0 h-10 w-24 text-center align-middle ${cellBgClass} bg-opacity-60 dark:bg-opacity-70 ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                                        title={titleText}
                                        onClick={() => {
                                            if (isClickable && typeof assessment === 'object' && assessment !== null) { 
                                                onCellClick(modelId, assessment);
                                            }
                                        }}
                                    >
                                        <div className="flex items-center justify-center h-full w-full">
                                            {cellContent}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default KeyPointCoverageTable; 