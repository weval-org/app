import { Command } from 'commander';
import { getConfig } from '../config';
import { getResultByFileName } from '@/lib/storageService';
import { loadAndValidateConfig, parseEvalMethods } from './run-config';
import { executeComparisonPipeline } from '../services/comparison-pipeline-service';
import { ComparisonConfig, PromptResponseData } from '../types/cli_types';
import { ConversationMessage } from '@/types/shared';
import { getModelResponse, DEFAULT_TEMPERATURE } from '../services/llm-service';
import { loadFixturesFromLocal, FixtureSet, pickFixtureValue } from '@/lib/fixtures-service';
import { fetchBlueprintContentByName } from '@/lib/blueprint-service';
import type { SimpleLogger } from '@/lib/blueprint-service';
import { getCoverageResult, getConfigSummary, saveConfigSummary, updateSummaryDataWithNewRun } from '@/lib/storageService';
import pLimit from '@/lib/pLimit';
import { actionBackfillSummary } from './backfill-summary';

interface CloneOptions {
  config?: string;
  evalMethod?: string;
  cache?: boolean;
  genTimeoutMs?: number | string;
  genRetries?: number | string;
  updateSummaries?: boolean;
  fixtures?: string;
  fixturesStrict?: boolean;
  concurrency?: number | string;
}

function buildEffectiveId(baseModelId: string, temp: number | undefined, systems: (string | null | undefined)[] | undefined, spIdx: number): string {
  let id = baseModelId;
  if (typeof temp === 'number') {
    id = `${id}[temp:${temp.toFixed(1)}]`;
  }
  if (systems && systems.length > 1) {
    id = `${id}[sp_idx:${spIdx}]`;
  }
  return id;
}

function resolveSystemForPrompt(config: ComparisonConfig, prompt: any, systemFromArray: string | null | undefined): string | null {
  if (Array.isArray(config.systems) && config.systems.length > 0) {
    return systemFromArray ?? null;
  }
  if (prompt.system !== undefined) return prompt.system ?? null;
  return (config.system as any) ?? null;
}

function messagesDeepEqual(a: ConversationMessage[] | undefined, b: any): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const am = a[i] as any;
    const bm = b[i] as any;
    if (am?.role !== bm?.role) return false;
    if ((am?.content ?? null) !== (bm?.content ?? null)) return false;
  }
  return true;
}

async function generateResponseForPair(params: {
  modelId: string;
  temperature: number | undefined;
  systemPrompt: string | null;
  messages: ConversationMessage[];
  useCache: boolean;
  genTimeoutMs?: number;
  genRetries?: number;
}): Promise<{ text: string; history: ConversationMessage[]; hasError: boolean; errorMessage?: string }>
{
  const { modelId, temperature, systemPrompt, messages, useCache, genTimeoutMs, genRetries } = params;

  // Build working history including system if present
  const workingHistory: ConversationMessage[] = [];
  if (systemPrompt) workingHistory.push({ role: 'system', content: systemPrompt });

  // Support assistant:null placeholders; otherwise pass through
  let lastAssistant: string | null = null;
  let assistantTurnCount = 0;
  try {
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.content === null) {
        const genText = await getModelResponse({
          modelId,
          messages: [...workingHistory],
          temperature: temperature ?? DEFAULT_TEMPERATURE,
          useCache,
          timeout: genTimeoutMs,
          retries: genRetries,
        });
        workingHistory.push({ role: 'assistant', content: genText });
        lastAssistant = genText;
        assistantTurnCount++;
      } else {
        workingHistory.push(msg as ConversationMessage);
        if (msg.role === 'assistant' && typeof msg.content === 'string') {
          lastAssistant = msg.content;
          assistantTurnCount++;
        }
      }
    }

    // If last message is user, generate trailing assistant
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      const genText = await getModelResponse({
        modelId,
        messages: workingHistory,
        temperature: temperature ?? DEFAULT_TEMPERATURE,
        useCache,
        timeout: genTimeoutMs,
        retries: genRetries,
      });
      workingHistory.push({ role: 'assistant', content: genText });
      return { text: genText, history: workingHistory, hasError: false };
    }

    // Otherwise, reuse last assistant in the history
    const text = lastAssistant ?? '';
    return { text, history: workingHistory, hasError: false };
  } catch (err: any) {
    const message = `Failed to get response: ${err?.message || String(err)}`;
    const errorText = `<<error>>${message}<</error>>`;
    // Build a minimal history with error as assistant
    const history: ConversationMessage[] = [];
    if (systemPrompt) history.push({ role: 'system', content: systemPrompt });
    history.push(...messages.filter(m => !(m.role === 'assistant' && m.content === null)) as ConversationMessage[]);
    history.push({ role: 'assistant', content: errorText });
    return { text: errorText, history, hasError: true, errorMessage: message };
  }
}

