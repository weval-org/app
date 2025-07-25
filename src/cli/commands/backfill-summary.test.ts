import { backfillSummaryCommand } from './backfill-summary';
import * as storageService from '../../lib/storageService';
import { getConfig }from '../config';
import * as pairwiseService from '../services/pairwise-task-queue-service';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';
import { IDEAL_MODEL_ID } from '../../app/utils/calculationUtils';

// Use the real implementation for updateSummaryDataWithNewRun, but mock the others.
jest.mock('../../lib/storageService', () => {
  const originalStorageService = jest.requireActual('../../lib/storageService');
  return {
    ...originalStorageService,
    listConfigIds: jest.fn(),
    listRunsForConfig: jest.fn(),
    getResultByFileName: jest.fn(),
    saveConfigSummary: jest.fn(),
    saveHomepageSummary: jest.fn(),
    saveLatestRunsSummary: jest.fn(),
    saveModelSummary: jest.fn(),
  };
});

jest.mock('../services/pairwise-task-queue-service');
jest.mock('../config');

const mockedStorage = storageService as jest.Mocked<typeof storageService>;
const mockedPairwiseService = pairwiseService as jest.Mocked<typeof pairwiseService>;
const mockedGetConfig = getConfig as jest.Mocked<typeof getConfig>;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockConfigData1 = {
    configId: 'config-1',
    configTitle: 'Config 1',
    tags: ['_featured'],
    runs: [{ runLabel: 'run-1', timestamp: '2024-01-01T10-00-00-000Z', fileName: 'f1' }],
    latestRunTimestamp: '2024-01-01T10-00-00-000Z',
    runLabel: 'run-1',
    timestamp: '2024-01-01T10-00-00-000Z',
    effectiveModels: ['test-provider:test-model-a'],
    evaluationResults: {
        perModelScores: new Map([
            ['test-provider:test-model-a', { 
                hybrid: { average: 0.9, stddev: 0 },
                similarity: { average: 0.9, stddev: 0 },
                coverage: { average: 0.9, stddev: 0 },
            }]
        ])
    }
};

const mockConfigData2 = {
    configId: 'config-2',
    configTitle: 'Config 2',
    tags: ['not-featured'],
    runs: [{ runLabel: 'run-2', timestamp: '2024-01-02T10-00-00-000Z', fileName: 'f2' }],
    latestRunTimestamp: '2024-01-02T10-00-00-000Z',
};

const mockResultData1: Partial<FetchedComparisonData> = {
    configId: 'config-1',
    configTitle: 'Config 1',
    runLabel: 'run-1',
    timestamp: '2024-01-01T10-00-00-000Z',
    config: {
        id: 'config-1',
        title: 'Config 1',
        models: ['test-provider:test-model-a'],
        prompts: [{id: 'p1', promptText: '...', idealResponse: 'ideal text'}],
        tags: ['_featured', '_get_human_prefs'],
    } as any,
    evalMethodsUsed: ['embedding', 'llm-coverage'],
    promptIds: ['p1'],
    effectiveModels: ['test-provider:test-model-a', IDEAL_MODEL_ID],
    evaluationResults: {
        perPromptSimilarities: {
            'p1': {
                'test-provider:test-model-a': {
                    [IDEAL_MODEL_ID]: 0.9
                }
            }
        },
        llmCoverageScores: {
            'p1': {
                'test-provider:test-model-a': {
                    avgCoverageExtent: 0.9,
                    keyPointsCount: 1,
                } as any
            }
        }
    }
 };

