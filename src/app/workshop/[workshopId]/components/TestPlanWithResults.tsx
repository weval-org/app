'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { CheckCircle, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

interface TestPlanWithResultsProps {
  outline: any;
  quickRunResult?: any | null;
}

export function TestPlanWithResults({ outline, quickRunResult }: TestPlanWithResultsProps) {
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

  if (!outline) {
    return (
      <div className="text-center py-8 px-4">
        <p className="text-sm text-muted-foreground">
         As you chat with the assistant, a test plan will be generated here.
        </p>
      </div>
    );
  }

  // Helper to get criterion status
  const getCriterionStatus = (avgScore: number) => {
    if (avgScore >= 0.8) return { icon: CheckCircle, text: 'Models did well', color: 'text-green-600' };
    if (avgScore >= 0.6) return { icon: TrendingUp, text: 'Most handled this', color: 'text-blue-600' };
    if (avgScore >= 0.4) return { icon: TrendingDown, text: 'Some struggled', color: 'text-yellow-600' };
    return { icon: AlertTriangle, text: 'Models struggled', color: 'text-orange-600' };
  };

  // Helper to render progress bar
  const renderProgressBar = (score: number) => {
    const percentage = Math.round(score * 100);
    const filledBlocks = Math.round((score * 100) / 7);
    const emptyBlocks = 14 - filledBlocks;

    return (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-primary">
          {'█'.repeat(Math.max(0, filledBlocks))}
        </span>
        <span className="text-muted-foreground/30">
          {'░'.repeat(Math.max(0, emptyBlocks))}
        </span>
        <span className="text-muted-foreground min-w-[3ch] text-right">
          {percentage}%
        </span>
      </div>
    );
  };

  // Parse results if available
  const resultsMap = new Map<string, any>();
  if (quickRunResult?.prompts) {
    quickRunResult.prompts.forEach((p: any) => {
      const promptId = p.id;
      const models = Array.isArray(quickRunResult.models) ? quickRunResult.models : Object.keys(p.modelResponses || {});

      // Calculate per-criterion scores
      const criteriaScores: any[] = [];
      const assessments = p.assessments || {};
      const points = p.points || [];

      points.forEach((pt: any, idx: number) => {
        const modelScores = models.map((modelId: string) => {
          const assessment = assessments[modelId]?.[idx];
          const score = assessment?.coverageExtent ?? 0;
          return { modelId, score };
        });

        const avgScore = modelScores.length > 0
          ? modelScores.reduce((sum, ms) => sum + ms.score, 0) / modelScores.length
          : 0;

        const bestModel = modelScores.reduce((best, current) =>
          current.score > best.score ? current : best
        , { modelId: '', score: 0 });

        criteriaScores.push({
          avgScore,
          bestModel,
        });
      });

      // Calculate winner
      const modelAverages = models.map((modelId: string) => {
        const score = p.scores?.[modelId] ?? 0;
        return { modelId, score };
      });

      const winner = modelAverages.reduce((best, current) =>
        current.score > best.score ? current : best
      , { modelId: '', score: 0 });

      resultsMap.set(promptId, {
        criteriaScores,
        winner,
        responses: p.modelResponses || {},
        models,
        scores: p.scores || {},
      });
    });
  }

  return (
    <div className="space-y-4">
      {outline.description && (
        <div className="p-3 rounded-lg bg-accent/30 border border-accent/40">
          <p className="text-sm font-medium text-foreground">
            <span className="text-muted-foreground">Focus:</span> {outline.description}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {(outline.prompts || []).slice(0, 8).map((p: any, idx: number) => {
          const promptId = p.id || `prompt_${idx}`;
          const results = resultsMap.get(promptId);
          const hasResults = !!results;

          return (
            <Card key={promptId} className="p-3 bg-background/50">
              <div className="font-semibold text-sm mb-2 text-primary">
                Question #{idx + 1}
              </div>
              <p className="font-medium text-sm text-foreground/90 mb-3">
                {p.promptText}
              </p>

              {Array.isArray(p.points) && p.points.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                    Key Criteria:
                  </h4>
                  <ul className="space-y-2">
                    {(Array.isArray(p.points[0]) ? p.points[0] : p.points).slice(0, 5).map((pt: any, criterionIdx: number) => {
                      const criterionText = typeof pt === 'string' ? pt : pt?.text || String(pt);
                      const criterionResult = results?.criteriaScores[criterionIdx];

                      return (
                        <li key={criterionIdx} className="text-sm">
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-muted-foreground">
                                {criterionText}
                              </div>
                              {criterionResult && (
                                <div className="mt-1.5 space-y-1">
                                  {renderProgressBar(criterionResult.avgScore)}
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground">
                                      Best: {getModelDisplayLabel(criterionResult.bestModel.modelId, {
                                        hideProvider: true,
                                        prettifyModelName: true,
                                        hideTemperature: true
                                      })}
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {Math.round(criterionResult.bestModel.score * 100)}%
                                    </Badge>
                                    {(() => {
                                      const status = getCriterionStatus(criterionResult.avgScore);
                                      const StatusIcon = status.icon;
                                      return (
                                        <span className={`flex items-center gap-1 ${status.color}`}>
                                          <StatusIcon className="h-3 w-3" />
                                          <span className="text-xs">{status.text}</span>
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Winner Banner */}
              {hasResults && results.winner.modelId && (
                <div className="mt-3 pt-3 border-t">
                  <div className="bg-accent/30 border border-accent rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🏆</span>
                        <div className="text-sm">
                          <span className="font-semibold">
                            {getModelDisplayLabel(results.winner.modelId, {
                              hideProvider: true,
                              prettifyModelName: true,
                              hideTemperature: true
                            })}
                          </span>
                          <span className="text-muted-foreground ml-2">
                            {Math.round(results.winner.score * 100)}%
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedPrompt(expandedPrompt === promptId ? null : promptId)}
                      >
                        {expandedPrompt === promptId ? 'Hide' : 'Show'} Responses
                      </Button>
                    </div>

                    {/* Expanded Responses */}
                    {expandedPrompt === promptId && (
                      <div className="mt-3 space-y-2 pt-3 border-t">
                        {results.models.map((modelId: string) => {
                          const response = results.responses[modelId] || 'No response';
                          const score = results.scores[modelId] ?? 0;
                          const isWinner = modelId === results.winner.modelId;

                          return (
                            <div
                              key={modelId}
                              className={`p-2 rounded border text-xs ${
                                isWinner
                                  ? 'bg-primary/5 border-primary/30'
                                  : 'bg-background'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-medium flex items-center gap-1">
                                  {isWinner && <span>🏆</span>}
                                  {getModelDisplayLabel(modelId, {
                                    hideProvider: true,
                                    prettifyModelName: true,
                                    hideTemperature: true
                                  })}
                                </div>
                                <Badge variant={isWinner ? 'default' : 'outline'} className="text-xs">
                                  {Math.round(score * 100)}%
                                </Badge>
                              </div>
                              <p className="text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                                {response}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
