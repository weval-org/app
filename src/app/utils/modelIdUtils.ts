import { IDEAL_MODEL_ID } from "./calculationUtils";
import { ConfigData } from "./types";

export interface ParsedModelId {
  baseId: string; // e.g., "openai:gpt-4o-mini"
  displayName: string; // Base ID + system prompt hash if present
  systemPromptHash?: string; // e.g., "[sys:1a2b3c]"
  temperature?: number; // e.g., 0.7
  systemPromptIndex?: number;
  fullId: string; // The original effectiveModelId
  maker?: string; // e.g., "OPENAI", "ANTHROPIC", etc.
}

export interface ApiCallModelParams {
  originalModelId: string;    // Preserves exact routing: "openrouter:google/gemini-pro"
  temperature?: number;       // Extracted: 0.7
  systemPromptIndex?: number; // Extracted: 1
  systemPromptHash?: string;  // Extracted: "[sys:abc123]"
  effectiveModelId: string;   // Original full ID with suffixes
}

// ===== SHARED UTILITIES (to eliminate DRY issues) =====

interface ParsedSuffixes {
  temperature?: number;
  systemPromptIndex?: number;
  systemPromptHash?: string;
  baseWithoutSuffixes: string;
}

/**
 * Shared utility to parse suffix parameters from model IDs.
 * Handles [temp:X], [sp_idx:X], and [sys:X] in any order.
 */
function parseSuffixesFromModelId(modelId: string): ParsedSuffixes {
  let remaining = modelId;
  let temperature: number | undefined;
  let systemPromptIndex: number | undefined;
  let systemPromptHash: string | undefined;

  // Temperature suffix: [temp:0.7]
  const tempRegex = /\[temp:(\d+\.?\d*)\]/;
  const tempMatch = remaining.match(tempRegex);
  if (tempMatch) {
    temperature = parseFloat(tempMatch[1]);
    remaining = remaining.replace(tempRegex, '');
  }

  // System Prompt Index suffix: [sp_idx:2]
  const spIdxRegex = /\[sp_idx:(\d+)\]/;
  const spIdxMatch = remaining.match(spIdxRegex);
  if (spIdxMatch) {
    systemPromptIndex = parseInt(spIdxMatch[1], 10);
    remaining = remaining.replace(spIdxRegex, '');
  }

  // System Prompt Hash suffix: [sys:abc123]
  const sysRegex = /\[sys:([a-zA-Z0-9]+)\]/;
  const sysMatch = remaining.match(sysRegex);
  if (sysMatch) {
    systemPromptHash = sysMatch[0]; // Store the full [sys:hash]
    // Also check if it's a numeric index
    const numericIndex = parseInt(sysMatch[1], 10);
    if (!isNaN(numericIndex) && sysMatch[1].match(/^\d+$/)) {
      systemPromptIndex = numericIndex;
    }
    remaining = remaining.replace(sysRegex, '');
  }

  return {
    temperature,
    systemPromptIndex,
    systemPromptHash,
    baseWithoutSuffixes: remaining.trim()
  };
}

// Provider detection constants
const ROUTING_PROVIDERS = ['openrouter', 'together', 'fireworks', 'replicate'] as const;

export const IDEAL_MODEL_ID_BASE = 'IDEAL_MODEL_ID'; // Assuming this might be used or relevant

// Helper function to normalize maker names
function normalizeMakerName(maker: string): string {
    const normalized = maker.toUpperCase();
    // Normalize x-ai variants to XAI
    if (normalized === 'X-AI') return 'XAI';
    return normalized;
}

/**
 * Normalizes model IDs to ensure consistent provider prefixes.
 * This fixes issues where the same model appears with and without provider prefixes.
 */
/**
 * Model name normalization mappings for leaderboard consolidation.
 * Maps variant names to their canonical form.
 */
