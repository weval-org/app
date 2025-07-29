import { useMemo } from 'react';
import {
    ComparisonDataV2,
    CoverageResult as ImportedCoverageResult,
} from '@/app/utils/types';
import {
    IDEAL_MODEL_ID,
    calculateOverallCoverageExtremes as importedCalculateOverallCoverageExtremes,
    calculateHybridScoreExtremes as importedCalculateHybridScoreExtremes,
    calculateOverallAverageCoverage as importedCalculateOverallAverageCoverage,
    calculateAverageHybridScoreForRun,
    findIdealExtremes,
    calculateMostDifferentiatingPrompt,
    calculateAllModelCoverageRankings,
    calculateAllModelHybridRankings,
    OverallCoverageExtremes,
    HybridScoreExtremes,
    IdealScoreExtremes,
    AllModelScoreRankings,
} from '@/app/utils/calculationUtils';
import { parseEffectiveModelId } from '@/app/utils/modelIdUtils';

export interface AnalysisStats {
    overallIdealExtremes: IdealScoreExtremes | null;
    overallAvgCoverageStats: { average: number | null, stddev: number | null } | null;
    overallCoverageExtremes: OverallCoverageExtremes | null;
    overallHybridExtremes: HybridScoreExtremes | null;
    overallRunHybridStats: { average: number | null, stddev: number | null };
    calculatedPerModelHybridScores: Map<string, { average: number | null; stddev: number | null }>;
    calculatedPerModelSemanticScores: Map<string, { average: number | null; stddev: number | null }>;
    perSystemVariantHybridScores: Record<number, number | null>;
    perTemperatureVariantHybridScores: Record<string, number | null>;
    mostDifferentiatingPrompt: { id: string; score: number } | null;
    allModelCoverageRankings: AllModelScoreRankings | null;
    allModelHybridRankings: AllModelScoreRankings | null;
}

