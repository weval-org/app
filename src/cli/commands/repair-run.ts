import { Command } from 'commander';
import { getConfig } from '../config';
import {
  getResultByFileName,
  saveResult,
  getHomepageSummary,
  saveHomepageSummary,
  updateSummaryDataWithNewRun,
  listConfigIds,
  listRunsForConfig,
  saveConfigSummary,
} from '../../lib/storageService';
import { backfillSummaryCommand } from './backfill-summary';
import { actionBackfillSummary } from './backfill-summary';
import {
  FinalComparisonOutputV2 as FetchedComparisonData,
  EvaluationInput,
  PromptResponseData,
  Evaluator,
  EvaluationMethod,
} from '../types/cli_types';
import { 
    CoverageResult as LLMCoverageResult,
    PointAssessment,
    ConversationMessage,
    ModelResponseDetail,
} from '@/types/shared';
import { LLMCoverageEvaluator } from '../evaluators/llm-coverage-evaluator';
import { EmbeddingEvaluator } from '../evaluators/embedding-evaluator';
import { generateExecutiveSummary } from '../services/executive-summary-service';
import { toSafeTimestamp } from '@/lib/timestampUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { getModelResponse, DEFAULT_TEMPERATURE } from '../services/llm-service';
import { parseEffectiveModelId } from '@/app/utils/modelIdUtils';

async function runEvaluators(
    inputs: EvaluationInput[],
    methods: EvaluationMethod[],
    logger: ReturnType<typeof getConfig>['logger'],
    useCache: boolean
): Promise<Partial<FetchedComparisonData['evaluationResults']>> {
    const evaluators: Evaluator[] = [
        new EmbeddingEvaluator(logger),
        new LLMCoverageEvaluator(logger, useCache),
    ];
    const chosenEvaluators = evaluators.filter(e => methods.includes(e.getMethodName()));
    let combinedResults: Partial<FetchedComparisonData['evaluationResults']> = {};
    for (const evaluator of chosenEvaluators) {
        const results = await evaluator.evaluate(inputs);
        combinedResults = { ...combinedResults, ...results };
    }
    return combinedResults;
}

