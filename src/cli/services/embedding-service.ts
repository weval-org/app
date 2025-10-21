import { dispatchCreateEmbedding } from '@/lib/embedding-clients/client-dispatcher';
import { generateCacheKey } from '@/lib/cache-service';
import Keyv from 'keyv';

interface EmbeddingServiceLogger {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
}

// Use in-memory cache for embeddings to avoid RangeError when serializing large cache files
// Embeddings are large arrays (1536+ floats) and when many are cached, keyv-file hits string length limits
const embeddingCache = new Keyv({
    namespace: 'embeddings',
    // In-memory only - no persistence to avoid serialization errors
    ttl: 60 * 60 * 1000, // 1 hour TTL to prevent memory bloat
});

/**
 * Gets an embedding for the provided text using the specified model.
 * The modelId should be in the format "provider:model_name".
 * Uses the central cache service to avoid redundant API calls if useCache is true.
 */
export async function getEmbedding(
    text: string,
    modelId: string,
    logger: EmbeddingServiceLogger,
    useCache: boolean = false, // Add useCache flag, default to false
): Promise<number[]> {
    // Use the in-memory cache defined at module level
    const cacheKeyPayload = { modelId, text };
    const cacheKey = generateCacheKey(cacheKeyPayload);

    if (useCache) {
        const cachedEmbedding = await embeddingCache.get(cacheKey);
        if (cachedEmbedding) {
            logger.info(`  -> In-memory cache hit for embedding (model: ${modelId}, key: ${cacheKey.substring(0, 8)}...)`);
            return cachedEmbedding as number[];
        }
        logger.info(`  -> In-memory cache miss for embedding (model: ${modelId}, key: ${cacheKey.substring(0,8)}...). Requesting from API.`);
    }

    try {
        if (typeof window !== 'undefined') {
            logger.error('getEmbedding from embedding-service is not supported in the browser context.');
            throw new Error('Embedding generation from CLI service is not available in the browser.');
        }

        logger.info(`   --> [getEmbedding] Calling embedding dispatcher for model: ${modelId}`);
        
        const embedding = await dispatchCreateEmbedding(text, modelId);

        if (useCache) {
            try {
                // In-memory cache - no serialization issues
                await embeddingCache.set(cacheKey, embedding);
                const dims = Array.isArray(embedding) ? embedding.length : 'unknown';
                logger.info(`  -> Saved new embedding to in-memory cache (model: ${modelId}, key: ${cacheKey.substring(0, 8)}..., dims: ${dims})`);
            } catch (cacheError: any) {
                logger.error(`  -> Failed to cache embedding: ${cacheError.message}`);
                // Don't throw - just skip caching and return the embedding
            }
        }

        return embedding;

    } catch (error) {
        logger.error(`Embedding API call failed for model ${modelId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
    }
} 