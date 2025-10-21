import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';

interface QuickRunSummaryProps {
  result: any;
  onViewDetails: () => void;
  onRerun?: () => void;
}

export function QuickRunSummary({ result, onViewDetails, onRerun }: QuickRunSummaryProps) {
  const { prompts, uniqueModels, overallBestModels } = React.useMemo(() => {
    if (!result?.prompts?.length) {
      return { prompts: [], uniqueModels: [], overallBestModels: null };
    }

    const isCompactShape = (p: any) => 'modelResponses' in p || 'scores' in p || 'prompt' in p;

    const normalizedPrompts = result.prompts.map((p: any) => {
      if (isCompactShape(p)) {
        const modelIds: string[] = Array.isArray(result.models) && result.models.length
          ? result.models
          : Object.keys(p.modelResponses || {});
        return { id: p.id, models: modelIds, scores: p.scores || {} };
      }
      return { id: p.id, models: (p.models || []).map((m: any) => m.modelId), scores: {} };
    });

    const modelsSet = new Set<string>();
    normalizedPrompts.forEach((p: any) => p.models.forEach((m: string) => modelsSet.add(m)));

    // Find overall best model(s) - most wins
    const winCounts = new Map<string, number>();
    normalizedPrompts.forEach((prompt: any) => {
      let best = -1;
      const bestIds: string[] = [];

      prompt.models.forEach((modelId: string) => {
        const score = prompt.scores[modelId];
        const scoreValue = typeof score === 'number' ? Math.round(score * 100) : 0;
        if (scoreValue > best) {
          best = scoreValue;
          bestIds.length = 0;
          bestIds.push(modelId);
        } else if (scoreValue === best && best > 0) {
          bestIds.push(modelId);
        }
      });

      bestIds.forEach(winnerId => {
        winCounts.set(winnerId, (winCounts.get(winnerId) || 0) + 1);
      });
    });

    let maxWins = 0;
    const bestOverallModels: string[] = [];
    winCounts.forEach((wins, modelId) => {
      if (wins > maxWins) {
        maxWins = wins;
        bestOverallModels.length = 0;
        bestOverallModels.push(modelId);
      } else if (wins === maxWins && maxWins > 0) {
        bestOverallModels.push(modelId);
      }
    });

    return {
      prompts: normalizedPrompts,
      uniqueModels: Array.from(modelsSet),
      overallBestModels: bestOverallModels.length > 0 ? bestOverallModels : null
    };
  }, [result]);

  if (!prompts.length) {
    return null;
  }

  const promptCount = prompts.length;
  const modelCount = uniqueModels.length;

  return (
    <Card className="p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/30 dark:to-blue-950/30 border-green-200 dark:border-green-800">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            Test Complete!
          </h3>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• {promptCount} scenario{promptCount !== 1 ? 's' : ''} tested</li>
            <li>• {modelCount} model{modelCount !== 1 ? 's' : ''} compared</li>
            {overallBestModels && overallBestModels.length === 1 && (
              <li className="font-medium text-foreground">
                • 🏆 <strong>{getModelDisplayLabel(overallBestModels[0], { prettifyModelName: true, hideTemperature: true, hideProvider: true })}</strong> performed best
              </li>
            )}
          </ul>
        </div>
        <div className="flex gap-2">
          {onRerun && (
            <Button size="sm" variant="outline" onClick={onRerun}>
              Re-run Test
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onViewDetails}>
            View Details
          </Button>
        </div>
      </div>
    </Card>
  );
}
