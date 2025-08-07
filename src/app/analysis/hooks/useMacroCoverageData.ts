import React from 'react';
import { aggregateCoverageByTemperature } from '@/app/utils/temperatureAggregation';
import { AllCoverageScores } from '@/app/analysis/components/CoverageHeatmapCanvas';
import { parseModelIdForDisplay, ParsedModelId } from '@/app/utils/modelIdUtils';

export type SortOption =
  | 'alpha-asc'
  | 'alpha-desc'
  | 'coverage-desc'
  | 'coverage-asc'
  | 'disagreement-desc'
  | 'disagreement-asc';

// Constants can be moved here if they are only used within this hook
const OUTLIER_THRESHOLD_STD_DEV = 1.5;
const HIGH_DISAGREEMENT_THRESHOLD_STD_DEV = 0.3; // StDev threshold for judge scores

export interface PromptStats {
    avg: number | null;
    stdDev: number | null;
}

export type ModelSortOption = 'alpha' | 'coverage-desc';

export const useMacroCoverageData = (
    allCoverageScores: AllCoverageScores | undefined | null,
    promptIds: string[],
    models: string[],
    sortOption: SortOption = 'alpha-asc',
    modelSortOption: ModelSortOption = 'alpha'
) => {
    const aggregatedScores = React.useMemo(() => {
        if (!allCoverageScores) return undefined;
        return aggregateCoverageByTemperature(allCoverageScores);
    }, [allCoverageScores]);

    const scores = aggregatedScores || allCoverageScores;

    const promptStats = React.useMemo(() => {
        const newPromptStats = new Map<string, PromptStats>();
        if (!scores) return newPromptStats;

        promptIds.forEach(promptId => {
            const scoresForPrompt: number[] = [];
            models.forEach(modelId => {
                const result = scores[promptId]?.[modelId];
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
        return newPromptStats;
    }, [allCoverageScores, promptIds, models]);

    const sortedPromptIds = React.useMemo(() => {
        const prompts = [...promptIds];
        prompts.sort((a, b) => {
            switch (sortOption) {
                case 'coverage-desc':
                case 'coverage-asc': {
                    const statsA = promptStats.get(a);
                    const statsB = promptStats.get(b);
                    const avgA = statsA?.avg ?? -1;
                    const avgB = statsB?.avg ?? -1;
                    if (avgA === avgB) return a.localeCompare(b);
                    return sortOption === 'coverage-desc' ? avgB - avgA : avgA - avgB;
                }
                case 'disagreement-desc':
                case 'disagreement-asc': {
                    const statsA = promptStats.get(a);
                    const statsB = promptStats.get(b);
                    const stdDevA = statsA?.stdDev ?? -1;
                    const stdDevB = statsB?.stdDev ?? -1;
                    if (stdDevA === stdDevB) return a.localeCompare(b);
                    return sortOption === 'disagreement-desc' ? stdDevB - stdDevA : stdDevA - stdDevB;
                }
                case 'alpha-desc':
                    return b.localeCompare(a);
                case 'alpha-asc':
                default:
                    return a.localeCompare(b);
            }
        });
        return prompts;
    }, [promptIds, sortOption, promptStats]);
    
    const promptModelRanks = React.useMemo(() => {
        const ranks = new Map<string, Map<string, number>>();
        if (!scores) return ranks;

        promptIds.forEach(promptId => {
            const modelScores: { modelId: string, score: number | null }[] = [];
            models.forEach(modelId => {
                const result = scores[promptId]?.[modelId];
                let score: number | null = null;
                if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                    score = result.avgCoverageExtent;
                }
                modelScores.push({ modelId, score });
            });

            modelScores.sort((a, b) => {
                if (a.score === null) return 1;
                if (b.score === null) return -1;
                return b.score - a.score; // descending
            });

            const promptRanks = new Map<string, number>();
            if (modelScores.length > 0 && modelScores[0].score !== null) {
                let rank = 1;
                promptRanks.set(modelScores[0].modelId, rank);
                for (let i = 1; i < modelScores.length; i++) {
                    const currentModelScore = modelScores[i];
                    const prevModelScore = modelScores[i - 1];

                    if (currentModelScore.score === null) {
                        continue;
                    }
                    
                    if (prevModelScore.score !== null && currentModelScore.score < prevModelScore.score) {
                        rank = i + 1;
                    }
                    promptRanks.set(currentModelScore.modelId, rank);
                }
            }
            ranks.set(promptId, promptRanks);
        });

        return ranks;
    }, [allCoverageScores, promptIds, models]);

    const calculateModelAverageCoverage = React.useCallback((modelId: string): number | null => {
        if (!scores) return null;
        let totalAvgExtent = 0;
        let validPromptsCount = 0;
        promptIds.forEach(promptId => {
            const result = scores[promptId]?.[modelId];
            if (result && !('error' in result) && typeof result.avgCoverageExtent === 'number' && !isNaN(result.avgCoverageExtent)) {
                totalAvgExtent += result.avgCoverageExtent;
                validPromptsCount++;
            }
        });
        return validPromptsCount > 0 ? (totalAvgExtent / validPromptsCount) : null;
    }, [allCoverageScores, promptIds]);

    const calculatePromptAverage = React.useCallback((promptId: string): number | null => {
        const promptScores = scores?.[promptId];
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
        models.forEach(id => { parsedModelsMap[id] = parseModelIdForDisplay(id); });

        let localSortedModels: string[] = [];
        if (modelSortOption === 'coverage-desc') {
            localSortedModels = [...models].sort((a, b) => {
                const avgA = calculateModelAverageCoverage(a);
                const avgB = calculateModelAverageCoverage(b);
                if (avgA === null) return 1;
                if (avgB === null) return -1;
                return avgB - avgA; // descending
            });
        } else {
            localSortedModels = [...models].sort((a, b) => a.localeCompare(b));
        }

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
    }, [models, calculateModelAverageCoverage, modelSortOption]);

    return {
        ...memoizedHeaderData,
        aggregatedScores: scores,
        sortedPromptIds,
        promptStats,
        calculateModelAverageCoverage,
        calculatePromptAverage,
        promptModelRanks,
        OUTLIER_THRESHOLD_STD_DEV,
        HIGH_DISAGREEMENT_THRESHOLD_STD_DEV
    };
}; 