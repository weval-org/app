'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { buildBaseSimilarityMatrix } from '@/app/utils/calculationUtils';
import Icon from '@/components/ui/icon';

const ModelSimilarityModal: React.FC = () => {
  const { data, similarityModal, closeSimilarityModal } = useAnalysis();

  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  useEffect(() => {
    if (similarityModal.isOpen) {
      setSelectedModel(similarityModal.modelId);
    }
  }, [similarityModal.isOpen, similarityModal.modelId]);

  const models = data?.effectiveModels || [];
  const similarityMatrix = data?.evaluationResults?.similarityMatrix || {};
  const baseMatrix = useMemo(() => buildBaseSimilarityMatrix(similarityMatrix, models), [similarityMatrix, models]);

  const leaderboard = useMemo(() => {
    if (!selectedModel || !similarityMatrix || !models.length) return [] as Array<{ id: string; score: number }>;
    const baseId = parseModelIdForDisplay(selectedModel).baseId;
    const scores: Array<{ id: string; score: number }> = [];
    Object.keys(baseMatrix[baseId] || {}).forEach(otherBase => {
      if (otherBase === baseId) return;
      const s = baseMatrix[baseId][otherBase];
      if (typeof s === 'number' && !isNaN(s)) {
        scores.push({ id: otherBase, score: s });
      }
    });
    // Sort descending by similarity (most similar at top)
    scores.sort((x, y) => y.score - x.score);
    return scores;
  }, [selectedModel, similarityMatrix, models]);

  if (!similarityModal.isOpen) return null;

  return (
    <Dialog open={similarityModal.isOpen} onOpenChange={closeSimilarityModal}>
      <DialogContent className="w-[95vw] max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Similarity Leaderboard</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Select a model</label>
            <Select value={selectedModel ?? ''} onValueChange={(v) => setSelectedModel(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose model" />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set(models.map(m => parseModelIdForDisplay(m).baseId))).map(base => (
                  <SelectItem key={base} value={base}>{getModelDisplayLabel(base, { hideProvider: true, prettifyModelName: true })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedModel ? (
            <div className="text-sm text-muted-foreground">Pick a model to see its most and least similar peers.</div>
          ) : leaderboard.length === 0 ? (
            <div className="text-sm text-muted-foreground">No similarity data available for this selection.</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar divide-y divide-border border rounded-md">
              {leaderboard.map((row, idx) => (
                <div key={row.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-right text-xs text-muted-foreground">{idx + 1}.</span>
                    {idx < 3 && <Icon name="award" className={`w-3.5 h-3.5 ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-400' : 'text-amber-700/80'}`} />}
                    <span className="font-medium" title={row.id}>{getModelDisplayLabel(row.id, { hideProvider: true, prettifyModelName: true })}</span>
                  </div>
                  <div className="font-semibold text-primary">{(row.score * 100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModelSimilarityModal;


