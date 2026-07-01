import { MockedFunction, vi } from 'vitest';

// Mock Keyv at the top before imports
const { mockCacheStore, mockKeyvInstance } = vi.hoisted(() => {
  const store = new Map<string, any>();
  return {
    mockCacheStore: store,
    mockKeyvInstance: {
      get: vi.fn(async (key: string) => store.get(key)),
      set: vi.fn(async (key: string, value: any) => {
        store.set(key, value);
        return true;
      }),
    },
  };
});

vi.mock('keyv', () => {
  return { default: vi.fn().mockImplementation(() => mockKeyvInstance) };
});

// Mock generateCacheKey
vi.mock('@/lib/cache-service', () => ({
  generateCacheKey: vi.fn((payload: any) => `key-for-${JSON.stringify(payload)}`),
}));

// Mock the dispatcher
vi.mock('@/lib/embedding-clients/client-dispatcher', () => ({
  dispatchCreateEmbedding: vi.fn() as MockedFunction<(text: string, modelId: string) => Promise<number[]>>,
}));

// Import after mocks are set up
import { getEmbedding } from '../embedding-service';
import { dispatchCreateEmbedding } from '@/lib/embedding-clients/client-dispatcher';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('embedding-service', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockCacheStore.clear();
      mockKeyvInstance.get.mockClear();
      mockKeyvInstance.set.mockClear();
    });

    it('should call the dispatcher and cache the result when useCache is true and cache is missed', async () => {
      const text = 'some text';
      const modelId = 'openai:text-embedding-3-small';
      const embedding = [0.1, 0.2, 0.3];
      (dispatchCreateEmbedding as MockedFunction<typeof dispatchCreateEmbedding>).mockResolvedValue(embedding);

      const result = await getEmbedding(text, modelId, mockLogger as any, true);

      expect(result).toEqual(embedding);
      expect(dispatchCreateEmbedding).toHaveBeenCalledTimes(1);
      expect(dispatchCreateEmbedding).toHaveBeenCalledWith(text, modelId);
      expect(mockKeyvInstance.get).toHaveBeenCalled();
      expect(mockKeyvInstance.set).toHaveBeenCalledWith(
        expect.stringContaining('key-for-'),
        embedding
      );
    });

    it('should return the cached result without calling the dispatcher on cache hit when useCache is true', async () => {
      const text = 'some text';
      const modelId = 'openai:text-embedding-3-small';
      const embedding = [0.1, 0.2, 0.3];
      const cacheKey = `key-for-${JSON.stringify({ modelId, text })}`;
      mockCacheStore.set(cacheKey, embedding);

      const result = await getEmbedding(text, modelId, mockLogger as any, true);

      expect(result).toEqual(embedding);
      expect(mockKeyvInstance.get).toHaveBeenCalled();
      expect(dispatchCreateEmbedding).not.toHaveBeenCalled();
      expect(mockKeyvInstance.set).not.toHaveBeenCalled();
    });

    it('should not use the cache if useCache is false', async () => {
      const text = 'some text';
      const modelId = 'openai:text-embedding-3-small';
      const embedding = [0.1, 0.2, 0.3];
      (dispatchCreateEmbedding as MockedFunction<typeof dispatchCreateEmbedding>).mockResolvedValue(embedding);

      const result = await getEmbedding(text, modelId, mockLogger as any, false);

      expect(result).toEqual(embedding);
      expect(mockKeyvInstance.get).not.toHaveBeenCalled();
      expect(mockKeyvInstance.set).not.toHaveBeenCalled();
      expect(dispatchCreateEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should still call dispatcher but not cache if useCache is false, even if item is in cache', async () => {
        const text = 'some text';
        const modelId = 'openai:text-embedding-3-small';
        const embedding = [0.1, 0.2, 0.3];
        const newEmbedding = [0.4, 0.5, 0.6];
        const cacheKey = `key-for-${JSON.stringify({ modelId, text })}`;
        mockCacheStore.set(cacheKey, embedding);
        (dispatchCreateEmbedding as MockedFunction<typeof dispatchCreateEmbedding>).mockResolvedValue(newEmbedding);

        const result = await getEmbedding(text, modelId, mockLogger as any, false);

        expect(result).toEqual(newEmbedding); // Should be the new value from API
        expect(mockKeyvInstance.get).not.toHaveBeenCalled();
        expect(mockKeyvInstance.set).not.toHaveBeenCalled();
        expect(dispatchCreateEmbedding).toHaveBeenCalledTimes(1);
    });
  });