export const useAnalysisStats = (data: ComparisonDataV2 | null): AnalysisStats => {
    const calculatedPerModelHybridScores = useMemo(() => {
        if (!data?.evaluationResults?.perModelHybridScores) {
            return new Map<string, { average: number | null; stddev: number | null }>();
        }
        let scoresToSet = data.evaluationResults.perModelHybridScores;
        if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
            scoresToSet = new Map(Object.entries(scoresToSet));
        }
        return scoresToSet as Map<string, { average: number | null; stddev: number | null }>;
    }, [data?.evaluationResults?.perModelHybridScores]);

    const calculatedPerModelSemanticScores = useMemo(() => {
        if (!data?.evaluationResults?.perModelSemanticScores) {
            return new Map<string, { average: number | null; stddev: number | null }>();
        }
        let scoresToSet = data.evaluationResults.perModelSemanticScores;
        if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
            scoresToSet = new Map(Object.entries(scoresToSet));
        }
        return scoresToSet as Map<string, { average: number | null; stddev: number | null }>;
    }, [data?.evaluationResults?.perModelSemanticScores]);

    const overallIdealExtremes = useMemo(() => {
        if (!data?.evaluationResults?.similarityMatrix) return null;
        return findIdealExtremes(data.evaluationResults.similarityMatrix, IDEAL_MODEL_ID);
    }, [data?.evaluationResults?.similarityMatrix]);
    
    const overallAvgCoverageStats = useMemo(() => {
        if (!data) return null;
        const { evaluationResults, effectiveModels, promptIds } = data;
        const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;
        return (llmCoverageScores && effectiveModels && promptIds) 
            ? importedCalculateOverallAverageCoverage(llmCoverageScores, effectiveModels, promptIds) 
            : null;
    }, [data]);

    const overallCoverageExtremes = useMemo(() => {
        if (!data) return null;
        const { evaluationResults, effectiveModels } = data;
        const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;
        return (llmCoverageScores && effectiveModels) 
            ? importedCalculateOverallCoverageExtremes(llmCoverageScores, effectiveModels) 
            : null;
    }, [data]);

    const overallHybridExtremes = useMemo(() => {
        if (!data) return null;
        const { evaluationResults, effectiveModels } = data;
        const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;
        return (evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels)
            ? importedCalculateHybridScoreExtremes(evaluationResults.perPromptSimilarities, llmCoverageScores, effectiveModels, IDEAL_MODEL_ID)
            : null;
    }, [data]);

    const mostDifferentiatingPrompt = useMemo(() => {
        if (!data) return null;
        const { evaluationResults, effectiveModels, promptIds } = data;
        const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;
        return calculateMostDifferentiatingPrompt(
            evaluationResults?.perPromptSimilarities,
            llmCoverageScores,
            effectiveModels,
            promptIds,
        );
    }, [data]);

    const allModelCoverageRankings = useMemo(() => {
        if (!data) return null;
        const { evaluationResults, effectiveModels } = data;
        const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;
        return (llmCoverageScores && effectiveModels) 
            ? calculateAllModelCoverageRankings(llmCoverageScores, effectiveModels)
            : null;
    }, [data]);

    const allModelHybridRankings = useMemo(() => {
        if (!data) return null;
        const { evaluationResults, effectiveModels } = data;
        const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;
        return (evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels)
            ? calculateAllModelHybridRankings(evaluationResults.perPromptSimilarities, llmCoverageScores, effectiveModels, IDEAL_MODEL_ID)
            : null;
    }, [data]);

    const overallRunHybridStats = useMemo(() => {
        if (!data) return { average: null, stddev: null };
        const { evaluationResults, effectiveModels, promptIds } = data;
        const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;
        
        return (evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels && promptIds)
          ? calculateAverageHybridScoreForRun(evaluationResults.perPromptSimilarities, llmCoverageScores, effectiveModels, promptIds, IDEAL_MODEL_ID)
          : { average: null, stddev: null };
    }, [data]);

    const perSystemVariantHybridScores = useMemo(() => {
        const scores: Record<number, number | null> = {};
        if (!data) return scores;
        
        const { evaluationResults, effectiveModels, promptIds, config } = data;
        const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;
        
        if (config.systems && config.systems.length > 1 && evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels && promptIds) {
            for (let i = 0; i < config.systems.length; i++) {
                const modelsForVariant = effectiveModels.filter(modelId => {
                    const { systemPromptIndex } = parseEffectiveModelId(modelId);
                    return systemPromptIndex === i;
                });

                if (modelsForVariant.length > 0) {
                    const hybridStatsForVariant = calculateAverageHybridScoreForRun(
                        evaluationResults.perPromptSimilarities, llmCoverageScores, modelsForVariant, promptIds, IDEAL_MODEL_ID
                    );
                    scores[i] = hybridStatsForVariant?.average ?? null;
                } else {
                    scores[i] = null;
                }
            }
        }
        return scores;
    }, [data]);
    
    const perTemperatureVariantHybridScores = useMemo(() => {
        const scores: Record<string, number | null> = {};
        if (!data) return scores;
        
        const { evaluationResults, effectiveModels, promptIds, config } = data;
        const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;
        
        if (config.temperatures && config.temperatures.length > 1 && evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels && promptIds) {
            const uniqueTemperatures = [...new Set(config.temperatures)];
            for (const temp of uniqueTemperatures) {
                const modelsForTemp = effectiveModels.filter(modelId => {
                    const { temperature } = parseEffectiveModelId(modelId);
                    return temperature?.toString() === temp.toString();
                });

                if (modelsForTemp.length > 0) {
                    const hybridStatsForTemp = calculateAverageHybridScoreForRun(
                        evaluationResults.perPromptSimilarities, llmCoverageScores, modelsForTemp, promptIds, IDEAL_MODEL_ID
                    );
                    scores[temp.toString()] = hybridStatsForTemp?.average ?? null;
                } else {
                    scores[temp.toString()] = null;
                }
            }
        }
        return scores;
    }, [data]);

    return useMemo(() => ({
        overallIdealExtremes,
        overallAvgCoverageStats,
        overallCoverageExtremes,
        overallHybridExtremes,
        overallRunHybridStats,
        calculatedPerModelHybridScores,
        calculatedPerModelSemanticScores,
        perSystemVariantHybridScores,
        perTemperatureVariantHybridScores,
        mostDifferentiatingPrompt,
        allModelCoverageRankings,
        allModelHybridRankings,
    }), [
        overallIdealExtremes,
        overallAvgCoverageStats,
        overallCoverageExtremes,
        overallHybridExtremes,
        overallRunHybridStats,
        calculatedPerModelHybridScores,
        calculatedPerModelSemanticScores,
        perSystemVariantHybridScores,
        perTemperatureVariantHybridScores,
        mostDifferentiatingPrompt,
        allModelCoverageRankings,
        allModelHybridRankings,
    ]);
}; 