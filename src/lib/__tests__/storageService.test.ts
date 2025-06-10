import { updateSummaryDataWithNewRun } from '../storageService';
import { EnhancedComparisonConfigInfo } from '../../app/utils/homepageDataUtils';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';

// Mock calculation utilities as their specific output isn't being tested here.
jest.mock('../../app/utils/calculationUtils', () => ({
  calculateAverageHybridScoreForRun: jest.fn(() => ({ average: 0.9, stddev: 0.1 })),
  calculatePerModelHybridScoresForRun: jest.fn(() => new Map([['model-1', { average: 0.9, stddev: 0.1 }]])),
  calculateStandardDeviation: jest.fn(() => 0.05),
}));

describe('updateSummaryDataWithNewRun', () => {
  const baseMockResultData: FetchedComparisonData = {
    configId: 'test-config',
    configTitle: 'Test Config',
    runLabel: 'test-run',
    timestamp: '', // This will be set per test
    config: {
      configId: 'test-config',
      configTitle: 'Test Config',
      models: [],
      prompts: [],
    },
    evalMethodsUsed: ['embedding'],
    effectiveModels: ['model-1'],
    modelSystemPrompts: {},
    promptIds: ['p-1'],
    promptContexts: {},
    allFinalAssistantResponses: {},
    evaluationResults: {},
  };

  it('should correctly sort runs by URL-safe timestamps', () => {
    // Timestamps in safe format, but chronologically out of order
    const safeTimestamp1 = '2024-01-01T10-00-00-000Z'; // oldest
    const safeTimestamp2 = '2024-01-02T12-30-00-000Z'; // newest
    const safeTimestamp3 = '2024-01-01T11-00-00-000Z'; // middle

    // An existing summary with two runs
    const existingSummary: EnhancedComparisonConfigInfo[] = [
      {
        configId: 'test-config',
        configTitle: 'Test Config',
        id: 'test-config',
        title: 'Test Config',
        description: '',
        runs: [
          { runLabel: 'run1', timestamp: safeTimestamp1, fileName: `run1_${safeTimestamp1}_comparison.json` },
          { runLabel: 'run3', timestamp: safeTimestamp3, fileName: `run3_${safeTimestamp3}_comparison.json` },
        ],
        latestRunTimestamp: safeTimestamp3,
        tags: [],
        overallAverageHybridScore: 0.8,
        hybridScoreStdDev: 0.1,
      },
    ];

    // The new run to add is the chronologically newest one
    const newResultData: FetchedComparisonData = {
      ...baseMockResultData,
      timestamp: safeTimestamp2,
    };
    const newRunFileName = `run2_${safeTimestamp2}_comparison.json`;

    // Run the function
    const updatedSummary = updateSummaryDataWithNewRun(existingSummary, newResultData, newRunFileName);

    // Get the updated config
    const updatedConfig = updatedSummary.find(c => c.configId === 'test-config');
    expect(updatedConfig).toBeDefined();
    expect(updatedConfig!.runs).toHaveLength(3);

    // Assert that the runs are now sorted chronologically descending (newest first)
    expect(updatedConfig!.runs[0].timestamp).toBe(safeTimestamp2);
    expect(updatedConfig!.runs[1].timestamp).toBe(safeTimestamp3);
    expect(updatedConfig!.runs[2].timestamp).toBe(safeTimestamp1);

    // Assert that the config's latestRunTimestamp is updated
    expect(updatedConfig!.latestRunTimestamp).toBe(safeTimestamp2);
  });

  it('should handle a mix of safe and unsafe (legacy) timestamps gracefully during sorting', () => {
    const legacyTimestamp = '2024-02-01T10:00:00.000Z'; // Newest, but unsafe format
    const safeTimestamp = '2024-01-15T12-00-00-000Z';   // Oldest

     const existingSummary: EnhancedComparisonConfigInfo[] = [
      {
        configId: 'test-config',
        configTitle: 'Test Config',
        id: 'test-config',
        title: 'Test Config',
        description: '',
        runs: [{ runLabel: 'run-safe', timestamp: safeTimestamp, fileName: `run-safe_${safeTimestamp}_comparison.json` }],
        latestRunTimestamp: safeTimestamp,
        tags: [],
        overallAverageHybridScore: 0.8,
        hybridScoreStdDev: 0.1,
      },
    ];
    
    const newResultData: FetchedComparisonData = {
      ...baseMockResultData,
      // This is the key part of the test: the incoming data might have an "unsafe" timestamp
      // if it comes from an old file that the backfill command didn't fix the content of.
      // The update function should handle it.
      timestamp: legacyTimestamp, 
    };
    const newRunFileName = `run-legacy_${legacyTimestamp.replace(/[:.]/g, '-')}_comparison.json`;

    const updatedSummary = updateSummaryDataWithNewRun(existingSummary, newResultData, newRunFileName);
    const updatedConfig = updatedSummary.find(c => c.configId === 'test-config');

    expect(updatedConfig).toBeDefined();
    expect(updatedConfig!.runs).toHaveLength(2);

    // The function should correctly identify the legacy timestamp as the newest and place it first.
    // NOTE: The timestamp stored in the run *is not changed*. The function just needs to parse it correctly for sorting.
    expect(updatedConfig!.runs[0].timestamp).toBe(legacyTimestamp);
    expect(updatedConfig!.runs[1].timestamp).toBe(safeTimestamp);
    
    // The latestRunTimestamp for the whole config should also be updated.
    expect(updatedConfig!.latestRunTimestamp).toBe(legacyTimestamp);
  });

}); 