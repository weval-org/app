'use client';

import { useState, useCallback, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { ActiveBlueprint, RunResult, SandboxRunStatus } from './useWorkspace';

const RUN_HISTORY_KEY = 'sandboxV2_run_history';

export function useEvaluation(
  isLoggedIn: boolean,
  activeBlueprint: ActiveBlueprint | null
) {
  const { toast } = useToast();
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<SandboxRunStatus>({ status: 'idle' });
  const [runningBlueprintName, setRunningBlueprintName] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<RunResult[]>([]);

  useEffect(() => {
    try {
      const storedHistory = window.localStorage.getItem(RUN_HISTORY_KEY);
      if (storedHistory) {
        setRunHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.error("Failed to load run history from local storage", e);
    }
  }, []);

  useEffect(() => {
    const inProgressStatuses: SandboxRunStatus['status'][] = ['pending', 'generating_responses', 'evaluating', 'saving'];
    if (!runId || !inProgressStatuses.includes(runStatus.status)) return;

    const poll = async () => {
        try {
            const response = await fetch(`/api/sandbox/status/${runId}`);
            
            // Development debugging
            if (process.env.NODE_ENV === 'development') {
                console.log(`[useEvaluation] Polling status for runId: ${runId}`);
                console.log(`[useEvaluation] Response status: ${response.status}`);
            }
            
            if (response.ok) {
                const newStatus = await response.json();
                
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[useEvaluation] Status update:`, newStatus);
                }
                
                setRunStatus(newStatus);
            } else if (response.status !== 404 && response.status !== 202) {
                if (process.env.NODE_ENV === 'development') {
                    console.error(`[useEvaluation] Non-OK response: ${response.status}`);
                }
                 setRunStatus({ status: 'error', message: `Failed to get status (HTTP ${response.status}).` });
            }
        } catch (error: any) {
            if (process.env.NODE_ENV === 'development') {
                console.error(`[useEvaluation] Polling error for runId ${runId}:`, error);
            }
            console.error("Polling failed.", error);
             setRunStatus({ status: 'error', message: 'Polling failed.' });
        }
    };

    const intervalId = setInterval(poll, 3000);
    poll(); // Initial poll
    return () => clearInterval(intervalId);
  }, [runId, runStatus.status]);


  useEffect(() => {
    if (runStatus.status === 'complete' && runId) {
        const newResult: RunResult = {
            runId: runId,
            resultUrl: runStatus.resultUrl || `/sandbox/results/${runId}`,
            completedAt: new Date().toISOString(),
            blueprintName: runningBlueprintName || 'Unknown Blueprint',
        };

        setRunHistory(prev => {
            const updated = [newResult, ...prev.slice(0, 9)]; // Keep only last 10 results
            try {
                window.localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(updated));
            } catch (e) {
                console.error("Failed to save run history to local storage", e);
            }
            return updated;
        });
    }
  }, [runStatus.status, runId, runStatus.resultUrl, runningBlueprintName]);

  const runEvaluation = useCallback(async (models?: string[]) => {
    if (!activeBlueprint) {
        toast({ variant: 'destructive', title: 'No blueprint selected', description: 'Please select a blueprint to run an evaluation.'});
        return;
    }

    setRunningBlueprintName(activeBlueprint.name);
    setRunStatus({ status: 'pending', message: 'Initiating evaluation...' });
    setRunId(null);
    
    try {
        const response = await fetch('/api/sandbox/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                blueprintContent: activeBlueprint.content,
                isAdvanced: isLoggedIn,
                models: models,
            }),
        });

        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(responseData.error || 'Failed to start evaluation');
        }

        const { runId: newRunId } = responseData;
        setRunId(newRunId);
        setRunStatus({ status: 'pending', message: 'Evaluation started. This may take a few minutes...' });
        return newRunId;
    } catch (error: any) {
        setRunStatus({ status: 'error', message: error.message });
        toast({
            variant: 'destructive',
            title: 'Evaluation Failed',
            description: error.message,
        });
        return null;
    }
  }, [activeBlueprint, isLoggedIn, toast]);

  return {
    runId,
    runStatus,
    runHistory,
    runEvaluation,
    setRunStatus,
    setRunId,
  };
}