'use client';

import React, { useState } from 'react';
import { LLMCoverageScores, CoverageResult, ConversationMessage } from '@/types/shared';
import { ChevronDown, ChevronRight, Sparkles, AlertTriangle, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import ResponseRenderer from '@/app/components/ResponseRenderer';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

interface ModelScores {
  trust?: number;
  fluency?: number;
  complexity?: number;
  code_switching?: number;
}

interface FeaturedCase {
  id: string;
  title: string;
  description: string;
  promptId: string;
  modelId: string;
  category: 'divergence' | 'trust-gap' | 'fluency-issue' | 'interesting';
  humanScores: ModelScores;
  llmScores: ModelScores;
  highlight: string;
  // For divergence cases: the other model to compare
  comparisonModelId?: string;
  comparisonHumanScores?: ModelScores;
  comparisonLlmScores?: ModelScores;
}

interface FeaturedCasesProps {
  llmCoverageScores: LLMCoverageScores;
  models: string[];
  configId: string;
  runLabel: string;
  timestamp: string;
  promptContexts: Record<string, string | ConversationMessage[]>;
}

// Extract prompt text from context
function getPromptText(context: string | ConversationMessage[] | undefined): string {
  if (!context) return '';
  if (typeof context === 'string') return context;
  if (Array.isArray(context)) {
    const userMessage = context.find((m) => m.role === 'user');
    return userMessage?.content || '';
  }
  return '';
}

// Helper to extract scores from coverage result
function extractScores(result: CoverageResult | null | undefined): {
  human: ModelScores;
  llm: ModelScores;
} {
  if (!result) return { human: {}, llm: {} };
  return {
    human: result.humanRatings || {},
    llm: result.llmCriterionScores || {},
  };
}

// Find interesting cases from the data
function findFeaturedCases(
  llmCoverageScores: LLMCoverageScores,
  models: string[]
): FeaturedCase[] {
  const cases: FeaturedCase[] = [];
  const promptIds = Object.keys(llmCoverageScores);

  // Track what we've found to ensure diversity
  const foundCategories = new Set<string>();

  for (const promptId of promptIds) {
    const promptData = llmCoverageScores[promptId];
    if (!promptData) continue;

    for (const modelId of models) {
      const result = promptData[modelId];
      if (!result) continue;

      const { human, llm } = extractScores(result);
      const reliability = result.humanRatings?.workerReliabilityTier;

      // Only consider high-reliability worker cases for most categories
      if (reliability !== 'high') continue;

      // Case 1: Zero fluency from reliable worker (LLM says it's fine)
      if (
        human.fluency === 0 &&
        llm.fluency !== undefined &&
        llm.fluency >= 0.75 &&
        !foundCategories.has('fluency-issue-1')
      ) {
        cases.push({
          id: `fluency-${promptId}-${modelId}`,
          title: 'Native Speaker Rates Response Unreadable',
          description: 'A reliable native speaker gave 0% fluency while LLM judges rated it highly.',
          promptId,
          modelId,
          category: 'fluency-issue',
          humanScores: human,
          llmScores: llm,
          highlight: `Human: ${(human.fluency * 100).toFixed(0)}% fluency vs LLM: ${(llm.fluency * 100).toFixed(0)}%`,
        });
        foundCategories.add('fluency-issue-1');
      }

      // Case 2: High fluency but zero trust
      if (
        human.fluency !== undefined &&
        human.fluency >= 0.75 &&
        human.trust === 0 &&
        !foundCategories.has('trust-gap-1')
      ) {
        cases.push({
          id: `trust-${promptId}-${modelId}`,
          title: 'Fluent but Untrustworthy',
          description: 'Response reads well but contains information the evaluator doesn\'t trust.',
          promptId,
          modelId,
          category: 'trust-gap',
          humanScores: human,
          llmScores: llm,
          highlight: `Fluency: ${(human.fluency * 100).toFixed(0)}% but Trust: ${(human.trust * 100).toFixed(0)}%`,
        });
        foundCategories.add('trust-gap-1');
      }

      // Case 3: Code-switching disagreement (LLM thinks it's bad, human thinks it's fine)
      if (
        human.code_switching !== undefined &&
        human.code_switching >= 0.75 &&
        llm.code_switching !== undefined &&
        llm.code_switching <= 0.25 &&
        !foundCategories.has('code-switching-1')
      ) {
        cases.push({
          id: `cs-${promptId}-${modelId}`,
          title: 'Code-Switching Accepted by Native Speaker',
          description: 'LLM judges penalized English mixing that the native speaker found natural.',
          promptId,
          modelId,
          category: 'interesting',
          humanScores: human,
          llmScores: llm,
          highlight: `Human: ${(human.code_switching * 100).toFixed(0)}% vs LLM: ${(llm.code_switching * 100).toFixed(0)}%`,
        });
        foundCategories.add('code-switching-1');
      }

      // Stop if we have enough non-divergence cases
      if (cases.length >= 3) break;
    }
    if (cases.length >= 3) break;
  }

  // Case 4: Model divergence - find where Opus and Sonnet differ dramatically
  // Both workers must be high-reliability for this to be meaningful
  if (models.length >= 2 && !foundCategories.has('divergence-1')) {
    for (const promptId of promptIds) {
      const promptData = llmCoverageScores[promptId];
      if (!promptData) continue;

      const results = models.map(m => ({ model: m, result: promptData[m] })).filter(r => r.result);
      if (results.length < 2) continue;

      const [first, second] = results;

      // Both workers must be high-reliability
      const firstReliability = first.result?.humanRatings?.workerReliabilityTier;
      const secondReliability = second.result?.humanRatings?.workerReliabilityTier;
      if (firstReliability !== 'high' || secondReliability !== 'high') continue;

      const firstScores = extractScores(first.result);
      const secondScores = extractScores(second.result);

      // Look for dramatic trust/fluency divergence
      if (
        firstScores.human.trust !== undefined &&
        secondScores.human.trust !== undefined &&
        Math.abs(firstScores.human.trust - secondScores.human.trust) >= 0.75
      ) {
        // Determine which is better/worse
        const betterFirst = firstScores.human.trust > secondScores.human.trust;
        const better = betterFirst ? first : second;
        const worse = betterFirst ? second : first;
        const betterScores = betterFirst ? firstScores : secondScores;
        const worseScores = betterFirst ? secondScores : firstScores;

        cases.push({
          id: `diverge-${promptId}`,
          title: 'Dramatic Model Divergence',
          description: 'Same prompt, vastly different human trust ratings between models.',
          promptId,
          // Primary model is the "worse" one (more interesting to examine)
          modelId: worse.model,
          category: 'divergence',
          humanScores: worseScores.human,
          llmScores: worseScores.llm,
          // Comparison model is the "better" one
          comparisonModelId: better.model,
          comparisonHumanScores: betterScores.human,
          comparisonLlmScores: betterScores.llm,
          highlight: `${formatModelShort(better.model)}: ${((betterScores.human.trust || 0) * 100).toFixed(0)}% trust vs ${formatModelShort(worse.model)}: ${((worseScores.human.trust || 0) * 100).toFixed(0)}%`,
        });
        foundCategories.add('divergence-1');
        break;
      }
    }
  }

  return cases.slice(0, 4);
}

function formatModelShort(modelId: string): string {
  const name = modelId.split('/').pop() || modelId;
  if (name.includes('opus')) return 'Opus';
  if (name.includes('sonnet')) return 'Sonnet';
  return name.replace(/\[temp:\d+\.?\d*\]/, '').trim().slice(0, 12);
}

function formatModelName(modelId: string): string {
  const name = modelId.split('/').pop() || modelId;
  return name.replace(/\[temp:\d+\.?\d*\]/, '').trim();
}

function CategoryIcon({ category }: { category: FeaturedCase['category'] }) {
  switch (category) {
    case 'divergence':
      return <Scale className="w-4 h-4" />;
    case 'trust-gap':
      return <AlertTriangle className="w-4 h-4" />;
    case 'fluency-issue':
      return <AlertTriangle className="w-4 h-4" />;
    default:
      return <Sparkles className="w-4 h-4" />;
  }
}

function categoryColor(category: FeaturedCase['category']): string {
  switch (category) {
    case 'divergence':
      return 'text-purple-500 bg-purple-500/10';
    case 'trust-gap':
      return 'text-amber-500 bg-amber-500/10';
    case 'fluency-issue':
      return 'text-red-500 bg-red-500/10';
    default:
      return 'text-blue-500 bg-blue-500/10';
  }
}

function ScoreCard({
  title,
  scores,
  llmScores,
  colorClass
}: {
  title: string;
  scores: ModelScores;
  llmScores?: ModelScores;
  colorClass: string;
}) {
  return (
    <div className={cn('p-3 rounded-lg', colorClass)}>
      <div className="text-xs font-medium mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {scores.trust !== undefined && (
          <div>
            <span className="text-muted-foreground">Trust:</span>{' '}
            <span className="font-mono">{(scores.trust * 100).toFixed(0)}%</span>
          </div>
        )}
        {scores.fluency !== undefined && (
          <div>
            <span className="text-muted-foreground">Fluency:</span>{' '}
            <span className="font-mono">{(scores.fluency * 100).toFixed(0)}%</span>
          </div>
        )}
        {scores.complexity !== undefined && (
          <div>
            <span className="text-muted-foreground">Complexity:</span>{' '}
            <span className="font-mono">{(scores.complexity * 100).toFixed(0)}%</span>
          </div>
        )}
        {scores.code_switching !== undefined && (
          <div>
            <span className="text-muted-foreground">Code-switch:</span>{' '}
            <span className="font-mono">{(scores.code_switching * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function FeaturedCases({
  llmCoverageScores,
  models,
  configId,
  runLabel,
  timestamp,
  promptContexts,
}: FeaturedCasesProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingResponses, setLoadingResponses] = useState<Set<string>>(new Set());
  const [loadedResponses, setLoadedResponses] = useState<Record<string, string>>({});

  const featuredCases = findFeaturedCases(llmCoverageScores, models);

  if (featuredCases.length === 0) {
    return null;
  }

  const fetchResponse = async (promptId: string, modelId: string) => {
    const key = `${promptId}_${modelId}`;
    if (loadedResponses[key] || loadingResponses.has(key)) return;

    setLoadingResponses(prev => new Set(prev).add(key));

    try {
      const response = await fetch(
        `/api/comparison/${encodeURIComponent(configId)}/${encodeURIComponent(runLabel)}/${encodeURIComponent(timestamp)}/modal-data/${encodeURIComponent(promptId)}/${encodeURIComponent(modelId)}`
      );

      if (response.ok) {
        const data = await response.json();
        setLoadedResponses((prev) => ({
          ...prev,
          [key]: data.response || 'Response not available',
        }));
      }
    } catch (error) {
      console.error('Failed to load response:', error);
    } finally {
      setLoadingResponses(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleExpand = async (caseItem: FeaturedCase) => {
    if (expandedId === caseItem.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(caseItem.id);

    // Fetch primary model response
    fetchResponse(caseItem.promptId, caseItem.modelId);

    // For divergence cases, also fetch the comparison model response
    if (caseItem.category === 'divergence' && caseItem.comparisonModelId) {
      fetchResponse(caseItem.promptId, caseItem.comparisonModelId);
    }
  };

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold flex items-center gap-3"
          style={headingStyles}
        >
          <Sparkles className="w-6 h-6 text-primary" />
          Featured Cases
        </h2>
        <p className="text-muted-foreground">
          Hand-picked examples that illustrate key patterns in human-LLM disagreement.
          Each case comes from a high-reliability worker.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {featuredCases.map((caseItem) => {
          const isExpanded = expandedId === caseItem.id;
          const primaryKey = `${caseItem.promptId}_${caseItem.modelId}`;
          const comparisonKey = caseItem.comparisonModelId
            ? `${caseItem.promptId}_${caseItem.comparisonModelId}`
            : null;

          const primaryResponse = loadedResponses[primaryKey];
          const comparisonResponse = comparisonKey ? loadedResponses[comparisonKey] : null;
          const isLoading = loadingResponses.has(primaryKey) || (comparisonKey && loadingResponses.has(comparisonKey));
          const isDivergence = caseItem.category === 'divergence';

          return (
            <div
              key={caseItem.id}
              className={cn(
                'border border-border rounded-lg overflow-hidden transition-all',
                isExpanded && 'md:col-span-2 border-primary/30'
              )}
            >
              <button
                onClick={() => handleExpand(caseItem)}
                className="w-full p-4 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-start gap-3">
                  <div className={cn('p-2 rounded-lg', categoryColor(caseItem.category))}>
                    <CategoryIcon category={caseItem.category} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{caseItem.title}</h3>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {caseItem.description}
                    </p>
                    <div className="mt-2 inline-block px-2 py-0.5 bg-muted/50 rounded text-xs font-mono">
                      {caseItem.highlight}
                    </div>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/20 space-y-4">
                  {/* Prompt */}
                  <div>
                    <div className="text-xs text-muted-foreground uppercase font-medium mb-2">
                      Question
                    </div>
                    <div className="text-sm bg-background/50 p-3 rounded-lg border border-border/50">
                      <pre className="whitespace-pre-wrap font-sans">{getPromptText(promptContexts[caseItem.promptId])}</pre>
                    </div>
                  </div>

                  {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Loading responses...
                    </div>
                  )}

                  {isDivergence && caseItem.comparisonModelId ? (
                    // Side-by-side comparison for divergence cases
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Better model (comparison) */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-sm font-medium">
                            {formatModelShort(caseItem.comparisonModelId)} (Trusted)
                          </span>
                        </div>
                        <ScoreCard
                          title="Human Ratings"
                          scores={caseItem.comparisonHumanScores || {}}
                          colorClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        />
                        {comparisonResponse && (
                          <div className="text-sm bg-background/50 p-3 rounded-lg border border-emerald-500/30 max-h-48 overflow-y-auto">
                            <ResponseRenderer content={comparisonResponse} renderAs="html" />
                          </div>
                        )}
                      </div>

                      {/* Worse model (primary) */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="text-sm font-medium">
                            {formatModelShort(caseItem.modelId)} (Not Trusted)
                          </span>
                        </div>
                        <ScoreCard
                          title="Human Ratings"
                          scores={caseItem.humanScores}
                          colorClass="bg-red-500/10 text-red-600 dark:text-red-400"
                        />
                        {primaryResponse && (
                          <div className="text-sm bg-background/50 p-3 rounded-lg border border-red-500/30 max-h-48 overflow-y-auto">
                            <ResponseRenderer content={primaryResponse} renderAs="html" />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Single model view for other cases
                    <>
                      {/* Score comparison */}
                      <div className="grid grid-cols-2 gap-4">
                        <ScoreCard
                          title="Human Ratings"
                          scores={caseItem.humanScores}
                          colorClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        />
                        <ScoreCard
                          title="LLM Ratings"
                          scores={caseItem.llmScores}
                          colorClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        />
                      </div>

                      {/* Response */}
                      {primaryResponse && (
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground uppercase font-medium">
                            Response ({formatModelShort(caseItem.modelId)})
                          </div>
                          <div className="text-sm bg-background/50 p-4 rounded-lg border border-border/50 max-h-64 overflow-y-auto">
                            <ResponseRenderer content={primaryResponse} renderAs="html" />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
