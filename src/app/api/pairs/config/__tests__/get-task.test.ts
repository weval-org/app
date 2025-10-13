/**
 * @jest-environment node
 */
import { GET } from '../[configId]/get-task/route';
import { NextRequest } from 'next/server';

// Mock @netlify/blobs
jest.mock('@netlify/blobs', () => ({
  getStore: jest.fn(),
}));

const { getStore } = require('@netlify/blobs');

describe('GET /api/pairs/config/[configId]/get-task', () => {
  let mockStore: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = {
      get: jest.fn(),
    };
    (getStore as jest.Mock).mockReturnValue(mockStore);
  });

  it('should return a random task matching the configId', async () => {
    const taskIndex = ['task-1', 'task-2', 'task-3', 'task-4'];
    const tasks: Record<string, any> = {
      'task-1': {
        taskId: 'task-1',
        configId: 'test-config',
        prompt: { system: null, messages: [{ role: 'user', content: 'Test prompt 1' }] },
        responseA: 'Response A1',
        responseB: 'Response B1',
        modelIdA: 'model-a',
        modelIdB: 'model-b',
      },
      'task-2': {
        taskId: 'task-2',
        configId: 'other-config',
        prompt: { system: null, messages: [{ role: 'user', content: 'Test prompt 2' }] },
        responseA: 'Response A2',
        responseB: 'Response B2',
        modelIdA: 'model-a',
        modelIdB: 'model-b',
      },
      'task-3': {
        taskId: 'task-3',
        configId: 'test-config',
        prompt: { system: null, messages: [{ role: 'user', content: 'Test prompt 3' }] },
        responseA: 'Response A3',
        responseB: 'Response B3',
        modelIdA: 'model-a',
        modelIdB: 'model-b',
      },
      'task-4': {
        taskId: 'task-4',
        configId: 'another-config',
        prompt: { system: null, messages: [{ role: 'user', content: 'Test prompt 4' }] },
        responseA: 'Response A4',
        responseB: 'Response B4',
        modelIdA: 'model-a',
        modelIdB: 'model-b',
      },
    };

    mockStore.get.mockImplementation((key: string) => {
      if (key === '_index') {
        return Promise.resolve(taskIndex);
      }
      return Promise.resolve(tasks[key]);
    });

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/get-task');
    const response = await GET(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.configId).toBe('test-config');
    expect(['task-1', 'task-3']).toContain(data.taskId);
    expect(data).toHaveProperty('prompt');
    expect(data).toHaveProperty('responseA');
    expect(data).toHaveProperty('responseB');
  });

  it('should return 404 when no tasks match configId', async () => {
    const taskIndex = ['task-1', 'task-2'];
    const tasks: Record<string, any> = {
      'task-1': { taskId: 'task-1', configId: 'other-config' },
      'task-2': { taskId: 'task-2', configId: 'another-config' },
    };

    mockStore.get.mockImplementation((key: string) => {
      if (key === '_index') {
        return Promise.resolve(taskIndex);
      }
      return Promise.resolve(tasks[key]);
    });

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/get-task');
    const response = await GET(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('No comparison tasks found for config: test-config');
  });

  it('should return 404 when index is empty', async () => {
    mockStore.get.mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/get-task');
    const response = await GET(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('No comparison tasks are available in the index.');
  });

  it('should return 404 when index is undefined', async () => {
    mockStore.get.mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/get-task');
    const response = await GET(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('No comparison tasks are available in the index.');
  });

  it('should only return tasks from the specified config', async () => {
    const taskIndex = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5'];
    const tasks: Record<string, any> = {
      'task-1': { taskId: 'task-1', configId: 'config-alpha', prompt: {} },
      'task-2': { taskId: 'task-2', configId: 'config-beta', prompt: {} },
      'task-3': { taskId: 'task-3', configId: 'config-alpha', prompt: {} },
      'task-4': { taskId: 'task-4', configId: 'config-alpha', prompt: {} },
      'task-5': { taskId: 'task-5', configId: 'config-beta', prompt: {} },
    };

    mockStore.get.mockImplementation((key: string) => {
      if (key === '_index') {
        return Promise.resolve(taskIndex);
      }
      return Promise.resolve(tasks[key]);
    });

    // Run the request multiple times to ensure only alpha tasks are returned
    for (let i = 0; i < 10; i++) {
      const req = new NextRequest('http://localhost:3000/api/pairs/config/config-alpha/get-task');
      const response = await GET(req, { params: Promise.resolve({ configId: 'config-alpha' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.configId).toBe('config-alpha');
      expect(['task-1', 'task-3', 'task-4']).toContain(data.taskId);
    }
  });

  it('should handle stale index gracefully', async () => {
    const taskIndex = ['task-1', 'task-2', 'task-3'];
    const tasks: Record<string, any | undefined> = {
      'task-1': { taskId: 'task-1', configId: 'test-config', prompt: {} },
      'task-2': undefined, // Task in index but blob missing
      'task-3': { taskId: 'task-3', configId: 'test-config', prompt: {} },
    };

    mockStore.get.mockImplementation((key: string) => {
      if (key === '_index') {
        return Promise.resolve(taskIndex);
      }
      return Promise.resolve(tasks[key]);
    });

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/get-task');
    const response = await GET(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    // Should still succeed with one of the existing tasks
    expect(response.status).toBe(200);
    expect(['task-1', 'task-3']).toContain(data.taskId);
  });

  it('should return 400 when configId is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/pairs/config//get-task');
    const response = await GET(req, { params: Promise.resolve({ configId: '' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('configId is required');
  });

  it('should return 500 on blob store error', async () => {
    mockStore.get.mockRejectedValue(new Error('Blob store connection failed'));

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/get-task');
    const response = await GET(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('An internal server error occurred while fetching a comparison task.');
  });

  it('should return 404 when selected task blob is missing', async () => {
    const taskIndex = ['task-1'];

    mockStore.get.mockImplementation((key: string) => {
      if (key === '_index') {
        return Promise.resolve(taskIndex);
      }
      if (key === 'task-1') {
        // First call returns the task for filtering
        if (mockStore.get.mock.calls.length <= 2) {
          return Promise.resolve({ taskId: 'task-1', configId: 'test-config' });
        }
        // Second call (after filtering) returns undefined
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/get-task');
    const response = await GET(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Task object not found for ID');
  });
});
