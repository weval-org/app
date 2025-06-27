import { LLMCoverageEvaluator } from '../llm-coverage-evaluator';
import { dispatchMakeApiCall } from '@/lib/llm-clients/client-dispatcher';
import { getConfig } from '../../config';
import { getCache } from '@/lib/cache-service';

import {
    EvaluationInput,
    PointDefinition,
    PromptConfig,
    ComparisonConfig,
    PromptResponseData,
    ModelResponseDetail,
    Judge,
} from '../../types/cli_types';

import {
    CoverageResult,
    ConversationMessage
} from '@/types/shared';

import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

type Logger = ReturnType<typeof getConfig>['logger'];

const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockSuccess = jest.fn();

const mockLogger: jest.Mocked<Logger> = {
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
        const modelResponses: { [modelId: string]: ModelResponseDetail } = {};
        modelResponses['model1'] = { finalAssistantResponseText: modelResponseText, hasError: false, fullConversationHistory: [], systemPromptUsed: null };

        if (idealResponseText) {
             modelResponses[IDEAL_MODEL_ID] = { finalAssistantResponseText: idealResponseText, hasError: false, fullConversationHistory: [], systemPromptUsed: null };
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
        
        // Mock to simulate the new consensus logic with default judges
        requestIndividualJudgeSpy.mockResolvedValue({ coverage_extent: 0.75, reflection: 'Mocked reflection' });

        const result = await evaluator.evaluate([input]);
        
        // Expect it to be called for each of the 2 default judges
        expect(requestIndividualJudgeSpy).toHaveBeenCalledTimes(2);
        
        // Check the call for one of the judges
        expect(requestIndividualJudgeSpy).toHaveBeenCalledWith(
            "Test response", // modelResponseText
            "This is a string point", // keyPointText
            ["[should] This is a string point"], // allOtherKeyPoints
            expect.stringContaining("Prompt for prompt1"), // promptContextText
            expect.objectContaining({ approach: 'standard' }) // judge object
        );

        const model1Result = result.llmCoverageScores?.['prompt1']?.['model1'];
        expect(model1Result).toBeDefined();
        expect(model1Result).not.toHaveProperty('error');
        const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;

        // The result should be the average of the 2 mocked responses (0.75)
        expect(successResult.pointAssessments?.[0]?.coverageExtent).toBe(0.75);
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

        expect(successResult.pointAssessments?.[0]?.coverageExtent).toBe(1.0);
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

        expect(successResult.pointAssessments?.[0]?.coverageExtent).toBe(0.0);
        expect(successResult.pointAssessments?.[0]).toMatchObject({
            keyPointText: 'Function: matches("^pattern$")',
            coverageExtent: 0.0,
        });
    });

    it('should handle an unknown point function gracefully', async () => {
        const input = createMockEvaluationInput('prompt4', [['unknownFunction', 'someArg']]);
        
        const result = await evaluator.evaluate([input]);
        const model1Result = result.llmCoverageScores?.['prompt4']?.['model1'];
        expect(model1Result).toBeDefined();
        expect(model1Result).not.toHaveProperty('error');
        const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;

        expect(successResult.pointAssessments?.[0]?.coverageExtent).toBeUndefined(); // No valid points were assessed
        expect(successResult.pointAssessments?.[0]).toMatchObject({
            keyPointText: 'Function: unknownFunction("someArg")',
            error: "Unknown point function: 'unknownFunction'",
        });
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Function 'unknownFunction' not found"));
    });

    it('should use extracted key points if `points` is empty and `idealResponse` is provided', async () => {
        const input = createMockEvaluationInput('prompt7', [], "Test response", 'Ideal response with point one and point two.');
        // This test doesn't need custom judges, it will use the default ones.
        mockExtractKeyPoints.mockResolvedValue({ key_points: ['point one', 'point two'] });
        
        requestIndividualJudgeSpy.mockImplementation(async (modelResponseText, keyPointText, allOtherKeyPoints, promptContextText, judge) => {
            // Mock different scores based on the approach for variety
            if (keyPointText === 'point one') {
                if (judge.approach === 'standard') return { coverage_extent: 0.7, reflection: 'p1 standard' };
                if (judge.approach === 'prompt-aware') return { coverage_extent: 0.8, reflection: 'p1 prompt-aware' };
                if (judge.approach === 'holistic') return { coverage_extent: 0.9, reflection: 'p1 holistic' };
            }
            if (keyPointText === 'point two') {
                 if (judge.approach === 'standard') return { coverage_extent: 1.0, reflection: 'p2 standard' };
                 if (judge.approach === 'prompt-aware') return { coverage_extent: 1.0, reflection: 'p2 prompt-aware' };
                 if (judge.approach === 'holistic') return { coverage_extent: 1.0, reflection: 'p2 holistic' };
            }
            return { error: 'unexpected keypoint or judge' };
        });

        const result = await evaluator.evaluate([input]);
        
        // We now pass the default judges to the extraction service
        expect(mockExtractKeyPoints).toHaveBeenCalledWith('Ideal response with point one and point two.', expect.stringContaining("Prompt for prompt7"), mockLogger, undefined, false);
        expect(requestIndividualJudgeSpy).toHaveBeenCalledTimes(4); // 2 key points * 2 default judges
        expect(result.extractedKeyPoints?.['prompt7']).toEqual(['point one', 'point two']);
        
        const model1Result = result.llmCoverageScores?.['prompt7']?.['model1'];
        expect(model1Result).toBeDefined();
        expect(model1Result).not.toHaveProperty('error');
        const successResult = model1Result as Exclude<CoverageResult, { error: string } | null>;
        
        // P1 score: (0.7+0.8)/2 = 0.75. P2 score: (1+1)/2 = 1.0. 
        // Final avg: (0.75 + 1.0) / 2 = 0.875
        expect(successResult.avgCoverageExtent).toBeCloseTo(0.88, 2);
        expect(successResult.keyPointsCount).toBe(2);
    });

    describe('Judge Logic', () => {
        const points: PointDefinition[] = ['Test point'];

        it('should use custom judges when provided in config', async () => {
            const input = createMockEvaluationInput('prompt-custom-judges', points);
            const customJudges: Judge[] = [
                { model: 'custom:judge1', approach: 'standard' },
                { model: 'custom:judge2', approach: 'holistic' },
            ];
            input.config.evaluationConfig = { 'llm-coverage': { judges: customJudges } as any };

            requestIndividualJudgeSpy.mockImplementation(async (mrt, kpt, aokp, pct, judge) => {
                if (judge.model === 'custom:judge1') return { coverage_extent: 1.0, reflection: 'Perfect from judge1' };
                if (judge.model === 'custom:judge2') return { coverage_extent: 0.5, reflection: 'Partial from judge2' };
                return { error: 'unexpected judge' };
            });

            const result = await evaluator.evaluate([input]);
            const assessment = (result.llmCoverageScores?.['prompt-custom-judges']?.['model1'] as any)?.pointAssessments[0];

            expect(requestIndividualJudgeSpy).toHaveBeenCalledTimes(2);
            expect(assessment.coverageExtent).toBe(0.75); // (1.0 + 0.5) / 2
            expect(assessment.judgeModelId).toBe('consensus(standard(custom:judge1), holistic(custom:judge2))');
            expect(assessment.individualJudgements).toHaveLength(2);
            expect(assessment.individualJudgements).toEqual(expect.arrayContaining([
                { judgeModelId: 'standard(custom:judge1)', coverageExtent: 1.0, reflection: 'Perfect from judge1' },
                { judgeModelId: 'holistic(custom:judge2)', coverageExtent: 0.5, reflection: 'Partial from judge2' },
            ]));
        });

        it('should use default judges if `judges` array in config is empty', async () => {
            const input = createMockEvaluationInput('prompt-default-judges-empty', points);
            (input.config.evaluationConfig as any) = { 'llm-coverage': { judges: [] } };

            requestIndividualJudgeSpy.mockResolvedValue({ coverage_extent: 0.5, reflection: 'Default judge reflection' });

            await evaluator.evaluate([input]);

            expect(requestIndividualJudgeSpy).toHaveBeenCalledTimes(2); // 2 default judges
        });

        it('should correctly pass all key points for holistic evaluation', async () => {
             const points: PointDefinition[] = ['point one', 'point two'];
             const input = createMockEvaluationInput('prompt-holistic', points);
             const customJudges: Judge[] = [{ model: 'judge', approach: 'holistic' }];
             input.config.evaluationConfig = { 'llm-coverage': { judges: customJudges } as any };

             requestIndividualJudgeSpy.mockResolvedValue({ coverage_extent: 1.0, reflection: 'holistic reflection' });

             await evaluator.evaluate([input]);
             
             const expectedAllPoints = [
                "[should] point one",
                "[should] point two"
             ];

             expect(requestIndividualJudgeSpy).toHaveBeenCalledWith(
                expect.any(String), // modelResponseText
                "point one",          // keyPointText
                expectedAllPoints,  // allOtherKeyPoints
                expect.any(String), // promptContextText
                expect.objectContaining({ approach: 'holistic' })
             );
             expect(requestIndividualJudgeSpy).toHaveBeenCalledWith(
                expect.any(String), // modelResponseText
                "point two",          // keyPointText
                expectedAllPoints,  // allOtherKeyPoints
                expect.any(String), // promptContextText
                expect.objectContaining({ approach: 'holistic' })
             );
        });

        it('should return an error if all judges fail', async () => {
            const input = createMockEvaluationInput('prompt-all-fail', points);
            
            requestIndividualJudgeSpy.mockResolvedValue({ error: 'Judge failed' });
            
            const result = await evaluator.evaluate([input]);
            const assessment = (result.llmCoverageScores?.['prompt-all-fail']?.['model1'] as any)?.pointAssessments[0];
            
            expect(assessment.error).toBe('All judges failed in consensus mode.');
            expect(assessment.coverageExtent).toBeUndefined();
            expect(assessment.judgeModelId).toBeUndefined();
        });

        it('should prepend [should] and [should not] to criteria in holistic evaluation', async () => {
            const points: PointDefinition[] = ['be polite'];
            const input = createMockEvaluationInput('prompt-holistic-mixed', points, 'this is a response');
            input.config.prompts[0].should_not = ['be rude'];

            const customJudges: Judge[] = [{ model: 'judge', approach: 'holistic' }];
            input.config.evaluationConfig = { 'llm-coverage': { judges: customJudges } as any };
            
            requestIndividualJudgeSpy.mockResolvedValue({ coverage_extent: 1.0, reflection: 'holistic reflection' });

            await evaluator.evaluate([input]);
            
            const expectedAllPointsContext = [
                '[should] be polite',
                '[should not] be rude',
            ];

            // Check call for the 'should' point
            expect(requestIndividualJudgeSpy).toHaveBeenCalledWith(
                'this is a response',
                'be polite',
                expectedAllPointsContext,
                expect.any(String),
                expect.objectContaining({ approach: 'holistic' })
            );

            // Check call for the 'should not' point
            expect(requestIndividualJudgeSpy).toHaveBeenCalledWith(
                'this is a response',
                'be rude',
                expectedAllPointsContext,
                expect.any(String),
                expect.objectContaining({ approach: 'holistic' })
            );
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
            
            expect(successResult.pointAssessments?.[0]?.coverageExtent).toBe(1.0);
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
            
            expect(successResult.pointAssessments?.[0]?.coverageExtent).toBe(1.0);
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
            
            requestIndividualJudgeSpy.mockImplementation(async (mrt, keyPointText, aokp, pct, judge) => {
                // Return same score regardless of judge approach for simplicity
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
            const input = createMockEvaluationInput('prompt-invalid', [
                { text: 'some text', fn: 'contains', arg: 'word' }
            ]);
            await expect(evaluator.evaluate([input])).rejects.toThrow(
                "Point object cannot have both 'text' and a function ('fn' or idiomatic). Prompt ID: 'prompt-invalid'"
            );
        });

        it('should throw an error for a point with an invalid multiplier', async () => {
            const input = createMockEvaluationInput('prompt-invalid-mult', [
                { text: 'some text', multiplier: 100 }
            ]);
            await expect(evaluator.evaluate([input])).rejects.toThrow(
                "Point multiplier must be a number between 0.1 and 10. Found 100. Prompt ID: 'prompt-invalid-mult'"
            );
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
                throw new Error("Test failed: model1Result has an error or is null");
            }

            expect(model1Result.pointAssessments?.[0]?.coverageExtent).toBe(0.0); // Inverted from 1.0
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
                throw new Error("Test failed: model1Result has an error or is null");
            }

            expect(model1Result.pointAssessments?.[0]?.coverageExtent).toBe(1.0); // Inverted from 0.0
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
                throw new Error("Test failed: model1Result has an error or is null");
            }

            expect(model1Result.pointAssessments?.[0]?.coverageExtent).toBeCloseTo(0.0); // 1.0 becomes 0.0
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
                throw new Error("Test failed: model1Result has an error or is null");
            }

            // The original score was 0.75, so the inverted score is 1 - 0.75 = 0.25
            expect(model1Result.pointAssessments?.[0]?.coverageExtent).toBeCloseTo(0.25);
            const assessment = model1Result.pointAssessments?.[0];
            expect(assessment).toBeDefined();
            expect(assessment?.keyPointText).toBe('The response should be good');
            expect(assessment?.coverageExtent).toBeCloseTo(0.25);
            expect(assessment?.isInverted).toBe(true);
            expect(assessment?.reflection).toContain('[INVERTED]');
        });
    });
}); 