import { NextRequest, NextResponse } from 'next/server';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';
import { executeComparisonPipeline } from '@/cli/services/comparison-pipeline-service';
import { ComparisonConfig, EvaluationMethod, FinalComparisonOutputV2 } from '@/cli/types/cli_types';

type QuickRunRequestBody = {
  outline: any; // Simplified WevalConfig-like object from creator
};

const DEFAULT_MODELS = [
  'openrouter:google/gemini-2.5-flash',
  'openrouter:google/gemma-3-12b-it',
  'openrouter:qwen/qwen3-30b-a3b-instruct-2507',
];

export async function POST(req: NextRequest) {
  const logger = await getLogger('story:quick-run');
  configure({
    logger: {
      info: (m) => logger.info(m),
      warn: (m) => logger.warn(m),
      error: (m) => logger.error(m),
      success: (m) => logger.info(m),
    },
    errorHandler: (err) => logger.error(`[story:quick-run] error: ${err?.message || err}`),
  });

  try {
    const body = (await req.json()) as QuickRunRequestBody;
    const outline = body?.outline;
    if (!outline || !Array.isArray(outline?.prompts) || outline.prompts.length === 0) {
      return NextResponse.json({ error: 'outline.prompts is required' }, { status: 400 });
    }

    // Build a minimal ComparisonConfig
    const limitedPrompts = outline.prompts.slice(0, 5).map((p: any, idx: number) => {
      const promptText: string = p.promptText || '';
      return {
        id: p.id || `p_${idx + 1}`,
        promptText,
        // Ensure messages exist for the pipeline (fallback to single-turn user message)
        messages: Array.isArray(p.messages) && p.messages.length > 0
          ? p.messages
          : [{ role: 'user', content: promptText }],
        idealResponse: p.idealResponse,
        points: p.points,
      };
    });

    const config: ComparisonConfig = {
      id: outline.id || 'story-quickrun',
      title: outline.title || 'Quick Test',
      description: outline.description || undefined,
      models: Array.isArray(outline.models) && outline.models.length > 0 ? outline.models.slice(0, 3) : DEFAULT_MODELS,
      prompts: limitedPrompts,
      evaluationConfig: {
        'llm-coverage': {
          judges: [
            { id: 'holistic-gemma-3-12b-it', model: 'openrouter:google/gemma-3-12b-it', approach: 'holistic' },
          ],
        } as any,
      },
      temperature: 0,
    } as any;

    const evalMethods: EvaluationMethod[] = ['llm-coverage'];
    const runLabel = 'story-quickrun';

    // Execute without saving, no executive summary, short timeouts
    const { data } = await executeComparisonPipeline(
      config,
      runLabel,
      evalMethods,
      {
        info: (m: string) => logger.info(m),
        warn: (m: string) => logger.warn(m),
        error: (m: string) => logger.error(m),
        success: (m: string) => logger.info(m),
      } as any,
      undefined, // existingResponsesMap
      undefined, // forcePointwiseKeyEval
      true,      // useCache
      undefined, // commitSha
      undefined, // blueprintFileName
      undefined, // requireExecutiveSummary
      true,      // skipExecutiveSummary
      { genTimeoutMs: 25000, genRetries: 0 }, // genOptions
      undefined, // prefilledCoverage
      undefined, // fixturesCtx
      true,      // noSave
    );

    const compact = compactify(data);
    return NextResponse.json({ result: compact });

  } catch (err: any) {
    logger.error(`[story:quick-run] failed: ${err?.message || err}`);
    return NextResponse.json({ error: 'Failed to run quick evaluation.' }, { status: 500 });
  }
}

function compactify(run: FinalComparisonOutputV2) {
  const prompts: any[] = [];
  const promptIds = run.promptIds || Object.keys(run.promptContexts || {});
  const cov = run.evaluationResults?.llmCoverageScores || {};
  for (const pid of promptIds.slice(0, 5)) {
    const promptContext = run.promptContexts?.[pid];
    const promptText = Array.isArray(promptContext)
      ? promptContext.map((m: any) => `${m.role}: ${m.content}`).join('\n')
      : (promptContext as string);

    const modelsBlock: any[] = [];
    const modelToText = run.allFinalAssistantResponses?.[pid] || {};
    const modelIds = Object.keys(modelToText).filter(mid => mid !== 'IDEAL');
    for (const mid of modelIds) {
      const resp = modelToText[mid] || '';
      const coverage = cov?.[pid]?.[mid];
      const points = (coverage?.pointAssessments || []).slice(0, 5).map((pa: any) => ({
        text: pa.keyPointText,
        score: typeof pa.coverageExtent === 'number' ? Math.round(pa.coverageExtent * 100) : null,
        error: pa.error || null,
      }));
      modelsBlock.push({ modelId: mid, response: resp, points });
    }
    prompts.push({ id: pid, promptText, models: modelsBlock });
  }
  return { prompts };
}


