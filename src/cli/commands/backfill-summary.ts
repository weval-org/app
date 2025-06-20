import { Command } from 'commander';
import { getConfig } from '../config';
import {
    listConfigIds,
    listRunsForConfig,
    getResultByFileName,
    saveHomepageSummary,
    updateSummaryDataWithNewRun,
    HomepageSummaryFileContent,
    saveConfigSummary
} from '../../lib/storageService';
import { EnhancedComparisonConfigInfo } from '../../app/utils/homepageDataUtils';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';
import {
    calculateHeadlineStats,
    calculatePotentialModelDrift
} from '../utils/summaryCalculationUtils';

async function actionBackfillSummary(options: { verbose?: boolean }) {
    const { logger } = getConfig();
    logger.info('Starting homepage summary backfill process (v2 with per-config summaries)...');

    let allFeaturedConfigsForHomepage: EnhancedComparisonConfigInfo[] = [];
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
            const runs = await listRunsForConfig(configId);
            if (runs.length === 0) {
                if (options.verbose) logger.info(`- No runs found for config ${configId}, skipping.`);
                continue;
            }
            totalConfigsProcessed++;
            logger.info(`Processing ${runs.length} runs for config: ${configId}...`);
            
            let runsForThisConfig: EnhancedComparisonConfigInfo[] = [];

            for (const runInfo of runs) {
                const runFileName = runInfo.fileName;
                if (options.verbose) {
                    logger.info(`  Processing run file: ${runFileName}`);
                }
                try {
                    const resultData = await getResultByFileName(configId, runFileName) as FetchedComparisonData;
                    if (resultData) {
                        if (runInfo.timestamp) {
                            resultData.timestamp = runInfo.timestamp;
                        }
                        if (!resultData.configId || !resultData.runLabel || !resultData.timestamp) {
                            logger.warn(`  Skipping run file ${runFileName} due to missing essential fields (configId, runLabel, or timestamp).`);
                            totalRunsFailed++;
                            continue;
                        }
                        // Iteratively build up the summary object for this specific config
                        runsForThisConfig = updateSummaryDataWithNewRun(runsForThisConfig, resultData, runFileName);
                        totalRunsProcessed++;
                    } else {
                        logger.warn(`  Could not fetch or parse result data for run file: ${runFileName}`);
                        totalRunsFailed++;
                    }
                } catch (error: any) {
                    logger.error(`  Error processing run file ${runFileName}: ${error.message}`);
                    totalRunsFailed++;
                }
            }

            // After processing all runs for a config, save its specific summary
            if (runsForThisConfig.length > 0) {
                const finalConfigSummary = runsForThisConfig[0];
                logger.info(`Saving per-config summary for ${configId}...`);
                await saveConfigSummary(configId, finalConfigSummary);

                // If it's featured, add it to the list for the main homepage summary
                if (finalConfigSummary.tags?.includes('_featured')) {
                    allFeaturedConfigsForHomepage.push(finalConfigSummary);
                    if(options.verbose) logger.info(` -> Config ${configId} is featured. Adding to homepage summary list.`);
                }
            }
        }

        // Now, build and save the main homepage summary from the collected featured configs
        if (allFeaturedConfigsForHomepage.length > 0) {
            logger.info(`Backfill data compiled for homepage. Found ${allFeaturedConfigsForHomepage.length} featured configs.`);
            logger.info(`Calculating headline statistics and drift detection...`);
            
            const headlineStats = calculateHeadlineStats(allFeaturedConfigsForHomepage);
            const driftDetectionResult = calculatePotentialModelDrift(allFeaturedConfigsForHomepage);

            const finalHomepageSummaryObject: HomepageSummaryFileContent = {
                configs: allFeaturedConfigsForHomepage,
                headlineStats: headlineStats,
                driftDetectionResult: driftDetectionResult,
                lastUpdated: new Date().toISOString(),
            };

            logger.info('Saving comprehensive homepage summary with new stats...');
            await saveHomepageSummary(finalHomepageSummaryObject);
            logger.info('Comprehensive homepage summary saved successfully.');
        } else {
            logger.warn('No featured configs found. Homepage summary file will be empty or not saved.');
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
    .description('Rebuilds all summary files. Creates a summary.json for each config and a homepage_summary.json for featured configs.')
    .option('-v, --verbose', 'Enable verbose logging for detailed processing steps.')
    .action(actionBackfillSummary); 