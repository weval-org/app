import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMemo } from 'react';
import Icon from '@/components/ui/icon';
import { cn } from '@/lib/utils';

// A type for the result data, to avoid 'any'
type Point = { text: string; score: number | null };
type ModelResult = { modelId: string; response: string; points: Point[] };
type PromptResult = { id: string; promptText: string; models: ModelResult[] };
type QuickRunResultData = { prompts: PromptResult[] };

interface QuickRunResultsProps {
  result: QuickRunResultData;
}

export function QuickRunResults({ result }: QuickRunResultsProps) {
  const { prompts, winners } = useMemo(() => {
    if (!result?.prompts?.length) {
      return { prompts: [], winners: new Map() };
    }

    const winnersMap = new Map<string, string>();
    result.prompts.forEach(prompt => {
      let bestScore = -1;
      let winnerId = '';
      prompt.models.forEach(model => {
        const avgScore = model.points.reduce((acc, p) => acc + (p.score ?? 0), 0) / (model.points.length || 1);
        if (avgScore > bestScore) {
          bestScore = avgScore;
          winnerId = model.modelId;
        }
      });
      winnersMap.set(prompt.id, winnerId);
    });

    return { prompts: result.prompts, winners: winnersMap };
  }, [result]);

  if (!prompts.length) {
    return null;
  }

  const defaultTab = prompts[0].id;

  return (
    <div className="text-left space-y-3 my-2">
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
            {prompts.map(prompt => (
                <TabsTrigger key={prompt.id} value={prompt.id} className="truncate flex-shrink-0">{prompt.promptText}</TabsTrigger>
            ))}
        </TabsList>
        {prompts.map(prompt => (
          <TabsContent key={prompt.id} value={prompt.id}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Question for the AI</CardTitle>
                <p className="text-sm text-muted-foreground">{prompt.promptText}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {prompt.models.map((model, idx) => {
                  const isWinner = winners.get(prompt.id) === model.modelId;
                  return (
                    <Card key={idx} className={cn(isWinner && "border-2 border-yellow-400 bg-yellow-50/50 dark:bg-yellow-900/10")}>
                      <CardHeader className="flex flex-row justify-between items-center">
                        <CardTitle className="text-sm font-medium">{model.modelId}</CardTitle>
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
                        {Array.isArray(model.points) && model.points.length > 0 && (
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
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