const MODEL_NAME_NORMALIZATIONS: Record<string, string> = {
  // Grok models - normalize beta versions and dated versions to their base versions
  'grok-3-mini-beta': 'grok-3-mini',
  'grok-4-mini-beta': 'grok-4-mini', // Future-proofing
  'grok-4-0709': 'grok-4',

  'deepseek-chat-v3-0324': 'deepseek-chat-v3',
  
  // Claude models - normalize dated versions to their base versions
  'claude-3-5-haiku-20241022': 'claude-3-5-haiku',
  'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet',
  'claude-3-7-sonnet-20250219': 'claude-3-7-sonnet',
  'claude-sonnet-4-20250514': 'claude-sonnet-4',
  'claude-opus-4-20250514': 'claude-opus-4',
  // 'claude-opus-4.1': 'claude-opus-4',
  'claude-3-opus-20240229': 'claude-3-opus',
  // "gpt-4o-2024-11-20": "gpt-4o",
  // "gpt-4o-2024-08-06": "gpt-4o",
  // "gpt-4o-2024-05-13": "gpt-4o",
  
  
  // Gemini models - normalize preview/dated versions to their base versions
  'gemini-2.5-flash-preview-05-20': 'gemini-2.5-flash',
  'gemini-2.5-flash-preview': 'gemini-2.5-flash',
  'gemini-2.5-pro-preview': 'gemini-2.5-pro',
  
  // Add other model normalizations as needed
  // 'model-variant-name': 'canonical-name',
};

/**
 * Normalizes model names to consolidate variants.
 * For example: "grok-3-mini-beta" → "grok-3-mini"
 */
function normalizeModelName(modelName: string): string {
  const lowerModelName = modelName.toLowerCase();
  
  // Check for exact matches first
  if (MODEL_NAME_NORMALIZATIONS[lowerModelName]) {
    return MODEL_NAME_NORMALIZATIONS[lowerModelName];
  }
  
  // Check for pattern-based normalizations
  for (const [variant, canonical] of Object.entries(MODEL_NAME_NORMALIZATIONS)) {
    // Handle case-insensitive matching
    if (lowerModelName === variant.toLowerCase()) {
      return canonical;
    }
  }
  
  return modelName; // Return original if no normalization found
}

/**
 * Extracts the core model name from various provider formats.
 * Examples:
 * - "openrouter:x-ai/grok-3" → "grok-3"
 * - "together:x-ai/grok-3-mini-beta" → "grok-3-mini-beta"
 * - "x-ai/grok-3" → "grok-3"
 * - "xai:grok-3" → "grok-3"
 * - "grok-3" → "grok-3"
 */
function extractCoreModelName(baseId: string): string {
  // Handle all routing provider formats: routing_provider:actual_provider/model
  const isRoutingProvider = ROUTING_PROVIDERS.some(provider => baseId.startsWith(`${provider}:`));
  
  if (isRoutingProvider) {
    const afterRoutingProvider = baseId.substring(baseId.indexOf(':') + 1);
    if (afterRoutingProvider.includes('/')) {
      return afterRoutingProvider.split('/')[1]; // Extract just the model name
    }
    return afterRoutingProvider;
  }
  
  // Handle direct provider formats: provider:model or provider/model
  if (baseId.includes(':')) {
    return baseId.split(':')[1];
  }
  
  if (baseId.includes('/')) {
    return baseId.split('/')[1];
  }
  
  // Already just the model name
  return baseId;
}

