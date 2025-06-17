import {
    calculateStandardDeviation,
    calculateHybridScore,
    calculateAverageHybridScoreForRun,
    calculatePerModelHybridScoresForRun
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
        it('should return geometric mean when both scores are valid', () => {
            expect(calculateHybridScore(0.8, 0.7)).toBeCloseTo(Math.sqrt(0.56), 4);
            expect(calculateHybridScore(1, 1)).toBe(1);
            expect(calculateHybridScore(0, 0.5)).toBe(0);
        });

        it('should return the similarity score when only it is valid', () => {
            expect(calculateHybridScore(0.8, null)).toBe(0.8);
            expect(calculateHybridScore(0.8, undefined)).toBe(0.8);
        });

        it('should return the coverage score when only it is valid', () => {
            expect(calculateHybridScore(null, 0.7)).toBe(0.7);
            expect(calculateHybridScore(undefined, 0.7)).toBe(0.7);
        });

        it('should return null when neither score is valid', () => {
            expect(calculateHybridScore(null, null)).toBeNull();
            expect(calculateHybridScore(undefined, undefined)).toBeNull();
            expect(calculateHybridScore(null, undefined)).toBeNull();
        });

        it('should clamp negative scores to 0', () => {
            expect(calculateHybridScore(-0.5, 0.8)).toBe(Math.sqrt(0 * 0.8));
            expect(calculateHybridScore(0.8, -0.5)).toBe(Math.sqrt(0.8 * 0));
            expect(calculateHybridScore(-0.5, undefined)).toBe(0);
            expect(calculateHybridScore(undefined, -0.5)).toBe(0);
        });
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
        it('should calculate hybrid scores correctly when both score types are present', () => {
            const result = calculatePerModelHybridScoresForRun(perPromptSimilarities_base, llmCoverageScores_base, effectiveModels_base, promptIds_base, idealModelId);
            // modelA: sqrt(0.8*0.7)=0.7483, sqrt(0.9*0.8)=0.8485. Avg = 0.7984
            // modelB: sqrt(0.6*0.5)=0.5477, sqrt(0.5*0.4)=0.4472. Avg = 0.4975
            expect(result.get('modelA')?.average).toBeCloseTo(0.7984, 4);
            expect(result.get('modelA')?.stddev).toBeCloseTo(0.0708, 4);
            expect(result.get('modelB')?.average).toBeCloseTo(0.4975, 4);
            expect(result.get('modelB')?.stddev).toBeCloseTo(0.0711, 4);
            expect(result.has(idealModelId)).toBe(false);
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

        it('should calculate correctly if a model is missing a score for one prompt', () => {
            const llmCoverageScores_missingB: EvaluationResults['llmCoverageScores'] = {
                prompt1: { modelA: { keyPointsCount: 1, avgCoverageExtent: 0.7 } }, // modelB missing coverage
                prompt2: { modelA: { keyPointsCount: 1, avgCoverageExtent: 0.8 }, modelB: { keyPointsCount: 1, avgCoverageExtent: 0.4 } },
            };
            const result = calculatePerModelHybridScoresForRun(perPromptSimilarities_base, llmCoverageScores_missingB, effectiveModels_base, promptIds_base, idealModelId);
            // modelA: same as full test
            expect(result.get('modelA')?.average).toBeCloseTo(0.7984, 4);
            // modelB prompt1: has sim (0.6) but no cov -> hybrid = 0.6
            // modelB prompt2: has both -> sqrt(0.5*0.4) = 0.4472
            // Avg for B: (0.6 + 0.4472) / 2 = 0.5236
            expect(result.get('modelB')?.average).toBeCloseTo(0.5236, 4);
        });

        it('should handle coverage data with error for a model-prompt pair', () => {
            const llmCoverageScores_error: EvaluationResults['llmCoverageScores'] = {
                ...llmCoverageScores_base,
                prompt1: { ...llmCoverageScores_base.prompt1, modelB: { error: 'Coverage failed' } },
            };
            const result = calculatePerModelHybridScoresForRun(perPromptSimilarities_base, llmCoverageScores_error, effectiveModels_base, promptIds_base, idealModelId);
            // modelB prompt1: has sim (0.6), no cov -> hybrid = 0.6
            // modelB prompt2: has both -> sqrt(0.5*0.4) = 0.4472
            // Avg for B: (0.6 + 0.4472) / 2 = 0.5236
            expect(result.get('modelB')?.average).toBeCloseTo(0.5236, 4);
        });
    });

    describe('calculateAverageHybridScoreForRun', () => {
        it('should calculate average hybrid score correctly when both score types are present', () => {
            const result = calculateAverageHybridScoreForRun(perPromptSimilarities_base, llmCoverageScores_base, effectiveModels_base, promptIds_base, idealModelId);
            // Scores: 0.7483, 0.8485, 0.5477, 0.4472. Avg = 0.6479
            expect(result.average).toBeCloseTo(0.6479, 4);
            expect(result.stddev).toBeCloseTo(0.1832, 4);
        });

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
}); 