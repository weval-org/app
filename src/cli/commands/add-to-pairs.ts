import { Command } from 'commander';
import { getConfig } from '../config';
import { listRunsForConfig, getResultByFileName } from '../../lib/storageService';
import { populatePairwiseQueue } from '../services/pairwise-task-queue-service';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';

async function actionAddToPairs(options: { configId: string, siteId?: string, verbose?: boolean }) {
    const { logger } = getConfig();
    logger.info(`Starting to add pairs for config ID: ${options.configId}`);

    try {
        const runs = await listRunsForConfig(options.configId);
        if (runs.length === 0) {
            logger.warn(`No runs found for config ${options.configId}. Nothing to do.`);
            return;
        }

        const latestRun = runs[0]; // listRunsForConfig returns sorted by newest first
        logger.info(`Found latest run: ${latestRun.fileName}`);

        const resultData = await getResultByFileName(options.configId, latestRun.fileName) as FetchedComparisonData;
        if (!resultData) {
            logger.error(`Could not fetch result data for file: ${latestRun.fileName}`);
            process.exit(1);
        }

        logger.info(`Populating pairwise queue for latest run of config: ${options.configId}`);
        await populatePairwiseQueue(resultData, {logger, siteId: options.siteId});
        logger.info(`Successfully finished populating queue for ${options.configId}.`);

    } catch (error: any) {
        logger.error(`An error occurred while adding pairs for config ${options.configId}: ${error.message}`);
        if (options.verbose && error.stack) {
            logger.error(error.stack);
        }
        process.exit(1);
    }
}

export const addToPairsCommand = new Command('add-to-pairs')
    .description("Manually populates the pairwise task queue from a config's latest run.")
    .requiredOption('-c, --config-id <id>', 'The configuration ID to process.')
    .option('-s, --site-id <siteId>', 'Optional Netlify site ID to use for blob storage.')
    .option('-v, --verbose', 'Enable verbose logging for detailed processing steps.')
    .action(actionAddToPairs); 