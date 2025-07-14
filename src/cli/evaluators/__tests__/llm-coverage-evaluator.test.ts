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
            expect.objectContaining({ approach: 'prompt-aware' }) // judge object
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
        const points: PointDefinition[] = [{ fn: 'contains', fnArgs: 'specific text' }];
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
        const points: PointDefinition[] = [{ fn: 'matches', fnArgs: '^pattern$' }];
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
        const input = createMockEvaluationInput('prompt4', [{ fn: 'unknownFunction', fnArgs: 'someArg' }]);
        
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
        
        // P1 score with two prompt-aware judges: (0.8+0.8)/2 = 0.8. P2 score: (1.0+1.0)/2 = 1.0. 
        // Final avg: (0.8 + 1.0) / 2 = 0.9
        expect(successResult.avgCoverageExtent).toBeCloseTo(0.9, 2);
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

        it('should use backup judge when one primary judge fails', async () => {
            const input = createMockEvaluationInput('prompt-backup-success', points);
            
            requestIndividualJudgeSpy.mockImplementation(async (mrt, kpt, aokp, pct, judge) => {
                if (judge.model === 'openai:gpt-4.1-mini') return { coverage_extent: 0.8, reflection: 'Good from GPT-4' };
                if (judge.model === 'openrouter:google/gemini-2.5-flash-preview-05-20') return { error: 'Gemini failed' };
                if (judge.model === 'anthropic:claude-3.5-haiku') return { coverage_extent: 0.6, reflection: 'Backup Claude result' };
                return { error: 'unexpected judge' };
            });

            const result = await evaluator.evaluate([input]);
            const assessment = (result.llmCoverageScores?.['prompt-backup-success']?.['model1'] as any)?.pointAssessments[0];

            // Should have been called 3 times: 2 primary + 1 backup
            expect(requestIndividualJudgeSpy).toHaveBeenCalledTimes(3);
            expect(assessment.coverageExtent).toBe(0.7); // (0.8 + 0.6) / 2
            expect(assessment.judgeModelId).toBe('consensus(prompt-aware-openai-gpt-4-1-mini(openai:gpt-4.1-mini), backup-claude-3-5-haiku(anthropic:claude-3.5-haiku))');
            expect(assessment.individualJudgements).toHaveLength(2);
            expect(assessment.reflection).toContain('NOTE: Backup judge was used to supplement failed primary judges.');
            expect(assessment.error).toBeUndefined(); // Should be no error since backup succeeded
        });

        it('should not use backup judge when all primary judges succeed', async () => {
            const input = createMockEvaluationInput('prompt-no-backup-needed', points);
            
            requestIndividualJudgeSpy.mockImplementation(async (mrt, kpt, aokp, pct, judge) => {
                if (judge.model === 'openai:gpt-4.1-mini') return { coverage_extent: 0.8, reflection: 'Good from GPT-4' };
                if (judge.model === 'openrouter:google/gemini-2.5-flash-preview-05-20') return { coverage_extent: 0.9, reflection: 'Good from Gemini' };
                return { error: 'unexpected judge' };
            });

            const result = await evaluator.evaluate([input]);
            const assessment = (result.llmCoverageScores?.['prompt-no-backup-needed']?.['model1'] as any)?.pointAssessments[0];

            // Should have been called only 2 times: 2 primary judges, no backup
            expect(requestIndividualJudgeSpy).toHaveBeenCalledTimes(2);
            expect(assessment.coverageExtent).toBe(0.85); // (0.8 + 0.9) / 2
            expect(assessment.judgeModelId).toBe('consensus(prompt-aware-openai-gpt-4-1-mini(openai:gpt-4.1-mini), prompt-aware-gemini-2-5-flash-preview-05-20(openrouter:google/gemini-2.5-flash-preview-05-20))');
            expect(assessment.individualJudgements).toHaveLength(2);
            expect(assessment.reflection).not.toContain('NOTE: Backup judge was used');
            expect(assessment.error).toBeUndefined();
        });

        it('should return error when primary judge fails and backup also fails', async () => {
            const input = createMockEvaluationInput('prompt-backup-fails', points);
            
            requestIndividualJudgeSpy.mockImplementation(async (mrt, kpt, aokp, pct, judge) => {
                if (judge.model === 'openai:gpt-4.1-mini') return { coverage_extent: 0.8, reflection: 'Good from GPT-4' };
                if (judge.model === 'openrouter:google/gemini-2.5-flash-preview-05-20') return { error: 'Gemini failed' };
                if (judge.model === 'anthropic:claude-3.5-haiku') return { error: 'Backup Claude also failed' };
                return { error: 'unexpected judge' };
            });

            const result = await evaluator.evaluate([input]);
            const assessment = (result.llmCoverageScores?.['prompt-backup-fails']?.['model1'] as any)?.pointAssessments[0];

            // Should have been called 3 times: 2 primary + 1 backup
            expect(requestIndividualJudgeSpy).toHaveBeenCalledTimes(3);
            expect(assessment.coverageExtent).toBe(0.8); // Only successful judge
            expect(assessment.error).toBe('1 of 2 judges failed to return a valid assessment. The backup judge was not used or also failed. The final score is based on a partial consensus.');
            expect(assessment.individualJudgements).toHaveLength(1);
            expect(assessment.reflection).toContain('WARNING: 1 of 2 judges failed');
        });

        it('should not use backup judge when custom judges are provided', async () => {
            const input = createMockEvaluationInput('prompt-custom-no-backup', points);
            const customJudges: Judge[] = [
                { model: 'custom:judge1', approach: 'standard' },
                { model: 'custom:judge2', approach: 'holistic' },
            ];
            input.config.evaluationConfig = { 'llm-coverage': { judges: customJudges } as any };

            requestIndividualJudgeSpy.mockImplementation(async (mrt, kpt, aokp, pct, judge) => {
                if (judge.model === 'custom:judge1') return { coverage_extent: 1.0, reflection: 'Perfect from judge1' };
                if (judge.model === 'custom:judge2') return { error: 'Custom judge2 failed' };
                return { error: 'unexpected judge' };
            });

            const result = await evaluator.evaluate([input]);
            const assessment = (result.llmCoverageScores?.['prompt-custom-no-backup']?.['model1'] as any)?.pointAssessments[0];

            // Should have been called only 2 times: 2 custom judges, no backup
            expect(requestIndividualJudgeSpy).toHaveBeenCalledTimes(2);
            expect(assessment.coverageExtent).toBe(1.0); // Only successful judge
            expect(assessment.judgeModelId).toBe('consensus(standard(custom:judge1))');
            expect(assessment.individualJudgements).toHaveLength(1);
            expect(assessment.reflection).not.toContain('NOTE: Backup judge was used');
        });

        it('should return error when all judges (including backup) fail', async () => {
            const input = createMockEvaluationInput('prompt-all-fail-including-backup', points);
            
            requestIndividualJudgeSpy.mockImplementation(async (mrt, kpt, aokp, pct, judge) => {
                return { error: 'All judges failed' };
            });

            const result = await evaluator.evaluate([input]);
            const assessment = (result.llmCoverageScores?.['prompt-all-fail-including-backup']?.['model1'] as any)?.pointAssessments[0];

            // Should have been called 3 times: 2 primary + 1 backup
            expect(requestIndividualJudgeSpy).toHaveBeenCalledTimes(3);
            expect(assessment.error).toBe('All judges failed in consensus mode.');
            expect(assessment.coverageExtent).toBeUndefined();
            expect(assessment.judgeModelId).toBeUndefined();
        });

        it('should NOT be considered an error by repair-run when backup judge is used successfully', async () => {
            const input = createMockEvaluationInput('prompt-backup-no-error', points);
            
            requestIndividualJudgeSpy.mockImplementation(async (mrt, kpt, aokp, pct, judge) => {
                if (judge.model === 'openai:gpt-4.1-mini') return { coverage_extent: 0.8, reflection: 'Good from GPT-4' };
                if (judge.model === 'openrouter:google/gemini-2.5-flash-preview-05-20') return { error: 'Gemini failed' };
                if (judge.model === 'anthropic:claude-3.5-haiku') return { coverage_extent: 0.6, reflection: 'Backup Claude result' };
                return { error: 'unexpected judge' };
            });

            const result = await evaluator.evaluate([input]);
            const coverageResult = result.llmCoverageScores?.['prompt-backup-no-error']?.['model1'];

            // Verify the structure matches what repair-run expects
            expect(coverageResult).toBeDefined();
            expect(coverageResult).not.toHaveProperty('error'); // No error at coverage result level
            expect(coverageResult?.pointAssessments).toHaveLength(1);
            
            const assessment = coverageResult?.pointAssessments?.[0];
            expect(assessment?.error).toBeUndefined(); // This is the key check - no error field
            expect(assessment?.coverageExtent).toBe(0.7); // Has valid score
            expect(assessment?.reflection).toContain('NOTE: Backup judge was used to supplement failed primary judges.');

            // Simulate repair-run's detection logic
            const wouldRepairRunDetectAsError = coverageResult?.pointAssessments?.some((pa: any) => pa.error);
            expect(wouldRepairRunDetectAsError).toBe(false); // repair-run should NOT consider this an error
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
            input.config.prompts[0].should_not = [{ fn: 'contains', fnArgs: 'forbidden phrase' }];

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
            input.config.prompts[0].should_not = [{ fn: 'contains', fnArgs: 'forbidden phrase' }];

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
            input.config.prompts[0].should_not = [{ fn: 'word_count_between', fnArgs: [5, 10] }];

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

    describe('Alternative Paths (OR logic)', () => {
        it('should evaluate alternative paths and take the best score', async () => {
            // This test defines the expected behavior for nested arrays
            const input = createMockEvaluationInput(
                'prompt-alternative-paths',
                [
                    [
                        // Path 1: Both must be met
                        'mentions kindness',
                        { fn: 'contains', fnArgs: 'recipe' }
                    ],
                    [
                        // Path 2: Alternative path
                        'asks clarifying questions',
                        'offers to help'
                    ]
                ],
                "I'd be happy to help you find a recipe! What type of cuisine are you interested in?"
            );

            // Mock judges to return specific scores
            requestIndividualJudgeSpy.mockImplementation(async (modelResponseText, keyPointText, allOtherKeyPoints, promptContextText, judge) => {
                if (keyPointText === 'mentions kindness') return { coverage_extent: 0.3, reflection: 'Barely mentions kindness' };
                if (keyPointText === 'asks clarifying questions') return { coverage_extent: 0.9, reflection: 'Clearly asks questions' };
                if (keyPointText === 'offers to help') return { coverage_extent: 0.9, reflection: 'Offers to help' };
                return { error: 'unexpected keypoint' };
            });

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-alternative-paths']?.['model1'];

            if (!model1Result || 'error' in model1Result) {
                throw new Error("Test failed: model1Result has an error or is null");
            }

            // Path 1 score: (0.3 + 1.0) / 2 = 0.65 (assuming contains("recipe") = 1.0)
            // Path 2 score: (0.9 + 0.9) / 2 = 0.9
            // With OR logic, the best path score is selected: max(0.65, 0.9) = 0.9
            expect(model1Result.avgCoverageExtent).toBeCloseTo(0.9);
            
            // Should have assessments for all individual points
            expect(model1Result.pointAssessments).toBeDefined();
            expect(model1Result.pointAssessments?.length).toBeGreaterThan(0);
        });

        it('should handle mixed alternative paths with should_not', async () => {
            const input = createMockEvaluationInput(
                'prompt-mixed-alternative-paths',
                [
                    [
                        'is helpful',
                        'is polite'
                    ],
                    [
                        'provides detailed information'
                    ]
                ],
                "Here's a comprehensive guide to cooking pasta properly."
            );

            // Also add should_not with alternative paths
            input.config.prompts[0].should_not = [
                [
                    'is rude',
                    'is dismissive'
                ],
                [
                    'provides misinformation'
                ]
            ];

            requestIndividualJudgeSpy.mockImplementation(async (modelResponseText, keyPointText, allOtherKeyPoints, promptContextText, judge) => {
                if (keyPointText === 'is helpful') return { coverage_extent: 0.8, reflection: 'Quite helpful' };
                if (keyPointText === 'is polite') return { coverage_extent: 0.9, reflection: 'Very polite' };
                if (keyPointText === 'provides detailed information') return { coverage_extent: 0.95, reflection: 'Very detailed' };
                if (keyPointText === 'is rude') return { coverage_extent: 0.1, reflection: 'Not rude' };
                if (keyPointText === 'is dismissive') return { coverage_extent: 0.1, reflection: 'Not dismissive' };
                if (keyPointText === 'provides misinformation') return { coverage_extent: 0.0, reflection: 'No misinformation' };
                return { error: 'unexpected keypoint' };
            });

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-mixed-alternative-paths']?.['model1'];

            if (!model1Result || 'error' in model1Result) {
                throw new Error("Test failed: model1Result has an error or is null");
            }

            // Should have positive score from best path
            expect(model1Result.avgCoverageExtent).toBeGreaterThan(0.8);
            
            // Should handle both should and should_not alternative paths
            expect(model1Result.pointAssessments).toBeDefined();
            expect(model1Result.pointAssessments?.some(p => p.isInverted)).toBe(true);
        });

        it('should handle single-item alternative paths (backwards compatibility)', async () => {
            const input = createMockEvaluationInput(
                'prompt-single-alternative',
                [
                    [
                        'is concise'
                    ]
                ],
                "Yes."
            );

            requestIndividualJudgeSpy.mockResolvedValue({ coverage_extent: 1.0, reflection: 'Very concise' });

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-single-alternative']?.['model1'];

            if (!model1Result || 'error' in model1Result) {
                throw new Error("Test failed: model1Result has an error or is null");
            }

            expect(model1Result.avgCoverageExtent).toBe(1.0);
            expect(model1Result.pointAssessments).toHaveLength(1);
        });

        it('should handle empty alternative paths gracefully', async () => {
            const input = createMockEvaluationInput(
                'prompt-empty-alternative',
                [
                    [],
                    ['is helpful']
                ],
                "I can help with that."
            );

            requestIndividualJudgeSpy.mockResolvedValue({ coverage_extent: 0.8, reflection: 'Helpful' });

            const result = await evaluator.evaluate([input]);
            const model1Result = result.llmCoverageScores?.['prompt-empty-alternative']?.['model1'];

            if (!model1Result || 'error' in model1Result) {
                throw new Error("Test failed: model1Result has an error or is null");
            }

            // Should ignore empty path and use the valid one
            expect(model1Result.avgCoverageExtent).toBe(0.8);
            expect(model1Result.pointAssessments).toHaveLength(1);
        });
    });
}); 