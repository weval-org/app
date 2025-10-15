/**
 * @jest-environment node
 */
import { POST } from '../[configId]/start-generation/route';
import { NextRequest } from 'next/server';
import * as pairwiseService from '@/cli/services/pairwise-task-queue-service';

// Mock dependencies
jest.mock('@/cli/services/pairwise-task-queue-service');
jest.mock('@/utils/logger', () => ({
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const mockedPairwiseService = jest.mocked(pairwiseService);

// Mock global fetch for triggering background function
global.fetch = jest.fn();

describe('POST /api/pairs/config/[configId]/start-generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    process.env.URL = 'http://localhost:8888';
  });

  afterEach(() => {
    delete process.env.URL;
  });

  it('should start generation when no existing job', async () => {
    mockedPairwiseService.getGenerationStatus.mockResolvedValue(null);
    mockedPairwiseService.updateGenerationStatus.mockResolvedValue();

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/start-generation', {
      method: 'POST',
    });

    const response = await POST(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('pending');
    expect(data.message).toBe('Pair generation started successfully.');
    expect(data.configId).toBe('test-config');

    // Should set initial status
    expect(mockedPairwiseService.updateGenerationStatus).toHaveBeenCalledWith(
      'test-config',
      expect.objectContaining({
        status: 'pending',
        message: 'Generation job queued.',
      })
    );

    // Should trigger background function
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8888/.netlify/functions/generate-pairs-background',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ configId: 'test-config' }),
      })
    );
  });

  it('should not start duplicate generation when already generating', async () => {
    const existingStatus: pairwiseService.GenerationStatus = {
      status: 'generating',
      message: 'Generation in progress...',
      timestamp: new Date().toISOString(), // Use current timestamp (not stale)
    };

    mockedPairwiseService.getGenerationStatus.mockResolvedValue(existingStatus);

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/start-generation', {
      method: 'POST',
    });

    const response = await POST(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('generating');
    expect(data.message).toBe('Generation is already in progress for this config.');
    expect(data.generationStatus).toEqual(existingStatus);

    // Should NOT update status or trigger background function
    expect(mockedPairwiseService.updateGenerationStatus).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should not start duplicate generation when status is pending', async () => {
    const existingStatus: pairwiseService.GenerationStatus = {
      status: 'pending',
      message: 'Job queued...',
      timestamp: new Date().toISOString(), // Use current timestamp (not stale)
    };

    mockedPairwiseService.getGenerationStatus.mockResolvedValue(existingStatus);

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/start-generation', {
      method: 'POST',
    });

    const response = await POST(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe('Generation is already in progress for this config.');

    expect(mockedPairwiseService.updateGenerationStatus).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should allow retry after error status', async () => {
    const existingStatus: pairwiseService.GenerationStatus = {
      status: 'error',
      message: 'Generation failed.',
      timestamp: '2024-01-01T00:00:00.000Z',
      error: 'Network timeout',
    };

    mockedPairwiseService.getGenerationStatus.mockResolvedValue(existingStatus);
    mockedPairwiseService.updateGenerationStatus.mockResolvedValue();

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/start-generation', {
      method: 'POST',
    });

    const response = await POST(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('pending');
    expect(data.message).toBe('Pair generation started successfully.');

    // Should allow retry
    expect(mockedPairwiseService.updateGenerationStatus).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should allow retry after complete status', async () => {
    const existingStatus: pairwiseService.GenerationStatus = {
      status: 'complete',
      message: 'Generation complete.',
      timestamp: '2024-01-01T00:00:00.000Z',
      tasksGenerated: 50,
    };

    mockedPairwiseService.getGenerationStatus.mockResolvedValue(existingStatus);
    mockedPairwiseService.updateGenerationStatus.mockResolvedValue();

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/start-generation', {
      method: 'POST',
    });

    const response = await POST(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('pending');

    // Should allow regeneration
    expect(mockedPairwiseService.updateGenerationStatus).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should return 400 for missing configId', async () => {
    const req = new NextRequest('http://localhost:3000/api/pairs/config//start-generation', {
      method: 'POST',
    });

    const response = await POST(req, { params: Promise.resolve({ configId: '' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('configId is required');

    expect(mockedPairwiseService.getGenerationStatus).not.toHaveBeenCalled();
    expect(mockedPairwiseService.updateGenerationStatus).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should handle errors during status update', async () => {
    mockedPairwiseService.getGenerationStatus.mockResolvedValue(null);
    mockedPairwiseService.updateGenerationStatus.mockRejectedValue(new Error('Blob store write failed'));

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/start-generation', {
      method: 'POST',
    });

    const response = await POST(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to start pair generation.');
    expect(data.details).toBe('Blob store write failed');
  });

  it('should still succeed even if background function fetch fails', async () => {
    mockedPairwiseService.getGenerationStatus.mockResolvedValue(null);
    mockedPairwiseService.updateGenerationStatus.mockResolvedValue();
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/start-generation', {
      method: 'POST',
    });

    const response = await POST(req, { params: Promise.resolve({ configId: 'test-config' }) });
    const data = await response.json();

    // Should still return success since fetch is fire-and-forget
    expect(response.status).toBe(200);
    expect(data.status).toBe('pending');
    expect(data.message).toBe('Pair generation started successfully.');
  });

  it('should construct correct function URL in production', async () => {
    process.env.URL = 'https://weval.org';

    mockedPairwiseService.getGenerationStatus.mockResolvedValue(null);
    mockedPairwiseService.updateGenerationStatus.mockResolvedValue();

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/start-generation', {
      method: 'POST',
    });

    await POST(req, { params: Promise.resolve({ configId: 'test-config' }) });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://weval.org/.netlify/functions/generate-pairs-background',
      expect.any(Object)
    );
  });

  it('should use localhost fallback when URL env is not set', async () => {
    delete process.env.URL;

    mockedPairwiseService.getGenerationStatus.mockResolvedValue(null);
    mockedPairwiseService.updateGenerationStatus.mockResolvedValue();

    const req = new NextRequest('http://localhost:3000/api/pairs/config/test-config/start-generation', {
      method: 'POST',
    });

    await POST(req, { params: Promise.resolve({ configId: 'test-config' }) });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8888/.netlify/functions/generate-pairs-background',
      expect.any(Object)
    );
  });
});
