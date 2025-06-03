import { calculateStandardDeviation, calculatePerModelHybridScoresForRun } from '../calculationUtils';
import { ComparisonDataV2 } from '@/app/utils/types';

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

  describe('calculatePerModelHybridScoresForRun', () => {
    const idealModelId = 'IDEAL_MODEL_ID';
    const effectiveModels_base: ComparisonDataV2['effectiveModels'] = ['modelA', 'modelB', idealModelId];
    const promptIds_base: ComparisonDataV2['promptIds'] = ['prompt1', 'prompt2'];

    const perPromptSimilarities_base: ComparisonDataV2['evaluationResults']['perPromptSimilarities'] = {
      prompt1: {
        modelA: { [idealModelId]: 0.8 },
        modelB: { [idealModelId]: 0.6 },
      },
      prompt2: {
        modelA: { [idealModelId]: 0.9 },
        modelB: { [idealModelId]: 0.5 },
      },
    };

    const llmCoverageScores_base: ComparisonDataV2['evaluationResults']['llmCoverageScores'] = {
      prompt1: {
        modelA: { keyPointsCount: 1, avgCoverageExtent: 0.7 },
        modelB: { keyPointsCount: 1, avgCoverageExtent: 0.5 },
      },
      prompt2: {
        modelA: { keyPointsCount: 1, avgCoverageExtent: 0.8 },
        modelB: { keyPointsCount: 1, avgCoverageExtent: 0.4 },
      },
    };

    it('should calculate hybrid scores correctly for valid inputs', () => {
      const result = calculatePerModelHybridScoresForRun(
        perPromptSimilarities_base,
        llmCoverageScores_base,
        effectiveModels_base,
        promptIds_base,
        idealModelId
      );

      // modelA: sqrt(0.8*0.7) = sqrt(0.56) ~= 0.7483, sqrt(0.9*0.8) = sqrt(0.72) ~= 0.8485
      // Avg for A: (0.7483 + 0.8485) / 2 ~= 0.7984
      // modelB: sqrt(0.6*0.5) = sqrt(0.3) ~= 0.5477, sqrt(0.5*0.4) = sqrt(0.2) ~= 0.4472
      // Avg for B: (0.5477 + 0.4472) / 2 ~= 0.4975
      expect(result.get('modelA')?.average).toBeCloseTo(0.7984, 4);
      expect(result.get('modelA')?.stddev).toBeCloseTo(0.0708, 4);
      expect(result.get('modelB')?.average).toBeCloseTo(0.4975, 4);
      expect(result.get('modelB')?.stddev).toBeCloseTo(0.0711, 4);
      expect(result.has(idealModelId)).toBe(false);
    });

    it('should return null scores if a model has no valid prompt scores', () => {
      const llmCoverageScores_missingB: ComparisonDataV2['evaluationResults']['llmCoverageScores'] = {
        prompt1: { modelA: { keyPointsCount: 1, avgCoverageExtent: 0.7 } }, // modelB missing
        prompt2: { modelA: { keyPointsCount: 1, avgCoverageExtent: 0.8 } }, // modelB missing
      };
      const result = calculatePerModelHybridScoresForRun(
        perPromptSimilarities_base, llmCoverageScores_missingB, effectiveModels_base, promptIds_base, idealModelId
      );
      expect(result.get('modelA')?.average).toBeCloseTo(0.7984, 4);
      expect(result.get('modelB')?.average).toBeNull();
      expect(result.get('modelB')?.stddev).toBeNull();
    });

    it('should return an empty map if essential top-level inputs are undefined, or model/prompt arrays are empty', () => {
      // Test undefined for optional perPromptSimilarities and llmCoverageScores
      expect(calculatePerModelHybridScoresForRun(undefined, llmCoverageScores_base, effectiveModels_base, promptIds_base, idealModelId).size).toBe(0);
      expect(calculatePerModelHybridScoresForRun(perPromptSimilarities_base, undefined, effectiveModels_base, promptIds_base, idealModelId).size).toBe(0);
      
      // Test empty arrays for required effectiveModels and promptIds
      expect(calculatePerModelHybridScoresForRun(perPromptSimilarities_base, llmCoverageScores_base, [], promptIds_base, idealModelId).size).toBe(0);
      
      const resultWithEmptyPrompts = calculatePerModelHybridScoresForRun(perPromptSimilarities_base, llmCoverageScores_base, effectiveModels_base, [], idealModelId);
      const expectedSizeWithEmptyPrompts = effectiveModels_base.filter(m => m !== idealModelId).length;
      expect(resultWithEmptyPrompts.size).toBe(expectedSizeWithEmptyPrompts);
      if (expectedSizeWithEmptyPrompts > 0) {
        expect(resultWithEmptyPrompts.get('modelA')?.average).toBeNull();
        expect(resultWithEmptyPrompts.get('modelA')?.stddev).toBeNull();
        expect(resultWithEmptyPrompts.get('modelB')?.average).toBeNull();
        expect(resultWithEmptyPrompts.get('modelB')?.stddev).toBeNull();
      }
    });

    it('should handle missing similarity or coverage for a specific prompt-model pair', () => {
      const perPromptSimilarities_missing: ComparisonDataV2['evaluationResults']['perPromptSimilarities'] = {
        prompt1: { modelA: { [idealModelId]: 0.8 } }, // modelB missing sim for prompt1
        prompt2: { modelA: { [idealModelId]: 0.9 }, modelB: { [idealModelId]: 0.5 } },
      };
      const result = calculatePerModelHybridScoresForRun(
        perPromptSimilarities_missing, llmCoverageScores_base, effectiveModels_base, promptIds_base, idealModelId
      );
      // modelA: sqrt(0.8*0.7) = 0.7483, sqrt(0.9*0.8) = 0.8485. Avg = 0.7984
      // modelB: prompt1 no score, prompt2 sqrt(0.5*0.4) = 0.4472. Avg = 0.4472 (only one score)
      expect(result.get('modelA')?.average).toBeCloseTo(0.7984, 4);
      expect(result.get('modelB')?.average).toBeCloseTo(0.4472, 4);
      expect(result.get('modelB')?.stddev).toBeNull(); // Only one score for modelB
    });

    it('should handle coverage data with error for a model-prompt pair', () => {
      const llmCoverageScores_error: ComparisonDataV2['evaluationResults']['llmCoverageScores'] = {
        ...llmCoverageScores_base,
        prompt1: {
          ...llmCoverageScores_base.prompt1,
          modelB: { error: 'Coverage failed' },
        },
      };
      const result = calculatePerModelHybridScoresForRun(
        perPromptSimilarities_base, llmCoverageScores_error, effectiveModels_base, promptIds_base, idealModelId
      );
      // modelB prompt1: no score. prompt2: sqrt(0.5*0.4) = 0.4472. Avg = 0.4472
      expect(result.get('modelB')?.average).toBeCloseTo(0.4472, 4);
      expect(result.get('modelB')?.stddev).toBeNull();
    });

    it('should clamp negative similarity or coverage scores to 0 before calculation', () => {
        const perPromptSimilarities_negative: ComparisonDataV2['evaluationResults']['perPromptSimilarities'] = {
            prompt1: { modelA: { [idealModelId]: -0.5 }, modelB: { [idealModelId]: 0.6 } },
            prompt2: { modelA: { [idealModelId]: 0.9 }, modelB: { [idealModelId]: 0.5 } },
        };
        const llmCoverageScores_negative: ComparisonDataV2['evaluationResults']['llmCoverageScores'] = {
            prompt1: { modelA: { keyPointsCount:1, avgCoverageExtent: 0.7 }, modelB: { keyPointsCount:1, avgCoverageExtent: -0.2 } },
            prompt2: { modelA: { keyPointsCount:1, avgCoverageExtent: 0.8 }, modelB: { keyPointsCount:1, avgCoverageExtent: 0.4 } },
        };
        const result = calculatePerModelHybridScoresForRun(
            perPromptSimilarities_negative, llmCoverageScores_negative, effectiveModels_base, promptIds_base, idealModelId
        );
        // modelA prompt1: sim -0.5 (becomes 0), cov 0.7 -> sqrt(0*0.7) = 0
        // modelA prompt2: sim 0.9, cov 0.8 -> sqrt(0.9*0.8) ~= 0.8485
        // Avg for A: (0 + 0.8485) / 2 = 0.42425
        expect(result.get('modelA')?.average).toBeCloseTo(0.4243, 4);

        // modelB prompt1: sim 0.6, cov -0.2 (becomes 0) -> sqrt(0.6*0) = 0
        // modelB prompt2: sim 0.5, cov 0.4 -> sqrt(0.5*0.4) ~= 0.4472
        // Avg for B: (0 + 0.4472) / 2 = 0.2236
        expect(result.get('modelB')?.average).toBeCloseTo(0.2236, 4);
    });
  });
}); 