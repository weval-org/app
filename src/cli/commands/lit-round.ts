import { Command } from 'commander';
import { getConfig } from '../config';
import { dispatchMakeApiCall } from '@/lib/llm-clients/client-dispatcher';
import type { LLMApiCallOptions } from '@/lib/llm-clients/types';
import { generateAllResponses } from '../services/comparison-pipeline-service.non-stream';
import { LLMCoverageEvaluator } from '@/cli/evaluators/llm-coverage-evaluator';
import type { ComparisonConfig, EvaluationInput } from '@/cli/types/cli_types';
import { getEmbedding } from '@/cli/services/embedding-service';
import { getCache, generateCacheKey } from '@/lib/cache-service';
import { runLitRound } from '@/lib/experiments/lit/core';
import type { LitParams, LitDependencies, LitProgressEvent } from '@/lib/experiments/lit/types';

function splitIntoChunks(text: string, maxChars: number): string[] {
    if (text.length <= maxChars) return [text];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + maxChars, text.length);
        chunks.push(text.slice(start, end));
        start = end;
    }
    return chunks;
}

async function embedTextMeanPooled(text: string, modelId: string, logger: ReturnType<typeof getConfig>['logger']): Promise<number[]> {
    const MAX_CHARS_PER_CHUNK = 6000; // conservative for embedding models
    const chunks = splitIntoChunks(text, MAX_CHARS_PER_CHUNK);
    const vectors: number[][] = [];
    for (const c of chunks) {
        try {
            const v = await getEmbedding(c, modelId, logger);
            vectors.push(v);
        } catch (e: any) {
            await logger.warn(`[lit-round] Embedding chunk failed: ${e?.message || e}`);
        }
    }
    if (vectors.length === 0) throw new Error('Failed to embed any chunks');
    const dim = vectors[0].length;
    const sum = new Array(dim).fill(0);
    for (const v of vectors) {
        for (let i = 0; i < dim; i++) sum[i] += v[i];
    }
    return sum.map(x => x / vectors.length);
}

function cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
}

function ngramOverlapRate(a: string, b: string, n = 3): number {
    const toks = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().split(' ');
    const ta = toks(a); const tb = toks(b);
    const grams = (t: string[]) => new Set(t.map((_, i) => t.slice(i, i + n).join(' ')).filter(x => x.split(' ').length === n));
    const ga = grams(ta); const gb = grams(tb);
    if (ga.size === 0 || gb.size === 0) return 0;
    let inter = 0;
    ga.forEach(g => { if (gb.has(g)) inter++; });
    const denom = Math.min(ga.size, gb.size);
    return inter / denom;
}

async function compileInstructionSet(sourceText: string, modelId: string, logger: ReturnType<typeof getConfig>['logger']): Promise<string> {
    // Cache by (modelId, source hash)
    const cache = getCache('lit-instruction-sets');
    const cacheKey = generateCacheKey({ t: 'instruction', modelId, sourceText });
    const cached = await cache.get(cacheKey);
    if (cached && typeof cached === 'string') {
        await logger.info('[lit-round] Instruction-set cache HIT.');
        return cached;
    }
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
    const options: LLMApiCallOptions = {
        modelId,
        systemPrompt,
        messages: [{ role: 'user', content: user }],
        temperature: 0.3,
        topP: 0.8,
        maxTokens: 4000,
    };
    const res = await dispatchMakeApiCall(options);
    if (res.error || !res.responseText) throw new Error(`Instruction-set LLM error: ${res.error || 'empty'}`);
    await logger.info(`[lit-round] Instruction-set compiled (${res.responseText.length} chars).`);
    const out = res.responseText.trim();
    await cache.set(cacheKey, out);
    return out;
}

