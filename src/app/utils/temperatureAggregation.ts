import { LLMCoverageScores, CoverageResult } from '@/types/shared';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';

export interface AggregatedScore {
  mean: number | null;
  stdev: number | null;
  n: number;
}

/**
 * Aggregates per-temperature CoverageResults into mean / stdev for each
 * (promptId, baseModelId, systemPromptIndex) combination.
 * Returns a new LLMCoverageScores object keyed by canonical modelId
 *   baseId[sp_idx:X]  (temperature suffix removed).
 *
 * PointAssessment arrays are also averaged: coverageExtent → mean,
 * stdev stored, sampleCount stored. All other metadata (reflection, etc.)
 * is copied from the first sample.
 */
export function aggregateCoverageByTemperature(raw: LLMCoverageScores): LLMCoverageScores {
  const aggregated: LLMCoverageScores = {};

  for (const promptId of Object.keys(raw)) {
    const promptData = raw[promptId];
    aggregated[promptId] = {};

    // Group variants by baseId + sysIdx
    const bucketMap: Record<string, CoverageResult[]> = {};

    Object.entries(promptData).forEach(([modelId, result]) => {
      if (!result) return;
      const parsed = parseModelIdForDisplay(modelId);
      // Canonical id without temperature
      const bucketId = parsed.systemPromptIndex !== undefined ? `${parsed.baseId}[sp_idx:${parsed.systemPromptIndex}]` : parsed.baseId;
      if (!bucketMap[bucketId]) bucketMap[bucketId] = [];
      bucketMap[bucketId].push(result);
    });

    // Aggregate each bucket
    Object.entries(bucketMap).forEach(([bucketId, list]) => {
      const numbers: number[] = [];
      list.forEach(r => {
        if (r && !('error' in r) && typeof r.avgCoverageExtent === 'number' && !isNaN(r.avgCoverageExtent)) {
          numbers.push(r.avgCoverageExtent);
        }
      });

      if (numbers.length === 0) {
        aggregated[promptId][bucketId] = list[0] ?? null; // preserve first (likely null)
        return;
      }

      const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      let stdev: number | null = null;
      if (numbers.length >= 2) {
        const variance = numbers.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / numbers.length;
        stdev = Math.sqrt(variance);
      }

      // Merge PointAssessments if present
      const firstValid = list.find(r => r && !('error' in r) && r.pointAssessments?.length);
      let mergedAssessments = firstValid?.pointAssessments;

      if (mergedAssessments) {
        mergedAssessments = mergedAssessments.map(pa => ({ ...pa }));
        // For each keyPoint index, average coverageExtent across variants
        mergedAssessments.forEach((pa, idx) => {
          const vals: number[] = [];
          list.forEach(r => {
            if (r && !('error' in r) && r.pointAssessments && r.pointAssessments[idx] && typeof r.pointAssessments[idx].coverageExtent === 'number') {
              vals.push(r.pointAssessments[idx].coverageExtent as number);
            }
          });
          if (vals.length) {
            const m = vals.reduce((a, b) => a + b, 0) / vals.length;
            let sd: number | null = null;
            if (vals.length >= 2) {
              const v = vals.reduce((s, v) => s + Math.pow(v - m, 2), 0) / vals.length;
              sd = Math.sqrt(v);
            }
            pa.coverageExtent = m;
            (pa as any).stdev = sd ?? undefined;
            (pa as any).sampleCount = vals.length;
          }
        });
      }

      aggregated[promptId][bucketId] = {
        keyPointsCount: firstValid?.keyPointsCount,
        avgCoverageExtent: mean,
        pointAssessments: mergedAssessments,
        // attach meta
        ...(stdev !== null ? { stdev } : {}),
        sampleCount: numbers.length,
      } as any;
    });
  }

  return aggregated;
}