async function actionRepairRun(runIdentifier: string, options: { cache?: boolean }) {
  const { logger } = getConfig();
  const useCache = options.cache ?? false;

  logger.info(`Starting repair for run: ${runIdentifier}`);

  const parts = runIdentifier.split('/');
  if (parts.length !== 3) {
    logger.error('Invalid runIdentifier format. Expected "configId/runLabel/timestamp".');
    process.exit(1);
    return;
  }
  const [configId, runLabel, timestamp] = parts;
  const fileName = `${runLabel}_${timestamp}_comparison.json`;

  logger.info(`Fetching result file: ${fileName} for config: ${configId}`);
  const resultData = await getResultByFileName(configId, fileName) as FetchedComparisonData | null;

  if (!resultData) {
    logger.error(`Could not find result file for identifier: ${runIdentifier}`);
    process.exit(1);
    return;
  }

  logger.info('Result file loaded. Scanning for necessary repairs...');

  const evalRepairsNeeded = new Map<string, string[]>();
  const generationRepairsNeeded = new Map<string, string[]>();
  let evalRepairCount = 0;
  let generationRepairCount = 0;

  if (resultData.evaluationResults.llmCoverageScores) {
    for (const [promptId, modelScores] of Object.entries(resultData.evaluationResults.llmCoverageScores)) {
      for (const [modelId, coverageResult] of Object.entries(modelScores as { [modelId: string]: LLMCoverageResult })) {
        if (coverageResult?.pointAssessments?.some((pa: PointAssessment) => pa.error)) {
          if (!evalRepairsNeeded.has(promptId)) evalRepairsNeeded.set(promptId, []);
          evalRepairsNeeded.get(promptId)!.push(modelId);
          evalRepairCount++;
        }
      }
    }
  }

  if (resultData.errors) {
    for (const [promptId, modelErrors] of Object.entries(resultData.errors)) {
      for (const modelId of Object.keys(modelErrors)) {
        if (!generationRepairsNeeded.has(promptId)) generationRepairsNeeded.set(promptId, []);
        generationRepairsNeeded.get(promptId)!.push(modelId);
        generationRepairCount++;
      }
    }
  }

  if (evalRepairCount === 0 && generationRepairCount === 0) {
    logger.info('No failed assessments or generation errors found. Nothing to repair.');
    return;
  }

  logger.info(`Found ${evalRepairCount} evaluation failures and ${generationRepairCount} generation failures to repair.`);

  // Repair evaluation failures first
  if (evalRepairCount > 0) {
    const evalInputs: EvaluationInput[] = [];
    for (const [promptId, modelIds] of evalRepairsNeeded.entries()) {
        const modelResponses: { [modelId: string]: ModelResponseDetail } = {};
        for(const modelId of modelIds) {
            if (resultData.allFinalAssistantResponses && resultData.allFinalAssistantResponses[promptId] && resultData.allFinalAssistantResponses[promptId][modelId]) {
                modelResponses[modelId] = {
                    finalAssistantResponseText: resultData.allFinalAssistantResponses[promptId][modelId],
                    fullConversationHistory: (resultData.fullConversationHistories?.[promptId]?.[modelId] || []) as ConversationMessage[],
                    systemPromptUsed: resultData.modelSystemPrompts?.[modelId] || null,
                    hasError: false,
                };
            }
        }
        if (Object.keys(modelResponses).length > 0 && resultData.promptContexts && resultData.allFinalAssistantResponses) {
            evalInputs.push({
                promptData: {
                    promptId: promptId,
                    initialMessages: resultData.promptContexts[promptId] as ConversationMessage[],
                    idealResponseText: resultData.allFinalAssistantResponses[promptId]?.[IDEAL_MODEL_ID] || null,
                    modelResponses: modelResponses,
                },
                config: resultData.config,
                effectiveModelIds: modelIds,
            });
        }
    }
    logger.info(`Re-running LLM coverage evaluation for ${evalRepairCount} failed assessments.`);
    const evaluator = new LLMCoverageEvaluator(logger, useCache);
    const repairedEvalResults = await evaluator.evaluate(evalInputs);
    if (repairedEvalResults.llmCoverageScores) {
        for (const [promptId, modelScores] of Object.entries(repairedEvalResults.llmCoverageScores)) {
            for (const [modelId, newCoverageResult] of Object.entries(modelScores)) {
                resultData.evaluationResults.llmCoverageScores![promptId][modelId] = newCoverageResult;
            }
        }
    }
  }

  // Repair generation failures
  if (generationRepairCount > 0) {
    for (const [promptId, modelIds] of generationRepairsNeeded.entries()) {
        const promptConfig = resultData.config.prompts.find(p => p.id === promptId);
        if (!promptConfig || !promptConfig.messages) continue;

        for (const modelId of modelIds) {
            logger.info(`Attempting to re-generate response for model ${modelId} on prompt ${promptId}...`);
            try {
                const { baseId, temperature: parsedTemp } = parseEffectiveModelId(modelId);
                const temperature = parsedTemp ?? DEFAULT_TEMPERATURE;
                
                const newResponseText = await getModelResponse({ modelId: baseId, messages: promptConfig.messages, temperature, useCache });
                
                // Update response data
                if(resultData.allFinalAssistantResponses && resultData.allFinalAssistantResponses[promptId] && resultData.allFinalAssistantResponses[promptId][modelId]) {
                  resultData.allFinalAssistantResponses[promptId][modelId] = newResponseText;
                }
                if(resultData.fullConversationHistories && resultData.fullConversationHistories[promptId] && resultData.fullConversationHistories[promptId][modelId]) {
                  resultData.fullConversationHistories[promptId][modelId] = [...promptConfig.messages, { role: 'assistant', content: newResponseText }];
                }
                if (resultData.errors?.[promptId]?.[modelId]) {
                    delete resultData.errors[promptId][modelId];
                }

                // Re-evaluate
                if (resultData.allFinalAssistantResponses) {
                    // We need to run evaluators separately to provide different contexts for embedding vs. coverage.

                    // 1. Embedding requires all other model responses to build a full similarity matrix.
                    if (resultData.evalMethodsUsed.includes('embedding')) {
                        const allModelResponses: { [modelId: string]: ModelResponseDetail } = {};
                        const allModelIds = Object.keys(resultData.allFinalAssistantResponses[promptId] || {});
                        
                        for (const mId of allModelIds) {
                            if (mId === IDEAL_MODEL_ID) continue;
                            allModelResponses[mId] = {
                                finalAssistantResponseText: resultData.allFinalAssistantResponses[promptId][mId],
                                fullConversationHistory: (resultData.fullConversationHistories?.[promptId]?.[mId] || []) as ConversationMessage[],
                                hasError: !!resultData.errors?.[promptId]?.[mId],
                                systemPromptUsed: resultData.modelSystemPrompts?.[mId] || null,
                            };
                        }

                        const embeddingInput: EvaluationInput = {
                            promptData: {
                                promptId,
                                initialMessages: promptConfig.messages,
                                idealResponseText: resultData.allFinalAssistantResponses[promptId]?.[IDEAL_MODEL_ID] || null,
                                modelResponses: allModelResponses,
                            },
                            config: resultData.config,
                            effectiveModelIds: allModelIds.filter(id => id !== IDEAL_MODEL_ID),
                        };

                        const embeddingEvaluator = new EmbeddingEvaluator(logger);
                        const newEmbeddingResults = await embeddingEvaluator.evaluate([embeddingInput]);

                        if (newEmbeddingResults.similarityMatrix && newEmbeddingResults.similarityMatrix[promptId]) {
                            if (!resultData.evaluationResults.similarityMatrix) resultData.evaluationResults.similarityMatrix = {};
                            resultData.evaluationResults.similarityMatrix[promptId] = newEmbeddingResults.similarityMatrix[promptId];
                        }
                        if (newEmbeddingResults.perPromptSimilarities && newEmbeddingResults.perPromptSimilarities[promptId]) {
                            if (!resultData.evaluationResults.perPromptSimilarities) resultData.evaluationResults.perPromptSimilarities = {};
                            resultData.evaluationResults.perPromptSimilarities[promptId] = newEmbeddingResults.perPromptSimilarities[promptId];
                        }
                    }

                    // 2. LLM Coverage only needs the single repaired response to avoid re-evaluating (and paying for) others.
                    if (resultData.evalMethodsUsed.includes('llm-coverage')) {
                        const coverageInput: EvaluationInput = {
                            promptData: {
                                promptId,
                                initialMessages: promptConfig.messages,
                                idealResponseText: resultData.allFinalAssistantResponses[promptId]?.[IDEAL_MODEL_ID] || null,
                                modelResponses: { 
                                    [modelId]: { 
                                        finalAssistantResponseText: newResponseText, 
                                        hasError: false, 
                                        fullConversationHistory: [...promptConfig.messages, { role: 'assistant', content: newResponseText }], 
                                        systemPromptUsed: resultData.modelSystemPrompts?.[modelId] || null 
                                    } 
                                },
                            },
                            config: resultData.config,
                            effectiveModelIds: [modelId],
                        };

                        const llmCoverageEvaluator = new LLMCoverageEvaluator(logger, useCache);
                        const newCoverageResults = await llmCoverageEvaluator.evaluate([coverageInput]);

                        if (newCoverageResults.llmCoverageScores?.[promptId]?.[modelId]) {
                            if (!resultData.evaluationResults.llmCoverageScores) resultData.evaluationResults.llmCoverageScores = {};
                            if (!resultData.evaluationResults.llmCoverageScores[promptId]) resultData.evaluationResults.llmCoverageScores[promptId] = {};
                            resultData.evaluationResults.llmCoverageScores[promptId][modelId] = newCoverageResults.llmCoverageScores[promptId][modelId];
                        }
                    }

                    logger.info(`Successfully repaired and re-evaluated model ${modelId} for prompt ${promptId}.`);
                }

            } catch (error: any) {
                logger.error(`Failed to repair model ${modelId} for prompt ${promptId}: ${error.message}`);
            }
        }
    }
  }

  logger.info('Re-generating executive summary...');
  const summaryResult = await generateExecutiveSummary(resultData, logger);
  if (!('error' in summaryResult)) {
      resultData.executiveSummary = summaryResult;
  }

  resultData.timestamp = toSafeTimestamp(new Date().toISOString());

  logger.info('Saving repaired result file back to storage...');
  await saveResult(configId, fileName, resultData);
  logger.info('Successfully saved repaired result file.');
  
  logger.info('To ensure data consistency, the summary files will now be rebuilt.');
  logger.info('--- Starting Summary Backfill ---');
  await actionBackfillSummary({ verbose: false });
  logger.info('--- Finished Summary Backfill ---');

  logger.info(`Repair process for ${runIdentifier} completed successfully.`);
}

export const repairRunCommand = new Command('repair-run')
  .description('Repairs a specific evaluation run by re-running failed assessments and generation errors.')
  .argument('<runIdentifier>', 'The unique identifier for the run (e.g., "configId/runLabel/timestamp")')
  .option('--cache', 'Enable caching for model responses during repair (by default, caching is disabled for repairs).', false)
  .action(actionRepairRun); 