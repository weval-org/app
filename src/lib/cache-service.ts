import Keyv from 'keyv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Determine the cache directory based on the environment
const isNetlify = !!process.env.NETLIFY;
const projectRoot = process.cwd();
// Use /tmp on Netlify, otherwise use .cache in the project root
const cacheDir = isNetlify ? path.resolve('/tmp', '.cache') : path.resolve(projectRoot, '.cache');

// Ensure the cache directory exists
if (!fs.existsSync(cacheDir)) {
    try {
        fs.mkdirSync(cacheDir, { recursive: true });
    } catch (error) {
        console.error(`[CacheService] Failed to create cache directory at ${cacheDir}`, error);
        // Depending on the desired behavior, you might want to throw the error
        // or handle it gracefully. For now, we'll log it.
    }
}

// A map to hold different cache instances (namespaces)
const caches = new Map<string, Keyv>();

/**
 * Gets a namespaced Keyv instance for file-based caching.
 * @param namespace - A string to identify the cache, e.g., 'model-responses'. This will be used as the filename.
 * @returns A Keyv instance.
 */
export function getCache(namespace: string): Keyv {
    if (!caches.has(namespace)) {
        let keyv: Keyv;
        try {
            const { KeyvFile } = require('keyv-file');
            keyv = new Keyv({
                store: new KeyvFile({
                    filename: path.join(cacheDir, `${namespace}.json`),
                    writeDelay: 100, // Debounce writes to disk to improve performance
                }),
            });
            caches.set(namespace, keyv);
        } catch (error) {
            console.error(`[CacheService] Failed to initialize cache for namespace '${namespace}'. Caching will be disabled for this namespace.`, error);
            // Return a dummy in-memory cache so the app doesn't crash
            keyv = new Keyv(); 
            caches.set(namespace, keyv);
        }
    }
    return caches.get(namespace)!;
}

/**
 * Generates a consistent SHA256 hash for any given serializable payload.
 * Used to create a stable cache key.
 * @param payload - The data to be hashed.
 * @returns A hex string representing the hash.
 */
export function generateCacheKey(payload: any): string {
    try {
        const stringifiedPayload = JSON.stringify(payload);
        return crypto.createHash('sha256').update(stringifiedPayload).digest('hex');
    } catch (error) {
        console.error('[CacheService] Failed to generate cache key. Returning random key to prevent collision.', error);
        // Return a random key to prevent accidentally overwriting a valid cache entry
        return crypto.randomBytes(16).toString('hex');
    }
} 