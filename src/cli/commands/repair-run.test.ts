import { jest } from '@jest/globals';
import { repairRunCommand } from './repair-run';
import * as storageService from '../../lib/storageService';
import * as backfillSummary from './backfill-summary';
import * as executiveSummaryService from '../services/executive-summary-service';
import { LLMCoverageEvaluator } from '../evaluators/llm-coverage-evaluator';
import { getConfig } from '../config';
import { FinalComparisonOutputV2 as FetchedComparisonData } from '../types/cli_types';

jest.mock('@/lib/storageService');
jest.mock('@/cli/commands/backfill-summary');
jest.mock('@/cli/services/executive-summary-service');
jest.mock('@/cli/evaluators/llm-coverage-evaluator');
jest.mock('@/cli/config');

const mockedStorage = storageService as jest.Mocked<typeof storageService>;
const mockedBackfill = backfillSummary as jest.Mocked<typeof backfillSummary>;
const mockedExecutiveSummary = executiveSummaryService as jest.Mocked<typeof executiveSummaryService>;
const mockedLLMCoverageEvaluator = LLMCoverageEvaluator as jest.MockedClass<typeof LLMCoverageEvaluator>;
const mockedGetConfig = getConfig as jest.MockedFunction<typeof getConfig>;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
};

const mockRunIdentifier = 'config-1/run-1/2024-01-01T00-00-00-000Z';
const mockFileName = 'run-1_2024-01-01T00-00-00-000Z_comparison.json';

const mockFailedResultData: Partial<FetchedComparisonData> = {
  configId: 'config-1',
  runLabel: 'run-1',
  timestamp: '2024-01-01T00-00-00-000Z',
  config: { prompts: [{ id: 'p1' }] } as any,
  promptContexts: { p1: 'Test prompt' },
  allFinalAssistantResponses: { p1: { 'model-a': 'Test response' } },
  evaluationResults: {
    llmCoverageScores: {
      p1: {
        'model-a': {
          keyPointsCount: 1,
          avgCoverageExtent: 0,
          pointAssessments: [{
            keyPointText: 'Test Key Point',
            error: 'All judges failed in consensus mode.',
            multiplier: 1,
            isInverted: false,
          }],
        },
        'model-b': { // This one is fine
            keyPointsCount: 1,
            avgCoverageExtent: 1.0,
            pointAssessments: [{
              keyPointText: 'Test Key Point',
              coverageExtent: 1.0,
              reflection: 'Perfect.',
              multiplier: 1,
              isInverted: false,
            }],
          },
      },
    },
  },
};

const mockRepairedCoverage = {
    llmCoverageScores: {
      p1: {
        'model-a': {
          keyPointsCount: 1,
          avgCoverageExtent: 0.9,
          pointAssessments: [{
            keyPointText: 'Test Key Point',
            coverageExtent: 0.9,
            reflection: 'Successfully repaired!',
            error: undefined,
            multiplier: 1,
            isInverted: false,
          }],
        },
      },
    },
  };

describe('repair-run command', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (mockedGetConfig as any).mockReturnValue({ logger: mockLogger });
        mockedStorage.getResultByFileName.mockResolvedValue(mockFailedResultData as FetchedComparisonData);
        mockedLLMCoverageEvaluator.prototype.evaluate.mockResolvedValue(mockRepairedCoverage);
        mockedExecutiveSummary.generateExecutiveSummary.mockResolvedValue({ modelId: 'test-summary-model', content: 'Repaired summary.' });
    });

    it('should successfully repair a run with failed assessments', async () => {
        await repairRunCommand.parseAsync(['node', 'test', mockRunIdentifier]);

        // 1. Should fetch the correct file
        expect(mockedStorage.getResultByFileName).toHaveBeenCalledWith('config-1', mockFileName);

        // 2. Should call the evaluator with the correct inputs
        expect(mockedLLMCoverageEvaluator.prototype.evaluate).toHaveBeenCalledTimes(1);
        const evaluatorInput = mockedLLMCoverageEvaluator.prototype.evaluate.mock.calls[0][0];
        expect(evaluatorInput).toHaveLength(1);
        expect(evaluatorInput[0].promptData.promptId).toBe('p1');
        expect(evaluatorInput[0].effectiveModelIds).toEqual(['model-a']);

        // 3. Should save the repaired result
        expect(mockedStorage.saveResult).toHaveBeenCalledTimes(1);
        const savedData = mockedStorage.saveResult.mock.calls[0][2] as FetchedComparisonData;
        
        // Check that the repaired data is merged correctly
        const finalAssessment = savedData.evaluationResults.llmCoverageScores!.p1['model-a']!.pointAssessments![0];
        expect(finalAssessment?.error).toBeUndefined();
        expect(finalAssessment?.reflection).toBe('Successfully repaired!');
        
        // Check that the unaffected model's data is still present
        expect(savedData.evaluationResults.llmCoverageScores!.p1['model-b']).toBeDefined();

        // 4. Should regenerate the executive summary
        expect(mockedExecutiveSummary.generateExecutiveSummary).toHaveBeenCalledTimes(1);
        expect(savedData.executiveSummary?.content).toBe('Repaired summary.');

        // 5. Should trigger a summary backfill
        expect(mockedBackfill.actionBackfillSummary).toHaveBeenCalledTimes(1);

        // 6. Should log success
        expect(mockLogger.info).toHaveBeenCalledWith(`Repair process for ${mockRunIdentifier} completed successfully.`);
    });
    
    it('should exit gracefully if no repairs are needed', async () => {
        const perfectData = JSON.parse(JSON.stringify(mockFailedResultData)) as FetchedComparisonData;
        perfectData.evaluationResults.llmCoverageScores!.p1['model-a']!.pointAssessments![0].error = undefined;
        mockedStorage.getResultByFileName.mockResolvedValue(perfectData);

        await repairRunCommand.parseAsync(['node', 'test', mockRunIdentifier]);

        expect(mockLogger.info).toHaveBeenCalledWith('No failed assessments or generation errors found. Nothing to repair.');
        expect(mockedLLMCoverageEvaluator.prototype.evaluate).not.toHaveBeenCalled();
        expect(mockedStorage.saveResult).not.toHaveBeenCalled();
        expect(mockedBackfill.actionBackfillSummary).not.toHaveBeenCalled();
    });

    it('should handle file not found error', async () => {
        mockedStorage.getResultByFileName.mockResolvedValue(null);
        // Mock process.exit to prevent the test runner from exiting
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

        await repairRunCommand.parseAsync(['node', 'test', mockRunIdentifier]);

        expect(mockLogger.error).toHaveBeenCalledWith(`Could not find result file for identifier: ${mockRunIdentifier}`);
        expect(exitSpy).toHaveBeenCalledWith(1);
        exitSpy.mockRestore();
    });

    it('should handle invalid identifier format', async () => {
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
        const invalidIdentifier = 'invalid-format';

        await repairRunCommand.parseAsync(['node', 'test', invalidIdentifier]);

        expect(mockLogger.error).toHaveBeenCalledWith('Invalid runIdentifier format. Expected "configId/runLabel/timestamp".');
        expect(exitSpy).toHaveBeenCalledWith(1);
        exitSpy.mockRestore();
    });
}); 