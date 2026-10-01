import {
  listRunsForConfig,
  getResultByFileName,
  getCoverageResult,
  getConfigSummary,
  saveConfigSummary,
  updateSummaryDataWithNewRun,
} from '@/lib/storageService';
import { generateConfigContentHash } from '@/lib/hash-utils';
import pLimit from '@/lib/pLimit';
import { executeComparisonPipeline } from './comparison-pipeline-service';
import { generateResponseForPair, resolveSystemForPrompt } from '../commands/clone-run';
import { ComparisonConfig, EvaluationMethod, PromptResponseData } from '../types/cli_types';
import { ConversationMessage } from '@/types/shared';

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

export interface AddModelsResult {
  configId: string;
  status: 'added' | 'skipped' | 'failed';
  reason?: string;
  fileName?: string;
  reused?: number;
  generated?: number;
  generationErrors?: number;
  rejudged?: number;
  retried?: number;
}

/**
 * Splits an effective model ID from a saved run into its base model and its
 * variant suffix, e.g. "openrouter:openai/gpt-4o[temp:0]" -> ("openrouter:openai/gpt-4o", "[temp:0]").
 * Returns null for IDs that don't belong to any of the base models (such as the ideal response).
 */
export function splitEffectiveId(effectiveId: string, baseModels: string[]): { base: string; suffix: string } | null {
  const base = baseModels
    .filter(b => effectiveId === b || effectiveId.startsWith(`${b}[`))
    .sort((a, b) => b.length - a.length)[0];
  return base ? { base, suffix: effectiveId.slice(base.length) } : null;
}

function parseSuffix(suffix: string): { temperature?: number; spIdx?: number } {
  const temp = suffix.match(/\[temp:([\d.]+)\]/);
  const sp = suffix.match(/\[sp_idx:(\d+)\]/);
  return {
    temperature: temp ? parseFloat(temp[1]) : undefined,
    spIdx: sp ? parseInt(sp[1], 10) : undefined,
  };
}

/**
 * Publishes a new run of a blueprint that adds `modelsToAdd` to its latest run.
 *
 * Every model already in the latest run keeps its saved response and coverage
 * score (failed ones stay failed; nothing is re-asked). Only the added models
 * are asked, once per variant the run used (temperatures, system prompts), and
 * only they are judged. The prompts come from the run's own embedded config,
 * so later blueprint or model-collection edits can't trigger a full re-run.
 *
 * With `rejudge`, listed models that the latest run already has keep their
 * responses but lose their saved scores, so only they are judged again (for
 * example after a judging outage left their scores incomplete).
 *
 * With `retryFailed`, listed models that the latest run already has are asked
 * again only on the prompts where their answer failed (for example when a
 * provider rejected the request), and those new answers are judged. Their
 * other answers and scores are kept.
 */
