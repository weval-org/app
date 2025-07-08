'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RunInstanceInfo } from './RunLabelInstancesClientPage';
import ClientDateTime from '@/app/components/ClientDateTime';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';

interface DriftComparisonViewProps {
  minScoreRun: RunInstanceInfo;
  maxScoreRun: RunInstanceInfo;
  modelId: string | null;
}

const DriftComparisonView: React.FC<DriftComparisonViewProps> = ({ minScoreRun, maxScoreRun, modelId }) => {

  const getModelScore = (run: RunInstanceInfo, modelId: string): number | null => {
    if (!run.perModelHybridScores) return null;
    
    const scoresMap = run.perModelHybridScores instanceof Map
        ? run.perModelHybridScores
        : new Map(Object.entries(run.perModelHybridScores) as [string, { average: number | null; stddev: number | null }][]);

    let totalScore = 0;
    let count = 0;

    for (const [effectiveModelId, scoreData] of scoresMap.entries()) {
        const parsed = parseEffectiveModelId(effectiveModelId);
        if (parsed.baseId === modelId) {
            if (scoreData.average !== null && scoreData.average !== undefined) {
                totalScore += scoreData.average;
                count++;
            }
        }
    }
    return count > 0 ? totalScore / count : null;
  }

  const renderRunCard = (run: RunInstanceInfo, title: string) => {
    const modelScore = modelId ? getModelScore(run, modelId) : null;
    
    return (
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              Executed on: <ClientDateTime timestamp={run.timestamp} />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
                <p className="text-sm text-muted-foreground">Overall Avg. Hybrid Score</p>
                <p className="text-lg font-semibold">{run.hybridScoreStats?.average ? (run.hybridScoreStats.average * 100).toFixed(1) + '%' : 'N/A'}</p>
            </div>
            {modelId && (
                <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
                    <p className="text-sm text-primary/80 font-medium">Score for <span className="font-bold">{getModelDisplayLabel(modelId)}</span></p>
                    <p className="text-lg font-semibold text-primary">{modelScore ? (modelScore * 100).toFixed(1) + '%' : 'N/A'}</p>
                </div>
            )}
            <div className="pt-2">
                <p className="text-sm text-muted-foreground">Model Variants Tested</p>
                <p className="text-lg font-semibold">{run.numModels}</p>
            </div>
            <div>
                <p className="text-sm text-muted-foreground">Test Cases</p>
                <p className="text-lg font-semibold">{run.numPrompts}</p>
            </div>
            <div className="mt-4 pt-4 border-t border-border/50">
                <Link href={`/analysis/${run.configId}/${run.runLabel}/${run.timestamp}`} className="text-primary hover:underline text-sm font-medium">
                    View Full Report
                </Link>
            </div>
          </CardContent>
        </Card>
    );
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Drift Comparison</h2>
      <p className="text-muted-foreground mb-4 max-w-3xl">
        A significant performance shift was detected for a model between these two runs of the same blueprint. 
        The highlighted score below shows the change for the specific model that triggered the alert, while other metrics show the overall run performance.
      </p>
      <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
        {renderRunCard(minScoreRun, 'Run with Lowest Score')}
        {renderRunCard(maxScoreRun, 'Run with Highest Score')}
      </div>
    </div>
  );
};

export default DriftComparisonView; 