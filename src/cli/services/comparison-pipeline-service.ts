import { getConfig } from '../config';
import { ComparisonConfig, EvaluationMethod, PromptResponseData, EvaluationInput, FinalComparisonOutputV2, Evaluator, IDEAL_MODEL_ID } from '../types/cli_types';
import { ConversationMessage } from '@/types/shared';
import { EmbeddingEvaluator } from '@/cli/evaluators/embedding-evaluator';
import { LLMCoverageEvaluator } from '@/cli/evaluators/llm-coverage-evaluator';
import { saveResult as saveResultToStorage } from '@/lib/storageService';
import { toSafeTimestamp } from '@/lib/timestampUtils';
import { generateExecutiveSummary } from './executive-summary-service';
import { generateAllResponses } from './comparison-pipeline-service.non-stream';

type Logger = ReturnType<typeof getConfig>['logger'];

async function aggregateAndSaveResults(
    config: ComparisonConfig,
    runLabel: string,
    allResponsesMap: Map<string, PromptResponseData>,
    evaluationResults: Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>,
    evalMethodsUsed: EvaluationMethod[],
    logger: Logger,
    commitSha?: string,
    blueprintFileName?: string,
): Promise<{ data: FinalComparisonOutputV2, fileName: string | null }> {
    logger.info('[PipelineService] Aggregating results...');
    logger.info(`[PipelineService] Received blueprint ID for saving: '${config.id}'`);

    const promptIds: string[] = [];
    const promptContexts: Record<string, string | ConversationMessage[]> = {}; 
    const allFinalAssistantResponses: Record<string, Record<string, string>> = {};
    const fullConversationHistories: Record<string, Record<string, ConversationMessage[]>> = {};
    const errors: Record<string, Record<string, string>> = {};
    const effectiveModelsSet = new Set<string>();
    const modelSystemPrompts: Record<string, string | null> = {};
    let hasAnyIdeal = false;

    // Determine if any ideal response exists based on the config
    if (config.prompts.some(p => p.idealResponse)) {
        hasAnyIdeal = true;
    }

    for (const [promptId, promptData] of allResponsesMap.entries()) {
        promptIds.push(promptId);
        // Store context appropriately
        if (promptData.initialMessages && promptData.initialMessages.length > 0) {
            // If it was originally multi-turn or converted from promptText, initialMessages is the source of truth for input
            promptContexts[promptId] = promptData.initialMessages;
        } else if (promptData.promptText) { // Fallback for any case where initialMessages might be missing (should not happen)
            promptContexts[promptId] = promptData.promptText;
        } else {
            promptContexts[promptId] = "Error: No input context found"; // Should not happen
        }
        
        allFinalAssistantResponses[promptId] = {};
        if (process.env.STORE_FULL_HISTORY !== 'false') { // Default to true
             fullConversationHistories[promptId] = {};
        }

        // Add ideal response text if it was part of the input
        if (promptData.idealResponseText !== null && promptData.idealResponseText !== undefined) {
            allFinalAssistantResponses[promptId][IDEAL_MODEL_ID] = promptData.idealResponseText;
            // If storing full histories, the ideal response doesn't have a "history" in the same way
        }

        for (const [effectiveModelId, responseData] of Object.entries(promptData.modelResponses)) {
            effectiveModelsSet.add(effectiveModelId);
            allFinalAssistantResponses[promptId][effectiveModelId] = responseData.finalAssistantResponseText;
            modelSystemPrompts[effectiveModelId] = responseData.systemPromptUsed;
            
            if (responseData.fullConversationHistory && fullConversationHistories[promptId]) {
                 fullConversationHistories[promptId][effectiveModelId] = responseData.fullConversationHistory;
            }

            if (responseData.hasError && responseData.errorMessage) {
                if (!errors[promptId]) errors[promptId] = {};
                errors[promptId][effectiveModelId] = responseData.errorMessage;
            }
        }
    }

    if (hasAnyIdeal) {
        effectiveModelsSet.add(IDEAL_MODEL_ID);
    }

    const effectiveModels = Array.from(effectiveModelsSet).sort();

    const currentTimestamp = new Date().toISOString();
    const safeTimestamp = toSafeTimestamp(currentTimestamp);

    const resolvedConfigId: string = config.id!;
    const resolvedConfigTitle: string = config.title!;

    if (!resolvedConfigId) {
        logger.error(`Critical: Blueprint ID is missing. Config: ${JSON.stringify(config)}`);
        throw new Error("Blueprint ID is missing unexpectedly after validation.");
    }
    if (!resolvedConfigTitle) {
        logger.error(`Critical: Blueprint Title is missing. Config: ${JSON.stringify(config)}`);
        throw new Error("Blueprint Title is missing unexpectedly after validation.");
    }

    const finalOutput: FinalComparisonOutputV2 = {
        configId: resolvedConfigId,
        configTitle: resolvedConfigTitle,
        runLabel,
        timestamp: safeTimestamp,
        description: config.description,
        sourceCommitSha: commitSha,
        sourceBlueprintFileName: blueprintFileName,
        config: config,
        evalMethodsUsed: evalMethodsUsed,
        effectiveModels: effectiveModels,
        modelSystemPrompts: modelSystemPrompts,
        promptIds: promptIds.sort(),
        promptContexts: promptContexts,
        extractedKeyPoints: evaluationResults.extractedKeyPoints ?? undefined,
        allFinalAssistantResponses: allFinalAssistantResponses,
        fullConversationHistories: (process.env.STORE_FULL_HISTORY !== 'false') ? fullConversationHistories : undefined,
        evaluationResults: {
            similarityMatrix: evaluationResults.similarityMatrix ?? undefined,
            perPromptSimilarities: evaluationResults.perPromptSimilarities ?? undefined,
            llmCoverageScores: evaluationResults.llmCoverageScores ?? undefined,
        },
        errors: Object.keys(errors).length > 0 ? errors : undefined,
    };

    // Generate summary after the main result object is constructed
    const summaryResult = await generateExecutiveSummary(finalOutput, logger);
    if (!('error' in summaryResult)) {
        finalOutput.executiveSummary = summaryResult;
    }

    const fileName = `${runLabel}_${safeTimestamp}_comparison.json`;

    try {
        await saveResultToStorage(resolvedConfigId, fileName, finalOutput);
        logger.info(`[PipelineService] Successfully saved aggregated results to storage with key/filename: ${fileName}`);
        return { data: finalOutput, fileName: fileName };
    } catch (error: any) {
        logger.error(`[PipelineService] Failed to save the final comparison output to storage: ${error.message}`);
        return { data: finalOutput, fileName: null };
    }
}

