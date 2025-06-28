import { useMemo } from 'react';
import { parseEffectiveModelId, getCanonicalModels } from '@/app/utils/modelIdUtils';
import { ComparisonDataV2 } from '@/app/utils/types';

interface ModelFilteringOptions {
  data: ComparisonDataV2 | null;
  currentPromptId: string | null;
  forceIncludeExcludedModels: boolean;
  excludedModelsList: string[];
  activeSysPromptIndex: number;
  selectedTemperatures: number[];
}

export const useModelFiltering = ({
  data,
  currentPromptId,
  forceIncludeExcludedModels,
  excludedModelsList,
  activeSysPromptIndex,
  selectedTemperatures,
}: ModelFilteringOptions) => {
  const effectiveModels = data?.effectiveModels;
  const config = data?.config;

  const displayedModels = useMemo(() => {
    if (!effectiveModels) return [];
    if (!currentPromptId) {
      return effectiveModels;
    }
    if (forceIncludeExcludedModels) {
      return effectiveModels;
    }
    return (effectiveModels || []).filter((m: string) => !excludedModelsList.includes(m));
  }, [effectiveModels, excludedModelsList, forceIncludeExcludedModels, currentPromptId]);

  const modelsForMacroTable = useMemo(() => {
    if (!config) return [];
    
    let models = displayedModels;

    if (config.systems && config.systems.length > 1) {
      models = models.filter(modelId => {
        const { systemPromptIndex } = parseEffectiveModelId(modelId);
        return systemPromptIndex === activeSysPromptIndex;
      });
    }
    
    if (config.temperatures && config.temperatures.length > 0) {
      if (selectedTemperatures.length === 0) {
        return [];
      }
      models = models.filter(modelId => {
        const { temperature } = parseEffectiveModelId(modelId);
        const modelTemp = temperature ?? (config.temperature ?? 0.0);
        return selectedTemperatures.includes(modelTemp);
      });
    }

    return models;
  }, [displayedModels, activeSysPromptIndex, selectedTemperatures, config]);

  const modelsForAggregateView = useMemo(() => {
    if (!config) return [];
    const canonical = getCanonicalModels(displayedModels, config);
    console.log('[useModelFiltering] displayedModels:', displayedModels);
    console.log('[useModelFiltering] modelsForAggregateView:', canonical);
    return canonical;
  }, [config, displayedModels]);

  return {
    displayedModels,
    modelsForMacroTable,
    modelsForAggregateView,
  };
}; 