import { NextRequest, NextResponse } from 'next/server';
import { checkBackgroundAuth } from '@/lib/background-function-auth';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';
import { addModelsToLatestRun, AddModelsResult } from '@/cli/services/add-models-to-run-service';
import { actionBackfillSummary } from '@/cli/commands/backfill-summary';

const MODEL_ID_RE = /^[A-Za-z0-9-]+:[A-Za-z0-9._\/:-]{1,150}$/;
const CONFIG_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,250}$/;
const MAX_CONFIGS = 300;

/**
 * Adds models to the latest published run of each listed blueprint, reusing
 * every existing response and score so only the added models are asked and
 * judged (see addModelsToLatestRun). Runs on the server, where the model and
 * storage credentials live; triggered by the "Add Models To Runs" workflow.
 *
 * Returns 202 immediately and works through the blueprints one at a time in
 * the background, logging under "add-models:". With rebuildSummaries, it
 * rebuilds the homepage, leaderboards and model summaries once at the end.
 * With rejudge, listed models a run already has are judged again from their
 * saved responses instead of being skipped. With retryFailed, they are asked
 * again on the prompts where their answer failed.
 */
export async function POST(req: NextRequest) {
  const authError = checkBackgroundAuth(req);
  if (authError) return authError;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body.' }, { status: 400 });
  }
  const models: unknown = body?.models;
  const configIds: unknown = body?.configIds;
  const rebuildSummaries = body?.rebuildSummaries === true;
  const rejudge = body?.rejudge === true;
  const retryFailed = body?.retryFailed === true;

  if (!Array.isArray(models) || models.length === 0 || !models.every(m => typeof m === 'string' && MODEL_ID_RE.test(m))) {
    return NextResponse.json({ error: "'models' must be a non-empty list of provider:model IDs." }, { status: 400 });
  }
  if (
    !Array.isArray(configIds) || configIds.length === 0 || configIds.length > MAX_CONFIGS ||
    !configIds.every(c => typeof c === 'string' && CONFIG_ID_RE.test(c))
  ) {
    return NextResponse.json({ error: `'configIds' must be a list of 1-${MAX_CONFIGS} config IDs.` }, { status: 400 });
  }

  const logger = await getLogger('add-models');
  configure({
    errorHandler: (error: Error) => logger.error(`CLI Error: ${error.message}`, error),
    logger: {
      info: (msg: string) => logger.info(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      success: (msg: string) => logger.info(msg),
    },
  });

  void runJob(models as string[], configIds as string[], rebuildSummaries, { rejudge, retryFailed }, logger);

  return NextResponse.json(
    { message: 'Accepted. Progress is logged under "add-models:".', models, configs: configIds.length, rebuildSummaries, rejudge, retryFailed },
    { status: 202 },
  );
}

async function runJob(
  models: string[],
  configIds: string[],
  rebuildSummaries: boolean,
  options: { rejudge: boolean; retryFailed: boolean },
  logger: any,
): Promise<void> {
  const results: AddModelsResult[] = [];
  for (const [i, configId] of configIds.entries()) {
    logger.info(`[AddModels] (${i + 1}/${configIds.length}) ${configId}...`);
    try {
      const result = await addModelsToLatestRun(configId, models, logger, options);
      results.push(result);
      logger.info(`[AddModels] (${i + 1}/${configIds.length}) ${configId}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    } catch (error: any) {
      results.push({ configId, status: 'failed', reason: error?.message || String(error) });
      logger.error(`[AddModels] (${i + 1}/${configIds.length}) ${configId}: failed: ${error?.message || error}`);
    }
  }

  const count = (s: AddModelsResult['status']) => results.filter(r => r.status === s).length;
  logger.info(`[AddModels] Done: ${count('added')} added, ${count('skipped')} skipped, ${count('failed')} failed.`);
  for (const r of results.filter(r => r.status === 'failed')) logger.warn(`[AddModels] Failed: ${r.configId}: ${r.reason}`);

  if (rebuildSummaries && count('added') > 0) {
    try {
      logger.info('[AddModels] Rebuilding homepage, leaderboards and model summaries...');
      await actionBackfillSummary({ verbose: false, dryRun: false });
      logger.info('[AddModels] Summaries rebuilt.');
    } catch (error: any) {
      logger.error(`[AddModels] Summary rebuild failed: ${error?.message || error}`);
    }
  }
}
