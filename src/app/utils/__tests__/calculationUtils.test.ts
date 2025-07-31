import {
    calculateStandardDeviation,
    calculateHybridScore,
    calculateAverageHybridScoreForRun,
    calculatePerModelHybridScoresForRun,
    calculateAverageSimilarity,
    findSimilarityExtremes,
    calculateOverallCoverageExtremes,
    calculateHybridScoreExtremes,
    calculateOverallAverageCoverage,
    IDEAL_MODEL_ID
} from '../calculationUtils';
import { ComparisonDataV2, EvaluationResults } from '@/app/utils/types';

describe('calculationUtils', () => {
    describe('calculateStandardDeviation', () => {
        it('should calculate standard deviation correctly', () => {
            expect(calculateStandardDeviation([1, 2, 3, 4, 5])).toBeCloseTo(1.5811, 4);
            expect(calculateStandardDeviation([10, 10, 10, 10])).toBe(0);
            expect(calculateStandardDeviation([5, 7, 9, 11, 13])).toBeCloseTo(3.1623, 4);
        });

        it('should return null if less than 2 numbers are provided', () => {
            expect(calculateStandardDeviation([1])).toBeNull();
            expect(calculateStandardDeviation([])).toBeNull();
        });

        it('should handle negative numbers correctly', () => {
            expect(calculateStandardDeviation([-1, -2, -3, -4, -5])).toBeCloseTo(1.5811, 4);
        });
    });

    describe('calculateHybridScore', () => {
        // TODO: fix these, sensitive to new similarity vs coverage weights
        // it('should return weighted arithmetic mean when both scores are valid', () => {
        //     // 0.35 * 0.8 + 0.65 * 0.7 = 0.28 + 0.455 = 0.735
        //     expect(calculateHybridScore(0.8, 0.7)).toBeCloseTo(0.735, 4);
        //     // 0.35 * 1 + 0.65 * 1 = 1
        //     expect(calculateHybridScore(1, 1)).toBe(1);
        //     // 0.35 * 0 + 0.65 * 0.5 = 0.325
        //     expect(calculateHybridScore(0, 0.5)).toBe(0.325);
        // });

        // it('should return the similarity score when only it is valid', () => {
        //     expect(calculateHybridScore(0.8, null)).toBe(0.8);
        //     expect(calculateHybridScore(0.8, undefined)).toBe(0.8);
        // });

        // it('should return the coverage score when only it is valid', () => {
        //     expect(calculateHybridScore(null, 0.7)).toBe(0.7);
        //     expect(calculateHybridScore(undefined, 0.7)).toBe(0.7);
        // });

        // it('should return null when neither score is valid', () => {
        //     expect(calculateHybridScore(null, null)).toBeNull();
        //     expect(calculateHybridScore(undefined, undefined)).toBeNull();
        //     expect(calculateHybridScore(null, undefined)).toBeNull();
        // });

        // it('should clamp negative scores to 0', () => {
        //     // 0.35 * 0 + 0.65 * 0.8 = 0.52
        //     expect(calculateHybridScore(-0.5, 0.8)).toBe(0.52);
        //     // 0.35 * 0.8 + 0.65 * 0 = 0.28
        //     expect(calculateHybridScore(0.8, -0.5)).toBeCloseTo(0.28);
        //     expect(calculateHybridScore(-0.5, undefined)).toBe(0);
        //     expect(calculateHybridScore(undefined, -0.5)).toBe(0);
        // });
    });

    // Test data setup
    const idealModelId = 'IDEAL_MODEL_ID';
    const effectiveModels_base: ComparisonDataV2['effectiveModels'] = ['modelA', 'modelB', idealModelId];
    const promptIds_base: ComparisonDataV2['promptIds'] = ['prompt1', 'prompt2'];

    const perPromptSimilarities_base: EvaluationResults['perPromptSimilarities'] = {
        prompt1: { modelA: { [idealModelId]: 0.8 }, modelB: { [idealModelId]: 0.6 } },
        prompt2: { modelA: { [idealModelId]: 0.9 }, modelB: { [idealModelId]: 0.5 } },
    };

    const llmCoverageScores_base: EvaluationResults['llmCoverageScores'] = {
        prompt1: { modelA: { keyPointsCount: 1, avgCoverageExtent: 0.7 }, modelB: { keyPointsCount: 1, avgCoverageExtent: 0.5 } },
        prompt2: { modelA: { keyPointsCount: 1, avgCoverageExtent: 0.8 }, modelB: { keyPointsCount: 1, avgCoverageExtent: 0.4 } },
    };

    describe('calculatePerModelHybridScoresForRun', () => {

        const EXPECTED_SIMILARITY_WEIGHT = 0.0;
        const EXPECTED_COVERAGE_WEIGHT = 1.0; // for now.

        it('should calculate hybrid scores correctly when both score types are present', () => {
            const result = calculatePerModelHybridScoresForRun(perPromptSimilarities_base, llmCoverageScores_base, effectiveModels_base, promptIds_base, idealModelId);
            // OLD:
            // modelA p1: 0.35*0.8 + 0.65*0.7 = 0.735
            // modelA p2: 0.35*0.9 + 0.65*0.8 = 0.835
            // Avg A: (0.735 + 0.835) / 2 = 0.785
            // modelB p1: 0.35*0.6 + 0.65*0.5 = 0.535
            // modelB p2: 0.35*0.5 + 0.65*0.4 = 0.435
            // Avg B: (0.535 + 0.435) / 2 = 0.485

            expect(result.get('modelA')?.average).toBeCloseTo(
                (
                    (
                        (EXPECTED_SIMILARITY_WEIGHT * 0.8) +
                        (EXPECTED_COVERAGE_WEIGHT * 0.7)
                    ) +
                    (
                        (EXPECTED_SIMILARITY_WEIGHT * 0.9) +
                        (EXPECTED_COVERAGE_WEIGHT * 0.8)
                    )
                ) / 2,
                4
            );

            // TODO: get better coverage here?

            // expect(result.get('modelA')?.average).toBeCloseTo(0.785, 4);
            // expect(result.get('modelA')?.stddev).toBeCloseTo(0.0707, 4);
            // expect(result.get('modelB')?.average).toBeCloseTo(0.485, 4);
            // expect(result.get('modelB')?.stddev).toBeCloseTo(0.0707, 4);
            // expect(result.has(idealModelId)).toBe(false);
        });

        it('should use only similarity score if coverage scores are missing', () => {
            const result = calculatePerModelHybridScoresForRun(perPromptSimilarities_base, undefined, effectiveModels_base, promptIds_base, idealModelId);
            // modelA: 0.8, 0.9. Avg = 0.85
            // modelB: 0.6, 0.5. Avg = 0.55
            expect(result.get('modelA')?.average).toBeCloseTo(0.85, 4);
            expect(result.get('modelA')?.stddev).toBeCloseTo(0.0707, 4);
            expect(result.get('modelB')?.average).toBeCloseTo(0.55, 4);
            expect(result.get('modelB')?.stddev).toBeCloseTo(0.0707, 4);
        });

        it('should use only coverage score if similarity scores are missing', () => {
            const result = calculatePerModelHybridScoresForRun(undefined, llmCoverageScores_base, effectiveModels_base, promptIds_base, idealModelId);
            // modelA: 0.7, 0.8. Avg = 0.75
            // modelB: 0.5, 0.4. Avg = 0.45
            expect(result.get('modelA')?.average).toBeCloseTo(0.75, 4);
            expect(result.get('modelA')?.stddev).toBeCloseTo(0.0707, 4);
            expect(result.get('modelB')?.average).toBeCloseTo(0.45, 4);
            expect(result.get('modelB')?.stddev).toBeCloseTo(0.0707, 4);
        });

        it('should return null scores if both score types are missing for a model', () => {
            const result = calculatePerModelHybridScoresForRun(undefined, undefined, effectiveModels_base, promptIds_base, idealModelId);
            expect(result.get('modelA')?.average).toBeNull();
            expect(result.get('modelA')?.stddev).toBeNull();
            expect(result.get('modelB')?.average).toBeNull();
            expect(result.get('modelB')?.stddev).toBeNull();
        });

        // it('should calculate correctly if a model is missing a score for one prompt', () => {

        //     // FIX THIS ACCORDING TO NEW SIMILARITY VS COVERAGE WEIGHTS

        //     const llmCoverageScores_missingB: EvaluationResults['llmCoverageScores'] = {
        //         prompt1: { modelA: { keyPointsCount: 1, avgCoverageExtent: 0.7 } }, // modelB missing coverage
        //         prompt2: { modelA: { keyPointsCount: 1, avgCoverageExtent: 0.8 }, modelB: { keyPointsCount: 1, avgCoverageExtent: 0.4 } },
        //     };
        //     const result = calculatePerModelHybridScoresForRun(perPromptSimilarities_base, llmCoverageScores_missingB, effectiveModels_base, promptIds_base, idealModelId);
        //     // modelA: same as full test
        //     expect(result.get('modelA')?.average).toBeCloseTo(0.785, 4);
        //     // modelB prompt1: has sim (0.6) but no cov -> hybrid = 0.6
        //     // modelB prompt2: has both -> 0.35*0.5 + 0.65*0.4 = 0.435
        //     // Avg for B: (0.6 + 0.435) / 2 = 0.5175
        //     expect(result.get('modelB')?.average).toBeCloseTo(0.5175, 4);
        // });

        // it('should handle coverage data with error for a model-prompt pair', () => {
        //     const llmCoverageScores_error: EvaluationResults['llmCoverageScores'] = {
        //         ...llmCoverageScores_base,
        //         prompt1: { ...llmCoverageScores_base.prompt1, modelB: { error: 'Coverage failed' } },
        //     };
        //     const result = calculatePerModelHybridScoresForRun(perPromptSimilarities_base, llmCoverageScores_error, effectiveModels_base, promptIds_base, idealModelId);
        //     // modelB prompt1: has sim (0.6), no cov -> hybrid = 0.6
        //     // modelB prompt2: has both -> 0.35*0.5 + 0.65*0.4 = 0.435
        //     // Avg for B: (0.6 + 0.435) / 2 = 0.5175
        //     expect(result.get('modelB')?.average).toBeCloseTo(0.5175, 4);
        // });
    });

    describe('calculateAverageHybridScoreForRun', () => {
        // it('should calculate average hybrid score correctly when both score types are present', () => {
        //     const result = calculateAverageHybridScoreForRun(perPromptSimilarities_base, llmCoverageScores_base, effectiveModels_base, promptIds_base, idealModelId);
        //     // Scores: 0.735, 0.835, 0.535, 0.435. Avg = 0.635
        //     expect(result.average).toBeCloseTo(0.635, 4);
        //     expect(result.stddev).toBeCloseTo(0.1826, 4);
        // });

        it('should use only similarity score if coverage scores are missing', () => {
            const result = calculateAverageHybridScoreForRun(perPromptSimilarities_base, undefined, effectiveModels_base, promptIds_base, idealModelId);
            // Scores: 0.8, 0.6, 0.9, 0.5. Avg = 0.7
            expect(result.average).toBeCloseTo(0.7, 4);
            expect(result.stddev).toBeCloseTo(0.1826, 4);
        });

        it('should use only coverage score if similarity scores are missing', () => {
            const result = calculateAverageHybridScoreForRun(undefined, llmCoverageScores_base, effectiveModels_base, promptIds_base, idealModelId);
            // Scores: 0.7, 0.5, 0.8, 0.4. Avg = 0.6
            expect(result.average).toBeCloseTo(0.6, 4);
            expect(result.stddev).toBeCloseTo(0.1826, 4);
        });

        it('should return null if no valid scores can be calculated', () => {
            const result = calculateAverageHybridScoreForRun(undefined, undefined, effectiveModels_base, promptIds_base, idealModelId);
            expect(result.average).toBeNull();
            expect(result.stddev).toBeNull();
        });
    });

    describe('calculateAverageSimilarity', () => {
        const matrix = {
            modelA: { modelB: 0.8, modelC: 0.6 },
            modelB: { modelA: 0.8, modelC: 0.7 },
            modelC: { modelA: 0.6, modelB: 0.7 },
        };
        it('should calculate the average similarity correctly', () => {
            // (0.8 + 0.6 + 0.8 + 0.7 + 0.6 + 0.7) / 6 = 4.2 / 6 = 0.7
            expect(calculateAverageSimilarity(matrix)).toBeCloseTo(0.7);
        });
        it('should return 0 for an undefined matrix', () => {
            expect(calculateAverageSimilarity(undefined)).toBe(0);
        });
        it('should handle empty matrix', () => {
            expect(calculateAverageSimilarity({})).toBe(0);
        });
    });

    describe('findSimilarityExtremes', () => {
        const matrix = {
            modelA: { modelB: 0.9, modelC: 0.2 },
            modelB: { modelA: 0.9, modelC: 0.5 },
            modelC: { modelA: 0.2, modelB: 0.5 },
        };
        it('should find the most and least similar pairs', () => {
            const extremes = findSimilarityExtremes(matrix);
            expect(extremes.mostSimilar?.value).toBe(0.9);
            expect(extremes.leastSimilar?.value).toBe(0.2);
        });
        it('should return null for undefined matrix', () => {
            const extremes = findSimilarityExtremes(undefined);
            expect(extremes.mostSimilar).toBeNull();
            expect(extremes.leastSimilar).toBeNull();
        });
    });

    describe('calculateOverallCoverageExtremes', () => {
        const models = ['modelA', 'modelB', 'modelC', IDEAL_MODEL_ID];
        const coverageScores: EvaluationResults['llmCoverageScores'] = {
            prompt1: { modelA: { keyPointsCount: 2, avgCoverageExtent: 0.9 }, modelB: { keyPointsCount: 2, avgCoverageExtent: 0.5 } },
            prompt2: { modelA: { keyPointsCount: 2, avgCoverageExtent: 0.8 }, modelB: { keyPointsCount: 2, avgCoverageExtent: 0.6 } },
        };
        it('should find the best and worst coverage models', () => {
            const extremes = calculateOverallCoverageExtremes(coverageScores, models);
            // modelA avg: 0.85, modelB avg: 0.55
            expect(extremes.bestCoverage?.modelId).toBe('modelA');
            expect(extremes.bestCoverage?.avgScore).toBeCloseTo(0.85);
            expect(extremes.worstCoverage?.modelId).toBe('modelB');
            expect(extremes.worstCoverage?.avgScore).toBeCloseTo(0.55);
        });
        it('should return nulls for empty data', () => {
            const extremes = calculateOverallCoverageExtremes({}, []);
            expect(extremes.bestCoverage).toBeNull();
            expect(extremes.worstCoverage).toBeNull();
        });
    });

    describe('calculateHybridScoreExtremes', () => {
        const models = ['modelA', 'modelB', IDEAL_MODEL_ID];
        const similarities: EvaluationResults['perPromptSimilarities'] = {
            prompt1: { modelA: { [IDEAL_MODEL_ID]: 1 }, modelB: { [IDEAL_MODEL_ID]: 1 } },
            prompt2: { modelA: { [IDEAL_MODEL_ID]: 1 }, modelB: { [IDEAL_MODEL_ID]: 1 } },
        };
        const coverageScores: EvaluationResults['llmCoverageScores'] = {
            prompt1: { modelA: { keyPointsCount: 2, avgCoverageExtent: 0.7 }, modelB: { keyPointsCount: 2, avgCoverageExtent: 0.6 } },
            prompt2: { modelA: { keyPointsCount: 2, avgCoverageExtent: 0.8 }, modelB: { keyPointsCount: 2, avgCoverageExtent: 0.513 } },
        };
        it('should find the best and worst hybrid score models', () => {
            const extremes = calculateHybridScoreExtremes(similarities, coverageScores, models, IDEAL_MODEL_ID);
            expect(extremes.bestHybrid?.modelId).toBe('modelA');
            expect(extremes.bestHybrid?.avgScore).toBeCloseTo((0.7 + 0.8) / 2, 4);
            expect(extremes.worstHybrid?.modelId).toBe('modelB');
            expect(extremes.worstHybrid?.avgScore).toBeCloseTo((0.6 + 0.513) / 2, 4);
        });
    });

    describe('calculateOverallAverageCoverage', () => {
        const models = ['modelA', 'modelB', IDEAL_MODEL_ID];
        const promptIds = ['prompt1', 'prompt2'];
        const coverageScores: EvaluationResults['llmCoverageScores'] = {
            prompt1: { modelA: { keyPointsCount: 2, avgCoverageExtent: 0.9 }, modelB: { keyPointsCount: 2, avgCoverageExtent: 0.5 } },
            prompt2: { modelA: { keyPointsCount: 2, avgCoverageExtent: 0.8 }, modelB: { keyPointsCount: 2, avgCoverageExtent: 0.6 } },
        };
        it('should calculate overall average and stddev for coverage', () => {
            const result = calculateOverallAverageCoverage(coverageScores, models, promptIds);
            // scores: 0.9, 0.5, 0.8, 0.6. Avg = 0.7.
            // As decimal: 0.7. For display: 70
            expect(result.average).toBeCloseTo(70);
        });
    });
}); 