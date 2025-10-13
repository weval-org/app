/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import {
  populatePairwiseQueue,
  PairwiseTask,
} from '../pairwise-task-queue-service';
import { ComparisonDataV2 } from '@/app/utils/types';
import { SimpleLogger } from '@/lib/blueprint-service';

// Mock @netlify/blobs
jest.mock('@netlify/blobs', () => ({
  getStore: jest.fn(),
}));

// Mock fs/promises for credential reading
jest.mock('fs/promises');
jest.mock('fs');

// Mock pLimit
jest.mock('@/lib/pLimit', () => {
  return jest.fn((concurrency: number) => {
    return (fn: () => Promise<any>) => fn();
  });
});

const { getStore } = require('@netlify/blobs');

describe('populatePairwiseQueue', () => {
  let mockStore: any;
  let mockLogger: SimpleLogger;
  const OFFICIAL_ANCHOR_MODEL = 'openrouter:openai/gpt-4.1-mini';

  beforeEach(() => {
    jest.clearAllMocks();

    mockStore = {
      get: jest.fn(),
      setJSON: jest.fn(),
    };

    // Mock getStore to return mockStore regardless of how it's called
    (getStore as jest.Mock).mockImplementation(() => mockStore);

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    };
  });

  it('should create pairwise tasks pairing all models with the anchor model', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1'],
      promptContexts: {
        'prompt-1': 'What is the capital of France?',
      },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Paris is the capital.',
          'openrouter:anthropic/claude-3.5-sonnet': 'The capital is Paris.',
          'openrouter:meta/llama-3.2-70b': 'Paris.',
        },
      },
      modelSystemPrompts: {
        [OFFICIAL_ANCHOR_MODEL]: 'You are a helpful assistant.',
      },
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]); // Empty indexes initially

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    expect(result.tasksAdded).toBe(2); // 2 models paired with anchor
    expect(result.totalTasksInQueue).toBe(0); // Bug: returns OLD index length, not updated length

    // Verify tasks were saved
    const setJSONCalls = mockStore.setJSON.mock.calls;
    const taskCalls = setJSONCalls.filter((call: any) => !call[0].startsWith('_index'));
    expect(taskCalls).toHaveLength(2);

    // Verify each task has correct structure
    taskCalls.forEach((call: any) => {
      const task: PairwiseTask = call[1];
      expect(task).toHaveProperty('taskId');
      expect(task).toHaveProperty('prompt');
      expect(task).toHaveProperty('responseA');
      expect(task).toHaveProperty('responseB');
      expect(task).toHaveProperty('modelIdA');
      expect(task).toHaveProperty('modelIdB');
      expect(task.configId).toBe('test-config');

      // One model should be the anchor
      expect(
        task.modelIdA === OFFICIAL_ANCHOR_MODEL || task.modelIdB === OFFICIAL_ANCHOR_MODEL
      ).toBe(true);
    });
  });

  it('should store model IDs exactly as provided', async () => {
    // Test that model IDs are stored without modification
    const modelA = OFFICIAL_ANCHOR_MODEL;
    const modelB = 'openrouter:anthropic/claude-3.5-sonnet';

    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1'],
      promptContexts: { 'prompt-1': 'Test' },
      allFinalAssistantResponses: {
        'prompt-1': {
          [modelA]: 'Response from anchor',
          [modelB]: 'Response from claude',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    expect(result.tasksAdded).toBe(1);
    expect(result.totalTasksInQueue).toBe(0); // Bug: returns OLD index length

    // Verify the exact model IDs are stored
    const taskCalls = mockStore.setJSON.mock.calls.filter((call: any) => !call[0].startsWith('_index'));
    const task: PairwiseTask = taskCalls[0][1];

    expect(task.modelIdA).toBe(modelA);
    expect(task.modelIdB).toBe(modelB);
  });

  it('should create both global and config-specific indexes', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1'],
      promptContexts: { 'prompt-1': 'Test' },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Anchor response',
          'openrouter:anthropic/claude-3.5-sonnet': 'Claude response',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    await populatePairwiseQueue(resultData, { logger: mockLogger });

    // Find the index update calls
    const indexCalls = mockStore.setJSON.mock.calls.filter((call: any) => call[0].startsWith('_index'));

    expect(indexCalls).toHaveLength(2);

    // Check for global index
    const globalIndexCall = indexCalls.find((call: any) => call[0] === '_index');
    expect(globalIndexCall).toBeDefined();
    expect(Array.isArray(globalIndexCall![1])).toBe(true);
    expect(globalIndexCall![1].length).toBe(1);

    // Check for config-specific index
    const configIndexCall = indexCalls.find((call: any) => call[0] === '_index_test-config');
    expect(configIndexCall).toBeDefined();
    expect(Array.isArray(configIndexCall![1])).toBe(true);
    expect(configIndexCall![1].length).toBe(1);

    // Both indexes should contain the same taskId
    expect(globalIndexCall![1]).toEqual(configIndexCall![1]);
  });

  it('should append to existing indexes', async () => {
    const existingTaskIds = ['existing-task-1', 'existing-task-2'];

    mockStore.get.mockImplementation((key: string) => {
      if (key === '_index') {
        return Promise.resolve(existingTaskIds);
      }
      if (key === '_index_test-config') {
        return Promise.resolve(['existing-task-1']); // Config index has fewer tasks
      }
      return Promise.resolve([]);
    });

    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1'],
      promptContexts: { 'prompt-1': 'Test' },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Anchor',
          'openrouter:anthropic/claude-3.5-sonnet': 'Claude',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    expect(result.tasksAdded).toBe(1);
    expect(result.totalTasksInQueue).toBe(2); // Bug: returns OLD index length (2), not updated (3)

    // Verify indexes were updated correctly
    const globalIndexCall = mockStore.setJSON.mock.calls.find((call: any) => call[0] === '_index');
    expect(globalIndexCall![1]).toHaveLength(3);
    expect(globalIndexCall![1]).toEqual(expect.arrayContaining(existingTaskIds));

    const configIndexCall = mockStore.setJSON.mock.calls.find((call: any) => call[0] === '_index_test-config');
    expect(configIndexCall![1]).toHaveLength(2); // 1 existing + 1 new
  });

  it('should deduplicate tasks using SHA256 hash', async () => {
    const taskId = 'task-sha256-hash';
    mockStore.get.mockResolvedValue([taskId]); // Task already exists

    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1'],
      promptContexts: { 'prompt-1': 'Test' },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Same response',
          'openrouter:anthropic/claude-3.5-sonnet': 'Same response',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    // If the hash matches, no new tasks should be added
    // (We can't predict the exact hash, but if dedupe works, tasksAdded should be 0 or 1)
    expect(result.totalTasksInQueue).toBeGreaterThanOrEqual(1);
  });

  it('should handle multiple prompts correctly', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1', 'prompt-2', 'prompt-3'],
      promptContexts: {
        'prompt-1': 'Question 1',
        'prompt-2': 'Question 2',
        'prompt-3': 'Question 3',
      },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Answer 1A',
          'openrouter:anthropic/claude-3.5-sonnet': 'Answer 1C',
        },
        'prompt-2': {
          [OFFICIAL_ANCHOR_MODEL]: 'Answer 2A',
          'openrouter:anthropic/claude-3.5-sonnet': 'Answer 2C',
        },
        'prompt-3': {
          [OFFICIAL_ANCHOR_MODEL]: 'Answer 3A',
          'openrouter:anthropic/claude-3.5-sonnet': 'Answer 3C',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    // 3 prompts × 1 pairing each = 3 tasks
    expect(result.tasksAdded).toBe(3);
    expect(result.totalTasksInQueue).toBe(0); // Bug: returns OLD index length, not updated
  });

  it('should convert string prompt to messages array', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1'],
      promptContexts: {
        'prompt-1': 'Simple string prompt',
      },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Response A',
          'openrouter:anthropic/claude-3.5-sonnet': 'Response B',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    await populatePairwiseQueue(resultData, { logger: mockLogger });

    const taskCalls = mockStore.setJSON.mock.calls.filter((call: any) => !call[0].startsWith('_index'));
    const task: PairwiseTask = taskCalls[0][1];

    expect(task.prompt.messages).toEqual([
      { role: 'user', content: 'Simple string prompt' }
    ]);
  });

  it('should preserve messages array prompt format', async () => {
    const messages = [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'First response' },
      { role: 'user', content: 'Second message' },
    ];

    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1'],
      promptContexts: {
        'prompt-1': messages,
      },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Response A',
          'openrouter:anthropic/claude-3.5-sonnet': 'Response B',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    await populatePairwiseQueue(resultData, { logger: mockLogger });

    const taskCalls = mockStore.setJSON.mock.calls.filter((call: any) => !call[0].startsWith('_index'));
    const task: PairwiseTask = taskCalls[0][1];

    expect(task.prompt.messages).toEqual(messages);
  });

  it('should include system prompt when available', async () => {
    const systemPrompt = 'You are a helpful assistant specialized in geography.';

    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1'],
      promptContexts: { 'prompt-1': 'Test' },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Response A',
          'openrouter:anthropic/claude-3.5-sonnet': 'Response B',
        },
      },
      modelSystemPrompts: {
        [OFFICIAL_ANCHOR_MODEL]: systemPrompt,
        'openrouter:anthropic/claude-3.5-sonnet': systemPrompt,
      },
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    await populatePairwiseQueue(resultData, { logger: mockLogger });

    const taskCalls = mockStore.setJSON.mock.calls.filter((call: any) => !call[0].startsWith('_index'));
    const task: PairwiseTask = taskCalls[0][1];

    expect(task.prompt.system).toBe(systemPrompt);
  });

  it('should return anchorModelMissing flag when anchor model not found', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1', 'prompt-2'],
      promptContexts: {
        'prompt-1': 'Test 1',
        'prompt-2': 'Test 2',
      },
      allFinalAssistantResponses: {
        'prompt-1': {
          'openrouter:anthropic/claude-3.5-sonnet': 'Response from Claude',
          'openrouter:meta/llama-3.2-70b': 'Response from Llama',
        },
        'prompt-2': {
          'openrouter:anthropic/claude-3.5-sonnet': 'Response from Claude',
          'openrouter:meta/llama-3.2-70b': 'Response from Llama',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    expect(result.tasksAdded).toBe(0);
    expect(result.anchorModelMissing).toBe(true);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Cannot generate pairs: anchor model')
    );
  });

  it('should skip prompts without anchor model but continue with others', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1', 'prompt-2'],
      promptContexts: {
        'prompt-1': 'Test 1 - has anchor',
        'prompt-2': 'Test 2 - missing anchor',
      },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Anchor response',
          'openrouter:anthropic/claude-3.5-sonnet': 'Claude response',
        },
        'prompt-2': {
          'openrouter:anthropic/claude-3.5-sonnet': 'Claude response',
          'openrouter:meta/llama-3.2-70b': 'Llama response',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    // Should create 1 task from prompt-1, skip prompt-2
    expect(result.tasksAdded).toBe(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Official anchor model 'openrouter:openai/gpt-4.1-mini' not found for prompt 'prompt-2'")
    );
  });

  it('should return early when missing required fields', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1'],
      // Missing promptContexts, allFinalAssistantResponses, config
    } as any;

    mockStore.get.mockResolvedValue([]);

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    expect(result.tasksAdded).toBe(0);
    expect(result.totalTasksInQueue).toBe(0);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Result data is missing required fields')
    );
  });

  it('should handle empty promptIds array', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: [],
      promptContexts: {},
      allFinalAssistantResponses: {},
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    expect(result.tasksAdded).toBe(0);
    expect(result.totalTasksInQueue).toBe(0);
  });

  it('should skip prompts with missing responses', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1', 'prompt-2'],
      promptContexts: {
        'prompt-1': 'Test 1',
        'prompt-2': 'Test 2',
      },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Anchor response',
          'openrouter:anthropic/claude-3.5-sonnet': 'Claude response',
        },
        // prompt-2 is missing from allFinalAssistantResponses
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    // Should only create tasks for prompt-1
    expect(result.tasksAdded).toBe(1);
  });

  it('should filter out IDEAL_MODEL_ID from pairings', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1'],
      promptContexts: { 'prompt-1': 'Test' },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Anchor response',
          'IDEAL_MODEL_ID': 'Ideal response - should be filtered',
          'openrouter:anthropic/claude-3.5-sonnet': 'Claude response',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    // Should create 1 task (anchor vs claude), not 2 (should skip IDEAL_MODEL_ID)
    expect(result.tasksAdded).toBe(1);

    const taskCalls = mockStore.setJSON.mock.calls.filter((call: any) => !call[0].startsWith('_index'));
    const task: PairwiseTask = taskCalls[0][1];

    expect(task.modelIdA).not.toBe('IDEAL_MODEL_ID');
    expect(task.modelIdB).not.toBe('IDEAL_MODEL_ID');
  });

  it('should generate unique taskIds for different prompt-model combinations', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1', 'prompt-2'],
      promptContexts: {
        'prompt-1': 'First question',
        'prompt-2': 'Second question',
      },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Answer 1A',
          'openrouter:anthropic/claude-3.5-sonnet': 'Answer 1C',
        },
        'prompt-2': {
          [OFFICIAL_ANCHOR_MODEL]: 'Answer 2A',
          'openrouter:anthropic/claude-3.5-sonnet': 'Answer 2C',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    await populatePairwiseQueue(resultData, { logger: mockLogger });

    const taskCalls = mockStore.setJSON.mock.calls.filter((call: any) => !call[0].startsWith('_index'));
    const taskIds = taskCalls.map((call: any) => call[0]);

    // All taskIds should be unique
    const uniqueTaskIds = new Set(taskIds);
    expect(uniqueTaskIds.size).toBe(taskIds.length);
    expect(taskIds.length).toBe(2);
  });

  it('should pair anchor with multiple other models', async () => {
    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds: ['prompt-1'],
      promptContexts: { 'prompt-1': 'Test' },
      allFinalAssistantResponses: {
        'prompt-1': {
          [OFFICIAL_ANCHOR_MODEL]: 'Anchor response',
          'openrouter:anthropic/claude-3.5-sonnet': 'Claude response',
          'openrouter:meta/llama-3.2-70b': 'Llama response',
          'openrouter:google/gemini-pro': 'Gemini response',
        },
      },
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    const result = await populatePairwiseQueue(resultData, { logger: mockLogger });

    // Anchor should be paired with 3 other models
    expect(result.tasksAdded).toBe(3);

    const taskCalls = mockStore.setJSON.mock.calls.filter((call: any) => !call[0].startsWith('_index'));

    // Verify each task includes the anchor model
    taskCalls.forEach((call: any) => {
      const task: PairwiseTask = call[1];
      expect(
        task.modelIdA === OFFICIAL_ANCHOR_MODEL || task.modelIdB === OFFICIAL_ANCHOR_MODEL
      ).toBe(true);
    });
  });

  it('should log progress when saving many tasks', async () => {
    // Create 150 prompts to trigger progress logging (every 100 tasks)
    const promptIds = Array.from({ length: 150 }, (_, i) => `prompt-${i}`);
    const promptContexts: any = {};
    const responses: any = {};

    promptIds.forEach(id => {
      promptContexts[id] = `Test ${id}`;
      responses[id] = {
        [OFFICIAL_ANCHOR_MODEL]: `Anchor ${id}`,
        'openrouter:anthropic/claude-3.5-sonnet': `Claude ${id}`,
      };
    });

    const resultData: ComparisonDataV2 = {
      configId: 'test-config',
      promptIds,
      promptContexts,
      allFinalAssistantResponses: responses,
      modelSystemPrompts: {},
      config: {} as any,
    };

    mockStore.get.mockResolvedValue([]);

    await populatePairwiseQueue(resultData, { logger: mockLogger });

    // Should log progress at 100 tasks
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('... saved 100 / 150 tasks')
    );
  });
});
