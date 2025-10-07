import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useMemo } from 'react';
import Icon from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';

// Normalized types for UI rendering
type NormalizedPoint = { text: string; score: number | null; reflection?: string };
type NormalizedModel = { modelId: string; response: string; points: NormalizedPoint[]; overall?: number | null };
type NormalizedPrompt = { id: string; promptText: string; models: NormalizedModel[] };
type QuickRunResultData = { prompts: any[]; models?: string[] };

interface QuickRunResultsProps {
  result: QuickRunResultData;
}

const getScoreBadge = (score: number) => {
  if (score >= 80) return { label: 'Excellent', color: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' };
  if (score >= 60) return { label: 'Good', color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700' };
  if (score >= 40) return { label: 'Fair', color: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700' };
  return { label: 'Needs Work', color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700' };
};

const getPointIcon = (score: number | null) => {
  if (score === null) return null;
  if (score >= 80) return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />;
  if (score >= 50) return <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />;
  return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />;
};

export function QuickRunResults({ result }: QuickRunResultsProps) {
  const { prompts, winners, uniqueModels, overallBestModel } = useMemo(() => {
    if (!result?.prompts?.length) {
      return { 
        prompts: [] as NormalizedPrompt[], 
        winners: new Map<string, string>(),
        uniqueModels: [],
        overallBestModel: null
      };
    }

    const isCompactShape = (p: any) => 'modelResponses' in p || 'scores' in p || 'prompt' in p;
    const overallScores = new Map<string, number>(); // key: `${promptId}:${modelId}` percent 0-100

    const normalizePoints = (pts: any, assessments?: any[]): NormalizedPoint[] => {
      if (!Array.isArray(pts)) return [];
      return pts.map((pt: any, idx: number) => {
        let text = '';
        let score: number | null = null;
        let reflection: string | undefined = undefined;
        
        if (pt && typeof pt === 'object') {
          text = typeof pt.text === 'string' ? pt.text : String(pt);
          score = typeof pt.score === 'number' ? pt.score : null;
        } else {
          text = String(pt);
        }
        
        // Match assessment by index or text
        if (Array.isArray(assessments) && assessments[idx]) {
          const assessment = assessments[idx];
          if (typeof assessment.coverageExtent === 'number') {
            score = Math.round(assessment.coverageExtent * 100);
          }
          if (typeof assessment.reflection === 'string' && assessment.reflection.trim()) {
            reflection = assessment.reflection;
          }
        }
        
        return { text, score, reflection };
      });
    };

    const normalizedPrompts: NormalizedPrompt[] = result.prompts.map((p: any) => {
      if (isCompactShape(p)) {
        const id = p.id ?? '';
        const promptText = p.promptText ?? p.prompt ?? '';
        const modelIds: string[] = Array.isArray(result.models) && result.models.length
          ? result.models
          : Object.keys(p.modelResponses || {});
        const models: NormalizedModel[] = modelIds.map((modelId: string) => {
          const response = (p.modelResponses && p.modelResponses[modelId]) ?? '';
          const assessments = p.assessments && p.assessments[modelId] ? p.assessments[modelId] : undefined;
          const points: NormalizedPoint[] = normalizePoints(p.points, assessments);
          const rawScore = p.scores && typeof p.scores[modelId] === 'number' ? p.scores[modelId] : null;
          const overall = rawScore == null ? null : Math.max(0, Math.min(100, Math.round(rawScore * 100)));
          if (overall != null) overallScores.set(`${id}:${modelId}`, overall);
          return { modelId, response, points, overall };
        });
        return { id, promptText, models };
      }

      // Legacy/expected shape with models array present
      const id = p.id ?? '';
      const promptText = p.promptText ?? '';
      const models: NormalizedModel[] = Array.isArray(p.models) ? p.models.map((m: any) => ({
        modelId: m.modelId,
        response: m.response,
        points: normalizePoints(m.points),
      })) : [];
      return { id, promptText, models };
    });

    // Compute winners per prompt
    const winnersMap = new Map<string, string>();
    normalizedPrompts.forEach((prompt) => {
      let best = -1;
      let bestId = '';
      for (const model of prompt.models) {
        // Prefer overall score if available; otherwise average point scores
        const overall = overallScores.get(`${prompt.id}:${model.modelId}`);
        const avgFromPoints = model.points.length
          ? (model.points.reduce((acc, p) => acc + (p.score ?? 0), 0) / model.points.length)
          : 0;
        const candidate = overall != null ? overall : Math.round(avgFromPoints);
        if (candidate > best) {
          best = candidate;
          bestId = model.modelId;
        }
      }
      winnersMap.set(prompt.id, bestId);
    });

    // Compute unique models
    const modelsSet = new Set<string>();
    normalizedPrompts.forEach(p => p.models.forEach(m => modelsSet.add(m.modelId)));
    
    // Find overall best model (most wins)
    const winCounts = new Map<string, number>();
    winnersMap.forEach(winnerId => {
      winCounts.set(winnerId, (winCounts.get(winnerId) || 0) + 1);
    });
    let maxWins = 0;
    let bestOverall = '';
    winCounts.forEach((wins, modelId) => {
      if (wins > maxWins) {
        maxWins = wins;
        bestOverall = modelId;
      }
    });

    return { 
      prompts: normalizedPrompts, 
      winners: winnersMap,
      uniqueModels: Array.from(modelsSet),
      overallBestModel: bestOverall || null
    };
  }, [result]);

  if (!prompts.length) {
    return null;
  }

  return (
    <div className="text-left space-y-4">
      {/* Summary Banner */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border-2 border-primary/20">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="sparkles" className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-2">Your Test Is Complete!</h2>
            <p className="text-base text-muted-foreground mb-3">
              We tested <span className="font-semibold text-foreground">{prompts.length}</span> scenario{prompts.length !== 1 ? 's' : ''} across <span className="font-semibold text-foreground">{uniqueModels.length}</span> different AI model{uniqueModels.length !== 1 ? 's' : ''}.
              {overallBestModel && (
                <>
                  {' '}<span className="font-semibold text-primary">
                    {getModelDisplayLabel(overallBestModel, { 
                      prettifyModelName: true, 
                      hideTemperature: true,
                      hideProvider: true 
                    })}
                  </span> performed best overall.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {uniqueModels.map(modelId => (
                <span key={modelId} className="px-3 py-1.5 text-sm font-medium bg-background/60 border rounded-md">
                  {getModelDisplayLabel(modelId, { 
                    prettifyModelName: true, 
                    hideTemperature: true,
                    hideProvider: true 
                  })}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Detailed Results */}
      <div className="space-y-3">
        {prompts.map((prompt, idx) => {
          const winnerId = winners.get(prompt.id);
          const winner = prompt.models.find(m => m.modelId === winnerId);
          const winnerScore = typeof winner?.overall === 'number'
            ? `${winner.overall}%`
            : (winner && winner.points.length
                ? `${Math.round(winner.points.reduce((a, p) => a + (p.score ?? 0), 0) / winner.points.length)}%`
                : undefined);

          return (
            <Collapsible key={prompt.id} defaultOpen={idx === 0}>
              <Card>
                <CardHeader className="p-0">
                  <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-muted/50 rounded-md">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate" title={prompt.promptText}>{prompt.promptText}</div>
                      <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                        {winnerId ? (
                          <>
                            <span className="font-semibold">Top performer:</span>
                            <span className="tabular-nums">
                              {getModelDisplayLabel(winnerId, { 
                                prettifyModelName: true, 
                                hideTemperature: true,
                                hideProvider: true
                              })}
                              {winnerScore ? ` (${winnerScore})` : ''}
                            </span>
                          </>
                        ) : (
                          <span>No winner determined</span>
                        )}
                      </div>
                    </div>
                    <span className="ml-2 text-muted-foreground">▾</span>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    {prompt.models.map((model, idx2) => {
                      const isWinner = winnerId === model.modelId;
                      return (
                        <Card key={idx2} className={cn(isWinner && "border-2 border-yellow-400 bg-yellow-50/50 dark:bg-yellow-900/10")}> 
                          <CardHeader className="flex flex-row justify-between items-center">
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                              <span>
                                {getModelDisplayLabel(model.modelId, { 
                                  prettifyModelName: true, 
                                  hideTemperature: true,
                                  hideProvider: true 
                                })}
                              </span>
                              {typeof model.overall === 'number' && (
                                <span className={cn(
                                  "px-2 py-0.5 rounded-full text-xs font-semibold border",
                                  getScoreBadge(model.overall).color
                                )}>
                                  {getScoreBadge(model.overall).label} · {model.overall}%
                                </span>
                              )}
                            </CardTitle>
                            {isWinner && (
                              <div className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400 text-sm font-semibold">
                                <Icon name="trophy" className="w-5 h-5" />
                                <span>Top Performer</span>
                              </div>
                            )}
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm whitespace-pre-wrap max-h-48 overflow-y-auto bg-muted/50 p-2 rounded">
                              {model.response || 'No response.'}
                            </p>
                            {Array.isArray(model.points) && model.points.some(p => p.score !== null) && (
                              <div className="mt-4">
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">What we looked for:</h4>
                                <ul className="space-y-4">
                                  {model.points.map((point, pIdx) => (
                                    <li key={pIdx} className="border-l-2 border-muted pl-3">
                                      <div className="flex items-start gap-2 mb-1.5">
                                        {getPointIcon(point.score)}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between gap-4 mb-1">
                                            <span className="text-sm font-medium">{point.text}</span>
                                            <span className="text-sm font-bold tabular-nums flex-shrink-0">
                                              {point.score === null ? 'N/A' : `${point.score}%`}
                                            </span>
                                          </div>
                                          <Progress value={point.score ?? 0} className="h-2 mb-2" />
                                          {point.reflection && (
                                            <div className="text-xs text-muted-foreground italic mt-1.5 pl-1 border-l-2 border-muted/50">
                                              <span className="font-semibold not-italic">Judge's reasoning: </span>
                                              {point.reflection}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