const mockResultData2: Partial<FetchedComparisonData> = {
    configId: 'config-2',
    configTitle: 'Config 2',
    runLabel: 'run-2',
    timestamp: '2024-01-02T10-00-00-000Z',
    config: {
        id: 'config-2',
        title: 'Config 2',
        models: ['test-provider:test-model-b'],
        prompts: [{id: 'p1', promptText: '...', idealResponse: 'ideal text'}],
        tags: ['not-featured'],
    } as any,
    evalMethodsUsed: ['embedding', 'llm-coverage'],
    promptIds: ['p1'],
    effectiveModels: ['test-provider:test-model-b', IDEAL_MODEL_ID],
    evaluationResults: {
        perPromptSimilarities: {
            'p1': {
                'test-provider:test-model-b': {
                    [IDEAL_MODEL_ID]: 0.7
                }
            }
        },
        llmCoverageScores: {
            'p1': {
                'test-provider:test-model-b': {
                    avgCoverageExtent: 0.85,
                    keyPointsCount: 1,
                } as any
            }
        }
    }
};

const mockRunInfo1 = { runLabel: 'run-1-new', timestamp: '2024-01-01T12-00-00-000Z', fileName: 'f1_new.json' };
const mockRunInfo1_old = { runLabel: 'run-1-old', timestamp: '2024-01-01T10-00-00-000Z', fileName: 'f1_old.json' };
const mockRunInfo2 = { runLabel: 'run-2', timestamp: '2024-01-02T10-00-00-000Z', fileName: 'f2.json' };

const mockResultData1_new = { ...mockResultData1, runLabel: 'run-1-new', timestamp: '2024-01-01T12-00-00-000Z' };
const mockResultData1_old = { ...mockResultData1, runLabel: 'run-1-old', timestamp: '2024-01-01T10-00-00-000Z' };

