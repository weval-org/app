'use client';

import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

// Type definitions (consistent with MacroCoverageTable)
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

export type AllCoverageScores = Record<string, Record<string, CoverageResult>>; // promptId -> modelId -> CoverageResult

interface CoverageHeatmapCanvasProps {
    allCoverageScores: AllCoverageScores | undefined | null;
    promptIds: string[];
    models: string[]; // List of non-ideal model IDs
    width: number;
    height: number;
    className?: string;
}

const CoverageHeatmapCanvas: React.FC<CoverageHeatmapCanvasProps> = ({
    allCoverageScores,
    promptIds,
    models,
    width,
    height,
    className,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Helper to get a color for a coverage score (0-1 range)
    const getCoverageColor = useCallback((score: number | null | undefined): string => {
        if (score === null || score === undefined || isNaN(score)) {
            return '#e2e8f0'; // slate-200 (light mode for missing/error)
        }
        if (score >= 0.75) return '#22c55e'; // green-500
        if (score >= 0.5) return '#facc15'; // yellow-400
        if (score >= 0.25) return '#f97316'; // orange-500
        if (score >= 0) return '#ef4444'; // red-500
        return '#cbd5e1'; // slate-300 (fallback for unexpected scores, e.g. negative)
    }, []);

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

    }, [allCoverageScores, sortedPromptIds, sortedModels, width, height, getCoverageColor]);

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
            title={`Coverage Heatmap. Avg: ${averageOverallScoreText}. Prompts: ${sortedPromptIds.length}, Models: ${sortedModels.length}`}
        />
    );
};

export default CoverageHeatmapCanvas;