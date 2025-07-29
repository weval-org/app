import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { dispatchCreateEmbedding } from '@/lib/embedding-clients/client-dispatcher';

interface EmbeddingServiceLogger {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
}

const CACHE_FILE_NAME = '.civic_eval_embed_service_cache_embeddings.json';

// Determine cache path based on environment
let CACHE_FILE_PATH = path.join('/tmp', CACHE_FILE_NAME);
console.log('[EmbeddingService] Initializing. Cache path will be:', CACHE_FILE_PATH);

let embeddingCache: Record<string, number[]> = {};
let cacheLoaded = false;

// Promise-based lock for file operations to ensure serial access
let fileOperationLock = Promise.resolve();

// Helper function to load cache from file
async function loadCache(logger: EmbeddingServiceLogger): Promise<void> {
    // If cache is already loaded into memory, no need to do anything.
    if (cacheLoaded) {
        return;
    }

    // Chain the actual file reading operation onto the existing lock.
    // This ensures that only one file read operation can occur at a time.
    const loadOperation = async () => {
        // Double-check cacheLoaded state inside the lock, as another concurrent call
        // might have completed loading while this one was awaiting the lock.
        if (cacheLoaded) {
            return;
        }

        try {
            logger.info(`Attempting to load embedding cache from: ${CACHE_FILE_PATH}`);
            const data = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
            embeddingCache = JSON.parse(data);
            cacheLoaded = true;
            logger.info(`Successfully loaded ${Object.keys(embeddingCache).length} embeddings from cache: ${CACHE_FILE_PATH}`);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                logger.info(`Embedding cache file not found at ${CACHE_FILE_PATH}. A new one will be created on the first save.`);
            } else {
                // This handles the user's SyntaxError due to corruption.
                logger.error(`Failed to parse embedding cache file at ${CACHE_FILE_PATH} (likely corrupt): ${error.message}`);
                logger.info(`Attempting to delete corrupt cache file: ${CACHE_FILE_PATH}`);
                try {
                    await fs.unlink(CACHE_FILE_PATH);
                    logger.info(`Successfully deleted corrupt cache file: ${CACHE_FILE_PATH}`);
                } catch (unlinkError: any) {
                    logger.error(`Failed to delete corrupt cache file: ${unlinkError.message}`);
                }
            }
            // In any error case (file not found, corruption), initialize an empty cache.
            embeddingCache = {};
            cacheLoaded = true; // Mark as loaded (even if empty) to prevent repeated load attempts this session.
        }
    };

    fileOperationLock = fileOperationLock.then(loadOperation).catch(criticalError => {
        // This catch is for errors in the locking mechanism itself or unhandled errors in loadOperation
        logger.error(`Critical error during cache loading sequence: ${criticalError.message}`);
        // Fallback to ensure the application can proceed, albeit without a working cache load.
        embeddingCache = {};
        cacheLoaded = true;
    });

    await fileOperationLock; // Wait for the load operation (or its turn in the queue) to complete.
}

// Helper function to save cache to file
async function saveCache(logger: EmbeddingServiceLogger): Promise<void> {
    // Chain the file writing operation onto the lock.
    // This ensures that only one file write operation can occur at a time.
    const saveOperation = async () => {
        const data = JSON.stringify(embeddingCache, null, 2); // Pretty-print JSON
        await fs.writeFile(CACHE_FILE_PATH, data, 'utf-8');
    };

    fileOperationLock = fileOperationLock.then(saveOperation).catch(error => {
        logger.error(`Failed to save embedding cache to ${CACHE_FILE_PATH}: ${error.message}`);
    });
    await fileOperationLock; // Wait for the save operation (or its turn in the queue) to complete.
}

// Helper function to create SHA-256 hash
function createHash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Gets an embedding for the provided text using the specified model.
 * The modelId should be in the format "provider:model_name".
 * Uses a file-based cache (.civic_eval_embed_service_cache_embeddings.json) to avoid redundant API calls.
 */
export async function getEmbedding(
    text: string,
    modelId: string, // Now a required parameter
    logger: EmbeddingServiceLogger
): Promise<number[]> {

    await loadCache(logger); // Ensure cache is loaded

    const cacheKeyInput = `${modelId}:${text}`;
    const cacheKeyHash = createHash(cacheKeyInput);

    if (embeddingCache[cacheKeyHash]) {
        logger.info(`  -> Cache hit for embedding (model: ${modelId}, key hash: ${cacheKeyHash.substring(0, 8)}...)`);
        return embeddingCache[cacheKeyHash];
    }

    logger.info(`  -> Cache miss for embedding (model: ${modelId}, key hash: ${cacheKeyHash.substring(0,8)}...). Requesting from API.`);

    try {
        if (typeof window !== 'undefined') {
            // Browser context is not supported for CLI embedding service.
            // This logic path should ideally not be hit in the primary CLI workflow.
            logger.error('getEmbedding from embedding-service is not supported in the browser context.');
            throw new Error('Embedding generation from CLI service is not available in the browser.');
        }

        logger.info(`   --> [getEmbedding] Calling embedding dispatcher for model: ${modelId}`);
        
        const embedding = await dispatchCreateEmbedding(text, modelId);

        embeddingCache[cacheKeyHash] = embedding; // Update in-memory cache
        await saveCache(logger); // Persist the updated cache to file
        logger.info(`  -> Saved new embedding to cache (model: ${modelId}, key hash: ${cacheKeyHash.substring(0, 8)}...)`);

        return embedding;

    } catch (error) {
        logger.error(`Embedding API call failed for model ${modelId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // To prevent poisoning the evaluation with a single failed embedding, we throw here.
        // The caller (EmbeddingEvaluator) will catch this and handle it gracefully.
        throw error;
    }
} 