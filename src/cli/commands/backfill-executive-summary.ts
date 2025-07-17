import { Command } from 'commander';
import { getConfig } from '../config';
import {
    listConfigIds,
    listRunsForConfig,
    getResultByFileName,
    saveResult,
} from '../../lib/storageService';
import { WevalResult } from '@/types/shared';
import { generateExecutiveSummary } from '../services/executive-summary-service';

const SUMMARIZER_MODEL_ID = 'openrouter:google/gemini-2.5-flash';

async function actionBackfillExecutiveSummary(
    runIdentifier: string | undefined,
    options: {
    verbose?: boolean;
    configId?: string;
    runLabel?: string;
    timestamp?: string;
    dryRun?: boolean;
    overwrite?: boolean;
    latestOnly?: boolean;
}) {
    const { logger } = getConfig();
    logger.info('Starting Executive Summary backfill process...');
    if (options.dryRun) {
        logger.warn('--- DRY RUN MODE --- No files will be written.');
    }
    
    let effectiveOptions = { ...options };

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

        effectiveOptions = { ...options, configId, runLabel, timestamp };
    }


    if (effectiveOptions.timestamp && (!effectiveOptions.configId || !effectiveOptions.runLabel)) {
        logger.error('When using --timestamp, you must also provide --config-id and --run-label.');
        return;
    }

    try {
        const configIds = effectiveOptions.configId ? [effectiveOptions.configId] : await listConfigIds();
        if (!configIds || configIds.length === 0) {
            logger.warn('No configuration IDs found. Nothing to backfill.');
            return;
        }

        logger.info(`Found ${configIds.length} configuration ID(s) to process.`);
        const pLimit = (await import('p-limit')).default;
        const limit = pLimit(5); // Limit concurrency to avoid overwhelming services
        const tasks: Promise<void>[] = [];

        for (const configId of configIds) {
            let runs = await listRunsForConfig(configId);
            if (effectiveOptions.runLabel) {
                runs = runs.filter(run => run.runLabel === effectiveOptions.runLabel);
            }
            if (effectiveOptions.timestamp) {
                runs = runs.filter(run => run.timestamp === effectiveOptions.timestamp);
            }

            // If latest-only is specified, only take the most recent run from the (potentially filtered) list
            if (options.latestOnly && runs.length > 0) {
                runs = [runs[0]];
            }

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

                    // If a summary exists in the new *structured* format, skip unless --overwrite is used.
                    // This allows overwriting old string-based or unstructured object summaries by default.
                    const summaryIsStructured = resultData.executiveSummary &&
                                                  typeof resultData.executiveSummary === 'object' &&
                                                  (resultData.executiveSummary as any).isStructured === true;

                    if (summaryIsStructured && !options.overwrite) {
                        if (options.latestOnly) {
                            logger.info(`  Skipping latest run for ${configId}: Structured executive summary already exists.`);
                        } else if (options.verbose) {
                            logger.info(`  Skipping ${runFileName}: summary already exists in the structured format.`);
                        }
                        return;
                    }

                    try {
                        if (options.latestOnly) {
                            if (summaryIsStructured && options.overwrite) {
                                logger.info(`  Processing latest run for ${configId}: Overwriting existing structured executive summary.`);
                            } else {
                                logger.info(`  Processing latest run for ${configId}: Generating new executive summary.`);
                            }
                        } else {
                            logger.info(`  Generating summary for ${runFileName}...`);
                        }
                        
                        const summaryResult = await generateExecutiveSummary(resultData, logger);

                        if ('error' in summaryResult) {
                            throw new Error(summaryResult.error);
                        }

                        resultData.executiveSummary = summaryResult;

                        if (options.dryRun) {
                            logger.info(`[DRY RUN] Would save summary for ${runFileName}. Summary starts with: "${summaryResult.content.substring(0, 100)}..."`);
                        } else {
                            await saveResult(configId, runFileName, resultData);
                            logger.success(`  Successfully generated and saved summary for ${runFileName}.`);
                        }

                    } catch (error: any) {
                        logger.error(`  Error processing run file ${runFileName}: ${error.message}`);
                    }
                }));
            }
        }
        await Promise.all(tasks);
        logger.info('--- Executive Summary Backfill Complete ---');

    } catch (error: any) {
        logger.error(`An error occurred during the backfill process: ${error.message}`);
        if (error.stack) {
            logger.error(error.stack);
        }
    }
}

export const backfillExecutiveSummaryCommand = new Command('backfill-executive-summary')
    .description('Backfills the executive summary for existing evaluation runs.')
    .argument('[runIdentifier]', 'Optional. A specific run to backfill, in "configId/runLabel/timestamp" format.')
    .option('-v, --verbose', 'Enable verbose logging for detailed processing steps.')
    .option('--config-id <id>', 'Only backfill for a specific configuration ID. Ignored if runIdentifier is provided.')
    .option('--run-label <label>', 'Only backfill for a specific run label. Ignored if runIdentifier is provided.')
    .option('--timestamp <timestamp>', 'Only backfill for a specific run timestamp. Requires --config-id and --run-label. Ignored if runIdentifier is provided.')
    .option('--dry-run', 'Log what would be changed without saving files.')
    .option('--overwrite', 'Overwrite existing executive summaries.')
    .option('--latest-only', 'Only process the latest run for each configuration.')
    .action(actionBackfillExecutiveSummary); 