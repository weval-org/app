'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { useState } from 'react';
import { TrendingUp, TrendingDown, CheckCircle, AlertTriangle } from 'lucide-react';

interface WorkshopResultsViewProps {
  data: any;
  weval: any;
}

interface CriterionScore {
  criterionText: string;
  avgScore: number;
  bestModel: { id: string; score: number };
  modelScores: Array<{ modelId: string; score: number }>;
}

interface PromptResult {
  promptId: string;
  promptText: string;
  criteriaScores: CriterionScore[];
  winners: Array<{ modelId: string; score: number }>;
}

export function WorkshopResultsView({ data, weval }: WorkshopResultsViewProps) {
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [showResponsesFor, setShowResponsesFor] = useState<string | null>(null);

  // Extract data
  const blueprint = weval.blueprint;
  const prompts = blueprint.prompts || [];
  const effectiveModels = data.effectiveModels || [];
  const llmCoverageScores = data.evaluationResults?.llmCoverageScores || {};
  const allResponses = data.allFinalAssistantResponses || {};

  // Calculate results for each prompt
  const promptResults: PromptResult[] = prompts.map((prompt: any, idx: number) => {
    const promptId = prompt.id || `prompt_${idx}`;
    const promptScores = llmCoverageScores[promptId] || {};

    // Extract criteria (handle nested array structure)
    const criteria = Array.isArray(prompt.points)
      ? (Array.isArray(prompt.points[0]) ? prompt.points[0] : prompt.points)
      : [];

    // Calculate scores for each criterion
    const criteriaScores: CriterionScore[] = criteria.map((criterion: any, criterionIdx: number) => {
      const criterionText = typeof criterion === 'string' ? criterion : criterion?.text || String(criterion);

      // Get scores from all models for this criterion
      const modelScores = effectiveModels.map((modelId: string) => {
        const modelScore = promptScores[modelId];
        const criterionScore = modelScore?.pointAssessments?.[criterionIdx];
        const score = criterionScore?.coverageExtent ?? 0;
        return { modelId, score };
      }).filter((ms: any) => ms.score !== undefined);

      // Calculate average and find best
      const avgScore = modelScores.length > 0
        ? modelScores.reduce((sum: number, ms: any) => sum + ms.score, 0) / modelScores.length
        : 0;

      const bestModel = modelScores.reduce((best: any, current: any) =>
        current.score > best.score ? current : best
      , { id: modelScores[0]?.modelId || '', score: 0 });

      return {
        criterionText,
        avgScore,
        bestModel: { id: bestModel.modelId || bestModel.id, score: bestModel.score },
        modelScores,
      };
    });

    // Calculate overall winners for this prompt (handle ties)
    const modelAverages = effectiveModels.map((modelId: string) => {
      const modelScore = promptScores[modelId];
      const score = modelScore?.avgCoverageExtent ?? 0;
      return { modelId, score };
    });

    // Find the best score
    const bestScore = Math.max(...modelAverages.map((m: { modelId: string; score: number }) => m.score));

    // Get all models with the best score (winners)
    const winners = modelAverages.filter((m: { modelId: string; score: number }) => m.score === bestScore);

    return {
      promptId,
      promptText: prompt.promptText || prompt.text || '',
      criteriaScores,
      winners,
    };
  });

  // Calculate overall model performance across all prompts
  const overallModelPerformance = effectiveModels.map((modelId: string) => {
    const scores = prompts.map((prompt: any, idx: number) => {
      const promptId = prompt.id || `prompt_${idx}`;
      const modelScore = llmCoverageScores[promptId]?.[modelId];
      return modelScore?.avgCoverageExtent ?? 0;
    });
    const avgScore = scores.length > 0
      ? scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length
      : 0;
    return { modelId, avgScore };
  }).sort((a: { modelId: string; avgScore: number }, b: { modelId: string; avgScore: number }) => b.avgScore - a.avgScore);

  // Helper to render criterion status badge
  const getCriterionStatus = (avgScore: number) => {
    if (avgScore >= 0.8) return { icon: CheckCircle, text: 'All models did well', color: 'text-green-600' };
    if (avgScore >= 0.6) return { icon: TrendingUp, text: 'Most models handled this', color: 'text-blue-600' };
    if (avgScore >= 0.4) return { icon: TrendingDown, text: 'Some models struggled', color: 'text-yellow-600' };
    return { icon: AlertTriangle, text: 'Most models struggled', color: 'text-orange-600' };
  };

  // Helper to render progress bar
  const renderProgressBar = (score: number) => {
    const filledBlocks = Math.round((score * 100) / 7); // 14 blocks total, each ~7%
    const emptyBlocks = 14 - filledBlocks;

    return (
      <div className="font-mono text-sm">
        <span className="text-primary">
          {'█'.repeat(Math.max(0, filledBlocks))}
        </span>
        <span className="text-muted-foreground/30">
          {'░'.repeat(Math.max(0, emptyBlocks))}
        </span>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          {weval.description}
        </h1>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>by {weval.authorName}</span>
          <span>•</span>
          <span>{prompts.length} question{prompts.length !== 1 ? 's' : ''}</span>
          <span>•</span>
          <span>{effectiveModels.length} model{effectiveModels.length !== 1 ? 's' : ''} tested</span>
        </div>
      </div>

      {/* Prompt Results */}
      <div className="space-y-6">
        {promptResults.map((result, idx) => (
          <Card key={result.promptId} className="p-6 space-y-4">
            {/* Prompt Header */}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-primary">
                Question #{idx + 1} for the AI
              </h2>
              <p className="text-base text-foreground leading-relaxed">
                {result.promptText}
              </p>
            </div>

            {/* Criteria with Scores */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Key Criteria:
              </h3>

              <div className="space-y-4">
                {result.criteriaScores.map((criterion, criterionIdx) => {
                  const status = getCriterionStatus(criterion.avgScore);
                  const StatusIcon = status.icon;

                  return (
                    <div key={criterionIdx} className="space-y-2">
                      <p className="text-sm text-foreground">
                        • {criterion.criterionText}
                      </p>
                      <div className="pl-4 space-y-1">
                        {renderProgressBar(criterion.avgScore)}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">
                            Best: {getModelDisplayLabel(criterion.bestModel.id, { hideProvider: true, prettifyModelName: true })}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {Math.round(criterion.bestModel.score * 100)}%
                          </Badge>
                          <span className={`flex items-center gap-1 ${status.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {status.text}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Winner Banner */}
            {result.winners.length > 0 && result.winners[0].modelId && (
              <div className="pt-4 border-t">
                <div className="bg-accent/50 border border-accent rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🏆</span>
                      <div>
                        <div className="font-semibold text-foreground">
                          {result.winners.length === 1 ? 'Winner: ' : 'Winners (tied): '}
                          {result.winners.map((w, i) => (
                            <span key={w.modelId}>
                              {i > 0 && ', '}
                              {getModelDisplayLabel(w.modelId, { hideProvider: true, prettifyModelName: true })}
                            </span>
                          ))}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {Math.round(result.winners[0].score * 100)}% overall
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowResponsesFor(showResponsesFor === result.promptId ? null : result.promptId)}
                    >
                      {showResponsesFor === result.promptId ? 'Hide Responses' : 'Show All Responses'}
                    </Button>
                  </div>

                  {/* Expanded Responses */}
                  {showResponsesFor === result.promptId && (
                    <div className="mt-4 space-y-4 pt-4 border-t">
                      {effectiveModels.map((modelId: string) => {
                        const response = allResponses[result.promptId]?.[modelId] || 'No response available';
                        const modelScore = llmCoverageScores[result.promptId]?.[modelId];
                        const score = modelScore?.avgCoverageExtent ?? 0;
                        const isWinner = result.winners.some(w => w.modelId === modelId);

                        return (
                          <div
                            key={modelId}
                            className={`p-4 rounded-lg border ${isWinner ? 'bg-primary/5 border-primary/30' : 'bg-background'}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-medium flex items-center gap-2">
                                {isWinner && <span>🏆</span>}
                                {getModelDisplayLabel(modelId, { hideProvider: true, prettifyModelName: true })}
                              </div>
                              <Badge variant={isWinner ? 'default' : 'outline'}>
                                {Math.round(score * 100)}%
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
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
        ))}
      </div>

      {/* Overall Model Performance */}
      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <span>📊</span>
          Overall Model Performance
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody>
              {overallModelPerformance.map((model: { modelId: string; avgScore: number }, idx: number) => {
                // Calculate actual rank based on score (handle ties)
                let rank = 1;
                for (let i = 0; i < idx; i++) {
                  if (overallModelPerformance[i].avgScore > model.avgScore) {
                    rank++;
                  }
                }

                // Assign medals based on rank (all tied models get the same medal)
                const medals = ['🥇', '🥈', '🥉'];
                const medal = rank <= 3 ? medals[rank - 1] : '';

                return (
                  <tr key={model.modelId} className="border-b last:border-0">
                    <td className="py-2 pr-2 text-xl w-8">{medal}</td>
                    <td className="py-2 pr-3 text-sm text-muted-foreground w-8">{rank}</td>
                    <td className="py-2 pr-4 text-sm font-medium whitespace-nowrap">
                      {getModelDisplayLabel(model.modelId, { hideProvider: true, prettifyModelName: true })}
                    </td>
                    <td className="py-2 pr-3 text-sm font-semibold text-right w-12">
                      {Math.round(model.avgScore * 100)}%
                    </td>
                    <td className="py-2">
                      {renderProgressBar(model.avgScore)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
