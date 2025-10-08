/**
 * @jest-environment node
 */
import { POST, GET } from '../route';
import { saveJsonFile, getJsonFile } from '@/lib/storageService';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/storageService');
jest.mock('@/utils/logger', () => ({
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));
jest.mock('@/app/sandbox/utils/yaml-generator', () => ({
  generateMinimalBlueprintYaml: jest.fn((obj) => `# Generated YAML\ntitle: ${obj.title || 'Test'}`),
}));

const mockedSaveJsonFile = saveJsonFile as jest.MockedFunction<typeof saveJsonFile>;
const mockedGetJsonFile = getJsonFile as jest.MockedFunction<typeof getJsonFile>;

describe('/api/story/export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST', () => {
    it('should export a blueprint successfully', async () => {
      const mockOutlineObj = {
        title: 'Test Blueprint',
        description: 'A test blueprint',
        prompts: [
          { id: 'p1', promptText: 'Test prompt', points: ['Check for accuracy'] }
        ],
        models: ['gpt-4'],
      };

      const requestBody = {
        sessionId: 'test-session-123',
        outlineObj: mockOutlineObj,
        quickRunResult: { prompts: [] },
      };

      const req = new NextRequest('http://localhost:3000/api/story/export', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' },
      });

      mockedSaveJsonFile.mockResolvedValue();

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.exportId).toBe('test-session-123');
      expect(data.blueprintKey).toBe('live/story/exports/test-session-123.yml');
      expect(mockedSaveJsonFile).toHaveBeenCalledTimes(2); // Blueprint + metadata
      expect(mockedSaveJsonFile).toHaveBeenCalledWith(
        'live/story/exports/test-session-123.yml',
        expect.objectContaining({ yaml: expect.any(String), blueprint: mockOutlineObj })
      );
      expect(mockedSaveJsonFile).toHaveBeenCalledWith(
        'live/story/exports/test-session-123_meta.json',
        expect.objectContaining({
          sessionId: 'test-session-123',
          exportedAt: expect.any(String),
        })
      );
    });

    it('should reject request with missing sessionId', async () => {
      const requestBody = {
        outlineObj: { title: 'Test' },
      };

      const req = new NextRequest('http://localhost:3000/api/story/export', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
      expect(mockedSaveJsonFile).not.toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      const requestBody = {
        sessionId: 'test-session-456',
        outlineObj: { title: 'Test' },
      };

      const req = new NextRequest('http://localhost:3000/api/story/export', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' },
      });

      mockedSaveJsonFile.mockRejectedValue(new Error('S3 write failed'));

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to export blueprint');
      expect(data.details).toBe('S3 write failed');
    });
  });

  describe('GET', () => {
    it('should retrieve an exported blueprint successfully', async () => {
      const mockBlueprintData = {
        yaml: '# Test YAML\ntitle: Test Blueprint',
        blueprint: { title: 'Test Blueprint', prompts: [] },
      };
      const mockMetadata = {
        sessionId: 'test-session-789',
        exportedAt: '2024-01-01T00:00:00.000Z',
        quickRunResult: null,
      };

      mockedGetJsonFile
        .mockResolvedValueOnce(mockBlueprintData) // First call for blueprint
        .mockResolvedValueOnce(mockMetadata); // Second call for metadata

      const req = new NextRequest('http://localhost:3000/api/story/export?id=test-session-789');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('test-session-789');
      expect(data.yaml).toBe('# Test YAML\ntitle: Test Blueprint');
      expect(data.blueprint).toEqual(mockBlueprintData.blueprint);
      expect(data.metadata).toEqual(mockMetadata);
      expect(mockedGetJsonFile).toHaveBeenCalledWith('live/story/exports/test-session-789.yml');
      expect(mockedGetJsonFile).toHaveBeenCalledWith('live/story/exports/test-session-789_meta.json');
    });

    it('should return 400 when session ID is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/story/export');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Session ID is required');
      expect(mockedGetJsonFile).not.toHaveBeenCalled();
    });

    it('should return 404 when blueprint is not found', async () => {
      mockedGetJsonFile.mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/story/export?id=nonexistent');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Blueprint not found');
    });

    it('should handle storage retrieval errors', async () => {
      mockedGetJsonFile.mockRejectedValue(new Error('S3 read failed'));

      const req = new NextRequest('http://localhost:3000/api/story/export?id=test-error');

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to retrieve exported blueprint');
      expect(data.details).toBe('S3 read failed');
    });
  });
});
