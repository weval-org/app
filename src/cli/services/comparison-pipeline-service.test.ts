import { executeComparisonPipeline } from './comparison-pipeline-service';
import { saveResult as saveResultToStorage } from '../../lib/storageService';
import { ComparisonConfig, EvaluationMethod } from '../types/comparison_v2';
import { getConfig, configure } from '../config';

// Mock dependencies
jest.mock('../../lib/storageService', () => ({
  saveResult: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/llm-service', () => ({
  getModelResponse: jest.fn().mockResolvedValue('Mocked response'),
  DEFAULT_TEMPERATURE: 0.5,
}));

jest.mock('@/cli/evaluators/embedding-evaluator', () => ({
  EmbeddingEvaluator: jest.fn().mockImplementation(() => ({
    getMethodName: () => 'embedding',
    evaluate: jest.fn().mockResolvedValue({
      similarityMatrix: {},
      perPromptSimilarities: {},
    }),
  })),
}));

jest.mock('@/cli/evaluators/llm-coverage-evaluator', () => ({
  LLMCoverageEvaluator: jest.fn().mockImplementation(() => ({
    getMethodName: () => 'llm-coverage',
    evaluate: jest.fn().mockResolvedValue({
      llmCoverageScores: {},
      extractedKeyPoints: {},
    }),
  })),
}));

const mockedSaveResult = saveResultToStorage as jest.Mock;

describe('executeComparisonPipeline', () => {
  let logger: ReturnType<typeof getConfig>['logger'];
  
  beforeAll(() => {
    // Mock logger to prevent console output during tests
    const mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    };
    // Initialize the CLI config, which is required by services under test.
    configure({
      logger: mockLogger,
      errorHandler: jest.fn(),
    });

    logger = getConfig().logger;
  });

  beforeEach(() => {
    // Clear mock history before each test
    mockedSaveResult.mockClear();
    (logger.info as jest.Mock).mockClear();
    (logger.warn as jest.Mock).mockClear();
    (logger.error as jest.Mock).mockClear();
    (logger.success as jest.Mock).mockClear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original logger functions
    jest.restoreAllMocks();
  });

  it('should generate a result with a URL-safe timestamp in the filename and data', async () => {
    const dummyConfig: ComparisonConfig = {
      configId: 'test-config',
      configTitle: 'Test Config',
      models: ['test-model-1'],
      prompts: [{ id: 'prompt-1', promptText: 'Hello', messages: [{role: 'user', content: 'Hello'}] }],
      concurrency: 1,
    };
    const runLabel = 'test-run';
    const evalMethods: EvaluationMethod[] = ['embedding'];

    await executeComparisonPipeline(dummyConfig, runLabel, evalMethods, logger);

    // Check that saveResult was called
    expect(mockedSaveResult).toHaveBeenCalledTimes(1);

    // Extract arguments from the mock call
    const [configId, fileName, savedData] = mockedSaveResult.mock.calls[0];

    // 1. Validate the timestamp format in the filename
    const timestampRegex = /([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z)/;
    const match = fileName.match(timestampRegex);
    
    expect(fileName).toMatch(/_comparison\.json$/);
    expect(match).not.toBeNull();
    
    const timestampFromFileName = match![1];
    
    // Ensure no colons or periods are in the filename timestamp part
    expect(timestampFromFileName).not.toContain(':');
    expect(timestampFromFileName).not.toContain('.');

    // 2. Validate the timestamp in the saved data object
    expect(savedData).toHaveProperty('timestamp');
    const timestampFromData = savedData.timestamp;

    // The timestamp in the data should also be in the safe format
    expect(timestampFromData).toMatch(timestampRegex);
    expect(timestampFromData).not.toContain(':');
    expect(timestampFromData).not.toContain('.');

    // 3. Ensure timestamps from filename and data are identical
    expect(timestampFromData).toEqual(timestampFromFileName);
  });
}); 