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