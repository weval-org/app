import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { getConfig } from '../config';
import { getHomepageSummary, getResultByFileName } from '../../lib/storageService';
import { ModelSummary, ModelRunPerformance } from '../types/model_card_types';
import { generateAnalyticalSummary } from '../services/model-summary-service';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { ComparisonDataV2 } from '@/app/utils/types';
import { calculateComparativeStats } from '../utils/summaryCalculationUtils';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { 
  HomepageSummaryFileContent,
  saveModelCard
} from '@/lib/storageService';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

type Logger = ReturnType<typeof getConfig>['logger'];

async function actionGenerateModelCard(modelIdPattern: string, options: {}) {
    const { logger } = getConfig();
    logger.info(`Starting Model Card generation for pattern: "${modelIdPattern}"`);

    const summary = await getHomepageSummary();
    if (!summary || !summary.configs) {
        logger.error('Could not load homepage summary manifest. Aborting.');
        return;
    }

    const allPerformanceRecords: ModelRunPerformance[] = [];
    const allBlueprintTags = new Map<string, string[]>();
    const discoveredModelIds = new Set<string>(); // Track all actual model IDs found
    const systemPromptMappings = new Map<string, Map<string, string>>(); // configId -> effectiveModelId -> actual system prompt text

    logger.info('Scanning all runs for participation...');

    const allRunsToProcess = summary.configs.flatMap((configInfo) =>
        configInfo.runs.map((runInfo) => ({ configInfo, runInfo })),
    );

    const concurrencyLimit = 10;
    const allProcessedResults = [];
    logger.info(`Processing ${allRunsToProcess.length} total runs with a concurrency limit of ${concurrencyLimit}.`);

    for (let i = 0; i < allRunsToProcess.length; i += concurrencyLimit) {
        const batch = allRunsToProcess.slice(i, i + concurrencyLimit);
        logger.info(`> Processing batch ${i / concurrencyLimit + 1} of ${Math.ceil(allRunsToProcess.length / concurrencyLimit)}...`);

        const processingPromises = batch.map(async ({ configInfo, runInfo }) => {
            const result = (await getResultByFileName(
                configInfo.configId,
                runInfo.fileName,
            )) as ComparisonDataV2;
            if (!result || !result.effectiveModels) {
                logger.warn(
                    `Could not fetch result file ${runInfo.fileName} or it has no models. Skipping.`,
                );
                return null;
            }

            const matchingEffectiveIds = result.effectiveModels.filter((em) =>
                parseModelIdForDisplay(em).baseId.includes(modelIdPattern),
            );

            if (matchingEffectiveIds.length === 0) {
                return null;
            }

            // Note: The detailed log for found models is commented out to reduce noise in concurrent processing.
            // It can be re-enabled for debugging.
            // logger.info(
            //     `> Found ${matchingEffectiveIds.length} matching model(s) in run ${
            //         runInfo.fileName
            //     }: ${matchingEffectiveIds.join(', ')}`,
            // );

            // Data to be collected from this run
            let performanceRecord: ModelRunPerformance | null = null;
            const blueprintTags: { configId: string; tags: string[] } | null =
                result.config.tags
                    ? { configId: configInfo.configId, tags: result.config.tags }
                    : null;
            const discoveredModelIdsForRun = new Set<string>(matchingEffectiveIds);
            const configSystemPrompts = new Map<string, string>();

            // Extract system prompts
            if (result.modelSystemPrompts) {
                Object.entries(result.modelSystemPrompts).forEach(
                    ([effectiveModelId, systemPrompt]) => {
                        if (
                            matchingEffectiveIds.includes(effectiveModelId) &&
                            systemPrompt
                        ) {
                            configSystemPrompts.set(effectiveModelId, systemPrompt);
                        }
                    },
                );
            } else if (result.config?.systems && Array.isArray(result.config.systems)) {
                // Fallback: reconstruct from config.systems and sp_idx parsing
                matchingEffectiveIds.forEach((effectiveId) => {
                    const spMatch = effectiveId.match(/\[sp_idx:(\d+)\]/);
                    if (spMatch) {
                        const spIdx = parseInt(spMatch[1]);
                        if (spIdx >= 0 && spIdx < result.config.systems!.length) {
                            const systemPrompt = result.config.systems![spIdx];
                            if (systemPrompt !== null) {
                                configSystemPrompts.set(effectiveId, systemPrompt);
                            }
                        }
                    } else if (result.config.system) {
                        // No sp_idx, so it's using the default system prompt
                        configSystemPrompts.set(effectiveId, result.config.system);
                    }
                });
            }

            if (runInfo.perModelScores) {
                let totalScore = 0;
                let count = 0;
                const scoresMap = 
                    runInfo.perModelScores instanceof Map
                        ? runInfo.perModelScores
                        : new Map(
                              Object.entries(
                                  runInfo.perModelScores as Record<
                                      string,
                                      any
                                  >
                              )
                          );

                matchingEffectiveIds.forEach((id) => {
                    const scoreData = scoresMap.get(id);
                    if (scoreData && scoreData.hybrid?.average !== undefined && scoreData.hybrid?.average !== null) {
                        totalScore += scoreData.hybrid.average;
                        count++;
                    }
                });

                if (count > 0) {
                    const modelHybridScore = totalScore / count;

                    // We'll use the first matching ID for comparative stats. This is an approximation.
                    const { peerAverageScore, rank } = calculateComparativeStats(
                        scoresMap,
                        matchingEffectiveIds[0],
                    );

                    // Count total models in this run (excluding IDEAL_MODEL_ID if present)
                    const totalModelsInRun = Array.from(scoresMap.keys()).filter(
                        (modelId) => modelId !== IDEAL_MODEL_ID,
                    ).length;

                    performanceRecord = {
                        configId: configInfo.configId,
                        configTitle: configInfo.configTitle,
                        runLabel: runInfo.runLabel,
                        timestamp: runInfo.timestamp,
                        hybridScore: modelHybridScore,
                        peerAverageScore: peerAverageScore,
                        rank: rank,
                        totalModelsInRun: totalModelsInRun,
                        executiveSummary: result.executiveSummary?.content || null,
                    };
                }
            }

            return {
                performanceRecord,
                discoveredModelIds: Array.from(discoveredModelIdsForRun),
                blueprintTags,
                systemPrompts: {
                    configId: configInfo.configId,
                    prompts: configSystemPrompts,
                },
            };
        });
        const batchResults = await Promise.all(processingPromises);
        allProcessedResults.push(...batchResults);
    }
    
    const processedResults = allProcessedResults.filter(
        (r): r is NonNullable<typeof r> => r !== null,
    );

    logger.info('Aggregating results...');
    for (const result of processedResults) {
        if (result.performanceRecord) {
            allPerformanceRecords.push(result.performanceRecord);
        }
        result.discoveredModelIds.forEach((id) => discoveredModelIds.add(id));
        if (result.blueprintTags) {
            allBlueprintTags.set(result.blueprintTags.configId, result.blueprintTags.tags);
        }
        if (result.systemPrompts.prompts.size > 0) {
            systemPromptMappings.set(
                result.systemPrompts.configId,
                result.systemPrompts.prompts,
            );
        }
    }

    if (allPerformanceRecords.length === 0) {
        logger.warn(
            `No performance records found for model pattern "${modelIdPattern}". Cannot generate card.`,
        );
        return;
    }
    
    const discoveredModelsList = Array.from(discoveredModelIds).sort();
    logger.info(`Found ${allPerformanceRecords.length} performance records for pattern "${modelIdPattern}".`);
    logger.info(`Discovered ${discoveredModelsList.length} unique model variants: ${discoveredModelsList.join(', ')}`);

    const totalScore = allPerformanceRecords.reduce((sum, run) => sum + run.hybridScore, 0);
    const averageHybridScore = allPerformanceRecords.length > 0 ? totalScore / allPerformanceRecords.length : null;

    const performanceByTag: ModelSummary['performanceByTag'] = {};
    const tagCounts: Record<string, number> = {};

    for (const run of allPerformanceRecords) {
        const tags = allBlueprintTags.get(run.configId);
        if (tags) {
            for (const tag of tags) {
                if (!performanceByTag[tag]) {
                    performanceByTag[tag] = { averageScore: 0, blueprintCount: 0 };
                    tagCounts[tag] = 0;
                }
                performanceByTag[tag].averageScore = (performanceByTag[tag].averageScore! * tagCounts[tag] + run.hybridScore) / (tagCounts[tag] + 1);
                tagCounts[tag]++;
            }
        }
    }
    for (const tag in performanceByTag) {
        performanceByTag[tag].blueprintCount = tagCounts[tag];
    }

    const modelSummary: ModelSummary = {
        modelId: modelIdPattern,
        displayName: modelIdPattern, // Use the pattern as the name for the card
        provider: 'aggregate', // Provider is now an aggregate
        discoveredModelIds: discoveredModelsList, // Add the actual model variants found
        systemPromptMappings: Object.fromEntries(
            Array.from(systemPromptMappings.entries()).map(([configId, promptMap]) => [
                configId,
                Object.fromEntries(promptMap)
            ])
        ), // Convert Maps to serializable Records
        overallStats: {
            averageHybridScore: averageHybridScore,
            totalRuns: allPerformanceRecords.length,
            totalBlueprints: allBlueprintTags.size,
            runs: allPerformanceRecords,
        },
        performanceByTag: performanceByTag,
        lastUpdated: new Date().toISOString(),
    };
    
    logger.info('Generating analytical summary...');
    const analyticalSummary = await generateAnalyticalSummary(modelSummary, logger);
    modelSummary.analyticalSummary = analyticalSummary;

    const outputDir = path.join(process.cwd(), '.results', 'model-cards');
    const fileName = `${modelIdPattern.replace(/[:/\\]/g, '_')}.json`;
    const outputPath = path.join(outputDir, fileName);

    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(outputPath, JSON.stringify(modelSummary, null, 2), 'utf-8');
    
    logger.info(`Model card generated successfully: ${outputPath}`);
    
    if (process.env.STORAGE_PROVIDER === 's3') {
        try {
            await saveModelCard(modelIdPattern, modelSummary);
            logger.info(`Model card also saved to S3 for ${modelIdPattern}`);
        } catch (s3Error: any) {
            logger.warn(`Failed to save model card to S3: ${s3Error.message}`);
        }
    }
    
    logger.info(`\n=== Model Card Summary ===`);
    logger.info(`Model: ${modelSummary.modelId}`);
    logger.info(`Performance Records: ${modelSummary.overallStats.totalRuns}`);
    logger.info(`Blueprints Covered: ${modelSummary.overallStats.totalBlueprints}`);
    if (modelSummary.overallStats.averageHybridScore !== null) {
        logger.info(`Overall Average Score: ${modelSummary.overallStats.averageHybridScore.toFixed(4)}`);
    }
    logger.info(`==========================\n`);
}

export const generateModelCardCommand = new Command('generate-model-card')
    .description('Generates a model-specific summary card by aggregating all of its performance data based on a pattern.')
    .argument('<modelIdPattern>', 'A substring to match against model IDs (e.g., "gpt-4.1-mini", "gpt-4.1", "openai:gpt-4o")')
    .action(actionGenerateModelCard); 