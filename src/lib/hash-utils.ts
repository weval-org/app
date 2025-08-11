import { createHash } from 'node:crypto';
import { ComparisonConfig } from '@/cli/types/cli_types';

/**
 * Generates a consistent content hash for a given comparison configuration.
 * This hash is used to identify unique runs based on the core parameters of the config.
 * @param config The ComparisonConfig object.
 * @returns A 16-character SHA256 hash string.
 */
export function generateConfigContentHash(config: ComparisonConfig): string {
    const dataToHash = {
        models: [...config.models].sort(),
        system: config.system,
        systems: config.systems ? [...config.systems].sort() : undefined,
        prompts: config.prompts
            .map(p => ({
                id: p.id,
                promptText: p.promptText,
                idealResponse: p.idealResponse,
                system: p.system,
                points: p.points,
                weight: (p as any)?.weight,
            }))
            .sort((a, b) => (a.id || '').localeCompare(b.id || '')), // Sort prompts by ID
        temperatureSettings: 
            (config.temperatures && config.temperatures.length > 0) 
            ? (config.temperatures.length === 1 ? config.temperatures[0] : [...config.temperatures].sort()) 
            : config.temperature,
        // Note: config.concurrency is not included in the hash here, but was mentioned as a consideration.
        // If concurrency should affect the hash, it needs to be added here.
    };
    const stringToHash = JSON.stringify(dataToHash);
    const contentHash = createHash('sha256').update(stringToHash).digest('hex').substring(0, 16);
    return contentHash;
} 