function normalizeModelBaseId(baseId: string): string {
  const coreModelName = extractCoreModelName(baseId);
  // Apply model name normalization (e.g., "grok-3-mini-beta" → "grok-3-mini")
  const normalizedModelName = normalizeModelName(coreModelName);
  const modelNameLower = normalizedModelName.toLowerCase();
  
  // Apply canonical provider prefixes based on the normalized model name
  // XAI/Grok models
  if (modelNameLower.includes('grok')) {
    return `xai:${normalizedModelName}`;
  }
  
  // OpenAI models
  if (modelNameLower.includes('gpt-') || modelNameLower.includes('o1-') || modelNameLower.includes('o4-')) {
    return `openai:${normalizedModelName}`;
  }
  
  // Anthropic models
  if (modelNameLower.includes('claude')) {
    return `anthropic:${normalizedModelName}`;
  }
  
  // Anthropic models
  if (modelNameLower.includes('qwen')) {
    return `qwen:${normalizedModelName}`;
  }
  
  // Google models
  if (modelNameLower.includes('gemini') || modelNameLower.includes('palm') || modelNameLower.includes('gemma')) {
    return `google:${normalizedModelName}`;
  }
  
  // DeepSeek models
  if (modelNameLower.includes('deepseek')) {
    return `deepseek:${normalizedModelName}`;
  }
  
  // Meta/Llama models
  if (modelNameLower.includes('llama')) {
    // Normalize meta-llama/llama-xyz to just llama-xyz for canonical form
    const normalizedLlamaName = normalizedModelName.replace(/^meta-llama\//, '');
    return `meta:${normalizedLlamaName}`;
  }
  
  // Mistral models
  if (modelNameLower.includes('mistral') || modelNameLower.includes('mixtral')) {
    return `mistralai:${normalizedModelName}`;
  }
  
  // Cohere models
  if (modelNameLower.includes('command')) {
    return `cohere:${normalizedModelName}`;
  }
  
  // If no known provider can be determined, return with original format if it had one,
  // or just the core name if it was already clean
  if (baseId.includes(':') || baseId.includes('/')) {
    return baseId; // Keep original format for unknown models
  }
  
  return normalizedModelName;
}

// ===== PURPOSE-SPECIFIC FUNCTIONS =====

/**
 * ✅ FOR API CALLS - preserves routing providers!
 * 
 * Extracts API parameters while preserving original routing information.
 * USE THIS for making API calls.
 * 
 * Example:
 * "openrouter:google/gemini-pro[temp:0.7]" → 
 * { originalModelId: "openrouter:google/gemini-pro", temperature: 0.7 }
 */
export function parseModelIdForApiCall(effectiveModelId: string): ApiCallModelParams {
  if (!effectiveModelId) {
    return { 
      originalModelId: 'unknown', 
      effectiveModelId 
    };
  }

  // Handle ideal model ID specifically
  if (effectiveModelId === 'IDEAL_BENCHMARK' || effectiveModelId === IDEAL_MODEL_ID_BASE) {
    return { 
      originalModelId: IDEAL_MODEL_ID_BASE, 
      effectiveModelId,
      temperature: undefined,
      systemPromptHash: undefined 
    };
  }

  const suffixes = parseSuffixesFromModelId(effectiveModelId);

  return {
    originalModelId: suffixes.baseWithoutSuffixes, // NO normalization - preserves routing!
    temperature: suffixes.temperature,
    systemPromptIndex: suffixes.systemPromptIndex,
    systemPromptHash: suffixes.systemPromptHash,
    effectiveModelId
  };
}

/**
 * ⚠️ FOR DISPLAY/LEADERBOARDS ONLY - normalizes providers!
 * 
 * Parses model ID for DISPLAY and LEADERBOARD purposes only.
 * DO NOT USE FOR API CALLS - normalizes routing providers!
 * 
 * Normalizes "openrouter:google/gemini-pro" → "google:gemini-pro"
 * Use parseModelIdForApiCall() to preserve routing.
 * 
 * Example:
 * "openrouter:google/gemini-pro[temp:0.7]" → 
 * { baseId: "google:gemini-pro", temperature: 0.7 } // Lost routing info!
 */
export function parseModelIdForDisplay(effectiveModelId: string): ParsedModelId {
  if (!effectiveModelId) {
    return { baseId: 'Unknown', displayName: 'Unknown', fullId: effectiveModelId };
  }
  
  // Handle ideal model ID specifically
  if (effectiveModelId === 'IDEAL_BENCHMARK' || effectiveModelId === IDEAL_MODEL_ID_BASE) {
      return { baseId: IDEAL_MODEL_ID_BASE, displayName: IDEAL_MODEL_ID_BASE, fullId: effectiveModelId, temperature: undefined, systemPromptHash: undefined };
  }

  const suffixes = parseSuffixesFromModelId(effectiveModelId);
  
  // What remains is the true base model ID
  const baseId = normalizeModelBaseId(suffixes.baseWithoutSuffixes); // Apply normalization for display
  const displayName = baseId; // Display name is just the base, formatting happens in getModelDisplayLabel

  // Extract maker from the original model ID
  const maker = extractMakerFromModelId(effectiveModelId);

  return {
    baseId: baseId,
    displayName: displayName,
    systemPromptHash: suffixes.systemPromptHash,
    temperature: suffixes.temperature,
    systemPromptIndex: suffixes.systemPromptIndex,
    fullId: effectiveModelId,
    maker: maker,
  };
}

/**
 * Resolves a baseId to the first matching full model ID from a list of effective models.
 * Used when leaderboard provides baseId values but we need to find the actual model variants.
 * 
 * @param baseIdOrFullId - Either a baseId (e.g., "openai:gpt-4o") or already a full ID
 * @param effectiveModels - List of full model IDs from data.effectiveModels
 * @returns The first matching full model ID, or the original if it's already full/no match found
 */
export function resolveModelId(baseIdOrFullId: string, effectiveModels: string[]): string {
  if (!baseIdOrFullId || !effectiveModels) return baseIdOrFullId;
  
  // If it already looks like a full model ID (has variant suffixes like [sys:0] or [temp:0.0]), return as-is
  if (baseIdOrFullId.includes('[')) {
    return baseIdOrFullId;
  }
  
  // Otherwise, treat it as a baseId and find the first matching full model ID
  const matchingModel = effectiveModels.find(fullModelId => {
    const parsed = parseModelIdForDisplay(fullModelId);
    return parsed.baseId === baseIdOrFullId;
  });
  
  return matchingModel || baseIdOrFullId;
}

/**
 * Finds all model variants (different system prompts/temperatures) that share the same baseId.
 * Useful for finding all variants when given either a baseId or one specific variant.
 * 
 * @param baseIdOrFullId - Either a baseId or a full model ID
 * @param effectiveModels - List of full model IDs from data.effectiveModels
 * @returns Array of all matching full model IDs that share the same baseId
 */
export function findModelVariants(baseIdOrFullId: string, effectiveModels: string[]): string[] {
  if (!baseIdOrFullId || !effectiveModels) return [];
  
  // First resolve to get the baseId
  const resolvedId = resolveModelId(baseIdOrFullId, effectiveModels);
  const targetBaseId = parseModelIdForDisplay(resolvedId).baseId;
  
  // Find all models that share this baseId
  return effectiveModels.filter(fullModelId => {
    const parsed = parseModelIdForDisplay(fullModelId);
    return parsed.baseId === targetBaseId;
  });
}

/**
 * Extracts the maker (company) from a model ID
 */
export function extractMakerFromModelId(modelId: string): string {
    if (!modelId) return 'UNKNOWN';
    
    let maker = 'UNKNOWN';
    
    // Handle direct provider patterns
    if (modelId.startsWith('openai:')) maker = 'OPENAI';
    else if (modelId.startsWith('anthropic:')) maker = 'ANTHROPIC';
    else if (modelId.startsWith('google:')) maker = 'GOOGLE';
    else if (modelId.startsWith('meta:')) maker = 'META';
    else if (modelId.startsWith('mistral:')) maker = 'MISTRAL';
    else if (modelId.startsWith('cohere:')) maker = 'COHERE';
    else if (modelId.startsWith('deepseek:')) maker = 'DEEPSEEK';
    else if (modelId.startsWith('xai:') || modelId.startsWith('x-ai:')) maker = 'XAI';
    // Handle routing providers that follow provider:maker/model pattern
    else if (modelId.startsWith('openrouter:') || modelId.startsWith('together:') || 
             modelId.startsWith('fireworks:') || modelId.startsWith('replicate:')) {
        const pathParts = modelId.split('/');
        if (pathParts.length > 1) {
            const providerPart = pathParts[0].split(':')[1];
            // Apply known mappings first
            if (providerPart === 'anthropic') maker = 'ANTHROPIC';
            else if (providerPart === 'google') maker = 'GOOGLE';
            else if (providerPart === 'meta-llama') maker = 'META';
            else if (providerPart === 'mistralai') maker = 'MISTRAL';
            else if (providerPart === 'openai') maker = 'OPENAI';
            else if (providerPart === 'moonshotai') maker = 'MOONSHOT';
            else maker = normalizeMakerName(providerPart);
        }
    }
    
    return maker;
}

// Helper function to format the display name for UI
export function getModelDisplayLabel(
    parsedIdOrFullId: ParsedModelId | string,
    options?: { hideProvider?: boolean; hideModelMaker?: boolean; prettifyModelName?: boolean, hideSystemPrompt?: boolean, hideTemperature?: boolean }
): string {
    const parsed = typeof parsedIdOrFullId === 'string' ? parseModelIdForDisplay(parsedIdOrFullId) : parsedIdOrFullId;
    
    let baseId = parsed.baseId;
    let provider = '';
    let modelPath = baseId;

    const colonIndex = baseId.indexOf(':');
    if (colonIndex !== -1) {
        provider = baseId.substring(0, colonIndex);
        modelPath = baseId.substring(colonIndex + 1);
    }

    let finalModelName = modelPath;
    if (options?.hideModelMaker) {
        const slashIndex = modelPath.indexOf('/');
        if (slashIndex !== -1) {
            finalModelName = modelPath.substring(slashIndex + 1);
        }
    }
    
    // Prettify the model name if requested
    if (options?.prettifyModelName) {
        finalModelName = finalModelName
            .replace(/-3-7-/g, '-3.7-')
            .replace(/-3-5-/g, '-3.5-')
            .split('-')
            .map(word => {
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join(' ')
            .replace(/gpt oss/i, 'GPT OSS')
            .replace('Gpt', 'GPT')
            .replace('A3b', 'A3B')
            .replace('Glm', 'GLM');
    }
    
    let baseDisplayName = finalModelName;
    if (!options?.hideProvider && provider) {
        baseDisplayName = `${provider}:${finalModelName}`;
    }

    let label = baseDisplayName;

    const suffixes = [];
    if (parsed.systemPromptHash && !options?.hideSystemPrompt) {
        suffixes.push(`${parsed.systemPromptHash}`);
    }
    if (parsed.systemPromptIndex !== undefined && !options?.hideSystemPrompt) {
        suffixes.push(`sys:${parsed.systemPromptIndex}`);
    }
    if (parsed.temperature !== undefined && parsed.temperature !== 0 && !options?.hideTemperature) {
        suffixes.push(`T:${parsed.temperature}`);
    }

    if (suffixes.length > 0) {
        label = `${baseDisplayName} (${suffixes.join(', ')})`;
    }

    return label;
}

export function getCanonicalModels(
    modelIds: string[],
    config?: ConfigData | null,
): string[] {
    if (!modelIds || modelIds.length === 0) {
        return [];
    }

    const modelsByBaseName = new Map<string, string[]>();

    // Group models by their base name
    for (const modelId of modelIds) {
        if (modelId === IDEAL_MODEL_ID) continue; // Don't group the ideal model
        const { baseId } = parseModelIdForDisplay(modelId);
        if (!modelsByBaseName.has(baseId)) {
            modelsByBaseName.set(baseId, []);
        }
        modelsByBaseName.get(baseId)!.push(modelId);
    }

    const canonicalModels: string[] = [];
    const hasTempVariations = (config?.temperatures?.length ?? 0) > 1;
    const hasSystemVariations = (config?.systems?.length ?? 0) > 1;

    // If there are no variations, all models are canonical
    if (!hasTempVariations && !hasSystemVariations) {
        return modelIds.filter(id => id === IDEAL_MODEL_ID || modelsByBaseName.has(parseModelIdForDisplay(id).baseId));
    }

    for (const variants of modelsByBaseName.values()) {
        if (variants.length === 1) {
            canonicalModels.push(variants[0]);
            continue;
        }

        let bestVariant = variants[0];
        
        // Find the index of the null system prompt, if it exists
        const nullSystemPromptIndex = config?.systems?.indexOf(null);

        for (const variant of variants) {
            if (variant === bestVariant) continue;

            const current = parseModelIdForDisplay(variant);
            const best = parseModelIdForDisplay(bestVariant);

            // Normalize temperature to avoid issues with undefined
            const currentTemp = current.temperature ?? config?.temperature ?? 0;
            const bestTemp = best.temperature ?? config?.temperature ?? 0;

            let isCurrentBetter = false;

            // Decision logic
            if (nullSystemPromptIndex !== undefined && nullSystemPromptIndex !== -1) {
                // A null system prompt is preferred
                const currentIsNSP = current.systemPromptIndex === nullSystemPromptIndex;
                const bestIsNSP = best.systemPromptIndex === nullSystemPromptIndex;

                if (currentIsNSP && !bestIsNSP) {
                    isCurrentBetter = true;
                } else if (currentIsNSP === bestIsNSP) {
                    // Both are NSP or neither are, fallback to temp comparison
                    if (currentTemp < bestTemp) {
                        isCurrentBetter = true;
                    } else if (currentTemp === bestTemp) {
                        // If temps are same, prefer lower sp_idx
                        const currentSPIdx = current.systemPromptIndex ?? 0;
                        const bestSPIdx = best.systemPromptIndex ?? 0;
                        if (currentSPIdx < bestSPIdx) {
                            isCurrentBetter = true;
                        }
                    }
                }
            } else {
                // No null system prompt defined, just compare sp_idx and temp
                const currentSPIdx = current.systemPromptIndex ?? 0;
                const bestSPIdx = best.systemPromptIndex ?? 0;
                if (currentSPIdx < bestSPIdx) {
                    isCurrentBetter = true;
                } else if (currentSPIdx === bestSPIdx && currentTemp < bestTemp) {
                    isCurrentBetter = true;
                }
            }
            
            if (isCurrentBetter) {
                bestVariant = variant;
            }
        }
        canonicalModels.push(bestVariant);
    }
    
    // Always include the ideal model if it was present
    if (modelIds.includes(IDEAL_MODEL_ID)) {
        canonicalModels.push(IDEAL_MODEL_ID);
    }

    return canonicalModels;
} 