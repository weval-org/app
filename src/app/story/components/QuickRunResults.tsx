import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useMemo } from 'react';
import Icon from '@/components/ui/icon';
import { cn } from '@/lib/utils';

// Normalized types for UI rendering
type NormalizedPoint = { text: string; score: number | null };
type NormalizedModel = { modelId: string; response: string; points: NormalizedPoint[]; overall?: number | null };
type NormalizedPrompt = { id: string; promptText: string; models: NormalizedModel[] };
type QuickRunResultData = { prompts: any[]; models?: string[] };

interface QuickRunResultsProps {
  result: QuickRunResultData;
}

export function QuickRunResults({ result }: QuickRunResultsProps) {
  const { prompts, winners } = useMemo(() => {
    if (!result?.prompts?.length) {
      return { prompts: [] as NormalizedPrompt[], winners: new Map<string, string>() };
    }

    const isCompactShape = (p: any) => 'modelResponses' in p || 'scores' in p || 'prompt' in p;
    const overallScores = new Map<string, number>(); // key: `${promptId}:${modelId}` percent 0-100

    const normalizePoints = (pts: any): NormalizedPoint[] => {
      if (!Array.isArray(pts)) return [];
      return pts.map((pt: any) => {
        if (pt && typeof pt === 'object') {
          const text = typeof pt.text === 'string' ? pt.text : String(pt);
          const score = typeof pt.score === 'number' ? pt.score : null;
          return { text, score };
        }
        return { text: String(pt), score: null };
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
          const points: NormalizedPoint[] = normalizePoints(p.points);
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

    return { prompts: normalizedPrompts, winners: winnersMap };
  }, [result]);

  if (!prompts.length) {
    return null;
  }

  return (
    <div className="text-left space-y-3 my-2">
      <div className="space-y-2">
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
                            <span className="tabular-nums">{winnerId}{winnerScore ? ` (${winnerScore})` : ''}</span>
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
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              <span>{model.modelId}</span>
                              {typeof model.overall === 'number' && (
                                <span className="text-xs font-semibold text-muted-foreground tabular-nums">{model.overall}%</span>
                              )}
                            </CardTitle>
                            {isWinner && (
                              <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 text-xs font-semibold">
                                <Icon name="trophy" className="w-4 h-4" />
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
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">What we looked for:</h4>
                                <ul className="space-y-3">
                                  {model.points.map((point, pIdx) => (
                                    <li key={pIdx}>
                                      <div className="flex items-center justify-between gap-4 mb-1">
                                          <span className="text-sm">{point.text}</span>
                                          <span className="text-sm font-bold tabular-nums flex-shrink-0">{point.score === null ? 'N/A' : `${point.score}%`}</span>
                                      </div>
                                      <Progress value={point.score ?? 0} />
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
