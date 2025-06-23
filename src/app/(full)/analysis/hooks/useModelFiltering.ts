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
  const displayedModels = useMemo(() => {
    if (!data?.effectiveModels) return [];
    if (!currentPromptId) {
      return data.effectiveModels;
    }
    if (forceIncludeExcludedModels) {
      return data.effectiveModels;
    }
    return (data.effectiveModels || []).filter((m: string) => !excludedModelsList.includes(m));
  }, [data?.effectiveModels, excludedModelsList, forceIncludeExcludedModels, currentPromptId]);

  const modelsForMacroTable = useMemo(() => {
    if (!data) return [];
    
    let models = displayedModels;

    if (data.config.systems && data.config.systems.length > 1) {
      models = models.filter(modelId => {
        const { systemPromptIndex } = parseEffectiveModelId(modelId);
        return systemPromptIndex === activeSysPromptIndex;
      });
    }

    if (selectedTemperatures.length > 0) {
      models = models.filter(modelId => {
        const { temperature } = parseEffectiveModelId(modelId);
        return temperature === undefined || selectedTemperatures.includes(temperature);
      });
    }

    return models;
  }, [displayedModels, activeSysPromptIndex, selectedTemperatures, data]);

  const modelsForAggregateView = useMemo(() => {
    if (!data) return [];
    return getCanonicalModels(data.effectiveModels, data.config);
  }, [data]);

  return {
    displayedModels,
    modelsForMacroTable,
    modelsForAggregateView,
  };
}; 