'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';

/**
 * Hook for viewport-aware prefetching of prompt responses
 * Intelligently loads responses as they approach the viewport
 */
export function useResponsePrefetch(promptIds: string[]) {
  const { fetchPromptResponses, getCachedResponse } = useAnalysis();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [loadingPrompts, setLoadingPrompts] = useState<Set<string>>(new Set());
  const [loadedPrompts, setLoadedPrompts] = useState<Set<string>>(new Set());

  // Check if a prompt's responses are already cached
  const isPromptCached = useCallback((promptId: string): boolean => {
    if (!getCachedResponse) return false;
    // Check if at least one model response is cached (indicates full prompt fetch)
    const cached = getCachedResponse(promptId, promptIds[0] || '');
    return cached !== null;
  }, [getCachedResponse, promptIds]);

  // Prefetch a prompt's responses
  const prefetchPrompt = useCallback(async (promptId: string) => {
    // Don't fetch if already loading or loaded
    if (loadingPrompts.has(promptId) || loadedPrompts.has(promptId) || isPromptCached(promptId)) {
      return;
    }

    if (!fetchPromptResponses) {
      return;
    }

    setLoadingPrompts(prev => new Set(prev).add(promptId));

    try {
      const responses = await fetchPromptResponses(promptId);
      setLoadedPrompts(prev => new Set(prev).add(promptId));
    } catch (error) {
      console.error(`[ResponsePrefetch] Failed to prefetch ${promptId}:`, error);
    } finally {
      setLoadingPrompts(prev => {
        const newSet = new Set(prev);
        newSet.delete(promptId);
        return newSet;
      });
    }
  }, [fetchPromptResponses, loadingPrompts, loadedPrompts, isPromptCached]);

  // Create intersection observer
  useEffect(() => {
    if (!fetchPromptResponses) return;

    // Create observer with viewport margin (prefetch 1 viewport ahead)
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const promptId = entry.target.getAttribute('data-prompt-id');
            if (promptId) {
              prefetchPrompt(promptId);
            }
          }
        });
      },
      {
        rootMargin: '100% 0px', // Start loading when element is 1 viewport away
        threshold: 0.01,
      }
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [fetchPromptResponses, prefetchPrompt]);

  // Observe an element
  const observeElement = useCallback((element: HTMLElement | null) => {
    if (!element || !observerRef.current) return;
    observerRef.current.observe(element);
  }, []);

  // Unobserve an element
  const unobserveElement = useCallback((element: HTMLElement | null) => {
    if (!element || !observerRef.current) return;
    observerRef.current.unobserve(element);
  }, []);

  // Eager prefetch (for first scenario or manual trigger)
  const eagerPrefetch = useCallback(async (promptId: string) => {
    await prefetchPrompt(promptId);
  }, [prefetchPrompt]);

  return {
    observeElement,
    unobserveElement,
    eagerPrefetch,
    isLoading: (promptId: string) => loadingPrompts.has(promptId),
    isLoaded: (promptId: string) => loadedPrompts.has(promptId) || isPromptCached(promptId),
  };
}
