import { aggregateCoverageScores, evaluateFunctionPoints } from '../coverage-logic';
import { PointAssessment } from '@/types/shared';
import { NormalizedPoint, ComparisonConfig, PromptConfig } from '../../types/cli_types';
import { PointFunctionContext } from '@/point-functions/types';

describe('aggregateCoverageScores', () => {
    it('should return 0 for an empty array of assessments', () => {
        expect(aggregateCoverageScores([])).toBe(0);
    });

    it('should correctly calculate the average of unweighted assessments', () => {
        const assessments: PointAssessment[] = [
            { keyPointText: 'p1', coverageExtent: 1.0 },
            { keyPointText: 'p2', coverageExtent: 0.5 },
            { keyPointText: 'p3', coverageExtent: 0.0 },
        ];
        // (1.0 + 0.5 + 0.0) / 3 = 0.5
        expect(aggregateCoverageScores(assessments)).toBe(0.5);
    });

    it('should correctly calculate a simple weighted average', () => {
        const assessments: PointAssessment[] = [
            { keyPointText: 'p1', coverageExtent: 1.0, multiplier: 2.0 }, // Weighted score: 2.0
            { keyPointText: 'p2', coverageExtent: 0.5, multiplier: 1.0 }, // Weighted score: 0.5
        ];
        // Total score: 2.5, Total weight: 3.0. Avg: 2.5 / 3.0
        expect(aggregateCoverageScores(assessments)).toBeCloseTo(0.8333);
    });

    it('should handle assessments with undefined scores gracefully', () => {
        const assessments: PointAssessment[] = [
            { keyPointText: 'p1', coverageExtent: 1.0 },
            { keyPointText: 'p2', coverageExtent: undefined }, // This should be ignored
            { keyPointText: 'p3', coverageExtent: 0.5 },
        ];
        // (1.0 + 0.5) / 2 = 0.75
        expect(aggregateCoverageScores(assessments)).toBe(0.75);
    });

    it('should return 0 if all assessments have undefined scores', () => {
        const assessments: PointAssessment[] = [
            { keyPointText: 'p1', coverageExtent: undefined },
            { keyPointText: 'p2', coverageExtent: undefined },
        ];
        expect(aggregateCoverageScores(assessments)).toBe(0);
    });

    it('should handle a mix of weighted and unweighted assessments', () => {
        const assessments: PointAssessment[] = [
            { keyPointText: 'p1', coverageExtent: 1.0, multiplier: 3.0 }, // Weighted score: 3.0
            { keyPointText: 'p2', coverageExtent: 0.2 }, // Unweighted, multiplier defaults to 1. Weighted score: 0.2
            { keyPointText: 'p3', coverageExtent: 0.8, multiplier: 0.5 }, // Weighted score: 0.4
        ];
        // Total score: 3.0 + 0.2 + 0.4 = 3.6
        // Total weight: 3.0 + 1.0 + 0.5 = 4.5
        // Avg: 3.6 / 4.5 = 0.8
        expect(aggregateCoverageScores(assessments)).toBe(0.8);
    });

    it('should handle assessments where coverage extent is 0', () => {
        const assessments: PointAssessment[] = [
            { keyPointText: 'p1', coverageExtent: 0.0, multiplier: 2.0 },
            { keyPointText: 'p2', coverageExtent: 0.0, multiplier: 1.0 },
        ];
        expect(aggregateCoverageScores(assessments)).toBe(0);
    });

    describe('Alternative Paths (OR logic)', () => {
        it('should evaluate alternative paths and return the best path score', () => {
            const assessments: PointAssessment[] = [
                // Path 1: Average score of 0.4
                { keyPointText: 'path1-point1', coverageExtent: 0.8, pathId: 'path_1' },
                { keyPointText: 'path1-point2', coverageExtent: 0.0, pathId: 'path_1' },
                // Path 2: Average score of 0.9
                { keyPointText: 'path2-point1', coverageExtent: 0.8, pathId: 'path_2' },
                { keyPointText: 'path2-point2', coverageExtent: 1.0, pathId: 'path_2' },
            ];
            // Path 1: (0.8 + 0.0) / 2 = 0.4
            // Path 2: (0.8 + 1.0) / 2 = 0.9
            // Should return max(0.4, 0.9) = 0.9
            expect(aggregateCoverageScores(assessments)).toBe(0.9);
        });

        it('should handle weighted points within alternative paths', () => {
            const assessments: PointAssessment[] = [
                // Path 1: Weighted average
                { keyPointText: 'path1-point1', coverageExtent: 1.0, multiplier: 3.0, pathId: 'path_1' },
                { keyPointText: 'path1-point2', coverageExtent: 0.0, multiplier: 1.0, pathId: 'path_1' },
                // Path 2: Weighted average
                { keyPointText: 'path2-point1', coverageExtent: 0.5, multiplier: 2.0, pathId: 'path_2' },
                { keyPointText: 'path2-point2', coverageExtent: 0.8, multiplier: 1.0, pathId: 'path_2' },
            ];
            // Path 1: (1.0 * 3.0 + 0.0 * 1.0) / (3.0 + 1.0) = 3.0 / 4.0 = 0.75
            // Path 2: (0.5 * 2.0 + 0.8 * 1.0) / (2.0 + 1.0) = 1.8 / 3.0 = 0.6
            // Should return max(0.75, 0.6) = 0.75
            expect(aggregateCoverageScores(assessments)).toBe(0.75);
        });

        it('should handle mixed alternative paths and required points', () => {
            const assessments: PointAssessment[] = [
                // Required points (no pathId)
                { keyPointText: 'required1', coverageExtent: 0.8 },
                { keyPointText: 'required2', coverageExtent: 0.6 },
                // Alternative path 1
                { keyPointText: 'path1-point1', coverageExtent: 0.2, pathId: 'path_1' },
                { keyPointText: 'path1-point2', coverageExtent: 0.4, pathId: 'path_1' },
                // Alternative path 2
                { keyPointText: 'path2-point1', coverageExtent: 1.0, pathId: 'path_2' },
            ];
            // Required points average: (0.8 + 0.6) / 2 = 0.7
            // Path 1: (0.2 + 0.4) / 2 = 0.3
            // Path 2: 1.0 / 1 = 1.0
            // Best path is path 2 with 1.0
            // Final score: average of required points (0.7) and best path (1.0) = (0.7 + 1.0) / 2 = 0.85
            expect(aggregateCoverageScores(assessments)).toBe(0.85);
        });

        it('should handle single-point alternative paths', () => {
            const assessments: PointAssessment[] = [
                { keyPointText: 'path1-only', coverageExtent: 0.3, pathId: 'path_1' },
                { keyPointText: 'path2-only', coverageExtent: 0.9, pathId: 'path_2' },
                { keyPointText: 'path3-only', coverageExtent: 0.1, pathId: 'path_3' },
            ];
            // Each path has only one point, so path scores are: 0.3, 0.9, 0.1
            // Should return max(0.3, 0.9, 0.1) = 0.9
            expect(aggregateCoverageScores(assessments)).toBe(0.9);
        });

        it('should handle alternative paths with some undefined scores', () => {
            const assessments: PointAssessment[] = [
                // Path 1: One valid, one undefined
                { keyPointText: 'path1-point1', coverageExtent: 0.8, pathId: 'path_1' },
                { keyPointText: 'path1-point2', coverageExtent: undefined, pathId: 'path_1' },
                // Path 2: Both valid
                { keyPointText: 'path2-point1', coverageExtent: 0.5, pathId: 'path_2' },
                { keyPointText: 'path2-point2', coverageExtent: 0.7, pathId: 'path_2' },
            ];
            // Path 1: 0.8 (undefined scores ignored)
            // Path 2: (0.5 + 0.7) / 2 = 0.6
            // Should return max(0.8, 0.6) = 0.8
            expect(aggregateCoverageScores(assessments)).toBe(0.8);
        });

        it('should handle alternative paths where entire path has undefined scores', () => {
            const assessments: PointAssessment[] = [
                // Path 1: All undefined (should be ignored)
                { keyPointText: 'path1-point1', coverageExtent: undefined, pathId: 'path_1' },
                { keyPointText: 'path1-point2', coverageExtent: undefined, pathId: 'path_1' },
                // Path 2: Valid scores
                { keyPointText: 'path2-point1', coverageExtent: 0.4, pathId: 'path_2' },
                { keyPointText: 'path2-point2', coverageExtent: 0.6, pathId: 'path_2' },
            ];
            // Path 1: ignored (all undefined)
            // Path 2: (0.4 + 0.6) / 2 = 0.5
            // Should return 0.5
            expect(aggregateCoverageScores(assessments)).toBe(0.5);
        });

        it('should return 0 if all alternative paths have undefined scores', () => {
            const assessments: PointAssessment[] = [
                { keyPointText: 'path1-point1', coverageExtent: undefined, pathId: 'path_1' },
                { keyPointText: 'path2-point1', coverageExtent: undefined, pathId: 'path_2' },
            ];
            expect(aggregateCoverageScores(assessments)).toBe(0);
        });
    });

    describe('Backwards Compatibility', () => {
        it('should maintain backwards compatibility with assessments without pathId', () => {
            const assessments: PointAssessment[] = [
                { keyPointText: 'p1', coverageExtent: 0.8 },
                { keyPointText: 'p2', coverageExtent: 0.6 },
                { keyPointText: 'p3', coverageExtent: 1.0 },
            ];
            // Should work exactly like the old behavior: (0.8 + 0.6 + 1.0) / 3 = 0.8
            expect(aggregateCoverageScores(assessments)).toBeCloseTo(0.8);
        });

        it('should handle empty pathId same as no pathId', () => {
            const assessments: PointAssessment[] = [
                { keyPointText: 'p1', coverageExtent: 0.8, pathId: '' },
                { keyPointText: 'p2', coverageExtent: 0.6, pathId: undefined },
                { keyPointText: 'p3', coverageExtent: 1.0 }, // no pathId
            ];
            // Should treat all as required points: (0.8 + 0.6 + 1.0) / 3 = 0.8
            expect(aggregateCoverageScores(assessments)).toBeCloseTo(0.8);
        });
    });
});

