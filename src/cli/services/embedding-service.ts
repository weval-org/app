import { dispatchCreateEmbedding } from '@/lib/embedding-clients/client-dispatcher';
import { getCache, generateCacheKey } from '@/lib/cache-service';

interface EmbeddingServiceLogger {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
}

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
    const embeddingCache = getCache('embeddings');
    const cacheKeyPayload = { modelId, text };
    const cacheKey = generateCacheKey(cacheKeyPayload);

    if (useCache) {
        const cachedEmbedding = await embeddingCache.get(cacheKey);
        if (cachedEmbedding) {
            logger.info(`  -> Cache hit for embedding (model: ${modelId}, key: ${cacheKey.substring(0, 8)}...)`);
            return cachedEmbedding as number[];
        }
        logger.info(`  -> Cache miss for embedding (model: ${modelId}, key: ${cacheKey.substring(0,8)}...). Requesting from API.`);
    }

    try {
        if (typeof window !== 'undefined') {
            logger.error('getEmbedding from embedding-service is not supported in the browser context.');
            throw new Error('Embedding generation from CLI service is not available in the browser.');
        }

        logger.info(`   --> [getEmbedding] Calling embedding dispatcher for model: ${modelId}`);
        
        const embedding = await dispatchCreateEmbedding(text, modelId);

        if (useCache) {
            await embeddingCache.set(cacheKey, embedding);
            logger.info(`  -> Saved new embedding to cache (model: ${modelId}, key: ${cacheKey.substring(0, 8)}...)`);
        }

        return embedding;

    } catch (error) {
        logger.error(`Embedding API call failed for model ${modelId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
    }
} 