import { LLMCoverageEvaluator } from '@/cli/evaluators/llm-coverage-evaluator';
import { dispatchMakeApiCall } from '@/lib/llm-clients/client-dispatcher';
import { getConfig } from '@/cli/config';
import { getCache } from '@/lib/cache-service';
import { EvaluationInput, PointDefinition, PromptConfig, ComparisonConfig, PromptResponseData, ModelResponseDetail, IDEAL_MODEL_ID, CoverageResult, ConversationMessage } from '@/cli/types/comparison_v2';

type Logger = ReturnType<typeof getConfig>['logger'];

const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockSuccess = jest.fn();

const mockLogger: Logger = {
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
    success: mockSuccess,
};

const mockExtractKeyPoints = jest.fn();

jest.mock('@/cli/services/llm-evaluation-service', () => ({
    extractKeyPoints: (...args: any[]) => mockExtractKeyPoints(...args),
}));

jest.mock('../../config');
jest.mock('../../services/llm-evaluation-service');
jest.mock('../../../lib/llm-clients/client-dispatcher');
jest.mock('../../../lib/cache-service');

describe('LLMCoverageEvaluator', () => {
    let evaluator: LLMCoverageEvaluator;

    beforeEach(() => {
        mockLogger.warn = jest.fn();
        mockLogger.error = jest.fn();

        (getConfig as jest.Mock).mockReturnValue({ logger: mockLogger });

        (dispatchMakeApiCall as jest.Mock).mockReset();

        evaluator = new LLMCoverageEvaluator(mockLogger, false);

        (getCache as jest.Mock).mockClear();
        mockExtractKeyPoints.mockReset();
        mockInfo.mockClear();
        mockWarn.mockClear();
        mockError.mockClear();
        mockSuccess.mockClear();
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
    let requestIndividualJudgeSpy: jest.SpyInstance;

    beforeEach(() => {
        requestIndividualJudgeSpy = jest.spyOn(LLMCoverageEvaluator.prototype as any, 'requestIndividualJudge');
    });

    afterEach(() => {
        requestIndividualJudgeSpy.mockRestore();
    });

    it('should process a simple string point', async () => {
        const points: PointDefinition[] = ['This is a string point'];
        const input = createMockEvaluationInput('prompt1', points);
        // Mock the new classification-based return value
        requestIndividualJudgeSpy.mockResolvedValue({ coverage_extent: 0.75, reflection: 'Mocked reflection' });

        const result = await evaluator.evaluate([input]);

        expect(requestIndividualJudgeSpy).toHaveBeenCalledWith("Test response", "This is a string point", expect.stringContaining("Prompt for prompt1"), expect.any(String));
        const model1Result = result.llmCoverageScores?.['prompt1']?.['model1'];
        expect(model1Result).toBeDefined();
        expect(model1Result).not.toHaveProperty('error');
        const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;

        expect(successResult.avgCoverageExtent).toBe(0.75);
        expect(successResult.pointAssessments?.[0]).toMatchObject({
            keyPointText: 'This is a string point',
            coverageExtent: 0.75,
            multiplier: 1,
        });
    });

    it('should process a "contains" function point correctly', async () => {
        const points: PointDefinition[] = [['contains', 'specific text']];
        const input = createMockEvaluationInput('prompt2', points, 'This response contains specific text.');

        const result = await evaluator.evaluate([input]);
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
        input.config.evaluationConfig = { 'llm-coverage': { judgeMode: 'failover', judgeModels: ['judge1', 'judge2'] } };
        mockExtractKeyPoints.mockResolvedValue({ key_points: ['point one', 'point two'] });
        
        requestIndividualJudgeSpy.mockImplementation(async (modelResponseText, keyPointText, promptContextText, modelId) => {
            if (modelId === 'judge1') {
                if (keyPointText === 'point one') return { coverage_extent: 0.75, reflection: 'Point one covered' };
                if (keyPointText === 'point two') return { coverage_extent: 1.0, reflection: 'Point two covered' };
            }
            return { error: 'unexpected keypoint or judge' };
        });

        const result = await evaluator.evaluate([input]);
        
        expect(mockExtractKeyPoints).toHaveBeenCalledWith('Ideal response with point one and point two.', expect.stringContaining("Prompt for prompt7"), mockLogger, ['judge1', 'judge2'], false);
        expect(requestIndividualJudgeSpy).toHaveBeenCalledTimes(2);
        expect(result.extractedKeyPoints?.['prompt7']).toEqual(['point one', 'point two']);
        
        const model1Result = result.llmCoverageScores?.['prompt7']?.['model1'];
        expect(model1Result).toBeDefined();
        expect(model1Result).not.toHaveProperty('error');
        const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;
        
        expect(successResult.avgCoverageExtent).toBe(0.88); // (0.75 + 1.0) / 2 = 0.875 -> rounded
        expect(successResult.keyPointsCount).toBe(2);
    });

    describe('Judge Mode Evaluation Logic', () => {
        const points: PointDefinition[] = ['Test point'];

        it('should average scores in "consensus" mode when both judges succeed', async () => {
            const input = createMockEvaluationInput('prompt-consensus', points);
            input.config.evaluationConfig = { 'llm-coverage': { judgeMode: 'consensus', judgeModels: ['judge1', 'judge2'] } };

            requestIndividualJudgeSpy.mockImplementation(async (modelResponseText, keyPointText, promptContextText, modelId) => {
                if (modelId === 'judge1') return { coverage_extent: 1.0, reflection: 'Perfect from judge1' };
                if (modelId === 'judge2') return { coverage_extent: 0.5, reflection: 'Partial from judge2' };
                return { error: 'unexpected judge' };
            });

            const result = await evaluator.evaluate([input]);
            const assessment = (result.llmCoverageScores?.['prompt-consensus']?.['model1'] as any)?.pointAssessments[0];

            expect(assessment.coverageExtent).toBe(0.75); // (1.0 + 0.5) / 2
            expect(assessment.judgeModelId).toBe('consensus(judge1, judge2)');
            expect(assessment.individualJudgements).toHaveLength(2);
            expect(assessment.individualJudgements).toEqual(expect.arrayContaining([
                { judgeModelId: 'judge1', coverageExtent: 1.0, reflection: 'Perfect from judge1' },
                { judgeModelId: 'judge2', coverageExtent: 0.5, reflection: 'Partial from judge2' },
            ]));
            expect(assessment.reflection).toContain('Consensus from 2 judge(s).');
            expect(assessment.reflection).toContain('Average score: 0.75');
        });

        it('should use only the successful score in "consensus" mode when one judge fails', async () => {
            const input = createMockEvaluationInput('prompt-consensus-fail', points);
            input.config.evaluationConfig = { 'llm-coverage': { judgeMode: 'consensus', judgeModels: ['judge1', 'judge2'] } };

            requestIndividualJudgeSpy.mockImplementation(async (modelResponseText, keyPointText, promptContextText, modelId) => {
                if (modelId === 'judge1') return { coverage_extent: 0.9, reflection: 'Great from judge1' };
                if (modelId === 'judge2') return { error: 'Judge2 failed' };
                return { error: 'unexpected judge' };
            });
            
            const result = await evaluator.evaluate([input]);
            const assessment = (result.llmCoverageScores?.['prompt-consensus-fail']?.['model1'] as any)?.pointAssessments[0];

            expect(assessment.coverageExtent).toBe(0.9); // Average of just the one score
            expect(assessment.judgeModelId).toBe('consensus(judge1)');
            expect(assessment.individualJudgements).toHaveLength(1);
            expect(assessment.individualJudgements[0]).toMatchObject({ judgeModelId: 'judge1', coverageExtent: 0.9 });
        });

        it('should use the second judge in "failover" mode when the first one fails', async () => {
            const input = createMockEvaluationInput('prompt-failover', points);
            input.config.evaluationConfig = { 'llm-coverage': { judgeMode: 'failover', judgeModels: ['judge1', 'judge2'] } };

             requestIndividualJudgeSpy.mockImplementation(async (modelResponseText, keyPointText, promptContextText, modelId) => {
                if (modelId === 'judge1') return { error: 'Judge1 failed' };
                if (modelId === 'judge2') return { coverage_extent: 0.75, reflection: 'OK from judge2' };
                return { error: 'unexpected judge' };
            });
            
            const result = await evaluator.evaluate([input]);
            const assessment = (result.llmCoverageScores?.['prompt-failover']?.['model1'] as any)?.pointAssessments[0];
            
            expect(requestIndividualJudgeSpy).toHaveBeenCalledTimes(2);
            expect(assessment.coverageExtent).toBe(0.75);
            expect(assessment.judgeModelId).toBe('judge2');
            expect(assessment.individualJudgements).toBeUndefined();
            expect(assessment.judgeLog).toEqual(expect.arrayContaining([
                '[Attempt 1][judge1] FAILED: Judge1 failed',
                `[Attempt 1][judge2] SUCCEEDED. Score: 0.75`,
            ]));
        });
    });

    describe('Rich PointObject processing', () => {
        it('should correctly process a PointObject with text, multiplier, and citation', async () => {
            const points: PointDefinition[] = [{
                text: 'Important point',
                multiplier: 2.5,
                citation: 'Source A'
            }];
            const input = createMockEvaluationInput('prompt-rich-text', points);
            requestIndividualJudgeSpy.mockResolvedValue({ coverage_extent: 1.0, reflection: 'Good coverage' });

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-rich-text']?.['model1'];
            expect(model1Result).toBeDefined();
            expect(model1Result).not.toHaveProperty('error');
            const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;
            
            expect(successResult.avgCoverageExtent).toBe(1.0);
            expect(successResult.pointAssessments?.[0]).toMatchObject({
                keyPointText: 'Important point',
                coverageExtent: 1.0,
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
                { text: 'Easy point', multiplier: 0.5 }, // Gets 1.0
                { text: 'Hard point', multiplier: 2.0 }, // Gets 0.5
            ];
            const input = createMockEvaluationInput('prompt-weighted', points);
            
            requestIndividualJudgeSpy.mockImplementation(async (modelResponseText, keyPointText) => {
                if (keyPointText === 'Easy point') return { coverage_extent: 1.0, reflection: 'Easy point covered' };
                if (keyPointText === 'Hard point') return { coverage_extent: 0.5, reflection: 'Hard point half covered' };
                return { error: 'unexpected keypoint' };
            });

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
             expect(model1Result).toEqual({ error: expect.stringContaining("Point normalization failed") });
        });

        it('should throw an error for a point with an invalid multiplier', async () => {
             const points: PointDefinition[] = [{ text: 'a', multiplier: 100 }];
             const input = createMockEvaluationInput('prompt-invalid-mult', points);

             const result = await evaluator.evaluate([input]);
             const model1Result = result.llmCoverageScores?.['prompt-invalid-mult']?.['model1'];
             expect(model1Result).toEqual({ error: expect.stringContaining("Point multiplier must be a number between 0.1 and 10") });
        });
    });

    describe('should_not functionality', () => {
        it('should invert the score of a successful match', async () => {
            const input = createMockEvaluationInput(
                'prompt-should-not',
                [], // No 'should' points
                "This response contains the forbidden phrase."
            );
            input.config.prompts[0].should_not = [['contains', 'forbidden phrase']];

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-should-not']?.['model1'];
            
            if (!model1Result || 'error' in model1Result) {
                fail('Expected a valid coverage result, but got an error or undefined.');
            }

            expect(model1Result.avgCoverageExtent).toBe(0.0); // Inverted from 1.0
            expect(model1Result.pointAssessments?.[0]).toMatchObject({
                keyPointText: 'Function: contains("forbidden phrase")',
                coverageExtent: 0.0,
                isInverted: true,
            });
        });

        it('should invert the score of a failed match', async () => {
            const input = createMockEvaluationInput(
                'prompt-should-not-2',
                [],
                "This response is clean."
            );
            input.config.prompts[0].should_not = [['contains', 'forbidden phrase']];

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-should-not-2']?.['model1'];

            if (!model1Result || 'error' in model1Result) {
                fail('Expected a valid coverage result, but got an error or undefined.');
            }

            expect(model1Result.avgCoverageExtent).toBe(1.0); // Inverted from 0.0
            expect(model1Result.pointAssessments?.[0]).toMatchObject({
                keyPointText: 'Function: contains("forbidden phrase")',
                coverageExtent: 1.0,
                isInverted: true,
            });
        });

        it('should invert a graded score from a function', async () => {
            const input = createMockEvaluationInput(
                'prompt-should-not-graded',
                [],
                "one two three four five six" // 6 words
            );
            // word_count_between [5, 10] returns 1.0 for 6 words. Inverted should be 0.0
            input.config.prompts[0].should_not = [['word_count_between', [5, 10]]];

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-should-not-graded']?.['model1'];

            if (!model1Result || 'error' in model1Result) {
                fail('Expected a valid coverage result, but got an error or undefined.');
            }

            expect(model1Result.avgCoverageExtent).toBeCloseTo(0.0); // 1.0 becomes 0.0
            expect(model1Result.pointAssessments?.[0]).toMatchObject({
                keyPointText: 'Function: word_count_between([5,10])',
                coverageExtent: 0.0,
                isInverted: true,
            });
        });

        it('should invert a graded score from an LLM judge', async () => {
            const input = createMockEvaluationInput(
                'prompt-should-not-llm',
                [],
                "This response is moderately bad."
            );
            input.config.prompts[0].should_not = ["The response should be good"];

            // Mock the judge to return a partial score of 0.75
            requestIndividualJudgeSpy.mockResolvedValue({ coverage_extent: 0.75, reflection: 'Moderately good' });

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-should-not-llm']?.['model1'];

            if (!model1Result || 'error' in model1Result) {
                fail('Expected a valid coverage result, but got an error or undefined.');
            }

            // The original score was 0.75, so the inverted score is 1 - 0.75 = 0.25
            expect(model1Result.avgCoverageExtent).toBeCloseTo(0.25);
            const assessment = model1Result.pointAssessments?.[0];
            expect(assessment).toBeDefined();
            expect(assessment?.keyPointText).toBe('The response should be good');
            expect(assessment?.coverageExtent).toBeCloseTo(0.25);
            expect(assessment?.isInverted).toBe(true);
            expect(assessment?.reflection).toContain('[INVERTED]');
        });
    });
}); 