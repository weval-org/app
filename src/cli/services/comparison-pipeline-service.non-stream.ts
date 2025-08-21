import { ComparisonConfig, EvaluationMethod, FinalComparisonOutputV2, PromptResponseData, Evaluator } from '../types/cli_types';
import { ConversationMessage } from '@/types/shared';
import { getModelResponse, DEFAULT_TEMPERATURE } from './llm-service';
import { checkForErrors } from '../utils/response-utils';
import { SimpleLogger } from '@/lib/blueprint-service';
import pLimit from '@/lib/pLimit';
import { extractToolCallsFromText } from '../utils/tool-trace';
import { getConfig } from '../config';
import { saveResult as saveResultToStorage } from '@/lib/storageService';
import { toSafeTimestamp } from '@/lib/timestampUtils';
import { generateExecutiveSummary } from './executive-summary-service';
import { EmbeddingEvaluator } from '@/cli/evaluators/embedding-evaluator';
import { LLMCoverageEvaluator } from '@/cli/evaluators/llm-coverage-evaluator';
import { FixtureSet, pickFixtureValue } from '@/lib/fixtures-service';

export type ProgressCallback = (completed: number, total: number) => Promise<void>;

const DEFAULT_GENERATION_CONCURRENCY = 20;
const FAILURE_THRESHOLD = 10; // Consecutive failures to trip circuit breaker

