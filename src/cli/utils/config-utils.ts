import crypto from 'crypto';
import { PromptResponseData, ComparisonConfig, IDEAL_MODEL_ID } from '../types/comparison_v2';

export function getEffectiveModelId(baseModelString: string, systemPrompt: string | null | undefined): { effectiveId: string, hash: string | null } {
    if (!systemPrompt) {
        return { effectiveId: baseModelString, hash: null };
    }
    const hash = crypto.createHash('sha256').update(systemPrompt).digest('hex').substring(0, 8);
    return { effectiveId: `${baseModelString}[sys:${hash}]`, hash };
}

export function getUniqueModelIds(allResponsesMap: Map<string, PromptResponseData>, config: ComparisonConfig): string[] {
    const ids = new Set<string>();
    let hasIdeal = false;

    // Check if any prompt in the config has an ideal response
    if (config.prompts.some(p => p.idealResponse)) {
        hasIdeal = true;
    }

    allResponsesMap.forEach(promptData => {
        // This check is now redundant if we rely on the config, but kept for safety if existingResponsesMap is passed without full config context elsewhere
        if (promptData.idealResponseText) hasIdeal = true; 
        promptData.modelResponses.forEach((_, effectiveId) => ids.add(effectiveId));
    });

    if (hasIdeal) {
        ids.add(IDEAL_MODEL_ID);
    }
    return Array.from(ids).sort();
} 