/**
 * Main service function to execute the full comparison pipeline.
 * @param config - The comparison configuration.
 * @param runLabel - The label for the current run.
 * @param evalMethods - The evaluation methods to use.
 * @param logger - The logger for logging purposes.
 * @param existingResponsesMap - Optional map of pre-generated responses.
 * @param forcePointwiseKeyEval - Optional flag to force pointwise key evaluation.
 * @param useCache - Optional flag to enable caching for model responses.
 * @returns A promise that resolves to an object containing the full comparison data and the filename it was saved under.
 */
export async function executeComparisonPipeline(
    config: ComparisonConfig,
    runLabel: string,
    evalMethods: EvaluationMethod[],
    logger: Logger,
    // Optional: allow passing pre-generated responses to skip generation
    existingResponsesMap?: Map<string, PromptResponseData>,
    forcePointwiseKeyEval?: boolean,
    useCache: boolean = false,
    commitSha?: string,
    blueprintFileName?: string,
): Promise<{ data: FinalComparisonOutputV2, fileName: string | null }> {
    logger.info(`[PipelineService] Starting comparison pipeline for configId: '${config.id || config.configId}' runLabel: '${runLabel}'`);
    
    // Step 1: Generate all model responses if not provided
    const allResponsesMap = existingResponsesMap ?? await generateAllResponses(config, logger, useCache);
    
    // Step 2: Prepare for evaluation
    const evaluationInputs: EvaluationInput[] = [];

    for (const promptData of allResponsesMap.values()) {
        const modelIdsForThisPrompt = Object.keys(promptData.modelResponses);
        
        evaluationInputs.push({
            promptData: promptData,
            config: config,
            effectiveModelIds: modelIdsForThisPrompt,
            embeddingModel: config.embeddingModel, // Pass embedding model
        });
    }

    // Step 3: Run selected evaluation methods
    const evaluators: Evaluator[] = [
        new EmbeddingEvaluator(logger),
        new LLMCoverageEvaluator(logger, useCache),
    ];

    const chosenEvaluators = evaluators.filter(e => evalMethods.includes(e.getMethodName()));
    logger.info(`[PipelineService] Will run the following evaluators: ${chosenEvaluators.map(e => e.getMethodName()).join(', ')}`);
    
    let combinedEvaluationResults: Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>> = {
        llmCoverageScores: {},
        similarityMatrix: {},
        perPromptSimilarities: {},
        extractedKeyPoints: {}
    };

    for (const evaluator of chosenEvaluators) {
        logger.info(`[PipelineService] --- Running ${evaluator.getMethodName()} evaluator ---`);
        const results = await evaluator.evaluate(evaluationInputs);
        combinedEvaluationResults = { ...combinedEvaluationResults, ...results };
        logger.info(`[PipelineService] --- Finished ${evaluator.getMethodName()} evaluator ---`);
        
        // Early validation: Check if embedding evaluation failed completely
        if (evaluator.getMethodName() === 'embedding' && results.perPromptSimilarities) {
            const allSimilarityValues: number[] = [];
            
            // Collect all similarity scores
            Object.values(results.perPromptSimilarities).forEach(promptData => {
                Object.values(promptData).forEach(modelData => {
                    Object.values(modelData).forEach(score => {
                        if (typeof score === 'number') {
                            allSimilarityValues.push(score);
                        }
                    });
                });
            });
            
            // Filter out self-similarities (which are always 1.0) and check if all others are NaN
            const nonSelfSimilarities = allSimilarityValues.filter(score => score !== 1.0);
            const allNaN = nonSelfSimilarities.length > 0 && nonSelfSimilarities.every(score => isNaN(score));
            
            if (allNaN) {
                const errorMsg = 'Embedding evaluation failed completely - all similarity scores are NaN. This typically indicates an issue with the embedding API (missing OPENAI_API_KEY, API errors, or network issues). Aborting run to prevent data contamination.';
                logger.error(`[PipelineService] ${errorMsg}`);
                throw new Error(errorMsg);
            }
            
            const nanCount = nonSelfSimilarities.filter(score => isNaN(score)).length;
            if (nanCount > 0) {
                logger.warn(`[PipelineService] Found ${nanCount} NaN similarity scores out of ${nonSelfSimilarities.length} comparisons. Some embeddings may have failed.`);
            } else {
                logger.info(`[PipelineService] Embedding evaluation successful - ${nonSelfSimilarities.length} valid similarity scores generated.`);
            }
        }
    }

    // Step 4: Aggregate and save results
    const finalResult = await aggregateAndSaveResults(
        config,
        runLabel,
        allResponsesMap,
        combinedEvaluationResults,
        evalMethods,
        logger,
        commitSha,
        blueprintFileName,
    );
    logger.info(`[PipelineService] executeComparisonPipeline finished successfully. Results at: ${finalResult.fileName}`);
    return finalResult;
}
