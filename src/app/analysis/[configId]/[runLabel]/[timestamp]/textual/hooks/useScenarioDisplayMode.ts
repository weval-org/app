import { useState, useEffect } from 'react';

export type ScenarioDisplayMode = 'detailed' | 'compact' | 'table' | 'engineer';

const STORAGE_KEY = 'textual-scenario-display-mode';

export function useScenarioDisplayMode() {
  const [mode, setMode] = useState<ScenarioDisplayMode>('detailed');

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (stored === 'detailed' || stored === 'compact' || stored === 'table' || stored === 'engineer')) {
      setMode(stored as ScenarioDisplayMode);
    }
  }, []);

  // Save to localStorage when changed
  const setModeAndPersist = (newMode: ScenarioDisplayMode) => {
    setMode(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  };

  return { mode, setMode: setModeAndPersist };
}
