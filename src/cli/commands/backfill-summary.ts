import { Command } from 'commander';
import { getConfig } from '../config';
import {
    listConfigIds,
    listRunsForConfig,
    getResultByFileName,
    saveHomepageSummary,
    updateSummaryDataWithNewRun,
} from '../../lib/storageService';
import { EnhancedComparisonConfigInfo } from '../../app/utils/homepageDataUtils';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';

async function actionBackfillSummary(options: { verbose?: boolean }) {
    const { logger } = getConfig();
    logger.info('Starting homepage summary backfill process...');

    let comprehensiveSummary: EnhancedComparisonConfigInfo[] = [];
    let totalConfigsProcessed = 0;
    let totalRunsProcessed = 0;
    let totalRunsFailed = 0;

    try {
        const configIds = await listConfigIds();
        if (!configIds || configIds.length === 0) {
            logger.warn('No configuration IDs found. Nothing to backfill.');
            return;
        }

        logger.info(`Found ${configIds.length} configuration IDs to process.`);

        for (const configId of configIds) {
            if (options.verbose) {
                logger.info(`Processing config ID: ${configId}`);
            }
            const runs = await listRunsForConfig(configId);
            if (!runs || runs.length === 0) {
                if (options.verbose) {
                    logger.info(`No runs found for config ID: ${configId}`);
                }
                continue;
            }

            totalConfigsProcessed++;
            if (options.verbose) {
                logger.info(`Found ${runs.length} runs for config ID: ${configId}`);
            }

            for (const runInfo of runs) {
                const runFileName = runInfo.fileName;
                if (options.verbose) {
                    logger.info(`  Processing run file: ${runFileName} for config ${configId}`);
                }
                try {
                    const resultData = await getResultByFileName(configId, runFileName) as FetchedComparisonData;
                    if (resultData) {
                        // Validate essential fields for updateSummaryDataWithNewRun
                        if (!resultData.configId || !resultData.runLabel || !resultData.timestamp) {
                            logger.warn(`  Skipping run file ${runFileName} for config ${configId} due to missing essential fields (configId, runLabel, or timestamp) in its content.`);
                            totalRunsFailed++;
                            continue;
                        }
                        comprehensiveSummary = updateSummaryDataWithNewRun(comprehensiveSummary, resultData, runFileName);
                        totalRunsProcessed++;
                    } else {
                        logger.warn(`  Could not fetch or parse result data for run file: ${runFileName} for config ${configId}`);
                        totalRunsFailed++;
                    }
                } catch (error: any) {
                    logger.error(`  Error processing run file ${runFileName} for config ${configId}: ${error.message}`);
                    totalRunsFailed++;
                }
            }
        }

        if (comprehensiveSummary.length > 0) {
            logger.info('Backfill data compiled. Saving comprehensive homepage summary...');
            await saveHomepageSummary(comprehensiveSummary);
            logger.info('Comprehensive homepage summary saved successfully.');
        } else {
            logger.warn('No data was compiled for the summary. Summary file not saved.');
        }

        logger.info('--- Backfill Summary ---');
        logger.info(`Total Configuration IDs found: ${configIds.length}`);
        logger.info(`Configuration IDs processed (with runs): ${totalConfigsProcessed}`);
        logger.info(`Total run files processed successfully: ${totalRunsProcessed}`);
        logger.info(`Total run files failed to process: ${totalRunsFailed}`);
        logger.info('------------------------');

    } catch (error: any) {
        logger.error(`An error occurred during the backfill process: ${error.message}`);
        if (error.stack) {
            logger.error(error.stack);
        }
    }
}

export const backfillSummaryCommand = new Command('backfill-summary')
    .description('Rebuilds the homepage_summary.json by processing all existing evaluation results from storage.')
    .option('-v, --verbose', 'Enable verbose logging for detailed processing steps.')
    .action(actionBackfillSummary); 