import { useState, useEffect } from 'react';
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
} from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

export interface UseComparisonDataParams {
    initialData: ImportedComparisonDataV2 | null;
    currentPromptId: string | null;
    disabled?: boolean;
}

export const useComparisonData = ({ initialData, currentPromptId, disabled = false }: UseComparisonDataParams) => {
    const [data, setData] = useState<ImportedComparisonDataV2 | null>(initialData);
    const [loading, setLoading] = useState(!initialData && !disabled); // Only loading if no initial data and not disabled
    const [error, setError] = useState<string | null>(null);
    const [promptNotFound, setPromptNotFound] = useState<boolean>(false);
    const [excludedModelsList, setExcludedModelsList] = useState<string[]>([]);
    const [selectedTemperatures, setSelectedTemperatures] = useState<number[]>([]);

    useEffect(() => {
        // Skip all data processing if disabled
        if (disabled) {
            setData(null);
            setLoading(false);
            setError(null);
            setPromptNotFound(false);
            setExcludedModelsList([]);
            setSelectedTemperatures([]);
            return;
        }

        // This effect now primarily reacts to data changes, not fetching.
        if (initialData) {
            setData(initialData);
            setLoading(false);

            // --- Begin: Logic for determining excluded models ---
            const excludedFromData = new Set(initialData.excludedModels || []);

            if (initialData.allFinalAssistantResponses && initialData.effectiveModels) {
                initialData.effectiveModels
                    .filter((modelId) => modelId !== IDEAL_MODEL_ID)
                    .forEach((modelId: string) => {
                        if (excludedFromData.has(modelId)) return;
                        if (initialData.allFinalAssistantResponses) {
                            for (const promptId in initialData.allFinalAssistantResponses) {
                                const responseText = initialData.allFinalAssistantResponses[promptId]?.[modelId];
                                if (responseText === undefined || responseText.trim() === '') {
                                    excludedFromData.add(modelId);
                                    break;
                                }
                            }
                        }
                    });
            }
            setExcludedModelsList(Array.from(excludedFromData));
            // --- End: Logic for determining excluded models ---
            
            if (currentPromptId && initialData.promptIds && !initialData.promptIds.includes(currentPromptId)) {
                setPromptNotFound(true);
            } else {
                setPromptNotFound(false);
            }

            if (initialData.config?.temperatures) {
                setSelectedTemperatures(initialData.config.temperatures);
            }
        }
    }, [initialData, currentPromptId, disabled]);

    return { data, loading, error, promptNotFound, excludedModelsList, setExcludedModelsList, selectedTemperatures, setSelectedTemperatures };
} 