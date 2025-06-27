import { Command } from 'commander';
import { getConfig } from '../config';
import {
    listConfigIds,
    listRunsForConfig,
    getResultByFileName,
    saveHomepageSummary,
    updateSummaryDataWithNewRun,
    HomepageSummaryFileContent,
    saveConfigSummary,
    saveLatestRunsSummary,
    LatestRunSummaryItem,
    saveModelSummary,
} from '../../lib/storageService';
import { EnhancedComparisonConfigInfo, EnhancedRunInfo } from '../../app/utils/homepageDataUtils';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';
import {
    calculateHeadlineStats,
    calculatePotentialModelDrift
} from '../utils/summaryCalculationUtils';
import { fromSafeTimestamp } from '../../lib/timestampUtils';
import { ModelRunPerformance, ModelSummary } from '@/types/shared';
import { parseEffectiveModelId, getModelDisplayLabel } from '@/app/utils/modelIdUtils';

async function actionBackfillSummary(options: { verbose?: boolean }) {
    const { logger } = getConfig();
    logger.info('Starting homepage summary backfill process (v3 hybrid summary)...');

    let allConfigsForHomepage: EnhancedComparisonConfigInfo[] = [];
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

                // Add the completed summary to our list for the homepage summary generation
                allConfigsForHomepage.push(finalConfigSummary);
            }
        }

        // Now, build and save the main homepage summary from the collected configs
        if (allConfigsForHomepage.length > 0) {
            logger.info(`Backfill data compiled. Found ${allConfigsForHomepage.length} total configs to process for homepage summary.`);
            
            // 1. Create the hybrid array for the homepage summary file itself.
            const homepageConfigs = allConfigsForHomepage.map(config => {
                if (config.tags?.includes('_featured')) {
                    return config; // Keep full run data
                }
                return { ...config, runs: [] }; // Strip run data
            });

            // 2. Calculate stats based on ALL configs.
            // The calculation functions will internally filter out any configs with the 'test' tag.
            logger.info(`Headline stats will be calculated based on all ${allConfigsForHomepage.length} configs (excluding 'test' tag).`);

            const headlineStats = calculateHeadlineStats(allConfigsForHomepage);
            const driftDetectionResult = calculatePotentialModelDrift(allConfigsForHomepage);

            const finalHomepageSummaryObject: HomepageSummaryFileContent = {
                configs: homepageConfigs, // The hybrid array
                headlineStats: headlineStats,
                driftDetectionResult: driftDetectionResult,
                lastUpdated: new Date().toISOString(),
            };

            logger.info('Saving comprehensive homepage summary...');
            await saveHomepageSummary(finalHomepageSummaryObject);
            logger.info('Comprehensive homepage summary saved successfully.');

            // --- BEGIN: Backfill Latest Runs Summary ---
            logger.info('Creating latest runs summary from backfilled data...');
            const allRunsFlat: LatestRunSummaryItem[] = allConfigsForHomepage.flatMap(config =>
                config.runs.map(run => ({
                    ...run,
                    configId: config.configId,
                    configTitle: config.title || config.configTitle,
                }))
            );

            const sortedRuns = allRunsFlat.sort((a, b) => 
                new Date(fromSafeTimestamp(b.timestamp)).getTime() - new Date(fromSafeTimestamp(a.timestamp)).getTime()
            );

            const latest50Runs = sortedRuns.slice(0, 50);

            await saveLatestRunsSummary({
                runs: latest50Runs,
                lastUpdated: new Date().toISOString(),
            });
            logger.info(`Latest runs summary saved successfully with ${latest50Runs.length} runs.`);
            // --- END: Backfill Latest Runs Summary ---

            // --- BEGIN: Backfill Model Summaries ---
            logger.info('Creating per-model summaries from backfilled data...');
            const modelRunData = new Map<string, ModelRunPerformance[]>();

            allConfigsForHomepage.forEach(config => {
                config.runs.forEach(run => {
                    if (run.perModelHybridScores) {
                        run.perModelHybridScores.forEach((scoreData, effectiveModelId) => {
                            if (scoreData.average !== null && scoreData.average !== undefined) {
                                const { baseId } = parseEffectiveModelId(effectiveModelId);
                                const currentRuns = modelRunData.get(baseId) || [];
                                currentRuns.push({
                                    configId: config.configId,
                                    configTitle: config.title || config.configTitle,
                                    runLabel: run.runLabel,
                                    timestamp: run.timestamp,
                                    hybridScore: scoreData.average,
                                });
                                modelRunData.set(baseId, currentRuns);
                            }
                        });
                    }
                });
            });

            logger.info(`Found data for ${modelRunData.size} unique base models. Generating and saving summaries...`);

            for (const [baseModelId, runs] of modelRunData.entries()) {
                const totalRuns = runs.length;
                const blueprintsParticipated = new Set(runs.map(r => r.configId));
                const totalBlueprints = blueprintsParticipated.size;

                const validScores = runs.map(r => r.hybridScore).filter(s => s !== null) as number[];
                const averageHybridScore = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : null;

                // Strengths & Weaknesses
                const blueprintScores = new Map<string, { scores: number[], title: string }>();
                runs.forEach(run => {
                    if (run.hybridScore !== null) {
                        const existing = blueprintScores.get(run.configId) || { scores: [], title: run.configTitle };
                        existing.scores.push(run.hybridScore);
                        blueprintScores.set(run.configId, existing);
                    }
                });
                
                const avgBlueprintScores = Array.from(blueprintScores.entries()).map(([configId, data]) => ({
                    configId,
                    configTitle: data.title,
                    score: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
                })).sort((a, b) => b.score - a.score);

                const modelSummary: ModelSummary = {
                    modelId: baseModelId,
                    displayName: getModelDisplayLabel(baseModelId),
                    provider: baseModelId.split(':')[0] || 'unknown',
                    overallStats: {
                        averageHybridScore,
                        totalRuns,
                        totalBlueprints,
                    },
                    strengthsAndWeaknesses: {
                        topPerforming: avgBlueprintScores.slice(0, 3),
                        weakestPerforming: avgBlueprintScores.slice(-3).reverse(),
                    },
                    runs: runs.sort((a, b) => new Date(fromSafeTimestamp(b.timestamp)).getTime() - new Date(fromSafeTimestamp(a.timestamp)).getTime()),
                    lastUpdated: new Date().toISOString(),
                };
                
                await saveModelSummary(baseModelId, modelSummary);
            }
            logger.info(`Finished generating and saving ${modelRunData.size} model summaries.`);
            // --- END: Backfill Model Summaries ---

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
    .description('Rebuilds all summary files. Creates a summary.json for each config and a hybrid homepage_summary.json (metadata for all, runs for featured).')
    .option('-v, --verbose', 'Enable verbose logging for detailed processing steps.')
    .action(actionBackfillSummary);

export { actionBackfillSummary }; 