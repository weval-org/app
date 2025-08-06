import { Command } from 'commander';
import { getConfig } from '../config';
import {
    listRunsForConfig,
    getResultByFileName,
} from '../../lib/storageService';
import { ComparisonDataV2 as FetchedComparisonData } from '../../app/utils/types';
import {
    calculatePerModelScoreStatsForRun,
    calculateAverageHybridScoreForRun,
} from '../utils/summaryCalculationUtils';

async function actionDebugConfigScores(configId: string) {
    const { logger } = getConfig();
    logger.info(`🔍 Debugging scores for config: ${configId}`);
    
    try {
        const runs = await listRunsForConfig(configId);
        if (runs.length === 0) {
            logger.warn(`No runs found for config ${configId}`);
            return;
        }

        logger.info(`Found ${runs.length} runs. Analyzing each...`);
        
        for (const runInfo of runs) {
            logger.info(`\n📊 === Analyzing run: ${runInfo.fileName} ===`);
            
            const resultData = await getResultByFileName(configId, runInfo.fileName) as FetchedComparisonData;
            if (!resultData) {
                logger.error(`  ❌ Could not fetch result data`);
                continue;
            }

            // Check basic data presence
            logger.info(`  📋 Basic Info:`);
            logger.info(`     Config ID: ${resultData.configId}`);
            logger.info(`     Run Label: ${resultData.runLabel}`);
            logger.info(`     Timestamp: ${resultData.timestamp}`);
            logger.info(`     Effective Models: [${resultData.effectiveModels.join(', ')}]`);
            logger.info(`     Prompt IDs: [${resultData.promptIds.join(', ')}]`);
            logger.info(`     Eval Methods Used: [${resultData.evalMethodsUsed?.join(', ') || 'undefined'}]`);

            // Check evaluation results
            logger.info(`  🔍 Evaluation Results:`);
            const hasPerPromptSimilarities = !!resultData.evaluationResults?.perPromptSimilarities;
            const hasLlmCoverageScores = !!resultData.evaluationResults?.llmCoverageScores;
            logger.info(`     Has Similarity Scores: ${hasPerPromptSimilarities}`);
            logger.info(`     Has Coverage Scores: ${hasLlmCoverageScores}`);

            if (hasPerPromptSimilarities && resultData.evaluationResults.perPromptSimilarities) {
                const simPrompts = Object.keys(resultData.evaluationResults.perPromptSimilarities);
                logger.info(`     Similarity Prompts: [${simPrompts.join(', ')}]`);
                
                for (const promptId of simPrompts) {
                    const promptSims = resultData.evaluationResults.perPromptSimilarities?.[promptId];
                    if (promptSims) {
                        const models = Object.keys(promptSims);
                        logger.info(`       ${promptId}: models [${models.join(', ')}]`);
                        
                        for (const modelId of models) {
                            const modelSims = promptSims[modelId];
                            const targets = Object.keys(modelSims);
                            for (const targetId of targets) {
                                const score = modelSims[targetId];
                                logger.info(`         ${modelId} -> ${targetId}: ${score}`);
                            }
                        }
                    }
                }
            }

            if (hasLlmCoverageScores && resultData.evaluationResults.llmCoverageScores) {
                const covPrompts = Object.keys(resultData.evaluationResults.llmCoverageScores);
                logger.info(`     Coverage Prompts: [${covPrompts.join(', ')}]`);
                
                for (const promptId of covPrompts) {
                    const promptCovs = resultData.evaluationResults.llmCoverageScores?.[promptId];
                    if (promptCovs) {
                        const models = Object.keys(promptCovs);
                        logger.info(`       ${promptId}: models [${models.join(', ')}]`);
                        
                        for (const modelId of models) {
                            const covResult = promptCovs[modelId];
                            if (covResult && 'error' in covResult) {
                                logger.info(`         ${modelId}: ERROR - ${covResult.error}`);
                            } else if (covResult) {
                                logger.info(`         ${modelId}: avgCoverageExtent=${covResult.avgCoverageExtent}, keyPointsCount=${covResult.keyPointsCount}`);
                            }
                        }
                    }
                }
            }

            // Calculate scores
            logger.info(`  🧮 Score Calculations:`);
            
            try {
                const perModelScores = calculatePerModelScoreStatsForRun(resultData);
                logger.info(`     Per-Model Scores calculated for ${perModelScores.size} models:`);
                
                perModelScores.forEach((scoreData, modelId) => {
                    logger.info(`       ${modelId}:`);
                    logger.info(`         Hybrid: avg=${scoreData.hybrid.average}, stddev=${scoreData.hybrid.stddev}`);
                    logger.info(`         Similarity: avg=${scoreData.similarity.average}, stddev=${scoreData.similarity.stddev}`);
                    logger.info(`         Coverage: avg=${scoreData.coverage.average}, stddev=${scoreData.coverage.stddev}`);
                });

                const hybridScoreStats = calculateAverageHybridScoreForRun(resultData);
                logger.info(`     Overall Hybrid Score Stats:`);
                logger.info(`       Average: ${hybridScoreStats.average}`);
                logger.info(`       Std Dev: ${hybridScoreStats.stddev}`);
                
                if (hybridScoreStats.average === null) {
                    logger.error(`     ❌ NULL HYBRID SCORE - This will cause N/A on homepage!`);
                    logger.info(`     🔍 Debugging why hybrid score is null...`);
                    
                    // Debug the hybrid score calculation step by step
                    const scores: number[] = [];
                    resultData.promptIds.forEach(promptId => {
                        logger.info(`       Checking prompt: ${promptId}`);
                        resultData.effectiveModels.forEach(modelId => {
                            if (modelId === 'ideal') {
                                logger.info(`         Skipping ideal model`);
                                return;
                            }
                            
                            logger.info(`         Checking model: ${modelId}`);
                            const sim = resultData.evaluationResults.perPromptSimilarities?.[promptId]?.[modelId]?.['ideal'];
                            const covResult = resultData.evaluationResults.llmCoverageScores?.[promptId]?.[modelId];
                            
                            logger.info(`           Similarity to ideal: ${sim}`);
                            logger.info(`           Coverage result: ${JSON.stringify(covResult)}`);
                            
                            if (sim !== undefined && sim !== null && covResult && !('error' in covResult) && covResult.avgCoverageExtent !== undefined && covResult.avgCoverageExtent !== null) {
                                logger.info(`           ✅ Valid scores found - would calculate hybrid`);
                                scores.push(1); // Placeholder
                            } else {
                                logger.info(`           ❌ Invalid scores - skipping hybrid calculation`);
                                if (sim === undefined || sim === null) logger.info(`             - Similarity is undefined/null`);
                                if (!covResult) logger.info(`             - Coverage result is missing`);
                                if (covResult && 'error' in covResult) logger.info(`             - Coverage result has error: ${covResult.error}`);
                                if (covResult && !('error' in covResult) && (covResult.avgCoverageExtent === undefined || covResult.avgCoverageExtent === null)) {
                                    logger.info(`             - Coverage avgCoverageExtent is undefined/null`);
                                }
                            }
                        });
                    });
                    
                    logger.info(`     📊 Total valid hybrid scores that would be calculated: ${scores.length}`);
                }
                
            } catch (error: any) {
                logger.error(`     ❌ Error calculating scores: ${error.message}`);
            }
        }
        
    } catch (error: any) {
        logger.error(`Error during debug: ${error.message}`);
    }
}

export const debugConfigScoresCommand = new Command('debug-config-scores')
    .description('Debug score calculations for a specific config to understand N/A issues')
    .argument('<configId>', 'The configuration ID to debug')
    .action(actionDebugConfigScores);