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

  it('should return a random task from the config-specific index', async () => {
    // Config-specific index contains only tasks for this config
    const configIndex = ['task-1', 'task-3'];
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
      'task-3': {
        taskId: 'task-3',
        configId: 'test-config',
        prompt: { system: null, messages: [{ role: 'user', content: 'Test prompt 3' }] },
        responseA: 'Response A3',
        responseB: 'Response B3',
        modelIdA: 'model-a',
        modelIdB: 'model-b',
      },
    };

    mockStore.get.mockImplementation((key: string) => {
      if (key === '_index_test-config') {
        return Promise.resolve(configIndex);
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

  it('should return 404 when config index does not exist', async () => {
    // Config-specific index doesn't exist
    mockStore.get.mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/get-task');
    const response = await GET(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('No comparison tasks found for config: test-config');
  });

  it('should return 404 when config index is empty', async () => {
    mockStore.get.mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/get-task');
    const response = await GET(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('No comparison tasks found for config: test-config');
  });

  it('should only return tasks from the config-specific index', async () => {
    // Config-alpha index contains only alpha tasks
    const configAlphaIndex = ['task-1', 'task-3', 'task-4'];
    const tasks: Record<string, any> = {
      'task-1': { taskId: 'task-1', configId: 'config-alpha', prompt: { messages: [] } },
      'task-3': { taskId: 'task-3', configId: 'config-alpha', prompt: { messages: [] } },
      'task-4': { taskId: 'task-4', configId: 'config-alpha', prompt: { messages: [] } },
    };

    mockStore.get.mockImplementation((key: string) => {
      if (key === '_index_config-alpha') {
        return Promise.resolve(configAlphaIndex);
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

  it('should return 404 when task blob is missing from index', async () => {
    const configIndex = ['task-1', 'task-2'];

    mockStore.get.mockImplementation((key: string) => {
      if (key === '_index_test-config') {
        return Promise.resolve(configIndex);
      }
      // Task blob is missing
      return Promise.resolve(undefined);
    });

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/get-task');
    const response = await GET(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Task object not found for ID');
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
});
