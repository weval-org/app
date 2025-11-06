import { getConfig } from '../config';
import { ComparisonConfig, EvaluationMethod, PromptResponseData, EvaluationInput, FinalComparisonOutputV2, Evaluator, IDEAL_MODEL_ID } from '../types/cli_types';
import { ConversationMessage } from '@/types/shared';
import { EmbeddingEvaluator } from '@/cli/evaluators/embedding-evaluator';
import { LLMCoverageEvaluator } from '@/cli/evaluators/llm-coverage-evaluator';
import { saveResult as saveResultToStorage } from '@/lib/storageService';
import { toSafeTimestamp } from '@/lib/timestampUtils';
import { generateExecutiveSummary as generateExecutiveSummary } from './executive-summary-service';
import { generateAllResponses, ProgressCallback } from './comparison-pipeline-service.non-stream';
import { buildDeckXml, parseResponsesXml, validateResponses } from '@/cli/services/consumer-deck';
import { collectConsumerSlices } from '@/cli/services/consumer-service';
import crypto from 'crypto';
import { exec } from 'child_process';
import { getModelResponse } from './llm-service';
import { getCache, generateCacheKey } from '@/lib/cache-service';
import type { FixtureSet } from '@/lib/fixtures-service';

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
    requireExecutiveSummary?: boolean,
    skipExecutiveSummary?: boolean,
    noSave?: boolean,
    generationApproach?: any,
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

    if (generationApproach) {
        (finalOutput as any).generationApproach = generationApproach;
    }

    // Optionally generate executive summary
    if (skipExecutiveSummary) {
        if (requireExecutiveSummary) {
            logger.warn(`[PipelineService] Both --skip-executive-summary and --require-executive-summary were provided. Skipping executive summary as requested.`);
        }
        logger.info(`[PipelineService] ⏭️  Skipping executive summary generation by flag.`);
    } else {
        const summaryResult = await generateExecutiveSummary(finalOutput, logger);
        if (!('error' in summaryResult)) {
            finalOutput.executiveSummary = summaryResult;
            logger.info(`[PipelineService] ✅ Executive summary generated successfully.`);
        } else {
            logger.error(`[PipelineService] ❌ Executive summary generation failed: ${summaryResult.error}`);
            if (requireExecutiveSummary) {
                logger.error(`[PipelineService] 🚨 FATAL: --require-executive-summary flag is set, but summary generation failed.`);
                throw new Error(`Executive summary generation failed and is required: ${summaryResult.error}`);
            } else {
                logger.warn(`[PipelineService] ⚠️  Run will continue without executive summary. Use 'backfill-executive-summary' to retry later.`);
                // Still save the run data without the executive summary
            }
        }
    }

    const fileName = `${runLabel}_${safeTimestamp}_comparison.json`;

    if (noSave) {
        logger.info(`[PipelineService] Demo/no-save mode enabled. Skipping persistence and returning result only.`);
        return { data: finalOutput, fileName: null };
    }

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
 * @param onProgress - Optional progress callback for generation and evaluation phases.
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
    requireExecutiveSummary?: boolean,
    skipExecutiveSummary?: boolean,
    genOptions?: { genTimeoutMs?: number; genRetries?: number },
    prefilledCoverage?: Record<string, Record<string, any>>,
    fixturesCtx?: { fixtures: FixtureSet; strict: boolean },
    noSave?: boolean,
    onProgress?: ProgressCallback,
): Promise<{ data: FinalComparisonOutputV2, fileName: string | null }> {
    logger.info(`[PipelineService] Starting comparison pipeline for configId: '${config.id || config.configId}' runLabel: '${runLabel}'`);
    
    // Step 0: If consumer:* models exist and no existingResponsesMap provided, collect consumer responses first, then generate API ones
    let allResponsesMap: Map<string, PromptResponseData>;
    if (existingResponsesMap) {
        allResponsesMap = existingResponsesMap;
    } else {
        const modelIds = (config.models || []).map(m => typeof m === 'string' ? m : (m as any).id);
        const consumerModels = modelIds.filter(id => typeof id === 'string' && (id as string).startsWith('consumer:')) as string[];
        const apiModels = modelIds.filter(id => !(typeof id === 'string' && (id as string).startsWith('consumer:')));
        const perModelApproach: Record<string, 'deck' | 'per_prompt'> = {};

        if (consumerModels.length === 0) {
            // No consumer models → normal generation
            allResponsesMap = await generateAllResponses(config, logger, useCache, onProgress, genOptions, runLabel, fixturesCtx);
        } else {
            // For system permutations, step the user through each variant with a dedicated deck (global <system>)
            const sysVariants: (string | null)[] = Array.isArray(config.systems) && config.systems.length > 0
                ? config.systems
                : [config.system ?? null];

            const { slicesByConsumer } = await collectConsumerSlices(config, logger, consumerModels);

            const bulkMode = (process.env.BULK_MODE || '').toLowerCase() === 'on' || ((process.env.BULK_MODE || '').toLowerCase() !== 'off' && apiModels.length > 0 && consumerModels.length > 0);
            let apiMap: Map<string, PromptResponseData>;
            if (!bulkMode) {
                // Standard per-prompt generation for API models
                const apiOnlyConfig = { ...config, models: apiModels } as ComparisonConfig;
                apiMap = await generateAllResponses(apiOnlyConfig, logger, useCache, onProgress, genOptions, runLabel, fixturesCtx);
            } else {
                logger.info('[PipelineService] BULK MODE enabled for API models. Generating one deck call per model×system variant.');
                // Build empty map
                apiMap = new Map<string, PromptResponseData>();
                // Ensure entries for prompts
                for (const prompt of config.prompts) {
                    apiMap.set(prompt.id, {
                        promptId: prompt.id,
                        promptText: prompt.promptText,
                        initialMessages: prompt.messages!,
                        idealResponseText: (prompt as any).idealResponse || null,
                        modelResponses: {}
                    });
                }
                const sysVariants: (string | null)[] = Array.isArray(config.systems) && config.systems.length > 0
                    ? config.systems
                    : [config.system ?? null];
                const temperatures: number[] = Array.isArray(config.temperatures) && config.temperatures.length > 0
                    ? config.temperatures
                    : (config.temperature !== undefined && config.temperature !== null ? [config.temperature] : [0.0]);
                for (let sysIdx = 0; sysIdx < sysVariants.length; sysIdx++) {
                    const sysText = sysVariants[sysIdx] ?? null;
                    const deckXml = buildDeckXml(config, { systemPrompt: sysText });
                    for (const modelId of apiModels) {
                        for (const temp of temperatures) {
                            const effectiveId = sysVariants.length > 1
                                ? `${modelId}[temp:${temp}][sp_idx:${sysIdx}]`
                                : `${modelId}[temp:${temp}]`;
                            try {
                                const resp = await getModelResponse({
                                    modelId: modelId as string,
                                    messages: [{ role: 'user', content: deckXml }],
                                    temperature: temp,
                                    useCache,
                                    timeout: genOptions?.genTimeoutMs,
                                    retries: genOptions?.genRetries,
                                });
                                const slices = parseResponsesXml(resp || '');
                                for (const prompt of config.prompts) {
                                    const pr = apiMap.get(prompt.id)!;
                                    const text = slices.get(prompt.id) || '';
                                    const history = [...(prompt.messages || []) as any, { role: 'assistant', content: text || '<<error>>missing deck slice<</error>>' }];
                                    if (text) {
                                        pr.modelResponses[effectiveId] = {
                                            finalAssistantResponseText: text,
                                            fullConversationHistory: history,
                                            hasError: false,
                                            systemPromptUsed: sysText ?? null,
                                        } as any;
                                        perModelApproach[effectiveId] = 'deck';
                                    } else {
                                        pr.modelResponses[effectiveId] = {
                                            finalAssistantResponseText: '<<error>>missing deck slice<</error>>',
                                            fullConversationHistory: history,
                                            hasError: true,
                                            errorMessage: 'missing deck slice',
                                            systemPromptUsed: sysText ?? null,
                                        } as any;
                                        perModelApproach[effectiveId] = 'deck';
                                    }
                                }
                            } catch (e: any) {
                                logger.error(`[PipelineService] Bulk deck call failed for ${modelId} (sys ${sysIdx}, temp ${temp}): ${e?.message || e}`);
                                for (const prompt of config.prompts) {
                                    const pr = apiMap.get(prompt.id)!;
                                    const history = [...(prompt.messages || []) as any, { role: 'assistant', content: '<<error>>bulk call failed<</error>>' }];
                                    pr.modelResponses[effectiveId] = {
                                        finalAssistantResponseText: '<<error>>bulk call failed<</error>>',
                                        fullConversationHistory: history,
                                        hasError: true,
                                        errorMessage: e?.message || 'bulk call failed',
                                        systemPromptUsed: sysText ?? null,
                                    } as any;
                                    perModelApproach[effectiveId] = 'deck';
                                }
                            }
                        }
                    }
                }
            }

            // Merge into a unified map
            const merged = new Map(apiMap);
            for (const prompt of config.prompts) {
                const promptId = prompt.id;
                if (!merged.has(promptId)) {
                    merged.set(promptId, {
                        promptId,
                        promptText: prompt.promptText,
                        initialMessages: prompt.messages!,
                        idealResponseText: (prompt as any).idealResponse || null,
                        modelResponses: {}
                    });
                }
                const pr = merged.get(promptId)!;
                for (const consumerId of consumerModels) {
                    const sysCount = Array.isArray(config.systems) && config.systems.length > 0 ? config.systems.length : 1;
                    const emitForSysIdx = (effId: string, bodyText: string) => {
                        const history = [...(prompt.messages || []) as any, { role: 'assistant', content: bodyText || '<<error>>missing consumer response<</error>>' }];
                        if (bodyText) {
                            pr.modelResponses[effId] = {
                                finalAssistantResponseText: bodyText,
                                fullConversationHistory: history,
                                hasError: false,
                                systemPromptUsed: (prompt as any).system ?? config.system ?? null,
                            } as any;
                            perModelApproach[effId] = 'deck';
                        } else {
                            pr.modelResponses[effId] = {
                                finalAssistantResponseText: '<<error>>missing consumer response<</error>>',
                                fullConversationHistory: history,
                                hasError: true,
                                errorMessage: 'missing consumer response',
                                systemPromptUsed: (prompt as any).system ?? config.system ?? null,
                            } as any;
                            perModelApproach[effId] = 'deck';
                        }
                    };
                    const perSys = slicesByConsumer.get(consumerId) || new Map<number, Map<string, string>>();
                    for (let i = 0; i < sysCount; i++) {
                        const slice = perSys.get(i) || new Map<string, string>();
                        const text = slice.get(promptId) || '';
                        const effId = sysCount > 1 ? `${consumerId}[sp_idx:${i}]` : consumerId;
                        emitForSysIdx(effId, text);
                    }
                }
            }
            allResponsesMap = merged;

            // After merge, mark remaining models as per_prompt by default
            for (const pd of allResponsesMap.values()) {
                for (const effId of Object.keys(pd.modelResponses)) {
                    if (!perModelApproach[effId]) perModelApproach[effId] = 'per_prompt';
                }
            }

            // Attach generation approach summary to be persisted
            const values = Object.values(perModelApproach);
            const mode = values.every(v => v === 'deck') ? 'deck' : values.every(v => v === 'per_prompt') ? 'per_prompt' : 'mixed';
            (config as any).__generationApproach = { mode, perModel: perModelApproach, bulkMode, consumerModels };
        }
    }
    
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
        new EmbeddingEvaluator(logger, useCache),
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
        let inputsForThisEvaluator = evaluationInputs;
        if (evaluator.getMethodName() === 'llm-coverage' && prefilledCoverage) {
            // Filter out models that already have prefilled coverage
            inputsForThisEvaluator = evaluationInputs.map(inp => {
                const models = Object.keys(inp.promptData.modelResponses);
                const remainingModels = models.filter(m => !prefilledCoverage?.[inp.promptData.promptId]?.[m]);
                if (remainingModels.length === models.length) return inp;
                const pruned = { ...inp, promptData: { ...inp.promptData, modelResponses: {} as any } } as EvaluationInput;
                remainingModels.forEach(m => {
                    (pruned.promptData.modelResponses as any)[m] = (inp.promptData.modelResponses as any)[m];
                });
                return pruned;
            });
        }
        const results = await evaluator.evaluate(inputsForThisEvaluator, onProgress);
        if (evaluator.getMethodName() === 'llm-coverage') {
            // Deep-merge coverage results to avoid overwriting prefilled entries
            const dest = (combinedEvaluationResults.llmCoverageScores = combinedEvaluationResults.llmCoverageScores || {});
            const resCov = (results as any).llmCoverageScores || {};
            // Merge evaluator results first
            for (const [pid, models] of Object.entries(resCov)) {
                dest[pid] = dest[pid] || {};
                for (const [mid, cov] of Object.entries(models as any)) {
                    dest[pid]![mid] = cov as any;
                }
            }
            // Then merge prefilled coverage (takes precedence)
            if (prefilledCoverage) {
                for (const [pid, models] of Object.entries(prefilledCoverage)) {
                    dest[pid] = dest[pid] || {};
                    for (const [mid, cov] of Object.entries(models)) {
                        dest[pid]![mid] = cov as any;
                    }
                }
            }
            logger.info(`[PipelineService] Coverage merge complete. Prompts with coverage: ${Object.keys(dest).length}`);
            // Assign merged object back onto results so downstream aggregation sees it
            (results as any).llmCoverageScores = dest;
        }
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
    const genApproach = (config as any).__generationApproach || undefined;
    const finalResult = await aggregateAndSaveResults(
        config,
        runLabel,
        allResponsesMap,
        combinedEvaluationResults,
        evalMethods,
        logger,
        commitSha,
        blueprintFileName,
        requireExecutiveSummary,
        skipExecutiveSummary,
        noSave,
        genApproach,
    );
    logger.info(`[PipelineService] executeComparisonPipeline finished successfully. Results at: ${finalResult.fileName}`);
    return finalResult;
}
