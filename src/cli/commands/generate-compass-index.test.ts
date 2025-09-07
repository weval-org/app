import { Command } from 'commander';

// Mock dependencies
jest.mock('@/lib/storageService', () => ({
  listConfigIds: jest.fn(),
  listRunsForConfig: jest.fn(),
  getResultByFileName: jest.fn(),
  saveCompassIndex: jest.fn(),
}));
jest.mock('@/lib/pLimit', () => (concurrency: number) => (fn: () => Promise<any>) => fn());
jest.mock('../config', () => ({
  getConfig: () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
    },
  }),
}));

import { actionGenerateCompassIndex } from './generate-compass-index';
import {
  getResultByFileName,
  listConfigIds,
  listRunsForConfig,
  saveCompassIndex,
  CompassComparisonPair
} from '@/lib/storageService';

describe('actionGenerateCompassIndex', () => {
  let mockListConfigIds: jest.Mock;
  let mockListRunsForConfig: jest.Mock;
  let mockGetResultByFileName: jest.Mock;
  let mockSaveCompassIndex: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockListConfigIds = listConfigIds as jest.Mock;
    mockListRunsForConfig = listRunsForConfig as jest.Mock;
    mockGetResultByFileName = getResultByFileName as jest.Mock;
    mockSaveCompassIndex = saveCompassIndex as jest.Mock;
  });

  const createMockCandidate = (promptId: string, modelId: string, axisScore: number) => ({
    promptId,
    promptText: `Prompt text for ${promptId}`,
    modelId,
    modelResponse: `Response from ${modelId} on ${promptId}`,
    coverageScore: axisScore,
    axisScore,
    configId: 'test-config',
    runLabel: 'test-run',
    timestamp: new Date().toISOString(),
  });

  it('should create high-contrast comparison pairs for exemplars', async () => {
    mockListConfigIds.mockResolvedValue(['extrovert-config', 'introvert-config']);
    mockListRunsForConfig.mockImplementation(configId => {
      if (configId === 'extrovert-config' || configId === 'introvert-config') {
        return Promise.resolve([{ fileName: 'latest.json' }]);
      }
      return Promise.resolve([]);
    });

    const extrovertRunData = {
      config: {
        tags: ['_compass:extroverted'],
        prompts: [
          { id: 'prompt1', text: 'Prompt text for prompt1' },
          { id: 'prompt2', text: 'Prompt text for prompt2' },
        ],
      },
      promptIds: ['prompt1', 'prompt2'],
      effectiveModels: ['modelA', 'modelB', 'modelC'],
      allFinalAssistantResponses: {
        prompt1: { modelA: '...', modelB: '...', modelC: '...' },
        prompt2: { modelA: '...', modelB: '...', modelC: '...' },
      },
      evaluationResults: {
        llmCoverageScores: {
          prompt1: {
            modelA: { avgCoverageExtent: 0.9 }, // Top extrovert champion
            modelB: { avgCoverageExtent: 0.2 },
            modelC: { avgCoverageExtent: 0.5 },
          },
          prompt2: {
            modelA: { avgCoverageExtent: 0.8 },
            modelB: { avgCoverageExtent: 0.95 },// 2nd extrovert champion
            modelC: { avgCoverageExtent: 0.4 },
          },
        },
      },
    };

    const introvertRunData = {
      config: {
        tags: ['_compass:introverted'],
        prompts: [
          { id: 'prompt1', text: 'Prompt text for prompt1' },
          { id: 'prompt2', text: 'Prompt text for prompt2' },
        ],
      },
      promptIds: ['prompt1', 'prompt2'],
      effectiveModels: ['modelA', 'modelB', 'modelC'],
      allFinalAssistantResponses: {
        prompt1: { modelA: '...', modelB: '...', modelC: '...' },
        prompt2: { modelA: '...', modelB: '...', modelC: '...' },
      },
      evaluationResults: {
        llmCoverageScores: {
          prompt1: {
            modelA: { avgCoverageExtent: 0.3 },
            modelB: { avgCoverageExtent: 0.85 }, // Top introvert rival for prompt1
            modelC: { avgCoverageExtent: 0.6 },
          },
          prompt2: {
            modelA: { avgCoverageExtent: 0.9 }, // Top introvert champion
            modelB: { avgCoverageExtent: 0.1 },
            modelC: { avgCoverageExtent: 0.2 },
          },
        },
      },
    };

    mockGetResultByFileName.mockImplementation((configId, fileName) => {
      if (configId === 'extrovert-config') return Promise.resolve(extrovertRunData);
      if (configId === 'introvert-config') return Promise.resolve(introvertRunData);
      return Promise.resolve(null);
    });

    await actionGenerateCompassIndex({ verbose: false, concurrency: 1 });

    expect(mockSaveCompassIndex).toHaveBeenCalledTimes(1);
    const savedIndex = mockSaveCompassIndex.mock.calls[0][0];
    const extroversionExemplars = savedIndex.exemplars.extroversion;

    expect(extroversionExemplars).toBeDefined();
    expect(extroversionExemplars.comparisonPairs).toHaveLength(2);

    // Find the pair for prompt1 and verify its contents (order-independent)
    const pair1 = extroversionExemplars.comparisonPairs.find((p: CompassComparisonPair) => p.promptText.includes('prompt1'));
    expect(pair1).toBeDefined();
    expect(pair1!.positiveExemplar.modelId).toBe('modelA'); // The champion on prompt1
    expect(pair1!.negativeExemplar.modelId).toBe('modelB'); // The best rival on prompt1

    // Find the pair for prompt2 and verify its contents (order-independent)
    const pair2 = extroversionExemplars.comparisonPairs.find((p: CompassComparisonPair) => p.promptText.includes('prompt2'));
    expect(pair2).toBeDefined();
    expect(pair2!.positiveExemplar.modelId).toBe('modelB'); // The champion on prompt2
    expect(pair2!.negativeExemplar.modelId).toBe('modelA'); // The best rival on prompt2
  });
});
