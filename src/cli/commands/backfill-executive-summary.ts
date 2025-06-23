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

const SUMMARIZER_MODEL_ID = 'openrouter:google/gemini-2.5-flash-preview-05-20';

async function actionBackfillExecutiveSummary(options: {
    verbose?: boolean;
    configId?: string;
    runLabel?: string;
    timestamp?: string;
    dryRun?: boolean;
    overwrite?: boolean;
}) {
    const { logger } = getConfig();
    logger.info('Starting Executive Summary backfill process...');
    if (options.dryRun) {
        logger.warn('--- DRY RUN MODE --- No files will be written.');
    }

    if (options.timestamp && (!options.configId || !options.runLabel)) {
        logger.error('When using --timestamp, you must also provide --config-id and --run-label.');
        return;
    }

    try {
        const configIds = options.configId ? [options.configId] : await listConfigIds();
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
            if (options.runLabel) {
                runs = runs.filter(run => run.runLabel === options.runLabel);
            }
            if (options.timestamp) {
                runs = runs.filter(run => run.timestamp === options.timestamp);
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

                    if (resultData.executiveSummary && !options.overwrite) {
                        if (options.verbose) logger.info(`  Skipping ${runFileName}: summary already exists.`);
                        return;
                    }

                    try {
                        logger.info(`  Generating summary for ${runFileName}...`);
                        
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
    .option('-v, --verbose', 'Enable verbose logging for detailed processing steps.')
    .option('--config-id <id>', 'Only backfill for a specific configuration ID.')
    .option('--run-label <label>', 'Only backfill for a specific run label.')
    .option('--timestamp <timestamp>', 'Only backfill for a specific run timestamp. Requires --config-id and --run-label.')
    .option('--dry-run', 'Log what would be changed without saving files.')
    .option('--overwrite', 'Overwrite existing executive summaries.')
    .action(actionBackfillExecutiveSummary); 