async function deriveCoveragePointsFromSource(sourceText: string, modelId: string, logger: ReturnType<typeof getConfig>['logger']): Promise<string[]> {
    // Cache by (modelId, source hash)
    const cache = getCache('lit-coverage-assertions');
    const cacheKey = generateCacheKey({ t: 'coverage', modelId, sourceText });
    const cached = await cache.get(cacheKey);
    if (cached && Array.isArray(cached)) {
        await logger.info('[lit-round] Coverage assertions cache HIT.');
        return cached as string[];
    }
    const systemPrompt = `Extract precise coverage assertions from the source. Each assertion must be a standalone, testable criterion that can be judged present/absent in a candidate rewrite. Emit one assertion per line. Cover these axes when present in the source (omit any axis not present):
- THEMES & MOTIFS: main ideas, recurring motifs.
- BEATS / SECTION OUTLINE: plot beats for narratives or section-level flow for expository pieces; preserve rough order.
- CLAIMS / FACTS: key claims, facts, examples, definitions, caveats (if applicable).
- TONE / VOICE / REGISTER: salient stylistic posture (e.g., clinical vs lyrical), without prescribing specific phrasing.
- FORM / FORMAT: required structural constraints (line/stanza breaks; headings/lists; speaker labels/turn-taking; code blocks/tables) if present in the source.
- PROHIBITIONS: forbid meta prefaces (e.g., "here's the rewrite"), minimize clichés/stock phrases.

Guidelines: keep assertions concise, content-agnostic, and easy to judge for presence in a text; avoid references to the process or to these instructions.`;
    const user = sourceText;
    const options: LLMApiCallOptions = {
        modelId,
        systemPrompt,
        messages: [{ role: 'user', content: user }],
        temperature: 0.2,
        topP: 0.8,
        maxTokens: 2000,
    };
    const res = await dispatchMakeApiCall(options);
    if (res.error || !res.responseText) throw new Error(`Coverage-assertions LLM error: ${res.error || 'empty'}`);
    const lines = res.responseText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    await logger.info(`[lit-round] Derived ${lines.length} coverage points.`);
    await cache.set(cacheKey, lines);
    return lines;
}

function extractDraftFrom(text: string): string | null {
    if (!text) return null;
    const m = text.match(/<draft>([\s\S]*?)<\/draft>/i);
    if (m && typeof m[1] === 'string') return m[1].trim();
    return null;
}

export const litRoundCommand = new Command('lit-round')
  .description('Run one experimental LIT round: compile instruction-set, generate anchors and candidates, evaluate coverage and embedding distance, and pick winners.')
  .option('-t, --text <text>', 'Source text to rewrite')
  .option('-f, --file <path>', 'Path to a file containing the source text')
  .option('--coverage-threshold <number>', 'Minimum coverage score to be considered a winner', parseFloat, 0.7)
  .option('--use-gate', 'Use coverage threshold as a hard gate for winners', false)
  .action(async (sourceText, options) => {
    const { logger } = getConfig();
    const {
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
      includeTexts,
      includeAnchorTexts,
    } = options;

    try {
      const onEvent = async (event: LitProgressEvent) => {
        let message = `[LIT] ${event.type}`;
        if (event.message) {
          message += `: ${event.message}`;
        }
        if (event.data?.progress) {
            const percent = Math.round(event.data.progress * 100);
            message += ` (${percent}%)`;
        }
        logger.info(message);
      };

      // Use shared core to run the round and produce artefacts
      const params: LitParams = {
        sourceText,
        embeddingModel,
        compilerModel,
        coverageModel,
        candidateModels: candidateModels.split(','),
        anchorModels: anchorModels.split(','),
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

      const artifacts = await runLitRound(params, deps, onEvent);

      const output = {
        instructionSet: artifacts.instructionSet,
        coveragePoints: artifacts.coveragePoints,
        params: artifacts.params,
        anchors: artifacts.anchors.map(a => includeAnchorTexts ? a : ({ modelId: a.modelId, length: a.length })),
        candidates: artifacts.candidates.map(c => {
          const base: Omit<typeof c, 'text'> = c;
          if (!includeTexts) delete (base as any).text;
          return base;
        }),
        candidatesSorted: artifacts.candidatesSorted.map(c => {
            const base: Omit<typeof c, 'text'> = c;
            if (!includeTexts) delete (base as any).text;
            return base;
        }),
        winners: artifacts.winners,
      };

      console.log(JSON.stringify(output, null, 2));
    } catch (err: any) {
      logger.error(`An error occurred: ${err.message}`);
      if (err.stack) {
        logger.error(err.stack);
      }
      process.exit(1);
    }
  });

export default litRoundCommand;


