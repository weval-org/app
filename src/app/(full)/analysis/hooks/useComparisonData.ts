import { useState, useEffect } from 'react';
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
} from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

interface UseComparisonDataParams {
    configId: string;
    runLabel: string;
    timestamp: string;
    currentPromptId: string | null;
}

export function useComparisonData({ configId, runLabel, timestamp, currentPromptId }: UseComparisonDataParams) {
    const [data, setData] = useState<ImportedComparisonDataV2 | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [promptNotFound, setPromptNotFound] = useState<boolean>(false);
    const [excludedModelsList, setExcludedModelsList] = useState<string[]>([]);

    useEffect(() => {
        if (!configId || !runLabel || !timestamp) {
            // If essential params are missing, don't attempt to fetch.
            // This can happen during initial render on the client.
            return;
        }

        const fetchData = async () => {
            try {
                setLoading(true);
                setPromptNotFound(false);
                setError(null);
                
                const response = await fetch(`/api/comparison/${configId}/${runLabel}/${timestamp}`);

                if (!response.ok) {
                    throw new Error(`Failed to fetch comparison data: ${response.statusText} for ${configId}/${runLabel}/${timestamp}`);
                }

                const result: ImportedComparisonDataV2 = await response.json();
                setData(result);

                // --- Begin: Logic for determining excluded models ---
                const excludedFromData = new Set(result.excludedModels || []);

                if (result.allFinalAssistantResponses && result.effectiveModels) {
                    result.effectiveModels
                        .filter((modelId) => modelId !== IDEAL_MODEL_ID)
                        .forEach((modelId: string) => {
                            if (excludedFromData.has(modelId)) return;
                            if (result.allFinalAssistantResponses) {
                                for (const promptId in result.allFinalAssistantResponses) {
                                    const responseText = result.allFinalAssistantResponses[promptId]?.[modelId];
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
                
                if (currentPromptId && result.promptIds && !result.promptIds.includes(currentPromptId)) {
                    setPromptNotFound(true);
                }

            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred');
                console.error(`Error fetching comparison data for ${configId}/${runLabel}/${timestamp}:`, err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [configId, runLabel, timestamp, currentPromptId]);

    return { data, loading, error, promptNotFound, excludedModelsList, setExcludedModelsList };
} 