export async function generateAllResponses(
    config: ComparisonConfig,
    logger: SimpleLogger,
    useCache: boolean,
    onProgress?: ProgressCallback,
    genOptions?: { genTimeoutMs?: number; genRetries?: number },
    runLabel?: string,
    fixturesCtx?: { fixtures: FixtureSet; strict: boolean },
): Promise<Map<string, PromptResponseData>> {
    logger.info(`[PipelineService] Generating model responses... Caching: ${useCache}`);
    const limit = pLimit(config.concurrency || DEFAULT_GENERATION_CONCURRENCY);
    const allResponsesMap = new Map<string, PromptResponseData>();
    const tasks: Promise<void>[] = [];
    let generatedCount = 0;

    // --- Circuit Breaker State ---
    const failureCounters = new Map<string, number>();
    const trippedModels = new Set<string>();
    
    /*
     * Per-Model Concurrency Limiting for Circuit Breaker Race Condition Prevention
     * 
     * Problem: With global concurrency (e.g., 20 concurrent tasks), multiple tasks for the same
     * failing model could execute simultaneously:
     *   1. All tasks read failureCounter = 9 (below threshold)
     *   2. All tasks call API and fail
     *   3. All tasks increment counter → 12 API calls instead of 10
     * 
     * Solution: pLimit(1) per model ensures circuit breaker operations are atomic per model:
     *   - Tasks for model A serialize: check counter → API call → update counter → next task
     *   - Tasks for model B run independently and concurrently with model A
     *   - Global concurrency still applies (up to 20 tasks across all models)
     * 
     * Performance: No impact on overall throughput since different models can still run
     * concurrently. Only serializes operations within the same model to prevent races.
     */
    const perModelLimits = new Map<string, ReturnType<typeof pLimit>>();
    // ---------------------------

    const temperaturesToRun = (config.temperatures?.length) ? config.temperatures : [config.temperature];
    const systemPromptsToRun = (config.systems?.length) ? config.systems : [config.system];

    // Convert models to string IDs for processing
    const modelIds = config.models.map(m => typeof m === 'string' ? m : m.id);
    
    // Create per-model limiters upfront (see detailed explanation above)
    modelIds.forEach(modelId => {
        // 1 is best for testability, but no harm in higher for non test env
        perModelLimits.set(modelId, pLimit(
            // process.env.NODE_ENV === 'test' ? 1 : 10
            10 // best to not break circuit breaker
            // Notes:
            // Why: a circuit breaker is about “consecutive failures.”
            // If you let N calls for the same model fly in parallel,
            // they all start before any failure increments the counter.
            // When they all fail, you overshoot the threshold by up to
            // “in‑flight” calls. The only way to strictly enforce “stop after N”
            // is to allow at most 1 in-flight call per model (so the failure
            // counter is checked/updated before dispatching the next call).

        ));
    });

    const totalResponsesToGenerate = config.prompts.length * modelIds.length * temperaturesToRun.length * systemPromptsToRun.length;
    logger.info(`[PipelineService] Preparing to generate ${totalResponsesToGenerate} responses across ${temperaturesToRun.length} temperature(s) and ${systemPromptsToRun.length} system prompt(s).`);

    config.prompts.forEach(promptConfig => {
        if (!promptConfig.messages) {
            throw new Error(`[PipelineService] CRITICAL: promptConfig.messages is undefined for prompt ID '${promptConfig.id}' after validation.`);
        }

        const currentPromptData: PromptResponseData = {
            promptId: promptConfig.id,
            promptText: promptConfig.promptText,
            initialMessages: promptConfig.messages,
            idealResponseText: promptConfig.idealResponse || null,
            modelResponses: {}
        };
        allResponsesMap.set(promptConfig.id, currentPromptData);

        modelIds.forEach(modelId => {
            const modelLimit = perModelLimits.get(modelId)!;
            
            temperaturesToRun.forEach(tempValue => {
                systemPromptsToRun.forEach((systemPromptValue, sp_idx) => {
                    tasks.push(limit(async () => {
                        // Serialize all operations for this specific model to prevent circuit breaker races
                        return modelLimit(async () => {
                        const systemPromptToUse = (config.systems && config.systems.length > 0)
                            ? systemPromptValue
                            : (promptConfig.system !== undefined ? promptConfig.system : config.system);

                        const temperatureForThisCall = tempValue ?? promptConfig.temperature ?? config.temperature ?? DEFAULT_TEMPERATURE;
     
                        let finalEffectiveId = modelId;
                        if (temperatureForThisCall !== undefined) {
                            finalEffectiveId = `${finalEffectiveId}[temp:${temperatureForThisCall.toFixed(1)}]`;
                        }
                        if (config.systems && config.systems.length > 1) {
                            finalEffectiveId = `${finalEffectiveId}[sp_idx:${sp_idx}]`;
                        }
                        
                        logger.info(`[PipelineService] Processing prompt '${promptConfig.id}' with model '${modelId}' (effective: '${finalEffectiveId}'), temperature: ${tempValue}, system prompt index: ${sp_idx}.`);

                        // --- Circuit Breaker Check ---
                        // Check both tripped models and current failure count to prevent race conditions
                        const currentFailureCount = failureCounters.get(modelId) || 0;
                        if (trippedModels.has(modelId) || currentFailureCount >= FAILURE_THRESHOLD) {
                            const errorMessage = `Circuit breaker for model '${modelId}' is open. Auto-failing this request.`;
                            logger.warn(`[PipelineService] ${errorMessage}`);
                            currentPromptData.modelResponses[finalEffectiveId] = {
                                finalAssistantResponseText: `<<error>>${errorMessage}<</error>>`,
                                fullConversationHistory: [...promptConfig.messages!, { role: 'assistant', content: `<<error>>${errorMessage}<</error>>` }],
                                hasError: true,
                                errorMessage: errorMessage,
                                systemPromptUsed: systemPromptToUse ?? null
                            };
                            generatedCount++;
                            if (onProgress) await onProgress(generatedCount, totalResponsesToGenerate);
                            return; // Skip API call
                        }
                        // ---------------------------

                        // Sequential generation with assistant:null support with fixtures
                        let finalAssistantResponseText = '';
                        let errorMessage: string | undefined;
                        let hasError = false;
                        let fullConversationHistoryWithResponse: ConversationMessage[] = [];
                        const generatedAssistantIndices: number[] = [];
                        const generatedAssistantTexts: string[] = [];
                        let fixtureUsed: boolean = false;
                        let fixtureSource: 'final' | 'turns' | undefined;

                        try {
                            const workingHistory: ConversationMessage[] = [];
                            if (systemPromptToUse) {
                                workingHistory.push({ role: 'system', content: systemPromptToUse });
                            }
                            let assistantTurnCount = 0;
                            for (const msg of promptConfig.messages!) {
                                if (msg.role === 'assistant') {
                                    if (msg.content === null) {
                                        // Try fixtures turn-level
                                        let genText: string | null = null;
                                        const fixturePick = fixturesCtx?.fixtures ? pickFixtureValue(fixturesCtx.fixtures, promptConfig.id, modelId, finalEffectiveId, runLabel || '') : null;
                                        if (fixturePick?.turns && fixturePick.turns.length > generatedAssistantIndices.length) {
                                            genText = fixturePick.turns[generatedAssistantIndices.length];
                                            fixtureUsed = true;
                                            fixtureSource = 'turns';
                                        }
                                        if (!genText) {
                                            genText = await getModelResponse({
                                                modelId: modelId,
                                                messages: [...workingHistory],
                                                temperature: temperatureForThisCall,
                                                useCache: useCache,
                                                timeout: genOptions?.genTimeoutMs,
                                                retries: genOptions?.genRetries,
                                            });
                                        }
                                        if (!genText || genText.trim() === '') {
                                            throw new Error('Model returned an empty or whitespace-only response.');
                                        }
                                        workingHistory.push({ role: 'assistant', content: genText });
                                        generatedAssistantIndices.push(assistantTurnCount);
                                        generatedAssistantTexts.push(genText);
                                        finalAssistantResponseText = genText;
                                        if (failureCounters.has(modelId)) {
                                            const currentFailures = failureCounters.get(modelId) || 0;
                                            if (currentFailures > 0) {
                                                logger.info(`[PipelineService] Successful response from '${modelId}' received. Resetting failure counter from ${currentFailures}.`);
                                                failureCounters.set(modelId, 0);
                                            }
                                        }
                                    } else {
                                        workingHistory.push({ role: 'assistant', content: msg.content });
                                    }
                                    assistantTurnCount++;
                                } else {
                                    workingHistory.push(msg as ConversationMessage);
                                }
                            }

                            // Implicit trailing assistant generation when last message is a user
                            const originalMessages = promptConfig.messages!;
                            const lastMsg = originalMessages[originalMessages.length - 1];
                            if (lastMsg && lastMsg.role === 'user') {
                                // Final assistant either from fixtures or real gen
                                let genText: string | null = null;
                                const fixturePick = fixturesCtx?.fixtures ? pickFixtureValue(fixturesCtx.fixtures, promptConfig.id, modelId, finalEffectiveId, runLabel || '') : null;
                                if (!generatedAssistantIndices.length && fixturePick?.final) {
                                    genText = fixturePick.final;
                                    fixtureUsed = true;
                                    fixtureSource = 'final';
                                }
                                if (!genText) {
                                    genText = await getModelResponse({
                                        modelId: modelId,
                                        messages: workingHistory,
                                        temperature: temperatureForThisCall,
                                        useCache: useCache,
                                        timeout: genOptions?.genTimeoutMs,
                                        retries: genOptions?.genRetries,
                                    });
                                }
                                if (!genText || genText.trim() === '') {
                                    throw new Error('Model returned an empty or whitespace-only response.');
                                }
                                workingHistory.push({ role: 'assistant', content: genText });
                                generatedAssistantIndices.push(assistantTurnCount);
                                generatedAssistantTexts.push(genText);
                                finalAssistantResponseText = genText;
                                if (failureCounters.has(modelId)) {
                                    const currentFailures = failureCounters.get(modelId) || 0;
                                    if (currentFailures > 0) {
                                        logger.info(`[PipelineService] Successful response from '${modelId}' received. Resetting failure counter from ${currentFailures}.`);
                                        failureCounters.set(modelId, 0);
                                    }
                                }
                            } else if (!finalAssistantResponseText) {
                                // Fallback: use last fixed assistant or single-shot generation
                                const lastAssistant = [...originalMessages].reverse().find(m => m.role === 'assistant' && typeof m.content === 'string');
                                if (lastAssistant && typeof lastAssistant.content === 'string') {
                                    finalAssistantResponseText = lastAssistant.content;
                                } else {
                                    let genText: string | null = null;
                                    const fixturePick = fixturesCtx?.fixtures ? pickFixtureValue(fixturesCtx.fixtures, promptConfig.id, modelId, finalEffectiveId, runLabel || '') : null;
                                    if (fixturePick?.final) {
                                        genText = fixturePick.final;
                                        fixtureUsed = true;
                                        fixtureSource = 'final';
                                    }
                                    if (!genText) {
                                        genText = await getModelResponse({
                                            modelId: modelId,
                                            messages: workingHistory,
                                            temperature: temperatureForThisCall,
                                            useCache: useCache,
                                            timeout: genOptions?.genTimeoutMs,
                                            retries: genOptions?.genRetries,
                                        });
                                    }
                                    if (!genText || genText.trim() === '') {
                                        throw new Error('Model returned an empty or whitespace-only response.');
                                    }
                                    workingHistory.push({ role: 'assistant', content: genText });
                                    generatedAssistantIndices.push(assistantTurnCount);
                                    generatedAssistantTexts.push(genText);
                                    finalAssistantResponseText = genText;
                                    if (failureCounters.has(modelId)) {
                                        const currentFailures = failureCounters.get(modelId) || 0;
                                        if (currentFailures > 0) {
                                            logger.info(`[PipelineService] Successful response from '${modelId}' received. Resetting failure counter from ${currentFailures}.`);
                                            failureCounters.set(modelId, 0);
                                        }
                                    }
                                }
                            }

                            hasError = checkForErrors(finalAssistantResponseText);
                            if (hasError) {
                                const errorMatch = finalAssistantResponseText.match(/<<error>>([\s\S]*)<<\/error>>/);
                                errorMessage = errorMatch ? errorMatch[1].trim() : `Response contains error markers.`;
                            }

                            fullConversationHistoryWithResponse = [...workingHistory];

                        } catch (error: any) {
                            errorMessage = `Failed to get response for ${finalEffectiveId}: ${error.message || String(error)}`;
                            finalAssistantResponseText = `<<error>>${errorMessage}<</error>>`;
                            hasError = true;
                            logger.error(`[PipelineService] ${errorMessage}`);

                            const historyBeforeFailure: ConversationMessage[] = [];
                            if (systemPromptToUse) {
                                historyBeforeFailure.push({ role: 'system', content: systemPromptToUse });
                            }
                            historyBeforeFailure.push(...promptConfig.messages!.filter(m => !(m.role === 'assistant' && m.content === null)) as ConversationMessage[]);
                            historyBeforeFailure.push({ role: 'assistant', content: finalAssistantResponseText });
                            fullConversationHistoryWithResponse = historyBeforeFailure;

                            const newFailureCount = (failureCounters.get(modelId) || 0) + 1;
                            failureCounters.set(modelId, newFailureCount);
                            logger.warn(`[PipelineService] Failure counter for '${modelId}' is now ${newFailureCount}.`);

                            if (newFailureCount >= FAILURE_THRESHOLD) {
                                trippedModels.add(modelId);
                                logger.error(`[PipelineService] Circuit breaker for '${modelId}' has been tripped after ${newFailureCount} consecutive failures. Subsequent requests will be auto-failed.`);
                            }
                        }

                        currentPromptData.modelResponses[finalEffectiveId] = {
                            finalAssistantResponseText,
                            fullConversationHistory: fullConversationHistoryWithResponse,
                            hasError,
                            errorMessage,
                            systemPromptUsed: systemPromptToUse ?? null,
                            toolCalls: extractToolCallsFromText(finalAssistantResponseText),
                            generatedAssistantIndices,
                            generatedAssistantTexts,
                            fixtureUsed: fixtureUsed || undefined,
                            fixtureSource
                        };
                        generatedCount++;
                        logger.info(`[PipelineService] Generated ${generatedCount}/${totalResponsesToGenerate} responses.`);
                        if (onProgress) {
                            await onProgress(generatedCount, totalResponsesToGenerate);
                        }
                        }); // Close modelLimit async function
                    }));
                });
            });
        });
    });

    await Promise.all(tasks);
    logger.info(`[PipelineService] Finished generating ${generatedCount}/${totalResponsesToGenerate} responses.`);
    return allResponsesMap;
}

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
    if (config.prompts.some(p => (p as any).idealResponse)) {
        hasAnyIdeal = true;
    }

    for (const [promptId, promptData] of allResponsesMap.entries()) {
        promptIds.push(promptId);
        // Store context appropriately
        if (promptData.initialMessages && promptData.initialMessages.length > 0) {
            promptContexts[promptId] = promptData.initialMessages;
        } else if (promptData.promptText) {
            promptContexts[promptId] = promptData.promptText;
        } else {
            promptContexts[promptId] = 'Error: No input context found';
        }

        allFinalAssistantResponses[promptId] = {};
        if (process.env.STORE_FULL_HISTORY !== 'false') {
            fullConversationHistories[promptId] = {};
        }

        // Add ideal response text if it was part of the input
        if (promptData.idealResponseText !== null && promptData.idealResponseText !== undefined) {
            allFinalAssistantResponses[promptId]['ideal'] = promptData.idealResponseText;
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
        effectiveModelsSet.add('ideal');
    }

    const effectiveModels = Array.from(effectiveModelsSet).sort();

    const currentTimestamp = new Date().toISOString();
    const safeTimestamp = toSafeTimestamp(currentTimestamp);

    const resolvedConfigId: string = config.id!;
    const resolvedConfigTitle: string = config.title!;

    if (!resolvedConfigId) {
        logger.error(`Critical: Blueprint ID is missing. Config: ${JSON.stringify(config)}`);
        throw new Error('Blueprint ID is missing unexpectedly after validation.');
    }
    if (!resolvedConfigTitle) {
        logger.error(`Critical: Blueprint Title is missing. Config: ${JSON.stringify(config)}`);
        throw new Error('Blueprint Title is missing unexpectedly after validation.');
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

    // Optionally generate executive summary
    if (skipExecutiveSummary) {
        if (requireExecutiveSummary) {
            logger.warn(`[PipelineService] Both --skip-executive-summary and --require-executive-summary were provided. Skipping executive summary as requested.`);
        }
        logger.info(`[PipelineService] ⏭️  Skipping executive summary generation by flag.`);
    } else {
        const summaryResult = await generateExecutiveSummary(finalOutput, logger);
        if (!('error' in summaryResult)) {
            (finalOutput as any).executiveSummary = summaryResult;
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

    try {
        await saveResultToStorage(resolvedConfigId, fileName, finalOutput);
        logger.info(`[PipelineService] Successfully saved aggregated results to storage with key/filename: ${fileName}`);
        return { data: finalOutput, fileName: fileName };
    } catch (error: any) {
        logger.error(`[PipelineService] Failed to save the final comparison output to storage: ${error.message}`);
        return { data: finalOutput, fileName: null };
    }
}

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
): Promise<{ data: FinalComparisonOutputV2, fileName: string | null }> {
    logger.info(`[PipelineService] Starting comparison pipeline for configId: '${(config as any).id || (config as any).configId}' runLabel: '${runLabel}'`);

    // Step 1: Generate all model responses if not provided
    const allResponsesMap = existingResponsesMap ?? await generateAllResponses(config, logger, useCache, undefined, genOptions);

    // Step 2: Prepare for evaluation
    const evaluationInputs: any[] = [];

    for (const promptData of allResponsesMap.values()) {
        const modelIdsForThisPrompt = Object.keys(promptData.modelResponses);

        evaluationInputs.push({
            promptData: promptData,
            config: config,
            effectiveModelIds: modelIdsForThisPrompt,
            embeddingModel: (config as any).embeddingModel,
        });
    }

    // Step 3: Run selected evaluation methods
    const evaluators: Evaluator[] = [
        new EmbeddingEvaluator(logger),
        new LLMCoverageEvaluator(logger, useCache),
    ];

    const chosenEvaluators = evaluators.filter(e => evalMethods.includes(e.getMethodName() as any));
    logger.info(`[PipelineService] Will run the following evaluators: ${chosenEvaluators.map(e => e.getMethodName()).join(', ')}`);

    let combinedEvaluationResults: Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>> = {
        llmCoverageScores: {},
        similarityMatrix: {},
        perPromptSimilarities: {},
        extractedKeyPoints: {}
    };

    for (const evaluator of chosenEvaluators) {
        logger.info(`[PipelineService] --- Running ${evaluator.getMethodName()} evaluator ---`);
        const results: any = await (evaluator as any).evaluate(evaluationInputs);
        combinedEvaluationResults = { ...combinedEvaluationResults, ...results };
        logger.info(`[PipelineService] --- Finished ${evaluator.getMethodName()} evaluator ---`);
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
        requireExecutiveSummary,
        skipExecutiveSummary,
    );
    logger.info(`[PipelineService] executeComparisonPipeline finished successfully. Results at: ${finalResult.fileName}`);
    return finalResult;
}
