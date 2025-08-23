import { Command } from 'commander';
import { getConfig } from '../config';
import { listConfigIds, listRunsForConfig, getResultByFileName, saveResult } from '../../lib/storageService';
import { WevalResult } from '@/types/shared';
import { generateArticle } from '../services/article-service';

async function actionBackfillArticle(
  runIdentifier: string | undefined,
  options: {
    verbose?: boolean;
    configId?: string;
    runLabel?: string;
    timestamp?: string;
    dryRun?: boolean;
    overwrite?: boolean;
    latestOnly?: boolean;
  }
) {
  const { logger } = getConfig();
  logger.info('Starting Article backfill process...');
  if (options.dryRun) {
    logger.warn('--- DRY RUN MODE --- No files will be written.');
  }

  let effective = { ...options };

  if (runIdentifier) {
    const parts = runIdentifier.split('/');
    if (parts.length !== 3) {
      logger.error('Invalid run identifier format. Expected "configId/runLabel/timestamp".');
      return;
    }
    const [configId, runLabel, timestamp] = parts;
    if (options.configId || options.runLabel || options.timestamp) {
      logger.warn('A run identifier was provided, so --config-id, --run-label, and --timestamp flags will be ignored.');
    }
    effective = { ...options, configId, runLabel, timestamp };
  }

  if (effective.timestamp && (!effective.configId || !effective.runLabel)) {
    logger.error('When using --timestamp, you must also provide --config-id and --run-label.');
    return;
  }

  try {
    const configIds = effective.configId ? [effective.configId] : await listConfigIds();
    if (!configIds || configIds.length === 0) {
      logger.warn('No configuration IDs found. Nothing to backfill.');
      return;
    }

    logger.info(`Found ${configIds.length} configuration ID(s) to process.`);
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(10);
    const tasks: Promise<void>[] = [];

    for (const configId of configIds) {
      let runs = await listRunsForConfig(configId);
      if (effective.runLabel) runs = runs.filter(r => r.runLabel === effective.runLabel);
      if (effective.timestamp) runs = runs.filter(r => r.timestamp === effective.timestamp);
      if (options.latestOnly && runs.length > 0) runs = [runs[0]];
      if (runs.length === 0) {
        if (options.verbose) logger.info(`- No matching runs found for config ${configId}, skipping.`);
        continue;
      }
      logger.info(`Processing ${runs.length} runs for config: ${configId}...`);

      for (const runInfo of runs) {
        tasks.push(limit(async () => {
          const runFileName = runInfo.fileName;
          if (options.verbose) logger.info(`  Processing run file: ${runFileName}`);

          const resultData = await getResultByFileName(configId, runFileName) as WevalResult;
          if (!resultData) {
            logger.warn(`  Could not fetch result data for run file: ${runFileName}`);
            return;
          }

          if (resultData.article && !options.overwrite) {
            if (options.latestOnly) {
              logger.info(`  Skipping latest run for ${configId}: Article already exists.`);
            } else if (options.verbose) {
              logger.info(`  Skipping ${runFileName}: article already exists.`);
            }
            return;
          }

          try {
            if (options.latestOnly) {
              if (resultData.article && options.overwrite) {
                logger.info(`  Processing latest run for ${configId}: Overwriting existing article.`);
              } else {
                logger.info(`  Processing latest run for ${configId}: Generating new article.`);
              }
            } else {
              logger.info(`  Generating article for ${runFileName}...`);
            }

            const article = await generateArticle(resultData, logger);
            if ('error' in article) throw new Error(article.error);

            resultData.article = article;
            if (options.dryRun) {
              logger.info(`[DRY RUN] Would save article for ${runFileName}. Title: "${article.title}"`);
            } else {
              await saveResult(configId, runFileName, resultData);
              logger.success(`  Successfully generated and saved article for ${runFileName}.`);
            }
          } catch (e: any) {
            logger.error(`  Error processing run file ${runFileName}: ${e.message}`);
          }
        }));
      }
    }
    await Promise.all(tasks);
    logger.info('--- Article Backfill Complete ---');
  } catch (e: any) {
    const { logger } = getConfig();
    logger.error(`An error occurred during the article backfill process: ${e.message}`);
    if (e.stack) logger.error(e.stack);
  }
}

export const backfillArticleCommand = new Command('backfill-article')
  .description('Backfills a data-journalism article for existing evaluation runs.')
  .argument('[runIdentifier]', 'Optional. A specific run to backfill, in "configId/runLabel/timestamp" format.')
  .option('-v, --verbose', 'Enable verbose logging for detailed processing steps.')
  .option('--config-id <id>', 'Only backfill for a specific configuration ID. Ignored if runIdentifier is provided.')
  .option('--run-label <label>', 'Only backfill for a specific run label. Ignored if runIdentifier is provided.')
  .option('--timestamp <timestamp>', 'Only backfill for a specific run timestamp. Requires --config-id and --run-label. Ignored if runIdentifier is provided.')
  .option('--dry-run', 'Log what would be changed without saving files.')
  .option('--overwrite', 'Overwrite existing articles.')
  .option('--latest-only', 'Only process the latest run for each configuration.')
  .action(actionBackfillArticle);


