import { jest } from '@jest/globals';
import {
  getConfigTaskCount,
  updateGenerationStatus,
  getGenerationStatus,
  PairwiseTask,
  GenerationStatus,
} from '../pairwise-task-queue-service';

// Mock @netlify/blobs
jest.mock('@netlify/blobs', () => ({
  getStore: jest.fn(),
}));

// Mock fs/promises for credential reading
jest.mock('fs/promises');
jest.mock('fs');

const { getStore } = require('@netlify/blobs');

describe('pairwise-task-queue-service - config-specific functions', () => {
  let mockStore: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = {
      get: jest.fn(),
      setJSON: jest.fn(),
    };
    (getStore as jest.Mock).mockReturnValue(mockStore);
  });

  describe('getConfigTaskCount', () => {
    it('should count tasks from config-specific index', async () => {
      const configIndex = ['task-1', 'task-3']; // Only tasks for config-a

      mockStore.get.mockResolvedValue(configIndex);

      const count = await getConfigTaskCount('config-a');

      expect(count).toBe(2);
      expect(mockStore.get).toHaveBeenCalledWith('_index_config-a', { type: 'json' });
      expect(mockStore.get).toHaveBeenCalledTimes(1); // Only reads config-specific index
    });

    it('should return 0 when config index is empty', async () => {
      mockStore.get.mockResolvedValue([]);

      const count = await getConfigTaskCount('config-a');

      expect(count).toBe(0);
      expect(mockStore.get).toHaveBeenCalledWith('_index_config-a', { type: 'json' });
      expect(mockStore.get).toHaveBeenCalledTimes(1);
    });

    it('should return 0 when config index is undefined', async () => {
      mockStore.get.mockResolvedValue(undefined);

      const count = await getConfigTaskCount('config-a');

      expect(count).toBe(0);
    });

    it('should return 0 when config has no tasks', async () => {
      mockStore.get.mockResolvedValue([]); // Empty config index

      const count = await getConfigTaskCount('config-a');

      expect(count).toBe(0);
    });

    it('should use correct index key for different configs', async () => {
      mockStore.get.mockResolvedValue(['task-1', 'task-2', 'task-3']);

      await getConfigTaskCount('config-alpha');
      expect(mockStore.get).toHaveBeenCalledWith('_index_config-alpha', { type: 'json' });

      await getConfigTaskCount('config-beta');
      expect(mockStore.get).toHaveBeenCalledWith('_index_config-beta', { type: 'json' });
    });

    it('should respect siteId option', async () => {
      // Mock fs to provide credentials for siteId override path
      const fs = require('fs/promises');
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ 'access-token': 'test-token' }));

      mockStore.get.mockResolvedValue([]);

      await getConfigTaskCount('config-a', { siteId: 'custom-site-id' });

      // When siteId is provided, getBlobStore will call getStore with credentials
      expect(getStore).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'pairwise-tasks-v2',
          siteID: 'custom-site-id',
          token: 'test-token',
        })
      );
    });
  });

  describe('updateGenerationStatus', () => {
    it('should save status to blob store', async () => {
      const status: GenerationStatus = {
        status: 'generating',
        message: 'Generating pairs...',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      await updateGenerationStatus('config-a', status);

      // getBlobStore is called internally, which then calls getStore
      // Just verify the status was saved correctly
      expect(mockStore.setJSON).toHaveBeenCalledWith('config-a', status);
    });

    it('should handle complete status with task counts', async () => {
      const status: GenerationStatus = {
        status: 'complete',
        message: 'Successfully generated pairs.',
        timestamp: '2024-01-01T00:05:00.000Z',
        tasksGenerated: 25,
        totalTasksInQueue: 100,
      };

      await updateGenerationStatus('config-a', status);

      expect(mockStore.setJSON).toHaveBeenCalledWith('config-a', status);
    });

    it('should handle error status', async () => {
      const status: GenerationStatus = {
        status: 'error',
        message: 'Failed to generate pairs.',
        timestamp: '2024-01-01T00:05:00.000Z',
        error: 'No runs found for config',
      };

      await updateGenerationStatus('config-a', status);

      expect(mockStore.setJSON).toHaveBeenCalledWith('config-a', status);
    });

    it('should respect siteId option', async () => {
      // Mock fs to provide credentials for siteId override path
      const fs = require('fs/promises');
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ 'access-token': 'test-token' }));

      const status: GenerationStatus = {
        status: 'pending',
        message: 'Queued...',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      await updateGenerationStatus('config-a', status, { siteId: 'custom-site-id' });

      // When siteId is provided, getBlobStore will call getStore with credentials
      expect(getStore).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'pairwise-generation-status',
          siteID: 'custom-site-id',
          token: 'test-token',
        })
      );
    });
  });

  describe('getGenerationStatus', () => {
    it('should return status when it exists', async () => {
      const status: GenerationStatus = {
        status: 'generating',
        message: 'Generating pairs...',
        timestamp: '2024-01-01T00:00:00.000Z',
        tasksGenerated: 10,
      };

      mockStore.get.mockResolvedValue(status);

      const result = await getGenerationStatus('config-a');

      expect(result).toEqual(status);
      expect(mockStore.get).toHaveBeenCalledWith('config-a', { type: 'json' });
    });

    it('should return null when status does not exist', async () => {
      mockStore.get.mockResolvedValue(undefined);

      const result = await getGenerationStatus('config-a');

      expect(result).toBeNull();
    });

    it('should respect siteId option', async () => {
      // Mock fs to provide credentials for siteId override path
      const fs = require('fs/promises');
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ 'access-token': 'test-token' }));

      mockStore.get.mockResolvedValue(undefined);

      await getGenerationStatus('config-a', { siteId: 'custom-site-id' });

      // When siteId is provided, getBlobStore will call getStore with credentials
      expect(getStore).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'pairwise-generation-status',
          siteID: 'custom-site-id',
          token: 'test-token',
        })
      );
    });

    it('should handle all status states', async () => {
      const statuses: GenerationStatus[] = [
        { status: 'pending', message: 'Queued', timestamp: '2024-01-01T00:00:00.000Z' },
        { status: 'generating', message: 'In progress', timestamp: '2024-01-01T00:01:00.000Z' },
        { status: 'complete', message: 'Done', timestamp: '2024-01-01T00:05:00.000Z', tasksGenerated: 50 },
        { status: 'error', message: 'Failed', timestamp: '2024-01-01T00:05:00.000Z', error: 'Network error' },
      ];

      for (const status of statuses) {
        mockStore.get.mockResolvedValue(status);
        const result = await getGenerationStatus('config-a');
        expect(result?.status).toBe(status.status);
      }
    });
  });
});
