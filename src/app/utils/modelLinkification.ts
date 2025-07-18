import { getModelDisplayLabel, getCanonicalModels, parseEffectiveModelId } from './modelIdUtils';
import { WevalConfig as ConfigData } from '@/types/shared';

/**
 * Replaces mentions of model names in a block of text with markdown links
 * that can be used to trigger actions in the UI.
 * @param text The text to process.
 * @param effectiveModels The list of all model IDs in the evaluation.
 * @param config The blueprint configuration, used to determine canonical models.
 * @returns Text with model names converted to markdown links.
 */
export function addLinksToModelNames(
  text: string,
  effectiveModels: string[],
  config: ConfigData | null,
): string {
  if (!text || !effectiveModels || effectiveModels.length === 0) {
    return text;
  }
  console.log('[modelLinkification] Running addLinksToModelNames...');

  const nameToIdMap = new Map<string, string>();
  const allDisplayNames: string[] = [];

  const canonicalModelIds = getCanonicalModels(effectiveModels, config);
  const baseToCanonicalMap = new Map<string, string>();
  for (const canonicalId of canonicalModelIds) {
    const parsedId = parseEffectiveModelId(canonicalId);
    const baseLabel = getModelDisplayLabel(parsedId, { hideProvider: true, hideSystemPrompt: true, hideTemperature: true });
    if (!baseToCanonicalMap.has(baseLabel)) {
      baseToCanonicalMap.set(baseLabel, canonicalId);
    }
  }

  for (const modelId of effectiveModels) {
    if (modelId.includes('ideal')) continue;
    
    const parsedId = parseEffectiveModelId(modelId);
    
    const baseLabel = getModelDisplayLabel(parsedId, { 
        hideProvider: true, 
        hideSystemPrompt: true, 
        hideTemperature: true 
    });

    const canonicalIdForBase = baseToCanonicalMap.get(baseLabel) || modelId;
    const namesForThisModel = new Set<string>();

    namesForThisModel.add(baseLabel);

    const slashIndex = baseLabel.indexOf('/');
    if (slashIndex !== -1) {
        namesForThisModel.add(baseLabel.substring(slashIndex + 1));
    }
    
    const textNames = [...namesForThisModel];
    for(const name of textNames) {
        // Break down the name into parts (e.g., "gemini-2.5-pro" -> ["gemini", "2.5", "pro"])
        const parts = name.split(/[- ]/);
        if (parts.length > 1) {
            // Generate all combinations of joining parts with spaces or hyphens
            for (let i = 0; i < (1 << (parts.length - 1)); i++) {
                let combination = parts[0];
                for (let j = 0; j < parts.length - 1; j++) {
                    combination += (i & (1 << j)) ? ' ' : '-';
                    combination += parts[j + 1];
                }
                namesForThisModel.add(combination);
                namesForThisModel.add(combination.charAt(0).toUpperCase() + combination.slice(1));
                namesForThisModel.add(combination.split(/[- ]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '));
                namesForThisModel.add(combination.split(/[- ]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-'));
            }
        }
        namesForThisModel.add(
            name.charAt(0).toUpperCase() + name.slice(1)
        );
    }
    
    for (const name of namesForThisModel) {
        if (name && !nameToIdMap.has(name)) {
            nameToIdMap.set(name, canonicalIdForBase);
            allDisplayNames.push(name);
        }
    }
    
    const fullLabelWithSuffix = getModelDisplayLabel(parsedId, { hideProvider: true });
    if (fullLabelWithSuffix !== baseLabel) {
        if (fullLabelWithSuffix && !nameToIdMap.has(fullLabelWithSuffix)) {
            nameToIdMap.set(fullLabelWithSuffix, modelId);
            allDisplayNames.push(fullLabelWithSuffix);
        }
    }
  }

  const uniqueNames = [...new Set(allDisplayNames)];
  uniqueNames.sort((a, b) => b.length - a.length);

  if (uniqueNames.length === 0) {
    return text;
  }

  console.log(`[modelLinkification] Found ${uniqueNames.length} unique model display names to search for.`);

  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const modelPattern = uniqueNames.map(escapeRegex).join('|');
  
  const regex = new RegExp(
    `(?<!\\[|#model-perf:|\\w)(${modelPattern})(?!\\w|-)`, 'gi'
  );

  let matchCount = 0;
  const linkedText = text.replace(regex, (match) => {
    const matchedKey = uniqueNames.find(name => name.toLowerCase() === match.toLowerCase());
    const modelId = matchedKey ? nameToIdMap.get(matchedKey) : null;
    
    if (modelId) {
      matchCount++;
      return `[${match}](#model-perf:${modelId})`;
    }
    return match;
  });

  if (matchCount > 0) {
    console.log(`[modelLinkification] Replaced ${matchCount} model name occurrences in the text.`);
  }

  return linkedText;
} 