describe('backfill-summary command', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (mockedGetConfig as any).mockReturnValue({ logger: mockLogger });

        // Reset mocks to a default "happy path" state
        mockedStorage.listConfigIds.mockResolvedValue(['config-1', 'config-2']);
        mockedStorage.listRunsForConfig.mockImplementation((configId: string) => {
            if (configId === 'config-1') return Promise.resolve([mockRunInfo1, mockRunInfo1_old]); // Newest first
            if (configId === 'config-2') return Promise.resolve([mockRunInfo2]);
            return Promise.resolve([]);
        });
        mockedStorage.getResultByFileName.mockImplementation((configId: string, fileName: string) => {
            if (fileName === 'f1_new.json') return Promise.resolve(mockResultData1_new as any);
            if (fileName === 'f1_old.json') return Promise.resolve(mockResultData1_old as any);
            if (fileName === 'f2.json') return Promise.resolve(mockResultData2 as any);
            return Promise.resolve(null);
        });
    });

    it('should process all configs and runs, saving a summary for each', async () => {
        await backfillSummaryCommand.parseAsync(['node', 'test']);

        expect(mockedStorage.listConfigIds).toHaveBeenCalledTimes(1);
        expect(mockedStorage.listRunsForConfig).toHaveBeenCalledWith('config-1');
        expect(mockedStorage.listRunsForConfig).toHaveBeenCalledWith('config-2');
        expect(mockedStorage.getResultByFileName).toHaveBeenCalledTimes(3); // 2 for config-1, 1 for config-2
        
        // Check that a per-config summary was saved for each config
        expect(mockedStorage.saveConfigSummary).toHaveBeenCalledTimes(2);
        expect(mockedStorage.saveConfigSummary).toHaveBeenCalledWith('config-1', expect.any(Object));
        expect(mockedStorage.saveConfigSummary).toHaveBeenCalledWith('config-2', expect.any(Object));
    });

    it('should call populatePairwiseQueue ONLY for the LATEST run of configs WITH the _get_human_prefs tag', async () => {
        await backfillSummaryCommand.parseAsync(['node', 'test']);

        // It should be called once for config-1's latest run, as it has the tag.
        expect(mockedPairwiseService.populatePairwiseQueue).toHaveBeenCalledTimes(1);
        
        // Verify it was called with the NEW data for config-1
        expect(mockedPairwiseService.populatePairwiseQueue).toHaveBeenCalledWith(
            expect.objectContaining({ runLabel: 'run-1-new' }), 
            expect.any(Object)
        );
        
        // Verify it was NOT called for config-2, which does not have the tag.
        expect(mockedPairwiseService.populatePairwiseQueue).not.toHaveBeenCalledWith(
            expect.objectContaining({ configId: 'config-2' }),
            expect.any(Object)
        );
    });

    it('should call saveModelSummary for models found in runs', async () => {
        await backfillSummaryCommand.parseAsync(['node', 'test']);

        // Check that the logic to generate model summaries was triggered
        expect(mockedStorage.saveModelSummary).toHaveBeenCalled();

        // Check that it was called for 'test-model-b' which was in mockResultData2
        const saveModelSummaryCalls = mockedStorage.saveModelSummary.mock.calls;
        const modelBSummaryCall = saveModelSummaryCalls.find(call => call[0] === 'test-provider:test-model-b');
        expect(modelBSummaryCall).toBeDefined();
        // Optionally, check some details of the summary object passed
        const modelBSummaryObject = modelBSummaryCall![1];
        expect(modelBSummaryObject.overallStats.totalRuns).toBe(1);
        expect(modelBSummaryObject.overallStats.averageHybridScore).toBeCloseTo(0.7975);
    });

    it('should save a hybrid homepage summary with run data only for featured configs', async () => {
        await backfillSummaryCommand.parseAsync(['node', 'test']);

        // Check that the final homepage summary was saved
        expect(mockedStorage.saveHomepageSummary).toHaveBeenCalledTimes(1);
        
        // Get the argument passed to saveHomepageSummary
        const savedHomepageSummary = mockedStorage.saveHomepageSummary.mock.calls[0][0];

        // Assert that the summary contains metadata for ALL configs
        expect(savedHomepageSummary.configs).toHaveLength(2);

        // Find the featured config and assert it has its run data
        const featuredConfig = savedHomepageSummary.configs.find((c: any) => c.configId === 'config-1');
        expect(featuredConfig).toBeDefined();
        expect(featuredConfig!.tags).toContain('_featured');
        expect(featuredConfig!.runs).toHaveLength(1); // It should have its run data

        // Find the non-featured config and assert its run data is stripped
        const nonFeaturedConfig = savedHomepageSummary.configs.find((c: any) => c.configId === 'config-2');
        expect(nonFeaturedConfig).toBeDefined();
        expect(nonFeaturedConfig!.tags).not.toContain('_featured');
        expect(nonFeaturedConfig!.runs).toHaveLength(0); // Its runs should be an empty array
    });

    it('should handle cases where no configs are found', async () => {
        mockedStorage.listConfigIds.mockResolvedValue([]);
        await backfillSummaryCommand.parseAsync(['node', 'test']);
        expect(mockLogger.warn).toHaveBeenCalledWith('No configuration IDs found. Nothing to backfill.');
        expect(mockedStorage.saveConfigSummary).not.toHaveBeenCalled();
        expect(mockedStorage.saveHomepageSummary).not.toHaveBeenCalled();
    });

    it('should handle configs with no runs', async () => {
        mockedStorage.listRunsForConfig.mockResolvedValue([]);
        await backfillSummaryCommand.parseAsync(['node', 'test']);
        expect(mockedStorage.listRunsForConfig).toHaveBeenCalledWith('config-1');
        expect(mockedStorage.listRunsForConfig).toHaveBeenCalledWith('config-2');
        expect(mockedStorage.getResultByFileName).not.toHaveBeenCalled();
        expect(mockedStorage.saveConfigSummary).not.toHaveBeenCalled();
    });

    it('should handle failure to fetch a result file', async () => {
        mockedStorage.getResultByFileName.mockResolvedValue(null);
        await backfillSummaryCommand.parseAsync(['node', 'test']);
        expect(mockLogger.warn).toHaveBeenCalledWith('  Could not fetch or parse result data for run file: f1_new.json');
        expect(mockLogger.warn).toHaveBeenCalledWith('  Could not fetch or parse result data for run file: f1_old.json');
        expect(mockLogger.warn).toHaveBeenCalledWith('  Could not fetch or parse result data for run file: f2.json');
        expect(mockedStorage.saveConfigSummary).not.toHaveBeenCalled();
    });

}); 