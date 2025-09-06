import { jest } from '@jest/globals';
import { getEmbedding } from '../embedding-service';
import * as cacheService from '@/lib/cache-service';
import * as dispatcher from '@/lib/embedding-clients/client-dispatcher';

jest.mock('@/lib/cache-service');
jest.mock('@/lib/embedding-clients/client-dispatcher');

const mockedCache = cacheService as jest.Mocked<typeof cacheService>;
const mockedDispatcher = dispatcher as jest.Mocked<typeof dispatcher>;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockCacheStore = new Map<string, number[]>();
const mockGet = jest.fn((key) => mockCacheStore.get(key));
const mockSet = jest.fn((key, value) => mockCacheStore.set(key, value));

mockedCache.getCache.mockReturnValue({
  get: mockGet,
  set: mockSet,
} as any);

mockedCache.generateCacheKey.mockImplementation((payload) => {
  // Simple deterministic key for testing
  return `key-for-${JSON.stringify(payload)}`;
});


describe('embedding-service', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockCacheStore.clear();
    });
  
    it('should call the dispatcher and cache the result when useCache is true and cache is missed', async () => {
      const text = 'some text';
      const modelId = 'openai:text-embedding-3-small';
      const embedding = [0.1, 0.2, 0.3];
      mockedDispatcher.dispatchCreateEmbedding.mockResolvedValue(embedding);
  
      const result = await getEmbedding(text, modelId, mockLogger as any, true);
  
      expect(result).toEqual(embedding);
      expect(mockedDispatcher.dispatchCreateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockedDispatcher.dispatchCreateEmbedding).toHaveBeenCalledWith(text, modelId);
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockSet).toHaveBeenCalledTimes(1);
      const cacheKey = mockedCache.generateCacheKey({ modelId, text });
      expect(mockSet).toHaveBeenCalledWith(cacheKey, embedding);
    });
    
    it('should return the cached result without calling the dispatcher on cache hit when useCache is true', async () => {
      const text = 'some text';
      const modelId = 'openai:text-embedding-3-small';
      const embedding = [0.1, 0.2, 0.3];
      const cacheKey = mockedCache.generateCacheKey({ modelId, text });
      mockCacheStore.set(cacheKey, embedding);
  
      const result = await getEmbedding(text, modelId, mockLogger as any, true);
  
      expect(result).toEqual(embedding);
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockedDispatcher.dispatchCreateEmbedding).not.toHaveBeenCalled();
      expect(mockSet).not.toHaveBeenCalled();
    });
  
    it('should not use the cache if useCache is false', async () => {
      const text = 'some text';
      const modelId = 'openai:text-embedding-3-small';
      const embedding = [0.1, 0.2, 0.3];
      mockedDispatcher.dispatchCreateEmbedding.mockResolvedValue(embedding);
  
      const result = await getEmbedding(text, modelId, mockLogger as any, false);
      
      expect(result).toEqual(embedding);
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockSet).not.toHaveBeenCalled();
      expect(mockedDispatcher.dispatchCreateEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should still call dispatcher but not cache if useCache is false, even if item is in cache', async () => {
        const text = 'some text';
        const modelId = 'openai:text-embedding-3-small';
        const embedding = [0.1, 0.2, 0.3];
        const newEmbedding = [0.4, 0.5, 0.6];
        const cacheKey = mockedCache.generateCacheKey({ modelId, text });
        mockCacheStore.set(cacheKey, embedding);
        mockedDispatcher.dispatchCreateEmbedding.mockResolvedValue(newEmbedding);

        const result = await getEmbedding(text, modelId, mockLogger as any, false);

        expect(result).toEqual(newEmbedding); // Should be the new value from API
        expect(mockGet).not.toHaveBeenCalled();
        expect(mockSet).not.toHaveBeenCalled();
        expect(mockedDispatcher.dispatchCreateEmbedding).toHaveBeenCalledTimes(1);
    });
  });
