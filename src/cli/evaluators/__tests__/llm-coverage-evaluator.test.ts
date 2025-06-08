import { LLMCoverageEvaluator } from '../llm-coverage-evaluator';
import { EvaluationInput, PointDefinition, PromptConfig, ComparisonConfig, PromptResponseData, ModelResponseDetail, IDEAL_MODEL_ID, CoverageResult, ConversationMessage } from '@/cli/types/comparison_v2';
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
        idealResponseText: string | null = null,
        promptText: string | null = `Prompt for ${promptId}`
    ): EvaluationInput => {
        const messages: ConversationMessage[] = promptText ? [{ role: 'user', content: promptText }] : [];

        const promptConfig: PromptConfig = {
            id: promptId,
            messages: messages,
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
        modelResponses.set('model1', { finalAssistantResponseText: modelResponseText, hasError: false, fullConversationHistory: [], systemPromptUsed: null });
        if (idealResponseText) {
             modelResponses.set(IDEAL_MODEL_ID, { finalAssistantResponseText: idealResponseText, hasError: false, fullConversationHistory: [], systemPromptUsed: null });
        }

        const promptData: PromptResponseData = {
            promptId: promptId,
            initialMessages: messages,
            idealResponseText: idealResponseText,
            modelResponses: modelResponses,
        };
        return {
            promptData: promptData,
            config: comparisonConfig,
            effectiveModelIds: ['model1', ...(idealResponseText ? [IDEAL_MODEL_ID] : [])],
        };
    };

    // Spy on the internal method since we don't want to make real LLM calls in unit tests
    let evaluateSinglePointSpy: jest.SpyInstance;
    beforeEach(() => {
        evaluateSinglePointSpy = jest.spyOn(LLMCoverageEvaluator.prototype as any, 'evaluateSinglePoint')
            .mockImplementation(() => Promise.resolve({ coverage_extent: 0.8, reflection: 'Mocked reflection' }));
    });
    afterEach(() => {
        evaluateSinglePointSpy.mockRestore();
    });

    it('should process a simple string point', async () => {
        const points: PointDefinition[] = ['This is a string point'];
        const input = createMockEvaluationInput('prompt1', points);

        const result = await evaluator.evaluate([input]);

        expect(evaluateSinglePointSpy).toHaveBeenCalledWith("Test response", "This is a string point", "user: Prompt for prompt1");
        const model1Result = result.llmCoverageScores?.['prompt1']?.['model1'];
        expect(model1Result).toBeDefined();
        expect(model1Result).not.toHaveProperty('error');
        const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;

        expect(successResult.avgCoverageExtent).toBe(0.8);
        expect(successResult.pointAssessments?.[0]).toMatchObject({
            keyPointText: 'This is a string point',
            coverageExtent: 0.8,
            multiplier: 1,
        });
    });

    it('should process a "contains" function point correctly', async () => {
        const points: PointDefinition[] = [['contains', 'specific text']];
        const input = createMockEvaluationInput('prompt2', points, 'This response contains specific text.');
        mockContains.mockReturnValue(true);

        const result = await evaluator.evaluate([input]);
        expect(mockContains).toHaveBeenCalledWith('This response contains specific text.', 'specific text', expect.any(Object));

        const model1Result = result.llmCoverageScores?.['prompt2']?.['model1'];
        expect(model1Result).toBeDefined();
        expect(model1Result).not.toHaveProperty('error');
        const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;

        expect(successResult.avgCoverageExtent).toBe(1.0);
        expect(successResult.pointAssessments?.[0]).toMatchObject({
            keyPointText: 'Function: contains("specific text")',
            coverageExtent: 1.0,
        });
    });

    it('should process a "matches" function point correctly that returns false', async () => {
        const points: PointDefinition[] = [['matches', '^pattern$']];
        const input = createMockEvaluationInput('prompt3', points, 'this does not match');
        mockMatches.mockReturnValue(false);

        const result = await evaluator.evaluate([input]);
        const model1Result = result.llmCoverageScores?.['prompt3']?.['model1'];
        expect(model1Result).toBeDefined();
        expect(model1Result).not.toHaveProperty('error');
        const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;

        expect(successResult.avgCoverageExtent).toBe(0.0);
        expect(successResult.pointAssessments?.[0]).toMatchObject({
            keyPointText: 'Function: matches("^pattern$")',
            coverageExtent: 0.0,
        });
    });

    it('should handle an unknown point function gracefully', async () => {
        const points: PointDefinition[] = [['unknownFunction', 'someArg']];
        const input = createMockEvaluationInput('prompt4', points);
        
        const result = await evaluator.evaluate([input]);
        const model1Result = result.llmCoverageScores?.['prompt4']?.['model1'];
        expect(model1Result).toBeDefined();
        expect(model1Result).not.toHaveProperty('error');
        const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;

        expect(successResult.avgCoverageExtent).toBeUndefined(); // No valid points were assessed
        expect(successResult.pointAssessments?.[0]).toMatchObject({
            keyPointText: 'Function: unknownFunction("someArg")',
            error: "Point function 'unknownFunction' not found.",
        });
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Function 'unknownFunction' not found"));
    });

    it('should use extracted key points if `points` is empty and `idealResponse` is provided', async () => {
        const input = createMockEvaluationInput('prompt7', [], "Test response", 'Ideal response with point one and point two.');
        mockExtractKeyPoints.mockResolvedValue({ key_points: ['point one', 'point two'] });
        
        evaluateSinglePointSpy
            .mockResolvedValueOnce({ coverage_extent: 0.7, reflection: 'Point one covered' })
            .mockResolvedValueOnce({ coverage_extent: 0.9, reflection: 'Point two covered' });

        const result = await evaluator.evaluate([input]);
        
        expect(mockExtractKeyPoints).toHaveBeenCalledWith('Ideal response with point one and point two.', "user: Prompt for prompt7", mockLogger);
        expect(evaluateSinglePointSpy).toHaveBeenCalledTimes(2);
        expect(result.extractedKeyPoints?.['prompt7']).toEqual(['point one', 'point two']);
        
        const model1Result = result.llmCoverageScores?.['prompt7']?.['model1'];
        expect(model1Result).toBeDefined();
        expect(model1Result).not.toHaveProperty('error');
        const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;
        
        expect(successResult.avgCoverageExtent).toBe(0.80);
        expect(successResult.keyPointsCount).toBe(2);
    });

    describe('Rich PointObject processing', () => {
        it('should correctly process a PointObject with text, multiplier, and citation', async () => {
            const points: PointDefinition[] = [{
                text: 'Important point',
                multiplier: 2.5,
                citation: 'Source A'
            }];
            const input = createMockEvaluationInput('prompt-rich-text', points);
            evaluateSinglePointSpy.mockResolvedValue({ coverage_extent: 0.8, reflection: 'Good coverage' });

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-rich-text']?.['model1'];
            expect(model1Result).toBeDefined();
            expect(model1Result).not.toHaveProperty('error');
            const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;
            
            expect(successResult.avgCoverageExtent).toBe(0.8);
            expect(successResult.pointAssessments?.[0]).toMatchObject({
                keyPointText: 'Important point',
                coverageExtent: 0.8,
                multiplier: 2.5,
                citation: 'Source A'
            });
        });

        it('should correctly process a PointObject with a function, multiplier, and citation', async () => {
            const points: PointDefinition[] = [{
                fn: 'contains',
                fnArgs: 'special',
                multiplier: 3.0,
                citation: 'Requirement doc, section 2.1'
            }];
            const input = createMockEvaluationInput('prompt-rich-fn', points, 'This has the special word.');
            mockContains.mockReturnValue(true);

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-rich-fn']?.['model1'];
            expect(model1Result).toBeDefined();
            expect(model1Result).not.toHaveProperty('error');
            const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;
            
            expect(successResult.avgCoverageExtent).toBe(1.0);
            expect(successResult.pointAssessments?.[0]).toMatchObject({
                keyPointText: 'Function: contains("special")',
                coverageExtent: 1.0,
                multiplier: 3.0,
                citation: 'Requirement doc, section 2.1'
            });
        });

        it('should correctly calculate a weighted average from multiple points with multipliers', async () => {
            const points: PointDefinition[] = [
                { text: 'Easy point', multiplier: 0.5 }, // Gets 1.0 from spy
                { text: 'Hard point', multiplier: 2.0 }, // Gets 0.5 from spy
            ];
            const input = createMockEvaluationInput('prompt-weighted', points);
            
            evaluateSinglePointSpy
                .mockResolvedValueOnce({ coverage_extent: 1.0, reflection: 'Easy point covered' })
                .mockResolvedValueOnce({ coverage_extent: 0.5, reflection: 'Hard point half covered' });

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-weighted']?.['model1'];
            expect(model1Result).toBeDefined();
            expect(model1Result).not.toHaveProperty('error');
            const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;
            
            // Weighted score: (1.0 * 0.5) + (0.5 * 2.0) = 0.5 + 1.0 = 1.5
            // Total multiplier: 0.5 + 2.0 = 2.5
            // Avg coverage: 1.5 / 2.5 = 0.6
            expect(successResult.avgCoverageExtent).toBeCloseTo(0.6);
            expect(successResult.pointAssessments).toHaveLength(2);
            expect(successResult.pointAssessments).toEqual(expect.arrayContaining([
                expect.objectContaining({ keyPointText: 'Easy point', coverageExtent: 1.0, multiplier: 0.5 }),
                expect.objectContaining({ keyPointText: 'Hard point', coverageExtent: 0.5, multiplier: 2.0 }),
            ]));
        });

        it('should throw an error for a point with both `text` and `fn`', async () => {
             const points: PointDefinition[] = [{ text: 'a', fn: 'b' }];
             const input = createMockEvaluationInput('prompt-invalid', points);
             
             const result = await evaluator.evaluate([input]);
             const model1Result = result.llmCoverageScores?.['prompt-invalid']?.['model1'];
             expect(model1Result).toEqual({ error: expect.stringContaining("Point object cannot have both 'text' and 'fn' defined") });
        });

        it('should throw an error for a point with an invalid multiplier', async () => {
             const points: PointDefinition[] = [{ text: 'a', multiplier: 100 }];
             const input = createMockEvaluationInput('prompt-invalid-mult', points);

             const result = await evaluator.evaluate([input]);
             const model1Result = result.llmCoverageScores?.['prompt-invalid-mult']?.['model1'];
             expect(model1Result).toEqual({ error: expect.stringContaining("Point multiplier must be a number between 0.1 and 10") });
        });
    });
}); 