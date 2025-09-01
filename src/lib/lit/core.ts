import { getConfig } from '@/cli/config';
import { generateAllResponses } from '@/cli/services/comparison-pipeline-service.non-stream';
import { LLMCoverageEvaluator } from '@/cli/evaluators/llm-coverage-evaluator';
import type { EvaluationInput, ComparisonConfig } from '@/cli/types/cli_types';
import { dispatchMakeApiCall } from '@/lib/llm-clients/client-dispatcher';
import type { LLMApiCallOptions } from '@/lib/llm-clients/types';
import { getEmbedding } from '@/cli/services/embedding-service';
import { getCache, generateCacheKey } from '@/lib/cache-service';
import { OnLitEvent, LitParams, LitArtifacts, LitDependencies } from './types';

function cosine(a: number[], b: number[]): number { let d=0,na=0,nb=0; const n=Math.min(a.length,b.length); for(let i=0;i<n;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];} const den=Math.sqrt(na)*Math.sqrt(nb); return den===0?0:d/den; }
function ngramOverlapRate(a: string, b: string, n = 3): number { const toks=(s:string)=>s.toLowerCase().replace(/\s+/g,' ').trim().split(' '); const ta=toks(a), tb=toks(b); const grams=(t:string[])=>new Set(t.map((_,i)=>t.slice(i,i+n).join(' ')).filter(x=>x.split(' ').length===n)); const ga=grams(ta), gb=grams(tb); if(ga.size===0||gb.size===0) return 0; let inter=0; ga.forEach(g=>{ if(gb.has(g)) inter++; }); const denom=Math.min(ga.size, gb.size); return inter/denom; }
function extractDraftFrom(text: string): string | null { if(!text) return null; const m=text.match(/<draft>([\s\S]*?)<\/draft>/i); return m && typeof m[1]==='string' ? m[1].trim() : null; }

export async function compileInstructionSet(sourceText: string, modelId: string, logger: ReturnType<typeof getConfig>['logger']): Promise<string> {
  const cache = getCache('lit-instruction-sets');
  const cacheKey = generateCacheKey({ t: 'instruction', modelId, sourceText });
  const cached = await cache.get(cacheKey);
  if (cached && typeof cached === 'string') return cached as string;
  const systemPrompt = `You are an expert instruction compiler. Given a source text, produce a detailed, precise instruction set that enables an LLM to recreate an equally informative text that preserves meaning while encouraging genuine stylistic divergence. Do not name specific target styles.

Core requirements to include (content-agnostic, works for poetry, stories, articles, transcripts, tweets, whitepapers, screeds):
- Preserve semantic content: themes, motifs, key claims/ideas, plot beats or section-level argument flow, causal links.
- Preserve tone/voice/register (e.g., formal/informal, earnest/ironic), without imitating exact phrasing.
- Preserve form/formatting if present: line/stanza breaks, headings, lists, speaker labels and turn-taking, code blocks, tables; otherwise omit.
- Preserve rough ordering of major beats/sections while allowing recomposition for clarity and originality.
- Modulate clichés and stock phrasing; avoid boilerplate and meta framing entirely.
- Length discipline: aim for roughly comparable length (±20%) unless content requires minimal expansion for clarity.
- Prohibitions: no meta commentary (e.g., "here is your rewrite"), no instructions to the reader, no apologies, no analysis blocks.

Output convention for downstream generators: require the final rewrite to be emitted strictly as <draft>...</draft> with no text outside the tag. This instruction-set itself should not include a <draft> block.

Return only the instruction set text.`;
  const user = `SOURCE TEXT:\n\n${sourceText}`;
  const options: LLMApiCallOptions = { modelId, systemPrompt, messages: [{ role: 'user', content: user }], temperature: 0.3, topP: 0.8, maxTokens: 4000 };
  const res = await dispatchMakeApiCall(options);
  if (res.error || !res.responseText) throw new Error(`Instruction-set LLM error: ${res.error || 'empty'}`);
  const out = res.responseText.trim();
  await cache.set(cacheKey, out);
  return out;
}

