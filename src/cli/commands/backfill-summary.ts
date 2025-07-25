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
    calculatePotentialModelDrift,
    calculatePerModelScoreStatsForRun,
    calculateAverageHybridScoreForRun,
} from '../utils/summaryCalculationUtils';
import { calculateStandardDeviation } from '../../app/utils/calculationUtils';
import { fromSafeTimestamp } from '../../lib/timestampUtils';
import { ModelRunPerformance, ModelSummary } from '@/types/shared';
import { parseEffectiveModelId, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { populatePairwiseQueue } from '../services/pairwise-task-queue-service';
import { normalizeTag } from '@/app/utils/tagUtils';

async function actionBackfillSummary(options: { verbose?: boolean; configId?: string; dryRun?: boolean }) {
    const { logger } = getConfig();
    logger.info('Starting homepage summary backfill process (v3 hybrid summary)...');
    if (options.dryRun) {
        logger.warn('--- DRY RUN MODE --- No files will be written.');
    }

    let allConfigsForHomepage: EnhancedComparisonConfigInfo[] = [];
    let totalConfigsProcessed = 0;
    let totalRunsProcessed = 0;
    let totalRunsFailed = 0;
    const modelDimensionGrades = new Map<string, Map<string, { totalScore: number; count: number }>>();

    try {
        const configIds = options.configId ? [options.configId] : await listConfigIds();
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

            // For populating the pairs queue, we only care about the latest run.
            // listRunsForConfig returns runs sorted by date, so the first one is the latest.
            const latestRunInfo = runs[0];
            
            totalConfigsProcessed++;
            logger.info(`Processing ${runs.length} runs for config: ${configId}...`);
            
            // --- Step 1: Fetch all run data in parallel ---
            const pLimit = (await import('p-limit')).default;
            const limit = pLimit(10); // Limit concurrency to 10 parallel downloads

            const fetchPromises = runs.map(runInfo => 
                limit(async () => {
                    try {
                        const resultData = await getResultByFileName(configId, runInfo.fileName) as FetchedComparisonData;
                        if (resultData && runInfo.timestamp) {
                            resultData.timestamp = runInfo.timestamp;
                        }
                        return { resultData, runInfo };
                    } catch (error: any) {
                        logger.error(`  Error processing run file ${runInfo.fileName}: ${error.message}`);
                        totalRunsFailed++;
                        return { resultData: null, runInfo };
                    }
                })
            );
            
            const allRunResults = await Promise.all(fetchPromises);

            // --- Step 2: Process the fetched data into EnhancedRunInfo objects ---
            const processedRuns: EnhancedRunInfo[] = [];
            let latestResultDataForConfig: FetchedComparisonData | null = null;
            
            for (const { resultData, runInfo } of allRunResults) {
                if (resultData) {
                     // --- NORMALIZE TAGS ---
                    if (resultData.config?.tags) {
                        const originalTags = [...resultData.config.tags];
                        const normalizedTags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
                        resultData.config.tags = normalizedTags;
                    }
                    // --- END NORMALIZE TAGS ---

                    // --- Process Executive Summary Grades ---
                    if (resultData.executiveSummary?.structured?.grades) {
                        for (const gradeInfo of resultData.executiveSummary.structured.grades) {
                            const { baseId: modelId } = parseEffectiveModelId(gradeInfo.modelId);
                            if (!modelDimensionGrades.has(modelId)) {
                                modelDimensionGrades.set(modelId, new Map());
                            }
                            const modelGrades = modelDimensionGrades.get(modelId)!;

                            for (const [dimension, score] of Object.entries(gradeInfo.grades)) {
                                if (score > 0) { // Only count valid, non-zero grades
                                    const current = modelGrades.get(dimension) || { totalScore: 0, count: 0 };
                                    current.totalScore += score;
                                    current.count++;
                                    modelGrades.set(dimension, current);
                                }
                            }
                        }
                    }

                    if (!resultData.configId || !resultData.runLabel || !resultData.timestamp) {
                        logger.warn(`  Skipping run file ${runInfo.fileName} due to missing essential fields (configId, runLabel, or timestamp).`);
                        totalRunsFailed++;
                        continue;
                    }
                    totalRunsProcessed++;

                    // --- Calculate stats for this run ---
                    const perModelScores = calculatePerModelScoreStatsForRun(resultData);
                    const hybridScoreStats = calculateAverageHybridScoreForRun(resultData);

                    processedRuns.push({
                        runLabel: resultData.runLabel,
                        timestamp: resultData.timestamp,
                        fileName: runInfo.fileName,
                        temperature: resultData.config.temperature || 0,
                        numPrompts: resultData.promptIds.length,
                        numModels: resultData.effectiveModels.filter(m => m !== 'ideal').length,
                        totalModelsAttempted: resultData.config.models.length,
                        hybridScoreStats: hybridScoreStats,
                        perModelScores: perModelScores,
                        tags: resultData.config.tags,
                        models: resultData.effectiveModels,
                        promptIds: resultData.promptIds,
                    });

                    // Track the latest result data to use for top-level config metadata
                    if (!latestResultDataForConfig || fromSafeTimestamp(resultData.timestamp) > fromSafeTimestamp(latestResultDataForConfig.timestamp)) {
                        latestResultDataForConfig = resultData;
                    }
                    
                    // Populate the pairwise queue with tasks from this run, ONLY if it's the latest one and has the tag.
                    if (runInfo.fileName === latestRunInfo.fileName && resultData.config?.tags?.includes('_get_human_prefs')) {
                        try {
                            if (options.verbose) logger.info(`  Found _get_human_prefs tag. Populating pairwise queue for LATEST run: ${runInfo.fileName}`);
                            await populatePairwiseQueue(resultData, { logger });
                        } catch (pairwiseError: any) {
                            logger.error(`  Error populating pairwise queue for run ${runInfo.fileName}: ${pairwiseError.message}`);
                        }
                    }
                } else {
                    logger.warn(`  Could not fetch or parse result data for run file: ${runInfo.fileName}`);
                    totalRunsFailed++;
                }
            }

            // --- Step 3: Assemble the final summary for this config ---
            if (processedRuns.length > 0 && latestResultDataForConfig) {
                 // Sort runs from newest to oldest
                processedRuns.sort((a, b) => new Date(fromSafeTimestamp(b.timestamp)).getTime() - new Date(fromSafeTimestamp(a.timestamp)).getTime());
                
                // Calculate overall stats for the config from all its processed runs
                const allHybridScoresForConfig = processedRuns
                    .map(run => run.hybridScoreStats?.average)
                    .filter(score => score !== null && score !== undefined) as number[];

                let overallAverageHybridScore: number | null = null;
                let hybridScoreStdDev: number | null = null;
                if (allHybridScoresForConfig.length > 0) {
                    const totalScore = allHybridScoresForConfig.reduce((sum, score) => sum + score, 0);
                    overallAverageHybridScore = totalScore / allHybridScoresForConfig.length;
                    hybridScoreStdDev = calculateStandardDeviation(allHybridScoresForConfig);
                }

                const finalConfigSummary: EnhancedComparisonConfigInfo = {
                    configId: configId,
                    configTitle: latestResultDataForConfig.configTitle || latestResultDataForConfig.config.title || configId,
                    id: configId,
                    title: latestResultDataForConfig.configTitle || latestResultDataForConfig.config.title || configId,
                    description: latestResultDataForConfig.config?.description || '',
                    runs: processedRuns,
                    latestRunTimestamp: processedRuns[0].timestamp,
                    tags: latestResultDataForConfig.config.tags || [],
                    overallAverageHybridScore,
                    hybridScoreStdDev,
                };
                
                if (options.dryRun) {
                    logger.info(`[DRY RUN] Would save per-config summary for ${configId}.`);
                    const latestRun = finalConfigSummary.runs[0];
                    const summaryToLog = {
                        ...finalConfigSummary,
                        runs: `(${finalConfigSummary.runs.length} runs processed, showing latest run details below)`,
                        latestRun: latestRun ? {
                            runLabel: latestRun.runLabel,
                            timestamp: latestRun.timestamp,
                            hasPerModelScores: !!latestRun.perModelScores,
                            perModelScoresCount: latestRun.perModelScores?.size || 0,
                            serializationNote: (!!latestRun.perModelScores) ? "Legacy 'perModelHybridScores' field will be generated from this for backward compatibility during save." : "No new scores to generate."
                        } : 'N/A'
                    };
                    // Using console.log for direct, unformatted output of the object
                    console.log(JSON.stringify(summaryToLog, null, 2));
                } else {
                    logger.info(`Saving per-config summary for ${configId}...`);
                    await saveConfigSummary(configId, finalConfigSummary);
                }

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
                    // For featured configs, keep the metadata but only include the LATEST run.
                    // The runs array is already sorted newest first.
                    const latestRun = config.runs[0];
                    return { ...config, runs: latestRun ? [latestRun] : [] };
                }
                return { ...config, runs: [] }; // For non-featured, strip all run data.
            });

            // 2. Calculate stats based on ALL configs.
            // The calculation functions will internally filter out any configs with the 'test' tag.
            logger.info(`Headline stats will be calculated based on all ${allConfigsForHomepage.length} configs (excluding 'test' tag).`);

            const headlineStats = calculateHeadlineStats(allConfigsForHomepage, modelDimensionGrades);
            const driftDetectionResult = calculatePotentialModelDrift(allConfigsForHomepage);

            const finalHomepageSummaryObject: HomepageSummaryFileContent = {
                configs: homepageConfigs, // The hybrid array
                headlineStats: headlineStats,
                driftDetectionResult: driftDetectionResult,
                lastUpdated: new Date().toISOString(),
            };

            // --- BEGIN: Backfill Latest Runs Summary ---
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
            // --- END: Backfill Latest Runs Summary ---

            // --- BEGIN: Backfill Model Summaries ---
            const modelRunData = new Map<string, ModelRunPerformance[]>();
            const modelSummariesToSave: { baseModelId: string, modelSummary: ModelSummary }[] = [];

            allConfigsForHomepage.forEach(config => {
                config.runs.forEach(run => {
                    // Defensive coding: Ensure perModelScores is a Map, as JSON operations can convert it to an object.
                    if (run.perModelScores && !(run.perModelScores instanceof Map)) {
                        run.perModelScores = new Map(Object.entries(run.perModelScores));
                    }
                    
                    if (run.perModelScores) {
                        run.perModelScores.forEach((scoreData, effectiveModelId) => {
                            if (scoreData.hybrid.average !== null && scoreData.hybrid.average !== undefined) {
                                const { baseId } = parseEffectiveModelId(effectiveModelId);
                                const currentRuns = modelRunData.get(baseId) || [];
                                currentRuns.push({
                                    configId: config.configId,
                                    configTitle: config.title || config.configTitle,
                                    runLabel: run.runLabel,
                                    timestamp: run.timestamp,
                                    hybridScore: scoreData.hybrid.average,
                                });
                                modelRunData.set(baseId, currentRuns);
                            }
                        });
                    }
                });
            });

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
                
                modelSummariesToSave.push({ baseModelId, modelSummary });
            }
            // --- END: Backfill Model Summaries ---

            if (options.dryRun) {
                logger.info(`[DRY RUN] Would save comprehensive homepage summary. Stats calculated:`);
                console.log(JSON.stringify(finalHomepageSummaryObject.headlineStats, null, 2));

                logger.info(`[DRY RUN] Would save latest runs summary (${latest50Runs.length} runs).`);

                const modelNames = modelSummariesToSave.map(m => m.baseModelId);
                logger.info(`[DRY RUN] Would save ${modelSummariesToSave.length} model summaries for models: ${modelNames.join(', ')}`);

            } else {
                logger.info('Saving comprehensive homepage summary...');
                await saveHomepageSummary(finalHomepageSummaryObject);
                logger.info('Comprehensive homepage summary saved successfully.');

                await saveLatestRunsSummary({
                    runs: latest50Runs,
                    lastUpdated: new Date().toISOString(),
                });
                logger.info(`Latest runs summary saved successfully with ${latest50Runs.length} runs.`);

                logger.info(`Generating and saving ${modelSummariesToSave.length} model summaries...`);
                for (const { baseModelId, modelSummary } of modelSummariesToSave) {
                    await saveModelSummary(baseModelId, modelSummary);
                }
                logger.info(`Finished generating and saving model summaries.`);
            }

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
    .option('--config-id <id>', 'Only backfill for a specific configuration ID.')
    .option('--dry-run', 'Log what would be saved without writing any files.')
    .action(actionBackfillSummary);

export { actionBackfillSummary }; 