import { Command } from 'commander';
import { getConfig } from '../config';
import {
    listConfigIds,
    listRunsForConfig,
    getResultByFileName,
    saveResult, // Corrected import name
} from '../../lib/storageService';
import { FinalComparisonOutputV2 } from '../types/cli_types';
import { ConversationMessage } from '@/types/shared';

type Logger = ReturnType<typeof getConfig>['logger'];

async function actionBackfillPromptContexts(options: { dryRun?: boolean, verbose?: boolean }) {
    const { logger } = getConfig();
    logger.info(`Starting prompt contexts backfill process... ${options.dryRun ? '(DRY RUN)' : ''}`);

    let totalConfigsProcessed = 0;
    let totalRunsScanned = 0;
    let totalRunsModified = 0;
    let totalRunsFailedToProcess = 0;

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
                    logger.info(`  No runs found for config ID: ${configId}. Skipping.`);
                }
                continue;
            }

            totalConfigsProcessed++;
            if (options.verbose) {
                logger.info(`  Found ${runs.length} runs for config ID: ${configId}.`);
            }

            for (const runInfo of runs) {
                const runFileName = runInfo.fileName;
                totalRunsScanned++;
                if (options.verbose) {
                    logger.info(`  Scanning run file: ${runFileName} for config ${configId}`);
                }

                try {
                    const rawData = await getResultByFileName(configId, runFileName);
                    if (!rawData) {
                        logger.warn(`    Could not fetch data for ${runFileName}. Skipping.`);
                        totalRunsFailedToProcess++;
                        continue;
                    }

                    const data: any = rawData; // Use 'any' to handle potentially legacy fields
                    let modified = false;

                    // 1. Backfill promptContexts from promptTexts
                    if (data.promptTexts && !data.promptContexts) {
                        logger.info(`    [${configId}/${runFileName}]: Found legacy 'promptTexts'. Converting to 'promptContexts'.`);
                        data.promptContexts = {};
                        for (const pId in data.promptTexts) {
                            if (Object.prototype.hasOwnProperty.call(data.promptTexts, pId)) {
                                const text = data.promptTexts[pId];
                                if (typeof text === 'string') {
                                    data.promptContexts[pId] = [{ role: 'user', content: text }];
                                } else {
                                    logger.warn(`    [${configId}/${runFileName}]: promptTexts['${pId}'] is not a string. Skipping this prompt context conversion.`);
                                }
                            }
                        }
                        delete data.promptTexts;
                        modified = true;
                    } else if (data.promptTexts && data.promptContexts) {
                         logger.info(`    [${configId}/${runFileName}]: Both 'promptTexts' and 'promptContexts' exist. Assuming 'promptContexts' is canonical. Removing 'promptTexts'.`);
                         delete data.promptTexts;
                         modified = true;
                    }

                    // 2. Backfill allFinalAssistantResponses and fullConversationHistories from allResponses
                    if (data.allResponses && (!data.allFinalAssistantResponses || !data.fullConversationHistories)) {
                        logger.info(`    [${configId}/${runFileName}]: Found legacy 'allResponses'. Converting to 'allFinalAssistantResponses' and 'fullConversationHistories'.`);
                        data.allFinalAssistantResponses = {};
                        data.fullConversationHistories = {};

                        for (const pId in data.allResponses) {
                            if (Object.prototype.hasOwnProperty.call(data.allResponses, pId)) {
                                data.allFinalAssistantResponses[pId] = {};
                                data.fullConversationHistories[pId] = {};
                                const promptSpecificResponses = data.allResponses[pId];
                                
                                // Try to get initial messages from already converted/existing promptContexts
                                let initialMessages: ConversationMessage[] = [];
                                const promptContextForHistory = data.promptContexts?.[pId];
                                if (Array.isArray(promptContextForHistory) && promptContextForHistory.length > 0) {
                                    initialMessages = promptContextForHistory;
                                } else if (typeof promptContextForHistory === 'string') { // Should ideally not happen if promptTexts conversion ran
                                    initialMessages = [{ role: 'user', content: promptContextForHistory }];
                                    logger.warn(`    [${configId}/${runFileName}]: promptContexts['${pId}'] was a string during history creation. This might be unexpected.`);
                                } else {
                                    logger.warn(`    [${configId}/${runFileName}]: Missing or invalid promptContexts['${pId}'] while creating fullConversationHistories. History might be incomplete for this prompt.`);
                                    // Create a placeholder if absolutely no context, so the structure doesn't break
                                    initialMessages = [{role: 'user', content: data.promptTexts?.[pId] || 'Unknown prompt content - backfill error'}];
                                }

                                for (const modelId in promptSpecificResponses) {
                                    if (Object.prototype.hasOwnProperty.call(promptSpecificResponses, modelId)) {
                                        const assistantResponseText = promptSpecificResponses[modelId];
                                        data.allFinalAssistantResponses[pId][modelId] = assistantResponseText;
                                        
                                        data.fullConversationHistories[pId][modelId] = [
                                            ...initialMessages,
                                            { role: 'assistant', content: assistantResponseText }
                                        ];
                                    }
                                }
                            }
                        }
                        delete data.allResponses;
                        modified = true;
                    } else if (data.allResponses && data.allFinalAssistantResponses && data.fullConversationHistories) {
                        logger.info(`    [${configId}/${runFileName}]: Found 'allResponses' and new response/history fields. Assuming new fields are canonical. Removing 'allResponses'.`);
                        delete data.allResponses;
                        modified = true;
                    }

                    if (modified) {
                        if (options.dryRun) {
                            logger.info(`    DRY RUN: Would modify and save ${runFileName}.`);
                        } else {
                            logger.info(`    Saving modified ${runFileName}...`);
                            // At this point, 'data' should conform to FinalComparisonOutputV2 / ComparisonDataV2
                            await saveResult(configId, runFileName, data as FinalComparisonOutputV2);
                            logger.info(`    Successfully saved ${runFileName}.`);
                        }
                        totalRunsModified++;
                    } else {
                        if (options.verbose) {
                            logger.info(`    No modifications needed for ${runFileName}.`);
                        }
                    }

                } catch (error: any) {
                    logger.error(`    Error processing run file ${runFileName} for config ${configId}: ${error.message}`);
                    if (options.verbose && error.stack) {
                        logger.error(error.stack);
                    }
                    totalRunsFailedToProcess++;
                }
            }
        }

        logger.info('--- Prompt Contexts Backfill Summary ---');
        logger.info(`Total Configuration IDs found: ${configIds?.length || 0}`);
        logger.info(`Configuration IDs processed (with runs): ${totalConfigsProcessed}`);
        logger.info(`Total run files scanned: ${totalRunsScanned}`);
        logger.info(`Total run files modified${options.dryRun ? ' (if not dry run)' : ''}: ${totalRunsModified}`);
        logger.info(`Total run files failed to process: ${totalRunsFailedToProcess}`);
        logger.info(`Dry run mode: ${options.dryRun ? 'ENABLED' : 'DISABLED'}`);
        logger.info('--------------------------------------');

    } catch (error: any) {
        logger.error(`An error occurred during the prompt contexts backfill process: ${error.message}`);
        if (error.stack) {
            logger.error(error.stack);
        }
    }
}

export const backfillPromptContextsCommand = new Command('backfill-prompt-contexts')
    .description('Scans existing evaluation results and backfills the new promptContexts, allFinalAssistantResponses, and fullConversationHistories fields from legacy promptTexts and allResponses fields.')
    .option('--dry-run', 'Log what would be changed without actually saving files.')
    .option('-v, --verbose', 'Enable verbose logging for detailed processing steps.')
    .action(actionBackfillPromptContexts);