async function actionCloneRun(sourceIdentifier: string, options: CloneOptions) {
  const { logger } = getConfig();
  const useCache = options.cache ?? false;

  // Parse source identifier
  const parts = sourceIdentifier.split('/');
  if (parts.length !== 3) {
    logger.error('Invalid runIdentifier format. Expected "configId/runLabel/timestamp".');
    process.exit(1);
    return;
  }
  const [sourceConfigId, sourceRunLabel, sourceTimestamp] = parts;
  const sourceFileName = `${sourceRunLabel}_${sourceTimestamp}_comparison.json`;

  logger.info(`Cloning from source run: ${sourceIdentifier}`);
  const sourceData: any = await getResultByFileName(sourceConfigId, sourceFileName);
  if (!sourceData) {
    logger.error(`Could not find result file for identifier: ${sourceIdentifier}`);
    process.exit(1);
    return;
  }

  let targetConfig: ComparisonConfig;
  if (!options.config) {
    // Try to load blueprint by name from GitHub (same behavior as run-config github)
    logger.info(`No --config provided. Attempting to fetch blueprint '${sourceConfigId}' from GitHub...`);
    const githubToken = process.env.GITHUB_TOKEN;
    const remote = await fetchBlueprintContentByName(sourceConfigId, githubToken, logger as unknown as SimpleLogger).catch(() => null);
    if (remote) {
      targetConfig = await loadAndValidateConfig({
        configContent: remote.content,
        blueprintPath: remote.blueprintPath,
        fileType: remote.fileType,
        isRemote: true,
      });
      logger.info(`Loaded blueprint '${sourceConfigId}' from GitHub.`);
      
      // Log captured metadata for observability
      const title = targetConfig.title || targetConfig.configTitle;
      const description = targetConfig.description;
      const author = (targetConfig as any).author;
      logger.info(`Blueprint metadata - Title: ${title ? `"${title}"` : 'none'}, Description: ${description ? `"${description.substring(0, 50)}${description.length > 50 ? '...' : ''}"` : 'none'}, Author: ${author ? (typeof author === 'string' ? `"${author}"` : `"${author.name}"${author.url ? ` (${author.url})` : ''}`) : 'none'}`);
    } else {
      // Fallback: use the config embedded in the source run
      logger.warn(`Blueprint '${sourceConfigId}' not found on GitHub. Falling back to source run's embedded config.`);
      targetConfig = sourceData.config as ComparisonConfig;
      
      // Log captured metadata from embedded config for observability
      const title = targetConfig.title || targetConfig.configTitle;
      const description = targetConfig.description;
      const author = (targetConfig as any).author;
      logger.info(`Embedded config metadata - Title: ${title ? `"${title}"` : 'none'}, Description: ${description ? `"${description.substring(0, 50)}${description.length > 50 ? '...' : ''}"` : 'none'}, Author: ${author ? (typeof author === 'string' ? `"${author}"` : `"${author.name}"${author.url ? ` (${author.url})` : ''}`) : 'none'}`);
      if (!targetConfig?.prompts || !Array.isArray(targetConfig.prompts)) {
        logger.error('Source run does not contain an embedded config suitable for cloning.');
        process.exit(1);
        return;
      }
    }
  } else {
    // Load and validate the target blueprint from local file
    targetConfig = await loadAndValidateConfig({
      configPath: options.config,
      isRemote: false,
    });
    
    // Log captured metadata from local config for observability
    const title = targetConfig.title || targetConfig.configTitle;
    const description = targetConfig.description;
    const author = (targetConfig as any).author;
    logger.info(`Local config metadata - Title: ${title ? `"${title}"` : 'none'}, Description: ${description ? `"${description.substring(0, 50)}${description.length > 50 ? '...' : ''}"` : 'none'}, Author: ${author ? (typeof author === 'string' ? `"${author}"` : `"${author.name}"${author.url ? ` (${author.url})` : ''}`) : 'none'}`);
  }

  // Prepare evaluation methods
  const chosenMethods = parseEvalMethods(options.evalMethod);

  // --- Compute proposed runLabel early for plan output ---
  const { generateConfigContentHash } = await import('@/lib/hash-utils');
  const proposedRunLabel = generateConfigContentHash(targetConfig);

  // --- Delta detection and plan header ---
  const sourcePromptIds: string[] = Array.isArray(sourceData?.promptIds) ? sourceData.promptIds : Object.keys(sourceData?.allFinalAssistantResponses || {});
  const targetPromptIds: string[] = (targetConfig.prompts || []).map(p => p.id);
  const addedPrompts = targetPromptIds.filter(id => !sourcePromptIds.includes(id));
  const removedPrompts = sourcePromptIds.filter(id => !targetPromptIds.includes(id));
  const potentiallyCommon = targetPromptIds.filter(id => sourcePromptIds.includes(id));

  const changedPrompts: string[] = [];
  for (const pid of potentiallyCommon) {
    const tgt = (targetConfig.prompts as any[]).find(p => p.id === pid);
    const srcCtx = sourceData?.promptContexts?.[pid];
    if (!messagesDeepEqual(tgt?.messages, srcCtx)) {
      changedPrompts.push(pid);
    }
  }

  logger.info('— clone-run plan —');
  logger.info(`Target: configId=${targetConfig.id}, proposed runLabel=${proposedRunLabel}`);
  logger.info(`Evaluation methods: ${chosenMethods.join(', ')}`);
  logger.info(`Prompts: +${addedPrompts.length} added, -${removedPrompts.length} removed, ${changedPrompts.length} changed`);

  // Build existingResponsesMap by reusing from source where possible; generate for missing
  const tempsToRun: (number | undefined)[] = (Array.isArray((targetConfig as any).temperatures) && (targetConfig as any).temperatures.length > 0)
    ? (targetConfig as any).temperatures
    : [(targetConfig as any).temperature];
  const systemsToRun: (string | null | undefined)[] = (Array.isArray((targetConfig as any).systems) && (targetConfig as any).systems.length > 0)
    ? (targetConfig as any).systems
    : [(targetConfig as any).system];

  const modelIds: string[] = targetConfig.models.map(m => typeof m === 'string' ? m : m.id);
  logger.info(`Cohort sizes: models=${modelIds.length}, temps=${tempsToRun.length}, systems=${systemsToRun.length}`);

  // Model deltas vs source
  const sourceModelIds: string[] = Array.isArray(sourceData?.config?.models)
    ? (sourceData.config.models as any[]).map((m: any) => (typeof m === 'string' ? m : m?.id)).filter(Boolean)
    : [];
  const addedBaseModels = modelIds.filter(id => !sourceModelIds.includes(id));
  const removedBaseModels = sourceModelIds.filter((id: string) => !modelIds.includes(id));
  logger.info(
    `Models: +${addedBaseModels.length} added${addedBaseModels.length ? ` [${addedBaseModels.join(', ')}]` : ''}, ` +
    `-${removedBaseModels.length} removed${removedBaseModels.length ? ` [${removedBaseModels.join(', ')}]` : ''}`
  );
  const responseMap = new Map<string, PromptResponseData>();
  let fixtures: FixtureSet | null = null;
  if (options.fixtures) {
    fixtures = await loadFixturesFromLocal(options.fixtures, logger as any);
    if (fixtures) logger.info(`Loaded fixtures for clone-run.`);
  }
  let totalPlannedReuse = 0;
  let totalPlannedGenerate = 0;
  const prefilledCoverage: Record<string, Record<string, any>> = {};
  let totalCoverageReused = 0;

  for (const prompt of targetConfig.prompts) {
    if (!prompt.messages) {
      throw new Error(`Prompt '${prompt.id}' has no messages after validation.`);
    }
    const promptData: PromptResponseData = {
      promptId: prompt.id,
      promptText: prompt.promptText,
      initialMessages: prompt.messages,
      idealResponseText: (prompt as any).idealResponse ?? null,
      modelResponses: {},
    };

    const promptChanged = changedPrompts.includes(prompt.id) || addedPrompts.includes(prompt.id);
    let promptReuse = 0;
    let promptGen = 0;
    let promptCoverageReuse = 0;

    const limit = pLimit(options.concurrency !== undefined ? parseInt(String(options.concurrency), 10) : 8);
    const tasks: Promise<void>[] = [];

    for (const baseModelId of modelIds) {
      for (let spIdx = 0; spIdx < systemsToRun.length; spIdx++) {
        const systemValue = systemsToRun[spIdx];
        const systemPromptUsed = resolveSystemForPrompt(targetConfig, prompt, systemValue ?? undefined);
        for (const tempValue of tempsToRun) {
          const effectiveId = buildEffectiveId(baseModelId, tempValue as number | undefined, systemsToRun, spIdx);

          if (!promptChanged) {
            const prevText = sourceData?.allFinalAssistantResponses?.[prompt.id]?.[effectiveId];
            const prevHist = sourceData?.fullConversationHistories?.[prompt.id]?.[effectiveId];
            const prevSystemUsed = sourceData?.modelSystemPrompts?.[effectiveId] ?? null;
            const systemsMatch = (prevSystemUsed ?? null) === (systemPromptUsed ?? null);
            if (typeof prevText === 'string' && systemsMatch) {
              // Immediate reuse of response
              promptData.modelResponses[effectiveId] = {
                finalAssistantResponseText: prevText,
                fullConversationHistory: Array.isArray(prevHist) ? prevHist : undefined,
                hasError: false,
                systemPromptUsed: systemPromptUsed ?? null,
              } as any;
              promptReuse++;
              // Coverage reuse task (concurrent)
              tasks.push(limit(async () => {
                try {
                  const cov = await getCoverageResult(sourceConfigId, sourceRunLabel, sourceTimestamp, prompt.id, effectiveId);
                  if (cov && cov.pointAssessments && Array.isArray(cov.pointAssessments)) {
                    prefilledCoverage[prompt.id] = prefilledCoverage[prompt.id] || {};
                    prefilledCoverage[prompt.id][effectiveId] = cov;
                    promptCoverageReuse++;
                    totalCoverageReused++;
                  }
                } catch {}
              }));
              continue;
            }
          }

          // Generation task (concurrent)
          tasks.push(limit(async () => {
            const fixturePick = fixtures ? pickFixtureValue(fixtures, prompt.id, baseModelId, effectiveId, proposedRunLabel) : null;
            if (fixturePick?.final) {
              const history = [...(prompt.messages as ConversationMessage[]), { role: 'assistant', content: fixturePick.final }];
              promptData.modelResponses[effectiveId] = {
                finalAssistantResponseText: fixturePick.final,
                fullConversationHistory: history,
                hasError: false,
                systemPromptUsed: systemPromptUsed ?? null,
                fixtureUsed: true,
                fixtureSource: 'final',
              } as any;
            } else {
              const res = await generateResponseForPair({
                modelId: baseModelId,
                temperature: (tempValue as number | undefined),
                systemPrompt: systemPromptUsed ?? null,
                messages: prompt.messages as ConversationMessage[],
                useCache,
                genTimeoutMs: options.genTimeoutMs !== undefined ? parseInt(String(options.genTimeoutMs), 10) : undefined,
                genRetries: options.genRetries !== undefined ? parseInt(String(options.genRetries), 10) : undefined,
              });
              promptData.modelResponses[effectiveId] = {
                finalAssistantResponseText: res.text,
                fullConversationHistory: res.history,
                hasError: !!res.hasError,
                errorMessage: res.errorMessage,
                systemPromptUsed: systemPromptUsed ?? null,
              } as any;
            }
            promptGen++;
          }));
        }
      }
    }

    await Promise.all(tasks);

    responseMap.set(prompt.id, promptData);

    logger.info(`Prompt '${prompt.id}': reuse ${promptReuse}, generate ${promptGen}${promptCoverageReuse > 0 ? ` (coverage reuse ${promptCoverageReuse})` : ''}`);
    totalPlannedReuse += promptReuse;
    totalPlannedGenerate += promptGen;
  }

  logger.info(`Totals → reuse: ${totalPlannedReuse}, generate: ${totalPlannedGenerate}${totalCoverageReused > 0 ? ` (coverage reuse total ${totalCoverageReused})` : ''}`);
  logger.info('Exec summary: will regenerate');

  // Execute pipeline with the fully populated map (no new generation required inside)
  const genRetries = options.genRetries !== undefined ? parseInt(String(options.genRetries), 10) : undefined;
  const genTimeoutMs = options.genTimeoutMs !== undefined ? parseInt(String(options.genTimeoutMs), 10) : undefined;

  const runLabel = proposedRunLabel;

  const finalResult = await executeComparisonPipeline(
    targetConfig,
    runLabel,
    chosenMethods,
    logger,
    responseMap,
    undefined,
    useCache,
    undefined,
    options.config,
    undefined,
    undefined,
    { genTimeoutMs, genRetries },
    prefilledCoverage
  );

  logger.info('clone-run finished successfully.');

  // --- Update summaries (per-config always when provider is s3 or UPDATE_LOCAL_SUMMARY=true, optional broader updates) ---
  try {
    if (finalResult && finalResult.data && (process.env.STORAGE_PROVIDER === 's3' || process.env.UPDATE_LOCAL_SUMMARY === 'true')) {
      const cfgId = finalResult.data.configId;
      const existingConfigSummary = await getConfigSummary(cfgId);
      const existingConfigsArray = existingConfigSummary ? [existingConfigSummary] : null;
      const updatedConfigs = updateSummaryDataWithNewRun(existingConfigsArray, finalResult.data as any, finalResult.fileName!);
      await saveConfigSummary(cfgId, updatedConfigs[0]);
      logger.info(`Updated per-config summary for ${cfgId}.`);

      if (options.updateSummaries) {
        logger.info('Rebuilding homepage, latest runs, and model summaries using backfill logic...');
        await actionBackfillSummary({ verbose: false, dryRun: false });
        logger.info('Backfill-based summaries updated.');
      } else {
        logger.info('Skipping homepage/latest runs/model summaries (use --update-summaries to enable).');
      }
    }
  } catch (e: any) {
    logger.warn(`Failed to update per-config summary: ${e.message}`);
  }
}

export const cloneRunCommand = new Command('clone-run')
  .description('Clone an existing run into a new run using a target blueprint, reusing prior responses where inputs match and generating only new pairs.')
  .argument('<runIdentifier>', 'The source run identifier (e.g., "configId/runLabel/timestamp").')
  .option('-c, --config <path>', 'Path to the target blueprint file (.yml, .yaml, or .json).')
  .option('--eval-method <methods>', 'Comma-separated evaluation methods (embedding, llm-coverage, all).')
  .option('--cache', 'Enable caching for model responses during generation of missing pairs.', false)
  .option('--gen-timeout-ms <number>', 'Timeout in milliseconds for each candidate generation API call (default 30000).')
  .option('--gen-retries <number>', 'Number of retries for each candidate generation API call (default 1).')
  .option('--update-summaries', 'Also update summaries (homepage, latest runs, model summaries) like run-config when STORAGE_PROVIDER=s3 or UPDATE_LOCAL_SUMMARY=true.')
  .option('--fixtures <nameOrPath>', 'Optional fixtures for generation of missing pairs. Local path or repo name (not fetched automatically in clone-run).')
  .option('--fixtures-strict', 'Error when a fixture for a prompt×model is missing instead of generating live.', false)
  .action(actionCloneRun);


