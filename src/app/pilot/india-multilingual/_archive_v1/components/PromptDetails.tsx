'use client';

import React, { useEffect, useState } from 'react';
import { ConversationMessage, CoverageResult } from '@/types/shared';
import { HumanLLMComparison } from './HumanLLMComparison';
import ResponseRenderer from '@/app/components/ResponseRenderer';

interface PromptDetailsProps {
  promptId: string;
  modelId: string;
  promptContext: string | ConversationMessage[];
  configId: string;
  runLabel: string;
  timestamp: string;
  // Optional: pass pre-loaded coverage data to avoid redundant fetch
  preloadedCoverage?: CoverageResult;
}

interface ModalData {
  response: string;
  history?: ConversationMessage[];
  systemPrompt?: string | null;
}

interface EvaluationData {
  promptId: string;
  modelId: string;
  evaluationResult: CoverageResult;
}

export function PromptDetails({
  promptId,
  modelId,
  promptContext,
  configId,
  runLabel,
  timestamp,
  preloadedCoverage,
}: PromptDetailsProps) {
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [evalData, setEvalData] = useState<EvaluationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Format model name for display
  const formatModelName = (id: string) => {
    const name = id.split('/').pop() || id;
    return name.replace(/\[temp:\d+\.?\d*\]/, '').trim();
  };

  // Extract prompt text from context
  const getPromptText = (): string => {
    if (typeof promptContext === 'string') {
      return promptContext;
    }
    if (Array.isArray(promptContext)) {
      const userMessage = promptContext.find((m) => m.role === 'user');
      return userMessage?.content || '';
    }
    return '';
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch modal data (response) and evaluation details in parallel
        const [modalRes, evalRes] = await Promise.all([
          fetch(
            `/api/comparison/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(timestamp)}/modal-data/${encodeURIComponent(promptId)}/${encodeURIComponent(modelId)}`
          ),
          preloadedCoverage
            ? Promise.resolve(null) // Skip if we have preloaded data
            : fetch(
                `/api/comparison/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(timestamp)}/evaluation-details/${encodeURIComponent(promptId)}/${encodeURIComponent(modelId)}`
              ),
        ]);

        if (!modalRes.ok) {
          throw new Error('Failed to load response data');
        }
        const modalJson = await modalRes.json();
        setModalData(modalJson);

        if (preloadedCoverage) {
          setEvalData({
            promptId,
            modelId,
            evaluationResult: preloadedCoverage,
          });
        } else if (evalRes && evalRes.ok) {
          const evalJson = await evalRes.json();
          setEvalData(evalJson);
        }
      } catch (err) {
        console.error('Failed to load prompt details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [promptId, modelId, configId, runLabel, timestamp, preloadedCoverage]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Loading details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-500 py-4">
        {error}
      </div>
    );
  }

  const coverage = evalData?.evaluationResult;
  const humanRatings = coverage?.humanRatings;
  const llmCriterionScores = coverage?.llmCriterionScores;

  return (
    <div className="space-y-4">
      {/* Prompt */}
      <div>
        <div className="text-xs text-muted-foreground uppercase font-medium mb-2">
          Prompt
        </div>
        <div className="text-sm bg-background/50 p-3 rounded-lg border border-border/50">
          <pre className="whitespace-pre-wrap font-sans">{getPromptText()}</pre>
        </div>
      </div>

      {/* Response */}
      <div>
        <div className="text-xs text-muted-foreground uppercase font-medium mb-2">
          Response ({formatModelName(modelId)})
        </div>
        <div className="text-sm bg-background/50 p-3 rounded-lg border border-border/50 max-h-64 overflow-y-auto">
          {modalData?.response ? (
            <ResponseRenderer content={modalData.response} renderAs="html" />
          ) : (
            <span className="text-muted-foreground">Response not available</span>
          )}
        </div>
      </div>

      {/* Human vs LLM Comparison */}
      {humanRatings && llmCriterionScores && (
        <div className="pt-2">
          <div className="text-xs text-muted-foreground uppercase font-medium mb-3">
            Score Comparison
          </div>
          <div className="bg-background/50 p-4 rounded-lg border border-border/50">
            <HumanLLMComparison
              humanRatings={humanRatings}
              llmCriterionScores={llmCriterionScores}
            />
          </div>
        </div>
      )}
    </div>
  );
}
