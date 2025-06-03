import { LLMCoverageEvaluator } from '../llm-coverage-evaluator';
import { EvaluationInput, PointDefinition, PromptConfig, ComparisonConfig, PromptResponseData, ModelResponseDetail, IDEAL_MODEL_ID, CoverageResult } from '@/cli/types/comparison_v2';
import { getConfig } from '@/cli/config';

type Logger = ReturnType<typeof getConfig>['logger'];

// Define mock functions separately for actual logger methods
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockSuccess = jest.fn(); // Added based on observed usage

// Create the typed mockLogger object
const mockLogger: Logger = {
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
    success: mockSuccess, // Added
    // debug, fatal, trace, silent are removed as they don't seem to be part of the actual Logger type
};

// Mock extractKeyPoints
const mockExtractKeyPoints = jest.fn();
// Mock evaluateSinglePoint (part of LLMCoverageEvaluator, so we might spyOn it or test its effects indirectly)

jest.mock('@/cli/services/llm-evaluation-service', () => ({
    extractKeyPoints: (...args: any[]) => mockExtractKeyPoints(...args),
}));

// Mock pointFunctions (or specific functions)
const mockContains = jest.fn();
const mockMatches = jest.fn();
const mockUnknownFunction = jest.fn();

jest.mock('@/point-functions', () => ({
    pointFunctions: {
        contains: (...args: any[]) => mockContains(...args),
        matches: (...args: any[]) => mockMatches(...args),
        // Not including mockUnknownFunction here to test 'function not found'
    },
}));


