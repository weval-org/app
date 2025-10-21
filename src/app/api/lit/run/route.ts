import { NextResponse } from 'next/server';
import { configure } from '@/cli/config';
import { runLitRound } from '@/lib/experiments/lit/core';
import type { LitParams, LitDependencies, LitProgressEvent } from '@/lib/experiments/lit/types';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const sourceText: string = body?.text || '';
  if (!sourceText || typeof sourceText !== 'string' || sourceText.trim().length === 0) {
    return NextResponse.json({ error: 'Missing text' }, { status: 400 });
  }

  const embeddingModel: string = body?.embeddingModel || 'openai:text-embedding-3-small';
  const compilerModel: string = body?.compilerModel || 'openrouter:openai/gpt-4o-mini';
  const coverageModel: string = body?.coverageModel || 'openrouter:openai/gpt-4o-mini';
  const candidateModels: string[] = body?.candidateModels || [
    'openrouter:openai/gpt-4o-mini',
    'openrouter:mistralai/mistral-medium-3',
  ];
  const anchorModels: string[] = body?.anchorModels || [
    'openrouter:openai/gpt-4o-mini',
  ];
  const candTemp: number = typeof body?.candTemp === 'number' ? body.candTemp : 0.9;
  const anchorTemp: number = typeof body?.anchorTemp === 'number' ? body.anchorTemp : 0.6;
  const topN: number = typeof body?.topN === 'number' ? body.topN : 3;
  const rankMode: 'composite' | 'pareto' = body?.rankMode === 'pareto' ? 'pareto' : 'composite';
  const coverageWeight: number = typeof body?.coverageWeight === 'number' ? body.coverageWeight : 0.7;
  const useGate: boolean = Boolean(body?.useGate) || false;
  const coverageThreshold: number = typeof body?.coverageThreshold === 'number' ? body.coverageThreshold : 0.7;

  configure({
    errorHandler: (e) => console.error('[LIT][error]', e.message),
    logger: {
      info: (m: string) => console.log('[LIT][info]', m),
      warn: (m: string) => console.warn('[LIT][warn]', m),
      error: (m: string) => console.error('[LIT][error]', m),
      success: (m: string) => console.log('[LIT][success]', m),
    },
  });

  const params: LitParams = {
    sourceText,
    embeddingModel,
    compilerModel,
    coverageModel,
    candidateModels,
    anchorModels,
    candTemp,
    anchorTemp,
    topN,
    rankMode,
    coverageWeight,
    useGate,
    coverageThreshold,
  };

  const deps: LitDependencies = {
    buildCandidateConfig: (p, instruction, points) => ({
      id: 'lit-candidates',
      title: 'LIT Candidates',
      description: 'Experimental LIT candidate generation',
      models: p.candidateModels,
      temperature: p.candTemp,
      prompts: [
        {
          id: 'cand',
          messages: [
            { role: 'system', content: `${instruction}\n\nOutput format requirement: Emit ONLY one XML-like tag with the final rewrite as <draft>...</draft>. Do not include any preface, notes, or trailing text outside <draft>.` },
            { role: 'user', content: `Rewrite the following text accordingly, preserving all content while diverging in style. Return strictly as <draft>...</draft>.\n\n<CONTENT>\n${p.sourceText}\n</CONTENT>` },
          ],
          points,
          idealResponse: p.sourceText,
        }
      ],
      concurrency: 8,
      embeddingModel: p.embeddingModel,
      evaluationConfig: { 'llm-coverage': {} },
    }) as any,
    buildAnchorConfig: (p, text) => ({
      id: 'lit-anchors',
      title: 'LIT Anchors',
      description: 'Plain variants as LLM norms anchors',
      models: p.anchorModels,
      temperature: p.anchorTemp,
      prompts: [
        {
          id: 'anchors',
          messages: [
            { role: 'system', content: 'You rewrite text clearly and neutrally, preserving meaning without adding content. Output strictly as <draft>...</draft> only.' },
            { role: 'user', content: `Rewrite plainly, concise and neutral tone. Return strictly as <draft>...</draft>.\n\n<CONTENT>\n${text}\n</CONTENT>` },
          ],
        }
      ],
      concurrency: 6,
    }) as any,
  };

  const events: LitProgressEvent[] = [];
  const onEvent = async (evt: LitProgressEvent) => { events.push(evt); };

  try {
    const artifacts = await runLitRound(params, deps, onEvent);
    return NextResponse.json({ artifacts, events }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
