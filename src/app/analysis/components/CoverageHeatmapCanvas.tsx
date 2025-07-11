'use client';

import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { CoverageResult as ImportedCoverageResult, PointAssessment } from '@/types/shared';

// Re-export shared types for local consistency and to avoid conflicts.
export type CoverageResult = ImportedCoverageResult;
export type AllCoverageScores = Record<string, Record<string, CoverageResult>>; // promptId -> modelId -> CoverageResult

interface CoverageHeatmapCanvasProps {
    allCoverageScores: AllCoverageScores | undefined | null;
    promptIds: string[];
    models: string[]; // List of non-ideal model IDs
    width: number;
    height: number;
    className?: string;
    viewMode?: 'heatmap' | 'barchart';
}

const CoverageHeatmapCanvas: React.FC<CoverageHeatmapCanvasProps> = ({
    allCoverageScores,
    promptIds,
    models,
    width,
    height,
    className,
    viewMode = 'barchart',
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [colorMap, setColorMap] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchColors = () => {
            if (typeof window !== 'undefined') {
                const computedStyle = getComputedStyle(document.documentElement);
                const getColor = (name: string) => `hsl(${computedStyle.getPropertyValue(name).trim()})`;

                setColorMap({
                    'fully-met': getColor('--coverage-fully-met'),
                    'grade-9': getColor('--coverage-grade-9'),
                    'grade-8': getColor('--coverage-grade-8'),
                    'grade-7': getColor('--coverage-grade-7'),
                    'grade-6': getColor('--coverage-grade-6'),
                    'grade-5': getColor('--coverage-grade-5'),
                    'grade-4': getColor('--coverage-grade-4'),
                    'grade-3': getColor('--coverage-grade-3'),
                    'grade-2': getColor('--coverage-grade-2'),
                    'grade-1': getColor('--coverage-grade-1'),
                    'grade-0': getColor('--coverage-grade-0'),
                    'unmet': getColor('--coverage-unmet'),
                    'no-extent': getColor('--coverage-no-extent'),
                });
            }
        };

        fetchColors();

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    fetchColors();
                    break;
                }
            }
        });

        observer.observe(document.documentElement, { attributes: true });

        return () => observer.disconnect();
    }, []);

    // Helper to get a color for a coverage score (0-1 range)
    const getCoverageColor = useCallback((score: number | null | undefined): string => {
        if (Object.keys(colorMap).length === 0) {
            return '#e2e8f0'; // Default fallback
        }
        if (score === null || score === undefined || isNaN(score)) {
            return colorMap['no-extent'] || '#e2e8f0';
        }
        if (score >= 1.0) return colorMap['fully-met'];
        if (score >= 0.9) return colorMap['grade-9'];
        if (score >= 0.8) return colorMap['grade-8'];
        if (score >= 0.7) return colorMap['grade-7'];
        if (score >= 0.6) return colorMap['grade-6'];
        if (score >= 0.5) return colorMap['grade-5'];
        if (score >= 0.4) return colorMap['grade-4'];
        if (score >= 0.3) return colorMap['grade-3'];
        if (score >= 0.2) return colorMap['grade-2'];
        if (score >= 0.1) return colorMap['grade-1'];
        return colorMap['grade-0'];
    }, [colorMap]);

    const calculateModelAverageCoverage = useCallback((modelId: string): number | null => {
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

    const calculatePromptAverageCoverage = useCallback((promptId: string): number | null => {
        if (!allCoverageScores) return null;
        let totalAvgExtent = 0;
        let validModelsCount = 0;
        models.forEach(modelId => {
            const result = allCoverageScores[promptId]?.[modelId];
            if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                totalAvgExtent += result.avgCoverageExtent;
                validModelsCount++;
            }
        });
        return validModelsCount > 0 ? (totalAvgExtent / validModelsCount) : null;
    }, [allCoverageScores, models]);

    const sortedModels = useMemo(() => {
        return [...models]
            .filter(m => m !== IDEAL_MODEL_ID)
            .sort((a, b) => a.localeCompare(b));
    }, [models]);

    const sortedPromptIds = useMemo(() => {
        return [...promptIds].sort((a, b) => a.localeCompare(b));
    }, [promptIds]);

    useEffect(() => {
        if (!canvasRef.current || !allCoverageScores || sortedModels.length === 0 || sortedPromptIds.length === 0) {
            return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        ctx.clearRect(0, 0, width, height);

        if (viewMode === 'barchart') {
            const numEffectivePrompts = sortedPromptIds.length;
            if (numEffectivePrompts === 0) return;

            const rowHeight = height / numEffectivePrompts;

            for (let y = 0; y < numEffectivePrompts; y++) {
                const promptId = sortedPromptIds[y];
                const rowYPos = y * rowHeight;

                const allAssessmentsForPrompt: PointAssessment[] = [];
                sortedModels.forEach(modelId => {
                    const result = allCoverageScores[promptId]?.[modelId];
                    if (result && !('error' in result) && result.pointAssessments) {
                        allAssessmentsForPrompt.push(...result.pointAssessments);
                    }
                });

                if (allAssessmentsForPrompt.length > 0) {
                    const sortedAssessments = allAssessmentsForPrompt.sort((a, b) => {
                        const scoreA = (a.coverageExtent !== undefined && !isNaN(a.coverageExtent)) ? a.coverageExtent : -1;
                        const scoreB = (b.coverageExtent !== undefined && !isNaN(b.coverageExtent)) ? b.coverageExtent : -1;
                        return scoreB - scoreA;
                    });

                    const totalMultiplier = sortedAssessments.reduce((sum, assessment) => sum + (assessment.multiplier ?? 1), 0);
                    let currentXOffset = 0;

                    for (const assessment of sortedAssessments) {
                        const score = (assessment.coverageExtent !== undefined && !isNaN(assessment.coverageExtent)) ? assessment.coverageExtent : null;
                        const pointMultiplier = assessment.multiplier ?? 1;
                        const segmentWidth = totalMultiplier > 0 ? (pointMultiplier / totalMultiplier) * width : width / sortedAssessments.length;

                        ctx.fillStyle = getCoverageColor(score);
                        ctx.fillRect(currentXOffset, rowYPos, segmentWidth, rowHeight);
                        currentXOffset += segmentWidth;
                    }
                } else {
                    const modelScores: { modelId: string; score: number | null }[] = sortedModels.map(modelId => {
                        const result = allCoverageScores[promptId]?.[modelId];
                        let score: number | null = null;
                        if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                            score = result.avgCoverageExtent;
                        }
                        return { modelId, score };
                    });

                    const sortedModelScores = modelScores.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
                    
                    if (sortedModels.length > 0) {
                        const segmentWidth = width / sortedModels.length;
                        let currentXOffset = 0;

                        for (const { score } of sortedModelScores) {
                            ctx.fillStyle = getCoverageColor(score);
                            ctx.fillRect(currentXOffset, rowYPos, segmentWidth, rowHeight);
                            currentXOffset += segmentWidth;
                        }
                    } else {
                        ctx.fillStyle = getCoverageColor(null);
                        ctx.fillRect(0, rowYPos, width, rowHeight);
                    }
                }
            }
        } else {
            const numEffectiveModels = sortedModels.length;
            const numEffectivePrompts = sortedPromptIds.length;

            const cellWidth = width / numEffectiveModels;
            const cellHeight = height / numEffectivePrompts;

            for (let y = 0; y < numEffectivePrompts; y++) {
                const promptId = sortedPromptIds[y];
                for (let x = 0; x < numEffectiveModels; x++) {
                    const modelId = sortedModels[x];
                    const result = allCoverageScores[promptId]?.[modelId];
                    
                    const cellXPos = x * cellWidth;
                    const cellYPos = y * cellHeight;

                    if (result && !('error' in result) && result.pointAssessments && result.pointAssessments.length > 0) {
                        const assessments = result.pointAssessments;
                        
                        const totalMultiplier = assessments.reduce((sum, assessment) => sum + (assessment.multiplier ?? 1), 0);
                        let currentXOffset = 0;

                        for (let k = 0; k < assessments.length; k++) {
                            const assessment = assessments[k];
                            const score = (assessment.coverageExtent !== undefined && !isNaN(assessment.coverageExtent)) ? assessment.coverageExtent : null;
                            
                            const pointMultiplier = assessment.multiplier ?? 1;
                            const segmentWidth = totalMultiplier > 0 ? (pointMultiplier / totalMultiplier) * cellWidth : cellWidth / assessments.length;

                            ctx.fillStyle = getCoverageColor(score);
                            ctx.fillRect(cellXPos + currentXOffset, cellYPos, segmentWidth, cellHeight);
                            currentXOffset += segmentWidth;
                        }
                    } else {
                        // Fallback to average score or error/missing color
                        let score: number | null = null;
                        if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                            score = result.avgCoverageExtent;
                        }
                        ctx.fillStyle = getCoverageColor(score); // Handles null/undefined for error/missing
                        ctx.fillRect(cellXPos, cellYPos, cellWidth, cellHeight);
                    }
                }
            }
        }

    }, [allCoverageScores, sortedPromptIds, sortedModels, width, height, getCoverageColor, viewMode]);

    const averageOverallScoreText = useMemo(() => {
        if (!allCoverageScores) return 'N/A';
        let totalSum = 0;
        let totalCount = 0;
        sortedPromptIds.forEach(promptId => {
            sortedModels.forEach(modelId => {
                 const result = allCoverageScores[promptId]?.[modelId];
                 if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                    totalSum += result.avgCoverageExtent;
                    totalCount++;
                }
            });
        });
        return totalCount > 0 ? (totalSum / totalCount * 100).toFixed(1) + '%' : 'N/A';
    }, [allCoverageScores, sortedPromptIds, sortedModels]);

    if (!allCoverageScores || sortedModels.length === 0 || sortedPromptIds.length === 0) {
        return (
            <div
                className={className}
                style={{ width: `${width}px`, height: `${height}px`, background: '#f1f5f9' /* slate-100 */ }}
                title={`Coverage Heatmap: Data unavailable. Prompts: ${promptIds.length}, Models: ${models.length}`}
            />
        );
    }

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={className}
            style={{ imageRendering: 'pixelated' }} // Ensures crisp pixels for small canvases
            title={`Coverage ${viewMode === 'barchart' ? 'Barchart' : 'Heatmap'}. Avg: ${averageOverallScoreText}. Prompts: ${sortedPromptIds.length}, Models: ${sortedModels.length}`}
        />
    );
};

export default CoverageHeatmapCanvas;