import { useState, useCallback } from 'react';

interface ResponseData {
  promptId: string;
  modelId: string;
  response: string;
}

interface ModelResponses {
  modelId: string;
  responses: Record<string, string>; // promptId -> response
}

interface PromptResponses {
  promptId: string;
  responses: Record<string, string>; // modelId -> response  
}

/**
 * Custom hook for lazy loading response data on demand.
 * Caches responses to avoid duplicate network requests.
 */
export function useLazyResponseData(configId: string, runLabel: string, timestamp: string) {
  const [responseCache, setResponseCache] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const baseUrl = `/api/comparison/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(timestamp)}`;

  /**
   * Fetches a single response for a specific prompt+model combination
   */
  const fetchModalResponse = useCallback(async (promptId: string, modelId: string): Promise<string | null> => {
    const cacheKey = `${promptId}:${modelId}`;
    
    // Return cached response if available
    if (responseCache.has(cacheKey)) {
      return responseCache.get(cacheKey)!;
    }

    // Prevent duplicate requests
    if (loading.has(cacheKey)) {
      return null;
    }

    setLoading(prev => new Set([...prev, cacheKey]));

    try {
      const response = await fetch(
        `${baseUrl}/modal-data/${encodeURIComponent(promptId)}/${encodeURIComponent(modelId)}`
      );

      if (!response.ok) {
        console.error(`Failed to fetch modal response for ${promptId}/${modelId}:`, response.statusText);
        return null;
      }

      const data: ResponseData = await response.json();
      
      // Cache the response
      setResponseCache(prev => new Map(prev).set(cacheKey, data.response));
      
      return data.response;

    } catch (error) {
      console.error(`Error fetching modal response for ${promptId}/${modelId}:`, error);
      return null;
    } finally {
      setLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(cacheKey);
        return newSet;
      });
    }
  }, [baseUrl, responseCache, loading]);

  /**
   * Fetches all responses for a specific model across all prompts
   */
  const fetchModelResponses = useCallback(async (modelId: string): Promise<Record<string, string> | null> => {
    const url = `${baseUrl}/model-responses/${encodeURIComponent(modelId)}`;
    console.log('🌐 useLazyResponseData: fetchModelResponses URL', { modelId, url });
    
    try {
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`Failed to fetch model responses for ${modelId}:`, response.statusText);
        return null;
      }

      const data: ModelResponses = await response.json();
      
      // Cache all responses for this model
      setResponseCache(prev => {
        const newCache = new Map(prev);
        for (const promptId in data.responses) {
          const cacheKey = `${promptId}:${modelId}`;
          newCache.set(cacheKey, data.responses[promptId]);
        }
        return newCache;
      });
      
      return data.responses;

    } catch (error) {
      console.error(`Error fetching model responses for ${modelId}:`, error);
      return null;
    }
  }, [baseUrl]);

  /**
   * Fetches all responses for a specific prompt across all models
   */
  const fetchPromptResponses = useCallback(async (promptId: string): Promise<Record<string, string> | null> => {
    try {
      const response = await fetch(
        `${baseUrl}/prompt-responses/${encodeURIComponent(promptId)}`
      );

      if (!response.ok) {
        console.error(`Failed to fetch prompt responses for ${promptId}:`, response.statusText);
        return null;
      }

      const data: PromptResponses = await response.json();
      
      // Cache all responses for this prompt
      setResponseCache(prev => {
        const newCache = new Map(prev);
        for (const modelId in data.responses) {
          const cacheKey = `${promptId}:${modelId}`;
          newCache.set(cacheKey, data.responses[modelId]);
        }
        return newCache;
      });
      
      return data.responses;

    } catch (error) {
      console.error(`Error fetching prompt responses for ${promptId}:`, error);
      return null;
    }
  }, [baseUrl]);

  /**
   * Fetches full evaluation details for a specific prompt+model combination.
   * This includes complete pointAssessments with keyPointText and individualJudgements.
   */
  const fetchEvaluationDetails = useCallback(async (promptId: string, modelId: string): Promise<any | null> => {
    try {
      const response = await fetch(
        `${baseUrl}/evaluation-details/${encodeURIComponent(promptId)}/${encodeURIComponent(modelId)}`
      );

      if (!response.ok) {
        console.error(`Failed to fetch evaluation details for ${promptId}/${modelId}:`, response.statusText);
        return null;
      }

      const data = await response.json();
      return data.evaluationResult;

    } catch (error) {
      console.error(`Error fetching evaluation details for ${promptId}/${modelId}:`, error);
      return null;
    }
  }, [baseUrl]);

  /**
   * Gets a cached response if available, otherwise returns null
   */
  const getCachedResponse = useCallback((promptId: string, modelId: string): string | null => {
    const cacheKey = `${promptId}:${modelId}`;
    return responseCache.get(cacheKey) || null;
  }, [responseCache]);

  /**
   * Checks if a response is currently being loaded
   */
  const isLoading = useCallback((promptId: string, modelId: string): boolean => {
    const cacheKey = `${promptId}:${modelId}`;
    return loading.has(cacheKey);
  }, [loading]);

  return {
    fetchModalResponse,
    fetchModelResponses,
    fetchPromptResponses,
    fetchEvaluationDetails,
    getCachedResponse,
    isLoading,
    cacheSize: responseCache.size
  };
}
