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

  const nameToIdMap = new Map<string, string>();
  const allDisplayNames: string[] = [];

  const canonicalModelIds = getCanonicalModels(effectiveModels, config);
  const baseToCanonicalMap = new Map<string, string>();
  for (const canonicalId of canonicalModelIds) {
    const parsedId = parseEffectiveModelId(canonicalId);
    if (!baseToCanonicalMap.has(parsedId.baseId)) {
      baseToCanonicalMap.set(parsedId.baseId, canonicalId);
    }
  }

  for (const modelId of effectiveModels) {
    if (modelId.includes('ideal')) continue;
    
    const parsedId = parseEffectiveModelId(modelId);
    const canonicalId = baseToCanonicalMap.get(parsedId.baseId) || modelId;

    const namesToGenerate = new Set<string>();

    // 1. Add all exact, known-good identifiers
    namesToGenerate.add(modelId); // Full ID, e.g., "openai/gpt-4o-mini[sp_idx:1]"
    namesToGenerate.add(parsedId.baseId); // Base ID, e.g., "openai/gpt-4o-mini"

    // Add all possible display labels
    const displayLabels = [
        getModelDisplayLabel(parsedId),
        getModelDisplayLabel(parsedId, { hideProvider: true }),
        getModelDisplayLabel(parsedId, { hideModelMaker: true }),
        getModelDisplayLabel(parsedId, { hideProvider: true, hideModelMaker: true }),
    ];
    displayLabels.forEach(label => namesToGenerate.add(label));

    // 2. Isolate the "pure" model name for generating fuzzy variations,
    //    and add the model path as a searchable term.
    let modelPath = parsedId.baseId;
    let pureModelName = parsedId.baseId;
    
    const colonIndex = pureModelName.indexOf(':');
    if (colonIndex > -1) {
        modelPath = pureModelName.substring(colonIndex + 1);
        namesToGenerate.add(modelPath); // Add "openai/gpt-4o-mini"
        pureModelName = modelPath;
    }
    
    const slashIndex = pureModelName.indexOf('/');
    if (slashIndex > -1) {
        pureModelName = pureModelName.substring(slashIndex + 1);
    }
    
    // 3. Generate fuzzy variations ONLY from the pure name.
    if (pureModelName && !pureModelName.includes(':') && !pureModelName.includes('/')) {
        namesToGenerate.add(pureModelName);
        const parts = pureModelName.split(/[- ]/);
        if (parts.length > 1) {
            // Generate all combinations of joining parts with spaces or hyphens
            for (let i = 0; i < (1 << (parts.length - 1)); i++) {
                let combination = parts[0];
                for (let j = 0; j < parts.length - 1; j++) {
                    combination += (i & (1 << j)) ? ' ' : '-';
                    combination += parts[j + 1];
                }
                namesToGenerate.add(combination);
                namesToGenerate.add(combination.charAt(0).toUpperCase() + combination.slice(1));
                namesToGenerate.add(combination.split(/[- ]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '));
                namesToGenerate.add(combination.split(/[- ]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-'));
            }
        }
        namesToGenerate.add(
            pureModelName.charAt(0).toUpperCase() + pureModelName.slice(1)
        );
    }
    
    // 4. Add all generated names to the main map.
    for (const name of namesToGenerate) {
        if (name && !nameToIdMap.has(name)) {
            nameToIdMap.set(name, canonicalId);
            allDisplayNames.push(name);
        }
    }
  }

  const uniqueNames = [...new Set(allDisplayNames)];
  uniqueNames.sort((a, b) => b.length - a.length);

  if (uniqueNames.length === 0) {
    return text;
  }

  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const modelPattern = uniqueNames.map(escapeRegex).join('|');
  
  const regex = new RegExp(
    "(`([^`]+?)`)|" + // Match and capture inline code blocks and their content
    `(?<!\\[|#model-perf:|\\w)(${modelPattern})(?!\\w|-)`, // Match model names
    'gi'
  );

  let matchCount = 0;
  const linkedText = text.replace(regex, (fullMatch, codeBlock, codeContent, modelMatch) => {
    // If a code block was matched (group 1 & 2)
    if (codeBlock) {
      // Check if the content of the code block is a known model name/ID
      const matchedKey = uniqueNames.find(name => name.toLowerCase() === codeContent.toLowerCase());
      const modelId = matchedKey ? nameToIdMap.get(matchedKey) : null;
      
      if (modelId) {
        matchCount++;
        // If it is, create a link from the content, discarding the backticks.
        return `[${codeContent}](#model-perf:${modelId})`;
      }
      // If not, return the code block unmodified
      return codeBlock;
    }

    // If a standalone model name was matched (group 3)
    if (modelMatch) {
      const matchedKey = uniqueNames.find(name => name.toLowerCase() === modelMatch.toLowerCase());
      const modelId = matchedKey ? nameToIdMap.get(matchedKey) : null;
      
      if (modelId) {
        matchCount++;
        return `[${modelMatch}](#model-perf:${modelId})`;
      }
    }
    
    // Fallback for safety
    return fullMatch;
  });

  return linkedText;
} 