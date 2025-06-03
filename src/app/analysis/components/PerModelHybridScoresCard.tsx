'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import dynamic from 'next/dynamic';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const BarChartHorizontalBig = dynamic(() => import('lucide-react').then(mod => mod.BarChartHorizontalBig));

interface PerModelHybridScoresCardProps {
  perModelHybridScores: Map<string, { average: number | null; stddev: number | null }>;
  perModelSemanticSimilarityScores: Map<string, { average: number | null; stddev: number | null }>;
  modelIds: string[]; // Controls order and which models to show (already filtered from IDEAL_MODEL_ID)
  title?: string;
  description?: string;
}

// Re-implement or import getHybridScoreColor logic
// For now, local implementation:
const getHybridScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-slate-400';
  if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

const PerModelHybridScoresCard: React.FC<PerModelHybridScoresCardProps> = ({
  perModelHybridScores,
  perModelSemanticSimilarityScores,
  modelIds,
  title = "Model Performance Summary",
  description = "Overall scores for each model across all prompts. Hybrid Score is a blend of semantic similarity to ideal and coverage."
}) => {
  if ((!perModelHybridScores || perModelHybridScores.size === 0) && (!perModelSemanticSimilarityScores || perModelSemanticSimilarityScores.size === 0) || modelIds.length === 0) {
    return null; // Or a message indicating no data
  }

  const sortedModelData = modelIds
    .map(modelId => ({
      modelId,
      displayName: getModelDisplayLabel(modelId),
      hybridScoreData: perModelHybridScores.get(modelId),
      semanticSimData: perModelSemanticSimilarityScores.get(modelId)
    }))
    .filter(item => (item.hybridScoreData && typeof item.hybridScoreData.average === 'number') || 
                    (item.semanticSimData && typeof item.semanticSimData.average === 'number'))
    .sort((a, b) => {
      const aHybrid = a.hybridScoreData?.average;
      const bHybrid = b.hybridScoreData?.average;
      if (typeof aHybrid === 'number' && typeof bHybrid === 'number') {
        if (bHybrid !== aHybrid) return bHybrid - aHybrid;
      }
      if (typeof aHybrid === 'number' && bHybrid === null) return -1;
      if (aHybrid === null && typeof bHybrid === 'number') return 1;

      const aSemantic = a.semanticSimData?.average;
      const bSemantic = b.semanticSimData?.average;
      if (typeof aSemantic === 'number' && typeof bSemantic === 'number') {
        return bSemantic - aSemantic;
      }
      if (typeof aSemantic === 'number' && bSemantic === null) return -1;
      if (aSemantic === null && typeof bSemantic === 'number') return 1;
      return 0;
    });

  return (
    <Card className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md text-card-foreground dark:text-slate-100 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden">
      <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-6">
        <div className="flex items-center">
          {BarChartHorizontalBig && <BarChartHorizontalBig className="w-5 h-5 mr-3 text-primary dark:text-sky-400" />}
          <CardTitle className="text-primary dark:text-sky-400 text-xl">{title}</CardTitle>
        </div>
        {description && <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-4 px-2 pb-4 sm:px-4">
        {sortedModelData.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[45%] px-2 sm:px-4">Model</TableHead>
                <TableHead className="text-right px-2 sm:px-4">Avg. Hybrid Score</TableHead>
                <TableHead className="text-right px-2 sm:px-4">Avg. Semantic Sim.</TableHead>
                <TableHead className="text-right px-2 sm:px-4">Hybrid Std. Dev.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedModelData.map(({ modelId, displayName, hybridScoreData, semanticSimData }) => (
                <TableRow key={modelId}>
                  <TableCell className="font-medium px-2 sm:px-4 py-2.5 truncate" title={displayName}>{displayName}</TableCell>
                  <TableCell className={`text-right font-semibold px-2 sm:px-4 py-2.5 ${getHybridScoreColor(hybridScoreData?.average)}`}>
                    {typeof hybridScoreData?.average === 'number' ? (hybridScoreData.average * 100).toFixed(1) + '%' : 'N/A'}
                  </TableCell>
                  <TableCell className={`text-right font-semibold px-2 sm:px-4 py-2.5 ${getHybridScoreColor(semanticSimData?.average)}`}>
                    {typeof semanticSimData?.average === 'number' ? (semanticSimData.average * 100).toFixed(1) + '%' : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground dark:text-slate-400 px-2 sm:px-4 py-2.5">
                    {typeof hybridScoreData?.stddev === 'number' ? hybridScoreData.stddev.toFixed(3) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No per-model scores available to display.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default PerModelHybridScoresCard; 