describe('LLMCoverageEvaluator', () => {
    let evaluator: LLMCoverageEvaluator;

    beforeEach(() => {
        evaluator = new LLMCoverageEvaluator(mockLogger);
        mockExtractKeyPoints.mockReset();
        mockContains.mockReset();
        mockMatches.mockReset();
        // Clear individual mock functions
        mockInfo.mockClear();
        mockWarn.mockClear();
        mockError.mockClear();
        mockSuccess.mockClear(); // Added
    });

    const createMockEvaluationInput = (
        promptId: string,
        points: PointDefinition[],
        modelResponseText: string = "Test response",
        idealResponseText?: string | null,

    ): EvaluationInput => {
        const promptConfig: PromptConfig = {
            id: promptId,
            promptText: `Prompt for ${promptId}`,
            points: points,
            idealResponse: idealResponseText,
        };
        const comparisonConfig: ComparisonConfig = {
            id: 'test-config',
            title: 'Test Config',
            models: ['model1'],
            prompts: [promptConfig],
        };
        const modelResponses = new Map<string, ModelResponseDetail>();
        modelResponses.set('model1', { responseText: modelResponseText, hasError: false, errorMessage: undefined, systemPromptUsed: null });
        if (idealResponseText) {
             modelResponses.set(IDEAL_MODEL_ID, { responseText: idealResponseText, hasError: false, errorMessage: undefined, systemPromptUsed: null });
        }

        const promptData: PromptResponseData = {
            promptId: promptId,
            promptText: `Prompt for ${promptId}`,
            idealResponseText: idealResponseText || null,
            modelResponses: modelResponses,
        };
        return {
            promptData: promptData,
            config: comparisonConfig,
            effectiveModelIds: ['model1', ...(idealResponseText ? [IDEAL_MODEL_ID] : [])],
        };
    };

    it('should process a string point using evaluateSinglePoint logic', async () => {
        const points: PointDefinition[] = ['This is a string point'];
        const input = createMockEvaluationInput('prompt1', points);

        // Mock the internal evaluateSinglePoint
        const evaluateSinglePointSpy = jest.spyOn(LLMCoverageEvaluator.prototype as any, 'evaluateSinglePoint')
            .mockResolvedValue({ coverage_extent: 0.8, reflection: 'String point covered' });

        const result = await evaluator.evaluate([input]);

        expect(evaluateSinglePointSpy).toHaveBeenCalledWith(input.promptData.modelResponses.get('model1')?.responseText, points[0], input.promptData.promptText);
        expect(result.llmCoverageScores?.['prompt1']?.['model1']).toEqual(expect.objectContaining({
            avgCoverageExtent: 0.8,
            keyPointsCount: 1,
            pointAssessments: expect.arrayContaining([
                expect.objectContaining({ keyPointText: points[0], coverageExtent: 0.8, reflection: 'String point covered' })
            ])
        }));
        evaluateSinglePointSpy.mockRestore();
    });

    it('should process a "contains" function point correctly', async () => {
        const points: PointDefinition[] = [['contains', 'specific text']];
        const input = createMockEvaluationInput('prompt2', points, 'This response contains specific text.');
        mockContains.mockReturnValue(true); // Mock behavior of 'contains' function

        const result = await evaluator.evaluate([input]);

        expect(mockContains).toHaveBeenCalledWith('This response contains specific text.', 'specific text', expect.any(Object));
        const model1Result = result.llmCoverageScores?.['prompt2']?.['model1'] as CoverageResult & { pointAssessments: any[] }; // Type assertion
        expect(model1Result).toEqual(expect.objectContaining({
            avgCoverageExtent: 1.0, // true becomes 1.0
            keyPointsCount: 1,
        }));
        expect(model1Result.pointAssessments[0]).toEqual(expect.objectContaining({
            keyPointText: 'Function: contains("specific text")',
            coverageExtent: 1.0,
            reflection: 'Function \'contains\' evaluated to true. Score: 1'
        }));
    });

    it('should process a "matches" function point correctly that returns false', async () => {
        const points: PointDefinition[] = [['matches', '^pattern$']];
        const input = createMockEvaluationInput('prompt3', points, 'this does not match');
        mockMatches.mockReturnValue(false); // Mock behavior of 'matches' function

        const result = await evaluator.evaluate([input]);

        expect(mockMatches).toHaveBeenCalledWith('this does not match', '^pattern$', expect.any(Object));
        const model1Result = result.llmCoverageScores?.['prompt3']?.['model1'] as CoverageResult & { pointAssessments: any[] };
        expect(model1Result).toEqual(expect.objectContaining({
            avgCoverageExtent: 0.0, // false becomes 0.0
            keyPointsCount: 1,
        }));
        expect(model1Result.pointAssessments[0]).toEqual(expect.objectContaining({
            keyPointText: 'Function: matches("^pattern$")',
            coverageExtent: 0.0,
            reflection: 'Function \'matches\' evaluated to false. Score: 0'
        }));
    });

    it('should handle an unknown point function', async () => {
        const points: PointDefinition[] = [['unknownFunction', 'someArg']];
        const input = createMockEvaluationInput('prompt4', points);

        const result = await evaluator.evaluate([input]);
        const model1Result = result.llmCoverageScores?.['prompt4']?.['model1'] as CoverageResult & { pointAssessments: any[] };

        expect(model1Result.pointAssessments[0]).toEqual(expect.objectContaining({
            keyPointText: 'Function: unknownFunction("someArg")',
            coverageExtent: 0,
            error: 'Point function \'unknownFunction\' not found.',
        }));
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Function 'unknownFunction' not found"));
    });

    it('should handle a point function returning an error object', async () => {
        const points: PointDefinition[] = [['contains', 123]]; // Invalid arg for contains
        const input = createMockEvaluationInput('prompt5', points);
        mockContains.mockReturnValue({ error: 'Invalid arg type' });

        const result = await evaluator.evaluate([input]);
        const model1Result = result.llmCoverageScores?.['prompt5']?.['model1'] as CoverageResult & { pointAssessments: any[] };

        expect(model1Result.pointAssessments[0]).toEqual(expect.objectContaining({
            keyPointText: 'Function: contains(123)',
            coverageExtent: 0,
            error: 'Invalid arg type',
            reflection: 'Function \'contains\' returned error: Invalid arg type'
        }));
    });

    it('should handle a point function returning an out-of-range number', async () => {
        const points: PointDefinition[] = [['matches', 'pattern']];
        const input = createMockEvaluationInput('prompt6', points);
        mockMatches.mockReturnValue(5); // Out of range

        const result = await evaluator.evaluate([input]);
        const model1Result = result.llmCoverageScores?.['prompt6']?.['model1'] as CoverageResult & { pointAssessments: any[] };

        expect(model1Result.pointAssessments[0]).toEqual(expect.objectContaining({
            keyPointText: 'Function: matches("pattern")',
            coverageExtent: 0,
            error: 'Function \'matches\' returned out-of-range score: 5',
            reflection: 'Error: Function \'matches\' returned out-of-range score: 5'
        }));
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Function 'matches' returned out-of-range score: 5"));
    });

    it('should use extracted key points if no explicit points and idealResponse is provided', async () => {
        const input = createMockEvaluationInput('prompt7', [], undefined, 'Ideal response with point one and point two.');
        mockExtractKeyPoints.mockResolvedValue({ key_points: ['point one', 'point two'] });
        
        const evaluateSinglePointSpy = jest.spyOn(LLMCoverageEvaluator.prototype as any, 'evaluateSinglePoint')
            .mockResolvedValueOnce({ coverage_extent: 0.7, reflection: 'Point one covered' })
            .mockResolvedValueOnce({ coverage_extent: 0.9, reflection: 'Point two covered' });

        const result = await evaluator.evaluate([input]);

        expect(mockExtractKeyPoints).toHaveBeenCalledWith(input.promptData.idealResponseText, input.promptData.promptText, mockLogger);
        expect(evaluateSinglePointSpy).toHaveBeenCalledTimes(2);
        expect(result.extractedKeyPoints?.['prompt7']).toEqual(['point one', 'point two']);
        const model1Result = result.llmCoverageScores?.['prompt7']?.['model1'] as CoverageResult & { pointAssessments: any[] };
        expect(model1Result).toEqual(expect.objectContaining({
            avgCoverageExtent: 0.80, // (0.7 + 0.9) / 2
            keyPointsCount: 2,
        }));
        evaluateSinglePointSpy.mockRestore();
    });

    it('should handle failure in key point extraction', async () => {
        const input = createMockEvaluationInput('prompt8', [], undefined, 'Ideal response.');
        mockExtractKeyPoints.mockResolvedValue({ error: 'Extraction failed' });

        const result = await evaluator.evaluate([input]);

        expect(result.llmCoverageScores?.['prompt8']?.['model1']).toEqual({ error: 'Key point extraction failed: Extraction failed' });
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Could not extract key points for prompt prompt8: Extraction failed"));
    });

}); 