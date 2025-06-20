import { executeComparisonPipeline } from './comparison-pipeline-service';
import { saveResult as saveResultToStorage } from '../../lib/storageService';
import { ComparisonConfig, ConversationMessage, EvaluationMethod } from '../types/comparison_v2';
import { getConfig, configure } from '../config';
import { getModelResponse, GetModelResponseOptions } from '../services/llm-service';
import * as llmService from './llm-service';

// Mock dependencies
jest.mock('../../lib/storageService', () => ({
  saveResult: jest.fn().mockResolvedValue(undefined),
  DEFAULT_TEMPERATURE: 0.5,
}));

jest.mock('../services/llm-service', () => ({
  ...jest.requireActual<typeof llmService>('./llm-service'),
  getModelResponse: jest.fn().mockResolvedValue('Mocked response'),
  DEFAULT_TEMPERATURE: 0.0,
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
const mockedGetModelResponse = getModelResponse as jest.Mock;

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

  it('should correctly aggregate results from multiple models and prompts', async () => {
    const aggConfig: ComparisonConfig = {
      id: 'agg-test',
      title: 'Aggregation Test',
      models: ['model-a', 'model-b'],
      prompts: [
        { id: 'p1', promptText: 'Prompt 1', messages: [{role: 'user', content: 'Prompt 1'}] },
        { id: 'p2', promptText: 'Prompt 2', messages: [{role: 'user', content: 'Prompt 2'}] },
      ],
      concurrency: 2,
    };
    const runLabel = 'agg-run';
    const evalMethods: EvaluationMethod[] = []; // No evaluators needed for this test

    mockedGetModelResponse.mockImplementation(async ({ modelId, messages }: { modelId: string, messages: ConversationMessage[] }) => {
      const lastMessage = messages[messages.length - 1];
      return `Response from ${modelId} to "${lastMessage.content}"`;
    });

    await executeComparisonPipeline(aggConfig, runLabel, evalMethods, logger);

    expect(mockedSaveResult).toHaveBeenCalledTimes(1);
    const [_, __, savedData] = mockedSaveResult.mock.calls[0];

    // Check top-level properties
    expect(savedData.configId).toBe('agg-test');
    expect(savedData.runLabel).toBe('agg-run');
    expect(savedData.promptIds.length).toBe(2);
    expect(savedData.effectiveModels.length).toBe(2);
    expect(savedData.effectiveModels).toContain('model-a[temp:0.0]');
    expect(savedData.effectiveModels).toContain('model-b[temp:0.0]');

    // Check responses for Prompt 1
    const p1Responses = savedData.allFinalAssistantResponses['p1'];
    expect(p1Responses['model-a[temp:0.0]']).toBe('Response from model-a to "Prompt 1"');
    expect(p1Responses['model-b[temp:0.0]']).toBe('Response from model-b to "Prompt 1"');
    
    // Check responses for Prompt 2
    const p2Responses = savedData.allFinalAssistantResponses['p2'];
    expect(p2Responses['model-a[temp:0.0]']).toBe('Response from model-a to "Prompt 2"');
    expect(p2Responses['model-b[temp:0.0]']).toBe('Response from model-b to "Prompt 2"');

    // Check conversation histories
    const p1History = savedData.fullConversationHistories['p1']['model-a[temp:0.0]'];
    expect(p1History.length).toBe(2);
    expect(p1History[0]).toEqual({role: 'user', content: 'Prompt 1'});
    expect(p1History[1]).toEqual({role: 'assistant', content: 'Response from model-a to "Prompt 1"'});
  });

  it('should be resilient to a single model failure and record the error', async () => {
    const resilientConfig: ComparisonConfig = {
      id: 'resilient-test',
      title: 'Resilient Test',
      models: ['good-model', 'bad-model'],
      prompts: [{ id: 'p1', promptText: 'Test prompt', messages: [{role: 'user', content: 'Test prompt'}]}],
      concurrency: 2,
    };
    const runLabel = 'resilience-run';
    const evalMethods: EvaluationMethod[] = ['embedding'];

    // Mock getModelResponse to fail for 'bad-model'
    mockedGetModelResponse.mockImplementation(async ({ modelId }: { modelId: string }) => {
      if (modelId === 'bad-model') {
        throw new Error('This model is broken');
      }
      return `Response from ${modelId}`;
    });

    await executeComparisonPipeline(resilientConfig, runLabel, evalMethods, logger);

    expect(mockedSaveResult).toHaveBeenCalledTimes(1);
    const [_, __, savedData] = mockedSaveResult.mock.calls[0];

    // Check that we have responses for the prompt
    expect(savedData.allFinalAssistantResponses).toHaveProperty('p1');
    const promptResponses = savedData.allFinalAssistantResponses['p1'];
    
    // Check that the good model has a successful response
    expect(promptResponses['good-model[temp:0.0]']).toBe('Response from good-model');

    // Check that the bad model's response is an error message
    expect(promptResponses['bad-model[temp:0.0]']).toContain('<error>Failed to get response for bad-model[temp:0.0]: This model is broken</error>');
    
    // Check that the error is recorded in the errors object
    expect(savedData.errors).toHaveProperty('p1');
    expect(savedData.errors['p1']['bad-model[temp:0.0]']).toContain('Failed to get response for bad-model[temp:0.0]: This model is broken');
  });

  it('should generate a result with a URL-safe timestamp in the filename and data', async () => {
    const dummyConfig: ComparisonConfig = {
      id: 'test-config',
      title: 'Test Config',
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

describe('executeComparisonPipeline permutation logic', () => {
  let getModelResponseSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Spy on getModelResponse and provide a mock implementation
    getModelResponseSpy = jest.spyOn(llmService, 'getModelResponse').mockImplementation(
      (options: GetModelResponseOptions) => Promise.resolve(`Mocked response for ${options.modelId}`)
    );
  });

  afterEach(() => {
    getModelResponseSpy.mockRestore();
  });

  it('should generate permutations for temperatures and systems', async () => {
    const config: ComparisonConfig = {
      id: 'perm-test',
      title: 'Permutation Test',
      models: ['test-model'],
      temperatures: [0.1, 0.9],
      systems: ['system-1', 'system-2', null],
      prompts: [{ id: 'p1', messages: [{role: 'user', content: 'hello'}] }],
    };

    const { logger } = getConfig();
    await executeComparisonPipeline(config, 'test-run', [], logger);

    // Expected calls = 1 prompt * 1 model * 2 temps * 3 systems = 6
    expect(getModelResponseSpy).toHaveBeenCalledTimes(6);

    // Check a few calls to ensure IDs and params are correct
    expect(getModelResponseSpy).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'test-model',
      temperature: 0.1,
      // The system prompt is now part of the messages array
      messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: 'system-1' })
      ]),
    }));
     expect(getModelResponseSpy).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'test-model',
      temperature: 0.9,
      messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: 'system-2' })
      ]),
    }));
     expect(getModelResponseSpy).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'test-model',
      temperature: 0.9,
       messages: expect.not.arrayContaining([
          expect.objectContaining({ role: 'system' })
      ]),
    }));
  });
   it('should handle a single temperature and single system prompt', async () => {
    const config: ComparisonConfig = {
      id: 'single-test',
      title: 'Single Test',
      models: ['test-model-1', 'test-model-2'],
      temperature: 0.5,
      system: 'global-system',
      prompts: [{ id: 'p1', messages: [{role: 'user', content: 'hello'}] }],
    };

    const { logger } = getConfig();
    await executeComparisonPipeline(config, 'test-run', [], logger);

    // Expected calls = 1 prompt * 2 models * 1 temp * 1 system = 2
    expect(getModelResponseSpy).toHaveBeenCalledTimes(2);

    expect(getModelResponseSpy).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'test-model-1',
      temperature: 0.5,
       messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: 'global-system' })
      ]),
    }));
     expect(getModelResponseSpy).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'test-model-2',
      temperature: 0.5,
       messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: 'global-system' })
      ]),
    }));
  });
}); 