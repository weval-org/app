import { NextRequest, NextResponse } from 'next/server';
import { getResultByFileName } from '@/lib/storageService';
import { ComparisonDataV2 } from '@/app/utils/types';
import { buildBaseSimilarityMatrix } from '@/app/utils/calculationUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';

/**
 * Returns the per-prompt embedding similarity matrix for a given prompt.
 * Shape: { [modelA]: { [modelB]: number } }
 * Uses the full comparison artefact (legacy) since core omits perPromptSimilarities.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ configId: string; runLabel: string; timestamp: string; promptId: string }> }
) {
  try {
    const { configId, runLabel, timestamp, promptId } = await context.params;
    const decodedPromptId = decodeURIComponent(promptId);

    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    const fullData = await getResultByFileName(configId, fileName) as ComparisonDataV2 | null;
    if (!fullData) {
      return NextResponse.json({ error: 'Comparison data not found' }, { status: 404 });
    }

    const matrix = fullData.evaluationResults?.perPromptSimilarities?.[decodedPromptId];
    if (!matrix) {
      return NextResponse.json({ error: 'Per-prompt similarities not found for this prompt' }, { status: 404 });
    }

    // Normalize to base IDs to remove temp/system variants
    const modelIds = Object.keys(matrix);
    const baseMatrix = buildBaseSimilarityMatrix(matrix as any, modelIds);

    // Compute per-base similarity to IDEAL if present in original matrix (supports multiple identifiers)
    let idealSimilarities: Record<string, number> | undefined = undefined;
    const candidateIdealKeys = [IDEAL_MODEL_ID, 'ideal', 'IDEAL_MODEL_ID'];
    const idealKey = candidateIdealKeys.find(k => !!(matrix as any)[k]);
    console.log('[Per-Prompt Similarities API] promptId=%s models=%d idealKey=%s', decodedPromptId, modelIds.length, idealKey || 'none');
    if (idealKey) {
      idealSimilarities = {};
      // Group variants by canonical base id from modelIds
      const baseToVariants: Record<string, string[]> = {};
      modelIds.forEach(mid => {
        const baseId = parseModelIdForDisplay(mid).baseId;
        // Skip any ideal-looking base ids
        if (baseId === IDEAL_MODEL_ID || baseId === 'IDEAL_MODEL_ID' || baseId === 'ideal') return;
        baseToVariants[baseId] = baseToVariants[baseId] || [];
        baseToVariants[baseId].push(mid);
      });
      Object.entries(baseToVariants).forEach(([baseId, variants]) => {
        let sum = 0, count = 0;
        variants.forEach(vid => {
          const s = (matrix[vid]?.[idealKey] ?? (matrix as any)[idealKey]?.[vid]);
          if (typeof s === 'number' && !isNaN(s)) { sum += s; count++; }
        });
        if (count > 0) idealSimilarities![baseId] = sum / count;
      });
      console.log('[Per-Prompt Similarities API] computed idealSimilarities entries=%d', Object.keys(idealSimilarities).length);
    }

    const res = NextResponse.json({ promptId: decodedPromptId, similarities: baseMatrix, idealSimilarities });
    res.headers.set('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=600');
    return res;
  } catch (error) {
    console.error('[Per-Prompt Similarities API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch per-prompt similarities' }, { status: 500 });
  }
}


