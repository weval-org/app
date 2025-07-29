import { useState, useEffect } from 'react';
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
} from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import React from 'react'; // Added for React.useMemo

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

export const useComparisonDataV2 = ({ initialData, currentPromptId, disabled = false }: UseComparisonDataParams) => {
    console.log('[useComparisonDataV2] Hook execution starts.', { hasInitialData: !!initialData, currentPromptId, disabled });

    const data = disabled ? null : initialData;
    const loading = !initialData && !disabled;
    const error = null; // This hook doesn't fetch, so no error state from fetching

    const excludedModelsList = React.useMemo(() => {
        console.log('[useComparisonDataV2] useMemo: calculating excludedModelsList.');
        if (!data) return [];

        const excludedFromData = new Set(data.excludedModels || []);
        if (data.allFinalAssistantResponses && data.effectiveModels) {
            data.effectiveModels
                .filter((modelId) => modelId !== IDEAL_MODEL_ID)
                .forEach((modelId: string) => {
                    if (excludedFromData.has(modelId)) return;
                    if (data.allFinalAssistantResponses) {
                        for (const promptId in data.allFinalAssistantResponses) {
                            const responseText = data.allFinalAssistantResponses[promptId]?.[modelId];
                            if (responseText === undefined || responseText.trim() === '') {
                                excludedFromData.add(modelId);
                                break;
                            }
                        }
                    }
                });
        }
        return Array.from(excludedFromData);
    }, [data]);

    const promptNotFound = React.useMemo(() => {
        console.log('[useComparisonDataV2] useMemo: calculating promptNotFound.');
        if (!data || !currentPromptId) return false;
        return data.promptIds && !data.promptIds.includes(currentPromptId);
    }, [data, currentPromptId]);

    const selectedTemperatures = React.useMemo(() => {
        console.log('[useComparisonDataV2] useMemo: calculating selectedTemperatures.');
        return data?.config?.temperatures || [];
    }, [data]);
    
    // The new hook doesn't manage setSelectedTemperatures, so we return a dummy function.
    // This state is managed in AnalysisProvider directly.
    const setExcludedModelsList = () => {};
    const setSelectedTemperatures = () => {};

    console.log('[useComparisonDataV2] Hook returning.', { loading, error: !!error, promptNotFound, excludedModelsCount: excludedModelsList.length });
    return { data, loading, error, promptNotFound, excludedModelsList, setExcludedModelsList, selectedTemperatures, setSelectedTemperatures };
}; 