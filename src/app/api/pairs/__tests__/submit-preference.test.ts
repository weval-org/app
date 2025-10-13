/**
 * @jest-environment node
 */
import { POST } from '../submit-preference/route';
import { NextRequest } from 'next/server';

// Mock @netlify/blobs
jest.mock('@netlify/blobs', () => ({
  getStore: jest.fn(),
}));

const { getStore } = require('@netlify/blobs');

describe('POST /api/pairs/submit-preference', () => {
  let mockPreferenceStore: any;
  let mockTaskStore: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPreferenceStore = {
      get: jest.fn(),
      setJSON: jest.fn(),
    };

    mockTaskStore = {
      get: jest.fn(),
      setJSON: jest.fn(),
    };

    // Mock getStore to return different stores based on name
    (getStore as jest.Mock).mockImplementation(({ name }: { name: string }) => {
      if (name === 'pairwise-preferences-v2') {
        return mockPreferenceStore;
      }
      if (name === 'pairwise-tasks-v2') {
        return mockTaskStore;
      }
      throw new Error(`Unexpected store name: ${name}`);
    });

    // Mock Math.random for consistent userToken
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should successfully submit a preference with all enriched fields', async () => {
    const mockTask = {
      taskId: 'task-1',
      prompt: {
        system: null,
        messages: [{ role: 'user', content: 'Test prompt content' }]
      },
      responseA: 'Response A',
      responseB: 'Response B',
      modelIdA: 'openrouter:openai/gpt-4.1-mini',
      modelIdB: 'openrouter:anthropic/claude-3.5-sonnet',
      configId: 'test-config',
    };

    mockTaskStore.get.mockResolvedValue(mockTask);
    mockPreferenceStore.get.mockResolvedValue([]);

    const requestBody = {
      taskId: 'task-1',
      preference: 'A',
      reason: 'Response A was more concise',
    };

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe('Preference submitted successfully.');
    expect(data.recordsSaved).toBe(1);

    // Verify the preference store was called correctly
    expect(mockPreferenceStore.setJSON).toHaveBeenCalledWith('task-1', [
      expect.objectContaining({
        preference: 'A',
        reason: 'Response A was more concise',
        userToken: expect.stringMatching(/^user_[a-z0-9]+$/),
        timestamp: expect.any(String),
        modelIdA: 'openrouter:openai/gpt-4.1-mini',
        modelIdB: 'openrouter:anthropic/claude-3.5-sonnet',
        configId: 'test-config',
        promptPreview: 'Test prompt content',
      })
    ]);
  });

  it('should append to existing preference records', async () => {
    const mockTask = {
      taskId: 'task-1',
      prompt: { messages: [{ role: 'user', content: 'Test prompt' }] },
      modelIdA: 'model-a',
      modelIdB: 'model-b',
      configId: 'test-config',
    };

    const existingRecords = [
      {
        preference: 'B',
        userToken: 'user_existing',
        timestamp: '2025-01-01T00:00:00.000Z',
        modelIdA: 'model-a',
        modelIdB: 'model-b',
        configId: 'test-config',
        promptPreview: 'Test prompt',
      }
    ];

    mockTaskStore.get.mockResolvedValue(mockTask);
    mockPreferenceStore.get.mockResolvedValue(existingRecords);

    const requestBody = {
      taskId: 'task-1',
      preference: 'A',
      reason: 'Changed my mind',
    };

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recordsSaved).toBe(2);

    // Verify new record was appended
    const savedRecords = mockPreferenceStore.setJSON.mock.calls[0][1];
    expect(savedRecords).toHaveLength(2);
    expect(savedRecords[0]).toEqual(existingRecords[0]);
    expect(savedRecords[1]).toMatchObject({
      preference: 'A',
      reason: 'Changed my mind',
    });
  });

  it('should handle "Indifferent" preference correctly', async () => {
    const mockTask = {
      taskId: 'task-1',
      prompt: { messages: [{ role: 'user', content: 'Test' }] },
      modelIdA: 'model-a',
      modelIdB: 'model-b',
      configId: 'test-config',
    };

    mockTaskStore.get.mockResolvedValue(mockTask);
    mockPreferenceStore.get.mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({
        taskId: 'task-1',
        preference: 'Indifferent',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockPreferenceStore.setJSON).toHaveBeenCalledWith('task-1', [
      expect.objectContaining({
        preference: 'Indifferent',
        reason: undefined,
      })
    ]);
  });

  it('should handle "Unknown" preference correctly', async () => {
    const mockTask = {
      taskId: 'task-1',
      prompt: { messages: [{ role: 'user', content: 'Test' }] },
      modelIdA: 'model-a',
      modelIdB: 'model-b',
      configId: 'test-config',
    };

    mockTaskStore.get.mockResolvedValue(mockTask);
    mockPreferenceStore.get.mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({
        taskId: 'task-1',
        preference: 'Unknown',
      }),
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockPreferenceStore.setJSON).toHaveBeenCalledWith('task-1', [
      expect.objectContaining({
        preference: 'Unknown',
      })
    ]);
  });

  it('should extract prompt preview from string prompt', async () => {
    const longPrompt = 'A'.repeat(300); // 300 chars
    const mockTask = {
      taskId: 'task-1',
      prompt: longPrompt,
      modelIdA: 'model-a',
      modelIdB: 'model-b',
      configId: 'test-config',
    };

    mockTaskStore.get.mockResolvedValue(mockTask);
    mockPreferenceStore.get.mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1', preference: 'A' }),
    });

    await POST(req);

    const savedRecord = mockPreferenceStore.setJSON.mock.calls[0][1][0];
    expect(savedRecord.promptPreview).toHaveLength(200);
    expect(savedRecord.promptPreview).toBe('A'.repeat(200));
  });

  it('should extract prompt preview from messages array', async () => {
    const longContent = 'B'.repeat(300);
    const mockTask = {
      taskId: 'task-1',
      prompt: {
        system: 'System prompt',
        messages: [{ role: 'user', content: longContent }]
      },
      modelIdA: 'model-a',
      modelIdB: 'model-b',
      configId: 'test-config',
    };

    mockTaskStore.get.mockResolvedValue(mockTask);
    mockPreferenceStore.get.mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1', preference: 'B' }),
    });

    await POST(req);

    const savedRecord = mockPreferenceStore.setJSON.mock.calls[0][1][0];
    expect(savedRecord.promptPreview).toHaveLength(200);
    expect(savedRecord.promptPreview).toBe('B'.repeat(200));
  });

  it('should handle empty prompt preview gracefully', async () => {
    const mockTask = {
      taskId: 'task-1',
      prompt: { messages: [] },
      modelIdA: 'model-a',
      modelIdB: 'model-b',
      configId: 'test-config',
    };

    mockTaskStore.get.mockResolvedValue(mockTask);
    mockPreferenceStore.get.mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1', preference: 'A' }),
    });

    await POST(req);

    const savedRecord = mockPreferenceStore.setJSON.mock.calls[0][1][0];
    expect(savedRecord.promptPreview).toBe('');
  });

  it('should return 400 when taskId is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ preference: 'A' }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required fields: taskId and preference.');
  });

  it('should return 400 when preference is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1' }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required fields: taskId and preference.');
  });

  it('should return 400 when both taskId and preference are missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Missing required fields: taskId and preference.');
  });

  it('should return 500 on task store error', async () => {
    mockTaskStore.get.mockRejectedValue(new Error('Task store connection failed'));

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1', preference: 'A' }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('An internal server error occurred while submitting the preference.');
  });

  it('should return 500 on preference store error', async () => {
    const mockTask = {
      taskId: 'task-1',
      prompt: { messages: [{ role: 'user', content: 'Test' }] },
      modelIdA: 'model-a',
      modelIdB: 'model-b',
      configId: 'test-config',
    };

    mockTaskStore.get.mockResolvedValue(mockTask);
    mockPreferenceStore.get.mockResolvedValue([]);
    mockPreferenceStore.setJSON.mockRejectedValue(new Error('Preference store write failed'));

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1', preference: 'A' }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('An internal server error occurred while submitting the preference.');
  });

  it('should generate unique user tokens for each submission', async () => {
    const mockTask = {
      taskId: 'task-1',
      prompt: { messages: [{ role: 'user', content: 'Test' }] },
      modelIdA: 'model-a',
      modelIdB: 'model-b',
      configId: 'test-config',
    };

    mockTaskStore.get.mockResolvedValue(mockTask);
    mockPreferenceStore.get.mockResolvedValue([]);

    // First submission
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.111111111);
    const req1 = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1', preference: 'A' }),
    });
    await POST(req1);
    const token1 = mockPreferenceStore.setJSON.mock.calls[0][1][0].userToken;

    // Second submission
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.999999999);
    const req2 = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1', preference: 'B' }),
    });
    await POST(req2);
    const token2 = mockPreferenceStore.setJSON.mock.calls[1][1][0].userToken;

    expect(token1).not.toBe(token2);
    expect(token1).toMatch(/^user_[a-z0-9]+$/);
    expect(token2).toMatch(/^user_[a-z0-9]+$/);
  });

  it('should include timestamp in ISO format', async () => {
    const mockTask = {
      taskId: 'task-1',
      prompt: { messages: [{ role: 'user', content: 'Test' }] },
      modelIdA: 'model-a',
      modelIdB: 'model-b',
      configId: 'test-config',
    };

    mockTaskStore.get.mockResolvedValue(mockTask);
    mockPreferenceStore.get.mockResolvedValue([]);

    const beforeTime = new Date().toISOString();

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1', preference: 'A' }),
    });

    await POST(req);

    const afterTime = new Date().toISOString();
    const savedRecord = mockPreferenceStore.setJSON.mock.calls[0][1][0];

    expect(savedRecord.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(savedRecord.timestamp >= beforeTime).toBe(true);
    expect(savedRecord.timestamp <= afterTime).toBe(true);
  });

  it('should handle task without metadata gracefully', async () => {
    const mockTask = {
      taskId: 'task-1',
      prompt: { messages: [{ role: 'user', content: 'Test' }] },
      // Missing modelIdA, modelIdB, configId
    };

    mockTaskStore.get.mockResolvedValue(mockTask);
    mockPreferenceStore.get.mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1', preference: 'A' }),
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    const savedRecord = mockPreferenceStore.setJSON.mock.calls[0][1][0];
    expect(savedRecord.modelIdA).toBeUndefined();
    expect(savedRecord.modelIdB).toBeUndefined();
    expect(savedRecord.configId).toBeUndefined();
  });

  it('should handle missing task (task not found)', async () => {
    mockTaskStore.get.mockResolvedValue(null);
    mockPreferenceStore.get.mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/pairs/submit-preference', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'non-existent-task', preference: 'A' }),
    });

    const response = await POST(req);

    // Should still succeed but with missing metadata
    expect(response.status).toBe(200);
    const savedRecord = mockPreferenceStore.setJSON.mock.calls[0][1][0];
    expect(savedRecord.preference).toBe('A');
    expect(savedRecord.modelIdA).toBeUndefined();
  });
});
