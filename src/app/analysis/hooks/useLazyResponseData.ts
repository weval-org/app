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
  // Track per-prompt loads to avoid repeated network requests
  const [promptLoads, setPromptLoads] = useState<Set<string>>(new Set()); // in-flight
  const [promptLoaded, setPromptLoaded] = useState<Set<string>>(new Set()); // completed

  // Shared cache for detailed evaluation objects keyed by `${promptId}:${modelId}`
  const [evaluationCache, setEvaluationCache] = useState<Map<string, any>>(new Map());
  const [evaluationLoading, setEvaluationLoading] = useState<Set<string>>(new Set());
  const [evalPromptLoads, setEvalPromptLoads] = useState<Set<string>>(new Set());
  const [evalPromptLoaded, setEvalPromptLoaded] = useState<Set<string>>(new Set());

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
    // Already finished?
    if (promptLoaded.has(promptId)) {
      const snapshot: Record<string, string> = {};
      responseCache.forEach((v, k) => {
        if (k.startsWith(`${promptId}:`)) {
          snapshot[k.substring(promptId.length + 1)] = v;
        }
      });
      return Object.keys(snapshot).length ? snapshot : null;
    }
    // Already in-flight?
    if (promptLoads.has(promptId)) return null;
    setPromptLoads(prev => new Set([...prev, promptId]));
    try {
      const resp = await fetch(`${baseUrl}/prompt-responses/${encodeURIComponent(promptId)}`);
      if (!resp.ok) {
        console.error(`Failed to fetch prompt responses for ${promptId}:`, resp.statusText);
        return null;
      }
      const data: PromptResponses = await resp.json();
      setResponseCache(prev => {
        const next = new Map(prev);
        for (const modelId in data.responses) {
          next.set(`${promptId}:${modelId}`, data.responses[modelId]);
        }
        return next;
      });
      setPromptLoaded(prev => new Set([...prev, promptId]));
      return data.responses;
    } catch (err) {
      console.error(`Error fetching prompt responses for ${promptId}:`, err);
      return null;
    } finally {
      setPromptLoads(prev => {
        const next = new Set(prev);
        next.delete(promptId);
        return next;
      });
    }
  }, [baseUrl, promptLoaded, promptLoads, responseCache]);

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
      const result = data.evaluationResult;
      if (result) {
        const cacheKey = `${promptId}:${modelId}`;
        setEvaluationCache(prev => new Map(prev).set(cacheKey, result));
      }
      return result;

    } catch (error) {
      console.error(`Error fetching evaluation details for ${promptId}/${modelId}:`, error);
      return null;
    }
  }, [baseUrl]);

  /**
   * Batch: Fetch evaluation details for ALL models for a given prompt
   */
  const fetchEvaluationDetailsBatchForPrompt = useCallback(async (promptId: string): Promise<Record<string, any> | null> => {
    // Return quickly if already loaded
    if (evalPromptLoaded.has(promptId)) return null;
    if (evalPromptLoads.has(promptId)) return null;
    const loadKey = `prompt:${promptId}`;
    setEvalPromptLoads(prev => new Set([...prev, promptId]));
    setEvaluationLoading(prev => new Set([...prev, loadKey]));
    try {
      const resp = await fetch(`${baseUrl}/evaluation-details-batch/${encodeURIComponent(promptId)}`);
      if (!resp.ok) {
        console.error('Failed to fetch batch evaluation details (prompt)', resp.statusText);
        return null;
      }
      const batchData = await resp.json();
      const evaluations = batchData.evaluations as Record<string, any> | undefined;
      if (evaluations) {
        setEvaluationCache(prev => {
          const next = new Map(prev);
          Object.entries(evaluations).forEach(([modelId, details]) => {
            next.set(`${promptId}:${modelId}`, details);
          });
          return next;
        });
        setEvalPromptLoaded(prev => new Set([...prev, promptId]));
        return evaluations;
      }
      return null;
    } catch (err) {
      console.error('Error fetching batch evaluation details (prompt)', err);
      return null;
    } finally {
      setEvalPromptLoads(prev => {
        const next = new Set(prev);
        next.delete(promptId);
        return next;
      });
      setEvaluationLoading(prev => {
        const next = new Set(prev);
        next.delete(loadKey);
        return next;
      });
    }
  }, [baseUrl, evalPromptLoaded, evalPromptLoads]);

  /**
   * Batch: Fetch evaluation details for ALL prompts for a given model
   */
  const fetchEvaluationDetailsBatchForModel = useCallback(async (modelId: string): Promise<Record<string, any> | null> => {
    const loadKey = `model:${modelId}`;
    if (evaluationLoading.has(loadKey)) return null;
    setEvaluationLoading(prev => new Set([...prev, loadKey]));
    try {
      const resp = await fetch(`${baseUrl}/evaluation-details-model-batch/${encodeURIComponent(modelId)}`);
      if (!resp.ok) {
        console.error('Failed to fetch batch evaluation details (model)', resp.statusText);
        return null;
      }
      const batchData = await resp.json();
      const evaluations = batchData.evaluations as Record<string, any> | undefined; // promptId -> details
      if (evaluations) {
        setEvaluationCache(prev => {
          const next = new Map(prev);
          Object.entries(evaluations).forEach(([promptId, details]) => {
            next.set(`${promptId}:${modelId}`, details);
          });
          return next;
        });
        return evaluations;
      }
      return null;
    } catch (err) {
      console.error('Error fetching batch evaluation details (model)', err);
      return null;
    } finally {
      setEvaluationLoading(prev => {
        const next = new Set(prev);
        next.delete(loadKey);
        return next;
      });
    }
  }, [baseUrl, evaluationLoading]);

  /** Get a cached detailed evaluation if available */
  const getCachedEvaluation = useCallback((promptId: string, modelId: string): any | null => {
    const cacheKey = `${promptId}:${modelId}`;
    return evaluationCache.get(cacheKey) || null;
  }, [evaluationCache]);

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
    fetchEvaluationDetailsBatchForPrompt,
    fetchEvaluationDetailsBatchForModel,
    getCachedResponse,
    getCachedEvaluation,
    isLoading,
    isLoadingEvaluation: (key: string) => evaluationLoading.has(key),
    cacheSize: responseCache.size
  };
}
