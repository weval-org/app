import { NextRequest, NextResponse } from 'next/server';
import { checkBackgroundAuth } from '@/lib/background-function-auth';
import { configure } from '@/cli/config';
import { getLogger } from '@/utils/logger';
import { archiveAndDeleteRun, listRunsForConfig } from '@/lib/storageService';
import { actionBackfillSummary } from '@/cli/commands/backfill-summary';
import { toSafeTimestamp } from '@/lib/timestampUtils';

const CONFIG_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,250}$/;
const FILE_NAME_RE = /^[A-Za-z0-9._-]+_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?Z_comparison\.json$/;
const MAX_RUNS = 50;

interface RunRef { configId: string; fileName: string }

/**
 * Removes specific published runs (e.g. ones whose judging failed), copying
 * each to archive/deleted-runs/<timestamp>/ first so it can be put back (see
 * archiveAndDeleteRun). Runs on the server, where the storage credentials
 * live; triggered by the "Delete Runs" workflow.
 *
 * Every run is checked before anything is touched: it must exist, and it must
 * not be its blueprint's latest run, so a blueprint always keeps the run its
 * pages and leaderboards are built from. dryRun defaults to true and only
 * reports what would be removed (200). A real run answers 202 and works in the
 * background, logging under "delete-runs:"; with rebuildSummaries it then
 * rebuilds the homepage, leaderboards and model summaries so the removed runs
 * drop out of them.
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
  const runs: unknown = body?.runs;
  const dryRun = body?.dryRun !== false;
  const rebuildSummaries = body?.rebuildSummaries === true;

  if (
    !Array.isArray(runs) || runs.length === 0 || runs.length > MAX_RUNS ||
    !runs.every(r => typeof r?.configId === 'string' && CONFIG_ID_RE.test(r.configId) &&
      typeof r?.fileName === 'string' && FILE_NAME_RE.test(r.fileName))
  ) {
    return NextResponse.json(
      { error: `'runs' must be a list of 1-${MAX_RUNS} { configId, fileName } entries naming *_comparison.json run files.` },
      { status: 400 },
    );
  }
  const refs = runs as RunRef[];

  const problems: string[] = [];
  const byConfig = new Map<string, string[]>();
  for (const { configId, fileName } of refs) {
    const listed = byConfig.get(configId) || [];
    if (listed.includes(fileName)) problems.push(`${configId}/${fileName}: listed twice`);
    byConfig.set(configId, [...listed, fileName]);
  }
  for (const [configId, fileNames] of byConfig) {
    const existing = await listRunsForConfig(configId);
    const latest = existing[0]?.fileName;
    for (const fileName of fileNames) {
      if (!existing.some(r => r.fileName === fileName)) problems.push(`${configId}/${fileName}: no such run`);
      else if (fileName === latest) problems.push(`${configId}/${fileName}: is the latest run of ${configId}; refusing to delete it`);
    }
  }
  if (problems.length > 0) {
    return NextResponse.json({ error: 'Nothing was deleted.', problems }, { status: 400 });
  }

  const archiveName = toSafeTimestamp(new Date().toISOString());

  if (dryRun) {
    const plan = [];
    for (const { configId, fileName } of refs) {
      const { keys } = await archiveAndDeleteRun(configId, fileName, archiveName, true);
      plan.push({ configId, fileName, objects: keys.length });
    }
    return NextResponse.json({ dryRun: true, message: 'Nothing was deleted.', runs: plan });
  }

  const logger = await getLogger('delete-runs');
  configure({
    errorHandler: (error: Error) => logger.error(`CLI Error: ${error.message}`, error),
    logger: {
      info: (msg: string) => logger.info(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      success: (msg: string) => logger.info(msg),
    },
  });

  void runJob(refs, archiveName, rebuildSummaries, logger);

  return NextResponse.json(
    { message: 'Accepted. Progress is logged under "delete-runs:".', runs: refs.length, archiveName, rebuildSummaries },
    { status: 202 },
  );
}

async function runJob(refs: RunRef[], archiveName: string, rebuildSummaries: boolean, logger: any): Promise<void> {
  let deleted = 0;
  for (const [i, { configId, fileName }] of refs.entries()) {
    const label = `(${i + 1}/${refs.length}) ${configId}/${fileName}`;
    try {
      const { keys, archivePrefix } = await archiveAndDeleteRun(configId, fileName, archiveName, false);
      deleted++;
      logger.info(`[DeleteRuns] ${label}: deleted ${keys.length} objects (copies in ${archivePrefix}).`);
    } catch (error: any) {
      logger.error(`[DeleteRuns] ${label}: failed, run left in place: ${error?.message || error}`);
    }
  }
  logger.info(`[DeleteRuns] Done: ${deleted} of ${refs.length} runs deleted.`);

  if (rebuildSummaries) {
    try {
      logger.info('[DeleteRuns] Rebuilding homepage, leaderboards and model summaries...');
      await actionBackfillSummary({ verbose: false, dryRun: false });
      logger.info('[DeleteRuns] Summaries rebuilt.');
    } catch (error: any) {
      logger.error(`[DeleteRuns] Summary rebuild failed: ${error?.message || error}`);
    }
  }
}