export async function addModelsToLatestRun(
  configId: string,
  modelsToAdd: string[],
  logger: Logger,
  options: { concurrency?: number; rejudge?: boolean; retryFailed?: boolean } = {},
): Promise<AddModelsResult> {
  const runs = await listRunsForConfig(configId);
  if (runs.length === 0) return { configId, status: 'skipped', reason: 'no published runs' };
  const latest = runs[0];

  const source: any = await getResultByFileName(configId, latest.fileName);
  if (!source?.config?.prompts?.length) {
    return { configId, status: 'failed', reason: `latest run ${latest.fileName} has no embedded config` };
  }

  const sourceModels: string[] = (source.config.models || [])
    .map((m: any) => (typeof m === 'string' ? m : m?.id))
    .filter(Boolean);
  const newModels = modelsToAdd.filter(m => !sourceModels.includes(m));
  const existingModels = modelsToAdd.filter(m => sourceModels.includes(m));
  const rejudgeModels = options.rejudge ? existingModels : [];
  const retryModels = options.retryFailed ? existingModels : [];
  if (newModels.length === 0 && rejudgeModels.length === 0 && retryModels.length === 0) {
    return { configId, status: 'skipped', reason: 'latest run already includes the model(s)' };
  }

  const sourceEffectiveIds: string[] = source.effectiveModels || [];
  const suffixes = new Set<string>();
  for (const effectiveId of sourceEffectiveIds) {
    const split = splitEffectiveId(effectiveId, sourceModels);
    if (split) suffixes.add(split.suffix);
  }
  if (suffixes.size === 0) {
    return { configId, status: 'failed', reason: 'could not work out the model variants of the latest run' };
  }

  const targetConfig: ComparisonConfig = { ...source.config, models: [...sourceModels, ...newModels] };
  const inlineCoverage = source.evaluationResults?.llmCoverageScores || {};
  const limit = pLimit(options.concurrency ?? 4);
  const responseMap = new Map<string, PromptResponseData>();
  const prefilledCoverage: Record<string, Record<string, any>> = {};
  const tasks: Promise<void>[] = [];
  let reused = 0;
  let generated = 0;
  let generationErrors = 0;
  let rejudged = 0;
  let retried = 0;

  // Asks `model` for `prompt` in one of the run's variants and stores the answer under its effective ID.
  const ask = (model: string, suffix: string, prompt: (typeof targetConfig.prompts)[number], promptData: PromptResponseData) => {
    const effectiveId = `${model}${suffix}`;
    const { temperature, spIdx } = parseSuffix(suffix);
    const systemFromArray = Array.isArray(targetConfig.systems) ? targetConfig.systems[spIdx ?? 0] : undefined;
    const systemPrompt = resolveSystemForPrompt(targetConfig, prompt, systemFromArray);
    tasks.push(limit(async () => {
      const res = await generateResponseForPair({
        modelId: model,
        temperature,
        systemPrompt,
        messages: prompt.messages as ConversationMessage[],
        useCache: false,
      });
      promptData.modelResponses[effectiveId] = {
        finalAssistantResponseText: res.text,
        fullConversationHistory: res.history,
        hasError: res.hasError,
        errorMessage: res.errorMessage,
        systemPromptUsed: systemPrompt,
      } as any;
      generated++;
      if (res.hasError) generationErrors++;
    }));
  };

  for (const prompt of targetConfig.prompts) {
    const promptData: PromptResponseData = {
      promptId: prompt.id,
      promptText: prompt.promptText,
      initialMessages: prompt.messages,
      idealResponseText: (prompt as any).idealResponse ?? null,
      modelResponses: {},
    };
    responseMap.set(prompt.id, promptData);

    // Existing models: copy the saved response and score as they are.
    for (const effectiveId of sourceEffectiveIds) {
      const split = splitEffectiveId(effectiveId, sourceModels);
      if (!split) continue;
      const text = source.allFinalAssistantResponses?.[prompt.id]?.[effectiveId];
      const sourceError = source.errors?.[prompt.id]?.[effectiveId];
      const ok = typeof text === 'string' && !sourceError && !text.startsWith('<<error>>');
      promptData.modelResponses[effectiveId] = {
        finalAssistantResponseText: typeof text === 'string' ? text : '',
        fullConversationHistory: source.fullConversationHistories?.[prompt.id]?.[effectiveId],
        hasError: !ok,
        errorMessage: ok ? undefined : (typeof sourceError === 'string' ? sourceError : 'No response in the source run'),
        systemPromptUsed: source.modelSystemPrompts?.[effectiveId] ?? null,
      } as any;
      if (ok) reused++;

      // Models being retried are asked again where their answer failed; the new answer is judged.
      if (!ok && retryModels.includes(split.base)) {
        retried++;
        ask(split.base, split.suffix, prompt, promptData);
        continue;
      }
      // Models being re-judged keep the response but not the score.
      if (ok && rejudgeModels.includes(split.base)) {
        rejudged++;
        continue;
      }

      const inline = inlineCoverage?.[prompt.id]?.[effectiveId];
      if (inline) {
        (prefilledCoverage[prompt.id] ||= {})[effectiveId] = inline;
      } else if (ok) {
        tasks.push(limit(async () => {
          try {
            const cov = await getCoverageResult(configId, latest.runLabel, latest.timestamp as string, prompt.id, effectiveId);
            if (cov) (prefilledCoverage[prompt.id] ||= {})[effectiveId] = cov;
          } catch {
            // No saved score: the evaluator will judge this pair.
          }
        }));
      }
    }

    // Added models: ask once per variant the run used.
    for (const model of newModels) {
      for (const suffix of suffixes) ask(model, suffix, prompt, promptData);
    }
  }

  await Promise.all(tasks);
  logger.info(`[AddModels] ${configId}: reused ${reused} responses, asked ${generated} (${generationErrors} failed; ${retried} were retries), re-judging ${rejudged}.`);

  if (newModels.length === 0 && rejudged === 0 && retried === 0) {
    return { configId, status: 'skipped', reason: 'nothing to re-judge or retry', reused, generated, generationErrors, rejudged, retried };
  }
  if (generated > 0 && generationErrors === generated) {
    return { configId, status: 'failed', reason: 'every request to the added model(s) failed', reused, generated, generationErrors, rejudged, retried };
  }

  const evalMethods: EvaluationMethod[] = Array.isArray(source.evalMethodsUsed) && source.evalMethodsUsed.length > 0
    ? source.evalMethodsUsed
    : ['llm-coverage'];
  const runLabel = generateConfigContentHash(targetConfig);

  const { fileName } = await executeComparisonPipeline(
    targetConfig,
    runLabel,
    evalMethods,
    logger as any,
    responseMap,
    undefined, // forcePointwiseKeyEval
    false, // useCache
    source.sourceCommitSha,
    source.sourceBlueprintFileName,
    false, // requireExecutiveSummary
    false, // skipExecutiveSummary
    undefined, // genOptions
    prefilledCoverage,
  );
  if (!fileName) {
    return { configId, status: 'failed', reason: 'the pipeline saved nothing', reused, generated, generationErrors, rejudged, retried };
  }

  const newRun = await getResultByFileName(configId, fileName);
  if (newRun) {
    const existingSummary = await getConfigSummary(configId);
    const [summary] = updateSummaryDataWithNewRun(existingSummary ? [existingSummary] : null, newRun as any, fileName);
    await saveConfigSummary(configId, summary);
  } else {
    logger.warn(`[AddModels] ${configId}: saved ${fileName} but could not read it back to update the page summary.`);
  }

  return { configId, status: 'added', fileName, reused, generated, generationErrors, rejudged, retried };
}
