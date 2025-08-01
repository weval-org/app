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

export const IDEAL_MODEL_ID_BASE = 'IDEAL_MODEL_ID'; // Assuming this might be used or relevant

// Helper function to normalize maker names
function normalizeMakerName(maker: string): string {
    const normalized = maker.toUpperCase();
    // Normalize x-ai variants to XAI
    if (normalized === 'X-AI') return 'XAI';
    return normalized;
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

export function parseEffectiveModelId(effectiveModelId: string): ParsedModelId {
  if (!effectiveModelId) {
    return { baseId: 'Unknown', displayName: 'Unknown', fullId: effectiveModelId };
  }
  // Handle ideal model ID specifically
  if (effectiveModelId === 'IDEAL_BENCHMARK' || effectiveModelId === IDEAL_MODEL_ID_BASE) { // IDEAL_MODEL_ID is often 'IDEAL_BENCHMARK'
      return { baseId: IDEAL_MODEL_ID_BASE, displayName: IDEAL_MODEL_ID_BASE, fullId: effectiveModelId, temperature: undefined, systemPromptHash: undefined };
  }

  let remainingId = effectiveModelId;
  let temperature: number | undefined;
  let systemPromptHash: string | undefined;
  let systemPromptIndex: number | undefined;

  // Match and remove suffixes regardless of their order.

  // Temperature
  const tempRegex = /\[temp:(\d+\.?\d*)\]/;
  const tempMatch = remainingId.match(tempRegex);
  if (tempMatch) {
    temperature = parseFloat(tempMatch[1]);
    remainingId = remainingId.replace(tempRegex, '');
  }

  // System Prompt Index
  const spIdxRegex = /\[sp_idx:(\d+)\]/;
  const spIdxMatch = remainingId.match(spIdxRegex);
  if (spIdxMatch) {
    systemPromptIndex = parseInt(spIdxMatch[1], 10);
    remainingId = remainingId.replace(spIdxRegex, '');
  }

  // System Prompt Hash
  const sysRegex = /\[sys:([a-zA-Z0-9]+)\]/;
  const sysMatch = remainingId.match(sysRegex);
  if (sysMatch) {
    systemPromptHash = sysMatch[0]; // Store the full [sys:hash]
    // Also check if it's a numeric index
    const numericIndex = parseInt(sysMatch[1], 10);
    if (!isNaN(numericIndex) && sysMatch[1].match(/^\d+$/)) {
        systemPromptIndex = numericIndex;
    }
    remainingId = remainingId.replace(sysRegex, '');
  }
  
  // What remains is the true base model ID
  const baseId = remainingId;
  const displayName = baseId; // Display name is just the base, formatting happens in getModelDisplayLabel

  // Extract maker from the original model ID
  const maker = extractMakerFromModelId(effectiveModelId);

  return {
    baseId: baseId,
    displayName: displayName,
    systemPromptHash: systemPromptHash,
    temperature: temperature,
    systemPromptIndex: systemPromptIndex, // This can remain if needed elsewhere
    fullId: effectiveModelId,
    maker: maker,
  };
}

// Helper function to format the display name for UI
export function getModelDisplayLabel(
    parsedIdOrFullId: ParsedModelId | string,
    options?: { hideProvider?: boolean; hideModelMaker?: boolean; prettifyModelName?: boolean, hideSystemPrompt?: boolean, hideTemperature?: boolean }
): string {
    const parsed = typeof parsedIdOrFullId === 'string' ? parseEffectiveModelId(parsedIdOrFullId) : parsedIdOrFullId;
    
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
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .replace('Gpt', 'GPT');
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
        const { baseId } = parseEffectiveModelId(modelId);
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
        return modelIds.filter(id => id === IDEAL_MODEL_ID || modelsByBaseName.has(parseEffectiveModelId(id).baseId));
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

            const current = parseEffectiveModelId(variant);
            const best = parseEffectiveModelId(bestVariant);

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