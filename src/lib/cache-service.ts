import Keyv from 'keyv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
// Only import KeyvFile if not in Netlify (will be loaded conditionally)
import { KeyvFile } from 'keyv-file';

// Detect if we're running in Netlify Functions (where native modules like sqlite3 don't work)
// AWS_LAMBDA_FUNCTION_NAME is set in Netlify Functions (which run on AWS Lambda)
// NETLIFY_DEV is set when running with `netlify dev` locally
const isNetlifyFunction = process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined || process.env.NETLIFY_DEV === 'true';

// Use the /tmp directory for caching, which is writable in serverless environments.
const cacheDir = path.resolve('/tmp', '.cache');

// Ensure the cache directory exists (unless we're in Netlify where we'll use in-memory cache)
if (!isNetlifyFunction && !fs.existsSync(cacheDir)) {
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
// A map to hold legacy JSON cache instances for reading old data
const legacyCaches = new Map<string, Keyv>();

/**
 * Gets a namespaced Keyv instance for SQLite-based caching with fallback to legacy JSON.
 * New entries are written to SQLite. Old entries from JSON cache are read and migrated on access.
 * @param namespace - A string to identify the cache, e.g., 'model-responses', 'embeddings'.
 * @returns A Keyv instance.
 */
export function getCache(namespace: string): Keyv {
    if (!caches.has(namespace)) {
        let keyv: Keyv;
        try {
            // In Netlify Functions, use /tmp file-based cache to persist across warm starts
            // This avoids sqlite3 native module issues while still getting cache benefits
            if (isNetlifyFunction) {
                console.log(`[CacheService] Using /tmp file-based cache for '${namespace}' (Netlify Function environment)`);
                const tmpCachePath = path.join('/tmp', '.cache', `${namespace}.json`);

                // Ensure /tmp/.cache directory exists
                const tmpCacheDir = path.dirname(tmpCachePath);
                if (!fs.existsSync(tmpCacheDir)) {
                    fs.mkdirSync(tmpCacheDir, { recursive: true });
                }

                keyv = new Keyv({
                    store: new KeyvFile({
                        filename: tmpCachePath,
                        writeDelay: 100,
                        // Clear old entries to prevent /tmp from filling up (512MB limit)
                        // This happens automatically via TTL, but we set a reasonable default
                    }),
                    // Set TTL to 1 hour - cache persists across warm starts but not indefinitely
                    ttl: 60 * 60 * 1000, // 1 hour in milliseconds
                });
            } else {
                // Create SQLite cache as primary storage for local/server environments
                // Use dynamic import to avoid loading sqlite3 in serverless environments
                const KeyvSqlite = require('@keyv/sqlite');
                keyv = new Keyv({
                    store: new KeyvSqlite({
                        uri: `sqlite://${path.join(cacheDir, `${namespace}.sqlite`)}`,
                    }),
                });
            }

            // Try to initialize legacy JSON cache for reading (if it exists) - only for non-Netlify environments
            if (!isNetlifyFunction) {
                const legacyJsonPath = path.join(cacheDir, `${namespace}.json`);
                if (fs.existsSync(legacyJsonPath)) {
                    try {
                        const legacyKeyv = new Keyv({
                            store: new KeyvFile({
                                filename: legacyJsonPath,
                                writeDelay: 100,
                            }),
                        });
                        legacyCaches.set(namespace, legacyKeyv);
                        console.log(`[CacheService] Found legacy JSON cache for '${namespace}'. Will migrate entries on access.`);
                    } catch (legacyError) {
                        console.warn(`[CacheService] Legacy JSON cache exists but couldn't be loaded for '${namespace}':`, legacyError);
                    }
                }
            }

            // Wrap the SQLite cache to add migration logic
            const originalGet = keyv.get.bind(keyv);
            keyv.get = async function(key: string | string[], options?: any) {
                // Handle single key migration
                if (typeof key === 'string') {
                    // First try SQLite
                    let value = await originalGet(key, options);

                    // If not found in SQLite, try legacy JSON cache
                    if (value === undefined && legacyCaches.has(namespace)) {
                        const legacyCache = legacyCaches.get(namespace)!;
                        try {
                            value = await legacyCache.get(key, options);
                            if (value !== undefined) {
                                console.log(`[CacheService] Migrating cache entry from JSON to SQLite (namespace: ${namespace}, key: ${key.substring(0, 12)}...)`);
                                // Migrate to SQLite
                                await keyv.set(key, value);
                            }
                        } catch (legacyReadError) {
                            console.warn(`[CacheService] Error reading from legacy cache for key ${key.substring(0, 12)}...:`, legacyReadError);
                        }
                    }

                    return value;
                } else {
                    // For array keys, just use original SQLite get (no migration)
                    return originalGet(key, options);
                }
            } as typeof keyv.get;

            // Wrap the cache to add resilience for write failures (especially in /tmp)
            const originalSet = keyv.set.bind(keyv);
            keyv.set = async function(key: string, value: any, ttl?: number) {
                try {
                    return await originalSet(key, value, ttl);
                } catch (error: any) {
                    // If write fails (e.g., /tmp full), log but don't crash
                    console.warn(`[CacheService] Failed to write to cache (namespace: ${namespace}): ${error.message}`);
                    // Return false to indicate write failure
                    return false;
                }
            } as typeof keyv.set;

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

/**
 * Cleans up large or old cache files from /tmp to prevent disk space issues
 * in Netlify Functions (512MB /tmp limit). Call this at the start of long-running
 * background functions.
 *
 * @param maxSizeMB - Maximum total size of cache files in MB (default: 100MB)
 */
export function cleanupTmpCache(maxSizeMB: number = 100): void {
    if (!isNetlifyFunction) {
        return; // Only relevant for Netlify Functions
    }

    try {
        const tmpCacheDir = path.join('/tmp', '.cache');
        if (!fs.existsSync(tmpCacheDir)) {
            return;
        }

        const files = fs.readdirSync(tmpCacheDir).map(filename => {
            const filepath = path.join(tmpCacheDir, filename);
            const stats = fs.statSync(filepath);
            return { filepath, filename, size: stats.size, mtime: stats.mtime };
        });

        const totalSize = files.reduce((sum, f) => sum + f.size, 0);
        const totalSizeMB = totalSize / (1024 * 1024);

        if (totalSizeMB > maxSizeMB) {
            console.warn(`[CacheService] /tmp cache is ${totalSizeMB.toFixed(2)}MB, exceeds ${maxSizeMB}MB limit. Cleaning up...`);

            // Sort by modification time (oldest first)
            files.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

            let deletedSize = 0;
            for (const file of files) {
                if (totalSizeMB - (deletedSize / (1024 * 1024)) <= maxSizeMB * 0.8) {
                    break; // Stop when we're at 80% of limit
                }

                try {
                    fs.unlinkSync(file.filepath);
                    deletedSize += file.size;
                    console.log(`[CacheService] Deleted old cache file: ${file.filename} (${(file.size / 1024).toFixed(1)}KB)`);
                } catch (err) {
                    console.warn(`[CacheService] Failed to delete ${file.filename}:`, err);
                }
            }

            console.log(`[CacheService] Cleanup complete. Freed ${(deletedSize / (1024 * 1024)).toFixed(2)}MB`);
        } else {
            console.log(`[CacheService] /tmp cache size: ${totalSizeMB.toFixed(2)}MB (under ${maxSizeMB}MB limit)`);
        }
    } catch (error) {
        console.error('[CacheService] Error during cache cleanup:', error);
        // Don't throw - cleanup is best-effort
    }
} 