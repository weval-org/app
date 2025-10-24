'use client';

import { useState, useMemo, useLayoutEffect, startTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { createClientLogger } from '@/app/utils/clientLogger';

const debug = createClientLogger('useOptimisticNavigation');

interface UseOptimisticNavigationProps {
  models: string[];
}

interface OptimisticState {
  scenario: string | null;
  models: Set<string> | null;
  view: 'summary' | 'leaderboard' | null;
}

export function useOptimisticNavigation({ models }: UseOptimisticNavigationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Optimistic UI state - updates immediately before URL catches up
  // null = no optimistic update, Set (even if empty) = optimistic state active
  const [optimisticState, setOptimisticState] = useState<OptimisticState>({
    scenario: null,
    models: null,
    view: null,
  });

  // Derive URL state (single source of truth)
  const urlShowExecutiveSummary = searchParams.get('view') === 'summary';
  const urlShowLeaderboard = searchParams.get('view') === 'leaderboard';
  const urlSelectedScenario = (urlShowExecutiveSummary || urlShowLeaderboard) ? null : searchParams.get('scenario');
  const urlComparisonItems = useMemo(() => {
    const scenario = searchParams.get('scenario');
    const modelsParam = searchParams.get('models');
    if (scenario && modelsParam) {
      const modelIds = modelsParam.split(',').filter(Boolean);
      return modelIds.map(modelId => `${scenario}::${modelId}`);
    }
    return [];
  }, [searchParams]);

  // Effective state: merge optimistic state with URL state
  // If we have an optimistic view, use only that (don't OR with URL state to avoid double-active bug)
  const showExecutiveSummary = optimisticState.view !== null
    ? optimisticState.view === 'summary'
    : urlShowExecutiveSummary;
  const showLeaderboard = optimisticState.view !== null
    ? optimisticState.view === 'leaderboard'
    : urlShowLeaderboard;
  const selectedScenario = optimisticState.scenario || urlSelectedScenario;
  const comparisonItems = useMemo(() => {
    // If we have optimistic models (even if empty), use those
    if (optimisticState.models !== null && selectedScenario) {
      return Array.from(optimisticState.models).map(modelId => `${selectedScenario}::${modelId}`);
    }
    return urlComparisonItems;
  }, [optimisticState.models, selectedScenario, urlComparisonItems]);

  // Clear optimistic state once URL catches up
  // Use useLayoutEffect to clear synchronously before browser paint (prevents flicker)
  useLayoutEffect(() => {
    let shouldClear = false;

    // Check if view caught up
    if (optimisticState.view === 'summary' && urlShowExecutiveSummary) {
      shouldClear = true;
    }
    if (optimisticState.view === 'leaderboard' && urlShowLeaderboard) {
      shouldClear = true;
    }

    // Check if scenario caught up
    if (optimisticState.scenario && optimisticState.scenario === urlSelectedScenario) {
      shouldClear = true;
    }

    // Check if models caught up (including empty state)
    if (optimisticState.models !== null) {
      const optimisticModels = Array.from(optimisticState.models);
      const urlModels = urlComparisonItems.map(item => item.split('::')[1]);
      const allPresent = optimisticModels.every(m => urlModels.includes(m));
      const sameLeng = optimisticModels.length === urlModels.length;

      if (allPresent && sameLeng) {
        shouldClear = true;
      }
    }

    if (shouldClear) {
      debug.log('URL caught up - clearing optimistic state');
      setOptimisticState({ scenario: null, models: null, view: null });
    }
  }, [urlShowExecutiveSummary, urlShowLeaderboard, urlSelectedScenario, urlComparisonItems, optimisticState.view, optimisticState.scenario, optimisticState.models]);

  // Helper to build URL with params
  const buildUrl = (params: URLSearchParams) => {
    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  };

  // Select executive summary
  const selectExecutiveSummary = () => {
    debug.log('selectExecutiveSummary START', { timestamp: performance.now() });

    // Optimistic update (instant, high priority)
    setOptimisticState({ scenario: null, models: null, view: 'summary' });

    // URL update in background (low priority)
    startTransition(() => {
      const params = new URLSearchParams();
      params.set('view', 'summary');
      const newUrl = buildUrl(params);
      debug.log('selectExecutiveSummary - Calling router.replace', { newUrl, timestamp: performance.now() });
      router.replace(newUrl, { scroll: false });
      debug.log('selectExecutiveSummary Done', { timestamp: performance.now() });
    });
  };

  // Select leaderboard
  const selectLeaderboard = () => {
    debug.log('selectLeaderboard START', { timestamp: performance.now() });

    // Optimistic update (instant, high priority)
    setOptimisticState({ scenario: null, models: null, view: 'leaderboard' });

    // URL update in background (low priority)
    startTransition(() => {
      const params = new URLSearchParams();
      params.set('view', 'leaderboard');
      const newUrl = buildUrl(params);
      debug.log('selectLeaderboard - Calling router.replace', { newUrl, timestamp: performance.now() });
      router.replace(newUrl, { scroll: false });
      debug.log('selectLeaderboard Done', { timestamp: performance.now() });
    });
  };

  // Select a scenario (middle column shows its models)
  const selectScenario = (promptId: string) => {
    debug.log('selectScenario START', {
      promptId,
      currentSelectedScenario: selectedScenario,
      timestamp: performance.now()
    });

    // Optimistic update - clear models when switching scenarios (instant, high priority)
    setOptimisticState({ scenario: promptId, models: new Set([]), view: null });

    // URL update in background (low priority)
    startTransition(() => {
      const params = new URLSearchParams();
      params.set('scenario', promptId);
      const newUrl = buildUrl(params);
      debug.log('selectScenario - Calling router.replace', { newUrl, timestamp: performance.now() });
      router.replace(newUrl, { scroll: false });
      debug.log('selectScenario Done', { timestamp: performance.now() });
    });
  };

  // Toggle all variants of a base model in/out of comparison
  const toggleModel = (baseId: string) => {
    debug.log('toggleModel - Called with', {
      baseId,
      selectedScenario,
      timestamp: performance.now()
    });

    if (!selectedScenario) {
      debug.log('toggleModel ABORT - no selectedScenario', { timestamp: performance.now() });
      return;
    }

    debug.log('toggleModel START', { baseId, selectedScenario, timestamp: performance.now() });

    // Find all model variants that match this baseId
    const variantIds = models.filter(modelId => {
      const parsed = parseModelIdForDisplay(modelId);
      return parsed.baseId === baseId;
    });

    const newItemKeys = variantIds.map(modelId => `${selectedScenario}::${modelId}`);

    // Check if all variants are already in comparison
    const existingKeys = new Set(comparisonItems);
    const allVariantsPresent = newItemKeys.every(key => existingKeys.has(key));

    let newModelIds: string[];
    if (allVariantsPresent) {
      // Remove all variants (toggle off)
      const keysToRemove = new Set(newItemKeys);
      newModelIds = comparisonItems
        .filter(key => !keysToRemove.has(key))
        .map(key => key.split('::')[1]);
    } else {
      // Add missing variants (toggle on)
      const itemsToAdd = newItemKeys.filter(key => !existingKeys.has(key));
      newModelIds = [...comparisonItems, ...itemsToAdd].map(key => key.split('::')[1]);
    }

    // Optimistic update (instant, high priority)
    setOptimisticState(prev => ({
      ...prev,
      models: new Set(newModelIds),
      view: null,
    }));

    // URL update in background (low priority)
    startTransition(() => {
      debug.log('toggleModel - Building new URL', { timestamp: performance.now() });
      const params = new URLSearchParams();
      params.set('scenario', selectedScenario);
      if (newModelIds.length > 0) {
        params.set('models', newModelIds.join(','));
      }
      const newUrl = buildUrl(params);
      debug.log('toggleModel - Calling router.replace', { newUrl, timestamp: performance.now() });
      router.replace(newUrl, { scroll: false });
      debug.log('toggleModel Done', { timestamp: performance.now() });
    });
  };

  const removeFromComparison = (key: string) => {
    debug.log('removeFromComparison START', { key, timestamp: performance.now() });
    if (!selectedScenario) return;

    const newModelIds = comparisonItems
      .filter(k => k !== key)
      .map(k => k.split('::')[1]);

    // Optimistic update (instant, high priority)
    setOptimisticState(prev => ({
      ...prev,
      models: new Set(newModelIds),
      view: null,
    }));

    // URL update in background (low priority)
    startTransition(() => {
      const params = new URLSearchParams();
      params.set('scenario', selectedScenario);
      if (newModelIds.length > 0) {
        params.set('models', newModelIds.join(','));
      }
      const newUrl = buildUrl(params);
      debug.log('removeFromComparison - Calling router.replace', { newUrl, timestamp: performance.now() });
      router.replace(newUrl, { scroll: false });
    });
  };

  const clearAllComparisons = () => {
    debug.log('clearAllComparisons START', { timestamp: performance.now() });
    if (!selectedScenario) return;

    // Optimistic update (instant, high priority)
    setOptimisticState(prev => ({
      ...prev,
      models: new Set([]),
      view: null,
    }));

    // URL update in background (low priority)
    startTransition(() => {
      const params = new URLSearchParams();
      params.set('scenario', selectedScenario);
      const newUrl = buildUrl(params);
      debug.log('clearAllComparisons - Calling router.replace', { newUrl, timestamp: performance.now() });
      router.replace(newUrl, { scroll: false });
    });
  };

  return {
    // State
    showExecutiveSummary,
    showLeaderboard,
    selectedScenario,
    comparisonItems,
    // Functions
    selectExecutiveSummary,
    selectLeaderboard,
    selectScenario,
    toggleModel,
    removeFromComparison,
    clearAllComparisons,
  };
}
