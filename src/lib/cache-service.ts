import Keyv from 'keyv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { KeyvFile } from 'keyv-file';

// Use the /tmp directory for caching.
const cacheDir = path.resolve('/tmp', '.cache');

// Ensure the cache directory exists
if (!fs.existsSync(cacheDir)) {
    try {
        fs.mkdirSync(cacheDir, { recursive: true });
    } catch (error) {
        console.error(`[CacheService] Failed to create cache directory at ${cacheDir}`, error);
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
            // Create SQLite cache as primary storage
            const KeyvSqlite = require('@keyv/sqlite').default;
            keyv = new Keyv({
                store: new KeyvSqlite({
                    uri: `sqlite://${path.join(cacheDir, `${namespace}.sqlite`)}`,
                }),
            });

            // Try to initialize legacy JSON cache for reading (if it exists)
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

            // Wrap the cache to add resilience for write failures
            const originalSet = keyv.set.bind(keyv);
            keyv.set = async function(key: string, value: any, ttl?: number) {
                try {
                    return await originalSet(key, value, ttl);
                } catch (error: any) {
                    console.warn(`[CacheService] Failed to write to cache (namespace: ${namespace}): ${error.message}`);
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
