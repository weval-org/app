import OpenAI from 'openai'
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto'; 

interface EmbeddingServiceLogger {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
}

// --- Cache Configuration ---
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
// --- End Cache Configuration ---

// Initialize OpenAI client if in Node.js environment
let openaiClient: OpenAI | null = null
if (typeof window === 'undefined' && process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  })
}

/**
 * Gets an embedding for the provided text using the specified model.
 * Defaults to text-embedding-3-small if no model is provided.
 * Uses a file-based cache (.cache_embeddings.json) to avoid redundant API calls.
 */
export async function getEmbedding(
    text: string,
    modelId: string = 'text-embedding-3-small',
    logger: EmbeddingServiceLogger // Added logger parameter
): Promise<number[]> {

    await loadCache(logger); // Ensure cache is loaded, passing the logger.

    // const { logger } = getConfig(); // Removed direct getConfig call

    // --- Caching Logic ---
    const cacheKeyInput = `${modelId}:${text}`;
    const cacheKeyHash = createHash(cacheKeyInput);

    if (embeddingCache[cacheKeyHash]) {
        logger.info(`  -> Cache hit for embedding (model: ${modelId}, key hash: ${cacheKeyHash.substring(0, 8)}...)`);
        return embeddingCache[cacheKeyHash];
    }
    // --- End Caching Logic ---

    logger.info(`  -> Cache miss for embedding (model: ${modelId}, key hash: ${cacheKeyHash.substring(0,8)}...). Requesting from API.`);

    // Determine dimensions (existing logic)
    let dimensions: number;
    if (modelId === 'text-embedding-3-large') {
        dimensions = 3072;
    } else if (modelId === 'text-embedding-3-small') {
        dimensions = 1536;
    } else {
        logger.error(`Unsupported embedding model ID: ${modelId}`);
        throw new Error(`Unsupported embedding model ID: ${modelId}`);
    }

  try {
    let embedding: number[];
    if (openaiClient) {
      logger.info(`   --> [getEmbedding] Calling OpenAI API for model: ${modelId}, hash: ${cacheKeyHash.substring(0,8)}...`);
      const response = await openaiClient.embeddings.create({
        model: modelId,
        input: text,
        dimensions: dimensions,
        encoding_format: 'float'
      });
      embedding = response.data[0].embedding;
    } else {
      // Browser context logic (remains unchanged, caching not applied here for file system)
      logger.warn('Browser context detected for embedding. File caching not applied. Attempting API route.');
      const response = await fetch('/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model: modelId })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get embedding via API route');
      }
      const data = await response.json();
      embedding = data.data[0].embedding;
    }

    // --- Caching Logic: Save new embedding to in-memory cache and then to file ---
    if (typeof window === 'undefined') { // Only perform file caching in Node.js environment
        embeddingCache[cacheKeyHash] = embedding; // Update in-memory cache
        await saveCache(logger); // Persist the updated cache to file, passing the logger.
        logger.info(`  -> Saved new embedding to cache (model: ${modelId}, key hash: ${cacheKeyHash.substring(0, 8)}...)`);
    }
    // --- End Caching Logic ---

    return embedding;

  } catch (error) {
    logger.error(`Embedding API call failed for model ${modelId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw new Error(`Embedding generation failed for model ${modelId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
} 