export async function deriveCoveragePoints(sourceText: string, modelId: string, logger: ReturnType<typeof getConfig>['logger']): Promise<string[]> {
  const cache = getCache('lit-coverage-assertions');
  const cacheKey = generateCacheKey({ t:'coverage', modelId, sourceText });
  const cached = await cache.get(cacheKey);
  if (cached && Array.isArray(cached)) return cached as string[];
  const systemPrompt = `Extract precise coverage assertions from the source. Each assertion must be a standalone, testable criterion that can be judged present/absent in a candidate rewrite. Emit one assertion per line. Cover these axes when present (omit if not present):\n- THEMES & MOTIFS\n- BEATS / SECTION OUTLINE (preserve rough order)\n- CLAIMS / FACTS / EXAMPLES / DEFINITIONS / CAVEATS\n- TONE / VOICE / REGISTER\n- FORM / FORMAT (line breaks, headings/lists, speaker labels/turn-taking, code blocks/tables)\n- PROHIBITIONS (no meta prefaces; minimize clichés)`;
  const options: LLMApiCallOptions = { modelId, systemPrompt, messages: [{ role: 'user', content: sourceText }], temperature: 0.2, topP: 0.8, maxTokens: 2000 };
  const res = await dispatchMakeApiCall(options);
  if (res.error || !res.responseText) throw new Error(`Coverage-assertions LLM error: ${res.error || 'empty'}`);
  const lines = res.responseText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  await cache.set(cacheKey, lines);
  return lines;
}

