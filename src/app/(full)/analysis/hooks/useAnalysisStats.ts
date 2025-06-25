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
} from '@/app/utils/calculationUtils';
import { parseEffectiveModelId } from '@/app/utils/modelIdUtils';

export const useAnalysisStats = (data: ComparisonDataV2 | null) => {
    return useMemo(() => {
        if (!data) {
          return {
            overallIdealExtremes: null,
            overallAvgCoverageStats: null,
            overallCoverageExtremes: null,
            overallHybridExtremes: null,
            overallRunHybridStats: { average: null, stddev: null },
            calculatedPerModelHybridScores: new Map<string, { average: number | null; stddev: number | null }>(),
            calculatedPerModelSemanticScores: new Map<string, { average: number | null; stddev: number | null }>(),
            perSystemVariantHybridScores: {},
            perTemperatureVariantHybridScores: {},
            mostDifferentiatingPrompt: null,
          };
        }

        const { evaluationResults, effectiveModels, promptIds, config } = data;
        const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;

        const overallIdealExtremes = evaluationResults?.similarityMatrix ? findIdealExtremes(evaluationResults.similarityMatrix, IDEAL_MODEL_ID) : null;
        
        const overallAvgCoverageStats = (llmCoverageScores && effectiveModels && promptIds) 
          ? importedCalculateOverallAverageCoverage(llmCoverageScores, effectiveModels, promptIds) 
          : null;

        const overallCoverageExtremes = (llmCoverageScores && effectiveModels) 
          ? importedCalculateOverallCoverageExtremes(llmCoverageScores, effectiveModels) 
          : null;

        const overallHybridExtremes = (evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels)
          ? importedCalculateHybridScoreExtremes(evaluationResults.perPromptSimilarities, llmCoverageScores, effectiveModels, IDEAL_MODEL_ID)
          : null;

        const mostDifferentiatingPrompt = evaluationResults?.perPromptSimilarities
          ? calculateMostDifferentiatingPrompt(evaluationResults.perPromptSimilarities)
          : null;

        const overallRunHybridStats = (evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels && promptIds)
          ? calculateAverageHybridScoreForRun(evaluationResults.perPromptSimilarities, llmCoverageScores, effectiveModels, promptIds, IDEAL_MODEL_ID)
          : { average: null, stddev: null };

        let calculatedPerModelHybridScores = new Map<string, { average: number | null; stddev: number | null }>();
        if (evaluationResults?.perModelHybridScores) {
          let scoresToSet = evaluationResults.perModelHybridScores;
          if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
            scoresToSet = new Map(Object.entries(scoresToSet));
          }
          calculatedPerModelHybridScores = scoresToSet as Map<string, { average: number | null; stddev: number | null }>;
        }
        
        let calculatedPerModelSemanticScores = new Map<string, { average: number | null; stddev: number | null }>();
        if (evaluationResults?.perModelSemanticScores) {
          let scoresToSet = evaluationResults.perModelSemanticScores;
          if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
            scoresToSet = new Map(Object.entries(scoresToSet));
          }
          calculatedPerModelSemanticScores = scoresToSet as Map<string, { average: number | null; stddev: number | null }>;
        }

        const perSystemVariantHybridScores: Record<number, number | null> = {};
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
                    perSystemVariantHybridScores[i] = hybridStatsForVariant?.average ?? null;
                } else {
                    perSystemVariantHybridScores[i] = null;
                }
            }
        }
        
        const perTemperatureVariantHybridScores: Record<string, number | null> = {};
        if (config.temperatures && config.temperatures.length > 1 && evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels && promptIds) {
            for (const temp of config.temperatures) {
                const modelsForTemp = effectiveModels.filter(modelId => {
                    const { temperature } = parseEffectiveModelId(modelId);
                    return temperature === temp;
                });

                if (modelsForTemp.length > 0) {
                    const hybridStatsForTemp = calculateAverageHybridScoreForRun(
                        evaluationResults.perPromptSimilarities, llmCoverageScores, modelsForTemp, promptIds, IDEAL_MODEL_ID
                    );
                    perTemperatureVariantHybridScores[temp.toFixed(1)] = hybridStatsForTemp?.average ?? null;
                } else {
                    perTemperatureVariantHybridScores[temp.toFixed(1)] = null;
                }
            }
        }
        
        return { 
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
        };
    }, [data]);
}; 