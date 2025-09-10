import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// A type for the result data, to avoid 'any'
type Point = { text: string; score: number | null };
type ModelResult = { modelId: string; response: string; points: Point[] };
type PromptResult = { id: string; promptText: string; models: ModelResult[] };
type QuickRunResultData = { prompts: PromptResult[] };

interface QuickRunResultsProps {
  result: QuickRunResultData;
}

export function QuickRunResults({ result }: QuickRunResultsProps) {
  if (!result?.prompts?.length) {
    return null;
  }

  const defaultTab = result.prompts[0].id;

  return (
    <div className="text-left space-y-3 my-2">
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
            {result.prompts.map(prompt => (
                <TabsTrigger key={prompt.id} value={prompt.id} className="truncate flex-shrink-0">{prompt.promptText}</TabsTrigger>
            ))}
        </TabsList>
        {result.prompts.map(prompt => (
          <TabsContent key={prompt.id} value={prompt.id}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prompt</CardTitle>
                <p className="text-sm text-muted-foreground">{prompt.promptText}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {prompt.models.map((model, idx) => (
                  <Card key={idx}>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">{model.modelId}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap max-h-48 overflow-y-auto bg-muted/50 p-2 rounded">
                        {model.response || 'No response.'}
                      </p>
                      {Array.isArray(model.points) && model.points.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Rubric Scores</h4>
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
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
