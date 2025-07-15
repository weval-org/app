import { Command } from 'commander';
import { getConfig } from '../config';
import {
    listConfigIds,
    listRunsForConfig,
    getResultByFileName,
    saveSearchIndex,
    updateSummaryDataWithNewRun,
} from '../../lib/storageService';
import { WevalResult } from '@/types/shared';
import { SearchableBlueprintSummary } from '../types/cli_types';
import { processBlueprintSummaries } from '../../app/utils/blueprintSummaryUtils';

async function actionGenerateSearchIndex(options: {
    verbose?: boolean;
    dryRun?: boolean;
}) {
    const { logger } = getConfig();
    logger.info('Starting search index generation process...');
    if (options.dryRun) {
        logger.warn('--- DRY RUN MODE --- No file will be written.');
    }

    try {
        const configIds = await listConfigIds();
        if (!configIds || configIds.length === 0) {
            logger.warn('No configuration IDs found. Nothing to index.');
            return;
        }

        logger.info(`Found ${configIds.length} configuration ID(s) to process.`);
        
        const pLimit = (await import('p-limit')).default;
        const limit = pLimit(10);
        const tasks: Promise<SearchableBlueprintSummary | null>[] = [];
        let runCount = 0;

        for (const configId of configIds) {
            const runs = await listRunsForConfig(configId);
            runCount += runs.length;

            if (runs.length === 0) {
                if (options.verbose) logger.info(`  No runs found for config ${configId}, skipping.`);
                continue;
            }

            // Only process the latest run for each config
            const latestRunInfo = runs[0];

            if (!latestRunInfo.timestamp) {
                logger.warn(`  Skipping latest run in config ${configId} with label ${latestRunInfo.runLabel} due to missing timestamp.`);
                continue;
            }

            console.log(`DEBUG: About to push task for ${configId} - ${latestRunInfo.fileName}`);
            tasks.push(limit(async () => {
                if (options.verbose) logger.info(`  Processing latest run file: ${latestRunInfo.fileName}`);
                
                const resultData = await getResultByFileName(configId, latestRunInfo.fileName) as WevalResult;
                if (!resultData) {
                    logger.warn(`  Could not fetch result data for run file: ${latestRunInfo.fileName}`);
                    return null;
                }
                
                if (latestRunInfo.timestamp) {
                    resultData.timestamp = latestRunInfo.timestamp;
                }

                // 1. Create the EnhancedComparisonConfigInfo needed for processing
                const configSummaryArray = updateSummaryDataWithNewRun([], resultData, latestRunInfo.fileName);
                
                console.log('DEBUG: configSummaryArray inside task', JSON.stringify(configSummaryArray, null, 2));

                // 2. Process it to get the rich BlueprintSummaryInfo
                const blueprintSummary = processBlueprintSummaries(configSummaryArray)[0];

                console.log('DEBUG: blueprintSummary inside task', JSON.stringify(blueprintSummary, null, 2));
                
                if (!blueprintSummary) {
                    logger.warn(`  Failed to process blueprint summary for ${latestRunInfo.fileName}`);
                    return null;
                }

                // 3. Create the searchable text
                const searchText = [
                    resultData.configTitle,
                    resultData.config?.description || '',
                    ...(resultData.config?.tags || []),
                    resultData.executiveSummary?.content || '',
                ].join(' ').trim().replace(/\s+/g, ' ');

                // 4. Combine into the final search document
                return {
                    ...blueprintSummary,
                    searchText,
                };
            }));
        }

        const allDocs = (await Promise.all(tasks)).filter((doc): doc is SearchableBlueprintSummary => doc !== null);
        
        logger.info(`Successfully processed ${allDocs.length} latest runs from a total of ${runCount} runs found across all configs.`);

        if (options.dryRun) {
            if (allDocs.length > 0) {
                logger.info(`[DRY RUN] Would save a search index with ${allDocs.length} documents.`);
                logger.info(`[DRY RUN] First document example: ${JSON.stringify(allDocs[0], null, 2)}`);
            } else {
                logger.info(`[DRY RUN] No documents to save.`);
            }
        } else {
            if (allDocs.length > 0) {
                const fileSizeInBytes = await saveSearchIndex(allDocs);
                const fileSizeInKB = (fileSizeInBytes / 1024).toFixed(2);
                logger.success(`Successfully generated and saved search index with ${allDocs.length} documents.`);
                logger.info(`Generated file size: ${fileSizeInKB} KB`);
            } else {
                logger.info('No documents to generate. Search index not saved.');
            }
        }

        logger.info('--- Search Index Generation Complete ---');

    } catch (error: any) {
        logger.error(`An error occurred during the index generation process: ${error.message}`);
        if (error.stack) {
            logger.error(error.stack);
        }
    }
}

export const generateSearchIndexCommand = new Command('generate-search-index')
    .description('Generates a search index from all existing evaluation runs.')
    .option('-v, --verbose', 'Enable verbose logging for detailed processing steps.')
    .option('--dry-run', 'Log what would be generated without saving the index file.')
    .action(actionGenerateSearchIndex); 