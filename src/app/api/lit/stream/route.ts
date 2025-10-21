import { NextResponse } from 'next/server';
import { configure } from '@/cli/config';
import { runLitRound } from '@/lib/experiments/lit/core';
import type { LitParams, LitDependencies, LitProgressEvent } from '@/lib/experiments/lit/types';

async function startStream(req: Request, writer: WritableStreamDefaultWriter<Uint8Array>) {
  const encoder = new TextEncoder();
  const send = (evt: string, data: any) => writer.write(encoder.encode(`event: ${evt}\n` + `data: ${JSON.stringify(data)}\n\n`));

  try {
    // Support both GET (query param 'q') and POST (JSON body)
    let body: any = {};
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const q = url.searchParams.get('q');
      if (q) {
        try { body = JSON.parse(decodeURIComponent(q)); } catch {}
      }
    } else if (req.method === 'POST') {
      try { body = await req.json(); } catch {}
    }

    const sourceText: string = body?.text || '';
    if (!sourceText || typeof sourceText !== 'string' || sourceText.trim().length === 0) {
      await send('error', { message: 'Missing text' });
      await writer.close();
      return;
    }

    const embeddingModel: string = body?.embeddingModel || 'openai:text-embedding-3-small';
    const compilerModel: string = body?.compilerModel || 'openrouter:openai/gpt-4o-mini';
    const coverageModel: string = body?.coverageModel || 'openrouter:openai/gpt-4o-mini';
    const candidateModels: string[] = Array.isArray(body?.candidateModels) ? body.candidateModels : [
      'openrouter:openai/gpt-4o-mini',
      'openrouter:mistralai/mistral-medium-3',
    ];
    const anchorModels: string[] = Array.isArray(body?.anchorModels) ? body.anchorModels : [
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
      errorHandler: (e) => send('log', { level: 'error', message: e.message }).catch(()=>{}),
      logger: {
        info: (m: string) => send('log', { level: 'info', message: m }).catch(()=>{}),
        warn: (m: string) => send('log', { level: 'warn', message: m }).catch(()=>{}),
        error: (m: string) => send('log', { level: 'error', message: m }).catch(()=>{}),
        success: (m: string) => send('log', { level: 'success', message: m }).catch(()=>{}),
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

    await send('ready', { ok: true });

    const onEvent = async (evt: LitProgressEvent) => {
      await send('progress', evt);
    };

    const artifacts = await runLitRound(params, deps, onEvent);
    await send('complete', { artifacts });
    await writer.close();
  } catch (e: any) {
    try { await writer.write(new TextEncoder().encode(`event: error\n` + `data: ${JSON.stringify({ message: e?.message || 'Unknown error' })}\n\n`)); } catch {}
    try { await writer.close(); } catch {}
  }
}

export async function GET(req: Request) {
  const { readable, writable } = new TransformStream();
  startStream(req, writable.getWriter());
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export async function POST(req: Request) {
  const { readable, writable } = new TransformStream();
  startStream(req, writable.getWriter());
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