describe('evaluateFunctionPoints', () => {
    const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        success: jest.fn(),
    };

    const mockContext: PointFunctionContext = {
        config: {} as ComparisonConfig,
        prompt: {} as PromptConfig,
        modelId: 'test-model',
        logger: mockLogger,
    };

    beforeEach(() => {
        mockLogger.warn.mockClear();
    });

    it('should correctly evaluate a passing "contains" function', async () => {
        const points: NormalizedPoint[] = [{
            id: '1',
            displayText: 'Function: contains("world")',
            isFunction: true,
            functionName: 'contains',
            functionArgs: 'world',
            isInverted: false,
            multiplier: 1.0,
        }];
        const assessments = await evaluateFunctionPoints(points, 'hello world', mockContext);
        expect(assessments).toHaveLength(1);
        expect(assessments[0].coverageExtent).toBe(1.0);
        expect(assessments[0].error).toBeUndefined();
    });

    it('should correctly evaluate a failing "contains" function', async () => {
        const points: NormalizedPoint[] = [{
            id: '1',
            displayText: 'Function: contains("goodbye")',
            isFunction: true,
            functionName: 'contains',
            functionArgs: 'goodbye',
            isInverted: false,
            multiplier: 1.0,
        }];
        const assessments = await evaluateFunctionPoints(points, 'hello world', mockContext);
        expect(assessments).toHaveLength(1);
        expect(assessments[0].coverageExtent).toBe(0.0);
        expect(assessments[0].error).toBeUndefined();
    });

    it('should invert the score for a passing "contains" function when isInverted is true', async () => {
        const points: NormalizedPoint[] = [{
            id: '1',
            displayText: 'Function: contains("world")',
            isFunction: true,
            functionName: 'contains',
            functionArgs: 'world',
            isInverted: true,
            multiplier: 1.0,
        }];
        const assessments = await evaluateFunctionPoints(points, 'hello world', mockContext);
        expect(assessments).toHaveLength(1);
        expect(assessments[0].coverageExtent).toBe(0.0);
        expect(assessments[0].isInverted).toBe(true);
    });

    it('should invert the score for a failing "contains" function when isInverted is true', async () => {
        const points: NormalizedPoint[] = [{
            id: '1',
            displayText: 'Function: contains("goodbye")',
            isFunction: true,
            functionName: 'contains',
            functionArgs: 'goodbye',
            isInverted: true,
            multiplier: 1.0,
        }];
        const assessments = await evaluateFunctionPoints(points, 'hello world', mockContext);
        expect(assessments).toHaveLength(1);
        expect(assessments[0].coverageExtent).toBe(1.0);
        expect(assessments[0].isInverted).toBe(true);
    });

    it('should return an assessment with an error for an unknown function', async () => {
        const points: NormalizedPoint[] = [{
            id: '1',
            displayText: 'Function: unknown("test")',
            isFunction: true,
            functionName: 'unknown',
            functionArgs: 'test',
            isInverted: false,
            multiplier: 1.0,
        }];
        const assessments = await evaluateFunctionPoints(points, 'hello world', mockContext);
        expect(assessments).toHaveLength(1);
        expect(assessments[0].coverageExtent).toBeUndefined();
        expect(assessments[0].error).toBe("Unknown point function: 'unknown'");
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Function 'unknown' not found"));
    });

    it('should handle point functions that return a numeric grade', async () => {
        const points: NormalizedPoint[] = [{
            id: '1',
            displayText: 'Function: word_count_between([1, 5])',
            isFunction: true,
            functionName: 'word_count_between',
            functionArgs: [1, 5],
            isInverted: false,
            multiplier: 1.0,
        }];
        // "hello world" has 2 words, which is between 1 and 5. The function should return 1.0.
        const assessments = await evaluateFunctionPoints(points, 'hello world', mockContext);
        expect(assessments).toHaveLength(1);
        expect(assessments[0].coverageExtent).toBe(1.0);
    });

     it('should invert a numeric grade when isInverted is true', async () => {
        const points: NormalizedPoint[] = [{
            id: '1',
            displayText: 'Function: word_count_between([1, 5])',
            isFunction: true,
            functionName: 'word_count_between',
            functionArgs: [1, 5],
            isInverted: true,
            multiplier: 1.0,
        }];
        // "hello world" has 2 words. The raw score is 1.0, inverted should be 0.0.
        const assessments = await evaluateFunctionPoints(points, 'hello world', mockContext);
        expect(assessments).toHaveLength(1);
        expect(assessments[0].coverageExtent).toBe(0.0);
    });
}); 