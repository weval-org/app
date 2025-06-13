export interface ParsedModelId {
  baseId: string; // e.g., "openai:gpt-4o-mini"
  displayName: string; // Base ID + system prompt hash if present
  systemPromptHash?: string; // e.g., "[sys:1a2b3c]"
  temperature?: number; // e.g., 0.7
  fullId: string; // The original effectiveModelId
}

export const IDEAL_MODEL_ID_BASE = 'IDEAL_MODEL_ID'; // Assuming this might be used or relevant

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

  // Regex to capture [temp:value] at the end of the string
  const tempRegex = /\[temp:(\d+(?:\.\d+)?)\]$/;
  const tempMatch = remainingId.match(tempRegex);
  if (tempMatch) {
    temperature = parseFloat(tempMatch[1]);
    remainingId = remainingId.replace(tempRegex, '');
  }

  // Regex to capture [sys:value] at the end of the (potentially shortened) string
  const sysRegex = /\[sys:([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)\]$/;
  const sysMatch = remainingId.match(sysRegex);
  if (sysMatch) {
    systemPromptHash = sysMatch[0]; // Store the full [sys:hash]
    remainingId = remainingId.replace(sysRegex, '');
  }
  
  // What remains is the true base model ID (e.g., openai:gpt-4o-mini)
  const baseId = remainingId;
  const displayName = systemPromptHash ? `${baseId}${systemPromptHash}` : baseId;

  return {
    baseId: baseId,
    displayName: displayName,
    systemPromptHash: systemPromptHash,
    temperature: temperature,
    fullId: effectiveModelId,
  };
}

// Helper function to format the display name for UI
export function getModelDisplayLabel(
    parsedIdOrFullId: ParsedModelId | string,
    options?: { hideProvider?: boolean }
): string {
    const parsed = typeof parsedIdOrFullId === 'string' ? parseEffectiveModelId(parsedIdOrFullId) : parsedIdOrFullId;
    
    let baseDisplayName = parsed.baseId;
    if (options?.hideProvider) {
        const colonIndex = parsed.baseId.indexOf(':');
        if (colonIndex !== -1) {
            // Make sure we don't hide "provider" if baseId is something like "provider:some:model"
            // and we only want to hide up to the first colon.
            // Or if the baseId itself IS the provider (e.g. for a group name, though less likely here)
            // For "provider:model", this will effectively take "model"
            baseDisplayName = parsed.baseId.substring(colonIndex + 1);
        }
    }
    
    let label = baseDisplayName;

    const suffixes = [];
    if (parsed.systemPromptHash) {
        suffixes.push(parsed.systemPromptHash);
    }
    if (parsed.temperature !== undefined) {
        suffixes.push(`T:${parsed.temperature}`);
    }

    if (suffixes.length > 0) {
        label += ` (${suffixes.join(', ')})`;
    }

    return label;
} 