export async function runLitRound(params: LitParams, deps: LitDependencies, onEvent?: OnLitEvent): Promise<LitArtifacts> {
  const { logger } = getConfig();
  const emit = async (e: any) => { try { await onEvent?.(e); } catch {} };

  await emit({ type: 'instruction_started' });
  const instructionSet = await compileInstructionSet(params.sourceText, params.compilerModel, logger);
  await emit({ type: 'instruction_finished' });

  await emit({ type: 'assertions_started' });
  const coveragePoints = await deriveCoveragePoints(params.sourceText, params.coverageModel, logger);
  await emit({ type: 'assertions_finished', data: { points: coveragePoints.length } });

  const candConfig: ComparisonConfig = deps.buildCandidateConfig(params, instructionSet, coveragePoints);
  const anchorConfig: ComparisonConfig = deps.buildAnchorConfig(params, params.sourceText);

  await emit({ type: 'generation_started' });
  const [candMap, anchorMap] = await Promise.all([
    generateAllResponses(candConfig, logger, true, async (c,t)=>emit({ type: 'generation_progress', data:{ phase:'candidates', completed:c,total:t } })),
    generateAllResponses(anchorConfig, logger, true, async (c,t)=>emit({ type: 'generation_progress', data:{ phase:'anchors', completed:c,total:t } })),
  ]);
  await emit({ type: 'generation_finished' });

  // Normalize to <draft> and emit texts for live UI
  const candPD = candMap.get('cand');
  if (candPD) {
    for (const [mid, detail] of Object.entries(candPD.modelResponses)) {
      const extracted = extractDraftFrom(detail.finalAssistantResponseText) || detail.finalAssistantResponseText;
      if (extracted) {
        detail.finalAssistantResponseText = extracted;
        await emit({ type: 'candidate_text', data: { modelId: mid, text: extracted } });
      }
    }
  }

  const anchorsRaw: { modelId: string; text: string }[] = [];
  const anchorResp = anchorMap.get('anchors');
  if (anchorResp) {
    for (const [mid, detail] of Object.entries(anchorResp.modelResponses)) {
      if (!detail.hasError && detail.finalAssistantResponseText) {
        const text = extractDraftFrom(detail.finalAssistantResponseText) || detail.finalAssistantResponseText;
        anchorsRaw.push({ modelId: mid, text });
        await emit({ type: 'anchor_text', data: { modelId: mid, text } });
      }
    }
  }

  await emit({ type: 'coverage_started' });
  const evaluator = new LLMCoverageEvaluator(logger, true);
  const evalInputs: EvaluationInput[] = [{
    promptData: candPD!,
    config: candConfig,
    effectiveModelIds: Object.keys(candPD!.modelResponses),
    embeddingModel: params.embeddingModel,
  }];
  const coverageRes = await evaluator.evaluate(evalInputs, async (c,t)=>emit({ type: 'coverage_progress', data:{ completed:c,total:t } }));
  await emit({ type: 'coverage_finished' });
  const candScores = (coverageRes.llmCoverageScores || {})['cand'] || {};

  // Embeddings and metrics
  await emit({ type: 'embedding_started' });
  const sourceVec = await getEmbedding(params.sourceText, params.embeddingModel, logger);
  const anchorVecs: { modelId: string; vec: number[] }[] = [];
  await Promise.all(anchorsRaw.map(async (a, idx) => {
    const v = await getEmbedding(a.text, params.embeddingModel, logger);
    anchorVecs[idx] = { modelId: a.modelId, vec: v };
    await emit({ type: 'embedding_progress', data:{ phase:'anchors', completed: idx+1, total: anchorsRaw.length } });
  }));

  const candidates: any[] = [];
  const candEntries = Object.entries(candPD!.modelResponses);
  for (let i=0;i<candEntries.length;i++) {
    const [mid, detail] = candEntries[i];
    const text = (extractDraftFrom(detail.finalAssistantResponseText) || detail.finalAssistantResponseText || '').trim();
    if (detail.hasError || !text) continue;
    const v = await getEmbedding(text, params.embeddingModel, logger);
    const simSource = cosine(v, sourceVec);
    const minSimAnchors = anchorVecs.length ? Math.min(...anchorVecs.map(a => cosine(v, a.vec))) : NaN;
    const normSimilarity = isNaN(minSimAnchors) ? simSource : Math.max(simSource, minSimAnchors);
    const overlap3 = ngramOverlapRate(text, params.sourceText, 3);
    const cov = candScores[mid]?.avgCoverageExtent ?? null;
    candidates.push({ modelId: mid, text, coverage: cov, simSource, minSimAnchors, normSimilarity, overlap3 });
    await emit({ type: 'candidate_metrics', data: { modelId: mid, coverage: cov, simSource, minSimAnchors, normSimilarity, overlap3 } });
    await emit({ type: 'embedding_progress', data:{ phase:'candidates', completed: i+1, total: candEntries.length } });
  }
  await emit({ type: 'embedding_finished' });

  const pool = params.useGate
    ? candidates.filter(c => typeof c.coverage === 'number' && c.coverage >= params.coverageThreshold)
    : candidates;
  let candidatesSorted: any[] = [];
  if (params.rankMode === 'composite') {
    candidatesSorted = [...pool]
      .map(c => ({ ...c, rankScore: (params.coverageWeight * (1 - (typeof c.coverage === 'number' ? c.coverage : 0))) + ((1 - params.coverageWeight) * c.normSimilarity) }))
      .sort((a,b) => (a.rankScore - b.rankScore) || (a.normSimilarity - b.normSimilarity) || ((b.coverage ?? 0) - (a.coverage ?? 0)));
  } else {
    candidatesSorted = [...pool]
      .map(c => ({ ...c, rankScore: null }))
      .sort((a,b) => (a.normSimilarity - b.normSimilarity) || ((b.coverage ?? 0) - (a.coverage ?? 0)));
  }
  const topCandidates = candidatesSorted.slice(0, params.topN);
  await emit({ type: 'ranking_finished' });

  const artifacts: LitArtifacts = {
    instructionSet,
    coveragePoints,
    params: {
      embeddingModel: params.embeddingModel,
      compilerModel: params.compilerModel,
      coverageModel: params.coverageModel,
      candidateModels: params.candidateModels,
      anchorModels: params.anchorModels,
      rankMode: params.rankMode,
      coverageWeight: params.coverageWeight,
      usedGate: params.useGate,
    },
    anchors: anchorsRaw.map(a => ({ modelId: a.modelId, length: a.text.length, text: a.text })),
    candidates: candidates.map(c => ({ modelId: c.modelId as string, coverage: c.coverage as number | null, simSource: c.simSource as number, minSimAnchors: c.minSimAnchors as number, normSimilarity: c.normSimilarity as number, overlap3: c.overlap3 as number })),
    candidatesSorted: candidatesSorted.map(c => ({ modelId: c.modelId as string, coverage: c.coverage as number | null, simSource: c.simSource as number, minSimAnchors: c.minSimAnchors as number, normSimilarity: c.normSimilarity as number, overlap3: c.overlap3 as number, rankScore: (c as any).rankScore as number | null })),
    winners: topCandidates.map(c => ({ modelId: c.modelId as string, text: c.text as string, coverage: c.coverage as number | null, simSource: c.simSource as number, minSimAnchors: c.minSimAnchors as number, normSimilarity: c.normSimilarity as number, overlap3: c.overlap3 as number, rankScore: (c as any).rankScore as number | null })),
    topCandidates: topCandidates.map(c => ({ modelId: c.modelId as string, coverage: c.coverage as number | null, simSource: c.simSource as number, minSimAnchors: c.minSimAnchors as number, normSimilarity: c.normSimilarity as number, overlap3: c.overlap3 as number, rankScore: (c as any).rankScore as number | null })),
  };

  await emit({ type: 'completed', data: { artifacts } });
  return artifacts;
}


