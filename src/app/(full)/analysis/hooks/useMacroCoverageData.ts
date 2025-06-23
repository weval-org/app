import React from 'react';
import { AllCoverageScores } from '../types';
import { parseEffectiveModelId, ParsedModelId } from '@/app/utils/modelIdUtils';

// Constants can be moved here if they are only used within this hook
const OUTLIER_THRESHOLD_STD_DEV = 1.5;
const HIGH_DISAGREEMENT_THRESHOLD_STD_DEV = 0.3; // StDev threshold for judge scores


export const useMacroCoverageData = (
    allCoverageScores: AllCoverageScores | undefined | null,
    promptIds: string[],
    models: string[]
) => {
    console.log('[DEBUG] useMacroCoverageData received models:', models);
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

        const localSortedModels = [...models].sort((a, b) => a.localeCompare(b));

        const modelScores = models.map(modelId => ({
            modelId,
            score: calculateModelAverageCoverage(modelId),
        }));

        modelScores.sort((a, b) => {
            if (a.score === null) return 1;
            if (b.score === null) return -1;
            return b.score - a.score;
        });

        const modelIdToRank: Record<string, number> = {};
        if (modelScores.length > 0 && modelScores[0].score !== null) {
            let rank = 1;
            modelIdToRank[modelScores[0].modelId] = rank;
            for (let i = 1; i < modelScores.length; i++) {
                const currentModelScore = modelScores[i];
                const prevModelScore = modelScores[i - 1];

                if (currentModelScore.score === null) {
                    continue;
                }
                
                if (prevModelScore.score !== null && currentModelScore.score < prevModelScore.score) {
                    rank = i + 1;
                }
                modelIdToRank[currentModelScore.modelId] = rank;
            }
        }

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
        const baseBorderClass = 'border-t-4';
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
            baseIdToVisualGroupStyleMap,
            modelIdToRank,
        };
    }, [models, calculateModelAverageCoverage]);

    const sortedPromptIds = React.useMemo(() => [...promptIds].sort((a,b) => a.localeCompare(b)), [promptIds]);

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

    return {
        ...memoizedHeaderData,
        sortedPromptIds,
        promptStats,
        calculateModelAverageCoverage,
        calculatePromptAverage,
        OUTLIER_THRESHOLD_STD_DEV,
        HIGH_DISAGREEMENT_THRESHOLD_STD_DEV
    };
}; 