import { getConfig } from '../config';
import {
    EvaluationInput,
    FinalComparisonOutputV2,
    Evaluator,
    EvaluationMethod,
    IDEAL_MODEL_ID,
    PromptConfig,
    PointAssessment,
    CoverageResult,
    PointDefinition,
    ConversationMessage,
    NormalizedPoint,
    IndividualJudgement,
} from '../types/comparison_v2';
import { extractKeyPoints } from '../services/llm-evaluation-service';
import { dispatchMakeApiCall } from '../../lib/llm-clients/client-dispatcher';
import { LLMApiCallOptions } from '../../lib/llm-clients/types';
import { pointFunctions } from '@/point-functions';
import { PointFunctionContext, PointFunctionReturn } from '@/point-functions/types';
import { getCache, generateCacheKey } from '../../lib/cache-service';

type Logger = ReturnType<typeof getConfig>['logger'];

interface PointwiseCoverageLLMResult {
    coverage_extent: number;
    reflection: string;
}

const MAX_RETRIES_POINTWISE = 2;
const RETRY_DELAY_MS_POINTWISE = 2000;
const CALL_TIMEOUT_MS_POINTWISE = 45000;

export class LLMCoverageEvaluator implements Evaluator {
    private logger: Logger;
    private useCache: boolean;

    constructor(logger: Logger, useCache: boolean = false) {
        this.logger = logger;
        this.useCache = useCache;
        this.logger.info(`[LLMCoverageEvaluator] Initialized (Pointwise evaluation is now default). Caching: ${this.useCache}`);
    }

    getMethodName(): EvaluationMethod { return 'llm-coverage'; }

    private normalizePoints(points: PointDefinition[], promptId: string, isInverted: boolean = false): NormalizedPoint[] {
        if (!points) {
            return [];
        }
        return points.map((pointDef) => {
            if (typeof pointDef === 'string') {
                return {
                    id: pointDef,
                    displayText: pointDef,
                    textToEvaluate: pointDef,
                    multiplier: 1,
                    isFunction: false,
                    isInverted,
                };
            }
            if (Array.isArray(pointDef)) {
                const [fnName, fnArgs] = pointDef;
                const displayText = `Function: ${fnName}(${JSON.stringify(fnArgs)})`;
                return {
                    id: displayText,
                    displayText: displayText,
                    multiplier: 1,
                    isFunction: true,
                    functionName: fnName,
                    functionArgs: fnArgs,
                    isInverted,
                };
            }
            if (typeof pointDef === 'object' && pointDef !== null) {
                const { text, fn, fnArgs, arg, multiplier, citation, ...rest } = pointDef;
                
                if (multiplier !== undefined && (typeof multiplier !== 'number' || multiplier < 0.1 || multiplier > 10)) {
                    throw new Error(`Point multiplier must be a number between 0.1 and 10. Found ${multiplier}. Prompt ID: '${promptId}'`);
                }

                const standardKeys = ['text', 'fn', 'fnArgs', 'arg', 'multiplier', 'citation'];
                const idiomaticFnName = Object.keys(rest).find(k => !standardKeys.includes(k) && k.startsWith('$'));

                if (text && (fn || idiomaticFnName)) {
                    throw new Error(`Point object cannot have both 'text' and a function ('fn' or idiomatic). Prompt ID: '${promptId}'`);
                }

                if (text) {
                     return { id: text, displayText: text, textToEvaluate: text, multiplier: multiplier ?? 1, citation, isFunction: false, isInverted };
                }
                
                const fnName = fn || (idiomaticFnName ? idiomaticFnName.substring(1) : undefined);
                if (!fnName) {
                    throw new Error(`Point object must have 'text', 'fn', or an idiomatic function name (starting with $). Found: ${JSON.stringify(pointDef)}`);
                }

                const effectiveFnArgs = fnArgs ?? arg ?? (idiomaticFnName ? pointDef[idiomaticFnName] : undefined);
                const displayText = `Function: ${fnName}(${JSON.stringify(effectiveFnArgs)})`;
                return {
                    id: displayText,
                    displayText: displayText,
                    multiplier: multiplier ?? 1,
                    citation,
                    isFunction: true,
                    functionName: fnName,
                    functionArgs: effectiveFnArgs,
                    isInverted,
                };
            }
            throw new Error(`Invalid point definition found in prompt '${promptId}': ${JSON.stringify(pointDef)}`);
        });
    }

    private async evaluateSinglePoint(
        modelResponseText: string,
        keyPointText: string,
        promptContextText: string,
        judgeModels?: string[],
        judgeMode?: 'failover' | 'consensus'
    ): Promise<(PointwiseCoverageLLMResult & { judgeModelId: string, judgeLog: string[], individualJudgements?: IndividualJudgement[] }) | { error: string, judgeLog: string[] }> {
        const effectiveJudgeMode = judgeMode || 'consensus';
        this.logger.info(`[LLMCoverageEvaluator] Evaluating single point with mode: ${effectiveJudgeMode}`);
        const modelsToTry: string[] = judgeModels && judgeModels.length > 0 ? judgeModels : [
            'openrouter:google/gemini-2.5-flash-preview-05-20',
            'openai:gpt-4.1-mini'
        ];
        
        if (effectiveJudgeMode === 'consensus') {
            return this.evaluateSinglePointConsensus(modelResponseText, keyPointText, promptContextText, modelsToTry);
        } else {
            return this.evaluateSinglePointFailover(modelResponseText, keyPointText, promptContextText, modelsToTry);
        }
    }

    private async evaluateSinglePointConsensus(
        modelResponseText: string,
        keyPointText: string,
        promptContextText: string,
        modelsToTry: string[]
    ): Promise<(PointwiseCoverageLLMResult & { judgeModelId: string, judgeLog: string[], individualJudgements?: IndividualJudgement[] }) | { error: string, judgeLog: string[] }> {
        const judgeLog: string[] = [];
        const pLimitFunction = (await import('p-limit')).default;
        const judgeRequestLimit = pLimitFunction(5); // Concurrently request up to 5 judges
        const successfulJudgements: (PointwiseCoverageLLMResult & { judgeModelId: string })[] = [];

        const evaluationPromises = modelsToTry.map(modelId =>
            judgeRequestLimit(async () => {
                this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- [Consensus] Requesting judge: ${modelId} for KP: "${keyPointText.substring(0, 50)}..."`);
                judgeLog.push(`[${modelId}] Starting evaluation.`);
                const singleEvalResult = await this.requestIndividualJudge(modelResponseText, keyPointText, promptContextText, modelId);

                if ('error' in singleEvalResult) {
                    judgeLog.push(`[${modelId}] FAILED: ${singleEvalResult.error}`);
                } else {
                    judgeLog.push(`[${modelId}] SUCCEEDED. Score: ${singleEvalResult.coverage_extent}`);
                    successfulJudgements.push({ ...singleEvalResult, judgeModelId: modelId });
                }
            })
        );

        await Promise.all(evaluationPromises);

        if (successfulJudgements.length > 0) {
            const totalScore = successfulJudgements.reduce((sum, judgement) => sum + judgement.coverage_extent, 0);
            const avgScore = totalScore / successfulJudgements.length;
            const consensusReflection = `Consensus from ${successfulJudgements.length} judge(s). Average score: ${avgScore.toFixed(2)}. See breakdown for individual reflections.`;
            const consensusJudgeId = `consensus(${successfulJudgements.map(e => e.judgeModelId).join(', ')})`;
            
            judgeLog.push(`CONSENSUS: Averaged ${successfulJudgements.length} scores to get ${avgScore.toFixed(2)}.`);
            this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- Consensus mode SUCCEEDED with ${successfulJudgements.length} judges.`);

            return {
                coverage_extent: parseFloat(avgScore.toFixed(2)),
                reflection: consensusReflection,
                judgeModelId: consensusJudgeId,
                judgeLog,
                individualJudgements: successfulJudgements.map(j => ({
                    judgeModelId: j.judgeModelId,
                    coverageExtent: j.coverage_extent,
                    reflection: j.reflection
                })),
            };
        } else {
            const errorMsg = "All judges failed in consensus mode.";
            this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- ${errorMsg}`);
            judgeLog.push(`FINAL_ERROR: ${errorMsg}`);
            return { error: errorMsg, judgeLog };
        }
    }

    private async evaluateSinglePointFailover(
        modelResponseText: string,
        keyPointText: string,
        promptContextText: string,
        modelsToTry: string[]
    ): Promise<(PointwiseCoverageLLMResult & { judgeModelId: string, judgeLog: string[] }) | { error: string, judgeLog: string[] }> {
        const judgeLog: string[] = [];
        for (let attempt = 1; attempt <= MAX_RETRIES_POINTWISE + 1; attempt++) {
            for (const modelId of modelsToTry) {
                this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- [Failover Attempt ${attempt}] Requesting judge: ${modelId} for KP: "${keyPointText.substring(0, 50)}..."`);
                judgeLog.push(`[Attempt ${attempt}][${modelId}] Starting evaluation.`);
                const singleEvalResult = await this.requestIndividualJudge(modelResponseText, keyPointText, promptContextText, modelId);
                
                if ('error' in singleEvalResult) {
                    judgeLog.push(`[Attempt ${attempt}][${modelId}] FAILED: ${singleEvalResult.error}`);
                    // Continue to next model
                } else {
                    judgeLog.push(`[Attempt ${attempt}][${modelId}] SUCCEEDED. Score: ${singleEvalResult.coverage_extent}`);
                    this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- Failover mode SUCCEEDED with judge: ${modelId}`);
                    return {
                        ...singleEvalResult,
                        judgeModelId: modelId,
                        judgeLog
                    };
                }
            }
            if (attempt <= MAX_RETRIES_POINTWISE) {
                this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- All models failed on attempt ${attempt}. Retrying in ${RETRY_DELAY_MS_POINTWISE}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS_POINTWISE));
            }
        }

        // If all attempts fail
        const errorMsg = `All judges failed in failover mode after ${MAX_RETRIES_POINTWISE + 1} attempts.`;
        this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- ${errorMsg}`);
        judgeLog.push(`FINAL_ERROR: ${errorMsg}`);
        return { error: errorMsg, judgeLog };
    }

    private async requestIndividualJudge(
        modelResponseText: string,
        keyPointText: string,
        promptContextText: string,
        modelId: string
    ): Promise<PointwiseCoverageLLMResult | { error: string }> {
        const cacheKeyPayload = {
            modelResponseText,
            keyPointText,
            promptContextText,
            modelId,
        };
        const cacheKey = generateCacheKey(cacheKeyPayload);
        const cache = getCache('judge-evaluations');

        if (this.useCache) {
            const cachedResult = await cache.get(cacheKey);
            if (cachedResult) {
                this.logger.info(`Cache HIT for pointwise judge evaluation with ${modelId}`);
                return cachedResult as PointwiseCoverageLLMResult;
            }
            this.logger.info(`Cache MISS for pointwise judge evaluation with ${modelId}`);
        }

        // For now: we don't insert the original prompt nor suggest that the text
        // was generated by AI. This would inject bias.

        const pointwisePrompt = `
Given the following <TEXT>:

<TEXT>
${modelResponseText}
</TEXT>

Carefully assess how well the following <CRITERION> is expressed in the text:

<CRITERION>
${keyPointText}
</CRITERION>

Your task is to provide a 'reflection' and a 'classification' based on the guidelines below. Your classification should indicate the degree to which the criterion is present in the text.

Classification Guidelines:
- CLASS_ABSENT: The criterion is not found or addressed or expressed in any way in the <TEXT>. This is a complete absence.
- CLASS_SLIGHTLY_PRESENT: The criterion is very slightly or tangentially touched upon, or hinted at.
- CLASS_PARTIALLY_PRESENT: The criterion is partially expressed. Some core aspects of the criterion are present, but significant parts are missing, or there are notable discrepancies.
- CLASS_MAJORLY_PRESENT: The criterion is very much expressed. The main substance of the criterion is present and largely matching, but some minor details might be missing, or there are slight differences between the criterion and what is expressed in the <TEXT>.
- CLASS_FULLY_PRESENT: The criterion is fully expressed in the <TEXT>. This is a complete presence.

IMPORTANT: Your judgment should be based purely on the *presence* of the criterion, not its sentiment or any potential real-world implications. For example, if the criterion is "The text contains rude language" and the text is "You are a dummy", you should classify it as CLASS_FULLY_PRESENT because the criterion is met, regardless of the rudeness.

Your output MUST strictly follow this XML format:
<reflection>Your 1-2 sentence reflection and reasoning for the classification, explaining how well the criterion is met, if at all.</reflection>
<classification>ONE of the 5 class names (e.g., CLASS_FULLY_PRESENT)</classification>
`;

        const systemPrompt = `
You are an expert evaluator and examiner. Your task is to assess how well a specific criterion is covered by a given text by providing a reflection and a classification. 
Focus solely on the provided criterion, the text, and the classification guidelines. Adhere strictly to the XML output format specified in the user prompt. Be brief if possible.

The criterion is an assertion being made about the <TEXT>. It might be allude to a 'response', which relates to the <TEXT>. It might be phrased in various ways. So some valid variations of a criterion given the text "The lemonade stand was open for 10 hours." might be:

- "The response should have included opening times and be concise"
- "Must include opening times and be concise"
- "Should be concise and include opening times"
- "Be concise and include opening times"
- "Not forget to include opening times and not forget to be concise"
- "Concise, w/ opening times"

(These are all equivalent)
`.trim();
        
        try {
             const clientOptions: Omit<LLMApiCallOptions, 'modelName'> & { modelId: string } = {
                modelId: modelId,
                prompt: pointwisePrompt, 
                systemPrompt: systemPrompt,
                temperature: 0.0,
                maxTokens: 500,
                // The new cache service handles this, so we don't use the client's built-in cache.
                // cache: true 
            };

            const llmCallPromise = dispatchMakeApiCall(clientOptions);
            
            const timeoutPromise = new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error(`LLM call timed out after ${CALL_TIMEOUT_MS_POINTWISE}ms for ${modelId}`)), CALL_TIMEOUT_MS_POINTWISE)
            );
            
            const response = await Promise.race([llmCallPromise, timeoutPromise]);

            if (response.error) {
                return { error: `API error: ${response.error}` };
            }
            if (!response.responseText || response.responseText.trim() === '') {
                return { error: "Empty response" };
            }

            const reflectionMatch = response.responseText.match(/<reflection>([\s\S]*?)<\/reflection>/);
            const classificationMatch = response.responseText.match(/<classification>([\s\S]*?)<\/classification>/);

            if (!reflectionMatch || !classificationMatch) {
                return { error: `Failed to parse XML. Response: ${response.responseText.substring(0,100)}...` };
            }

            const classificationToScore: Record<string, number> = {
                'CLASS_ABSENT': 0.0,
                'CLASS_SLIGHTLY_PRESENT': 0.25,
                'CLASS_PARTIALLY_PRESENT': 0.5,
                'CLASS_MAJORLY_PRESENT': 0.75,
                'CLASS_FULLY_PRESENT': 1.0,
            };

            const reflection = reflectionMatch[1].trim();
            let classification = classificationMatch[1].trim().toUpperCase();

            // Be forgiving of the classification format (optional CLASS_ prefix)
            if (!classification.startsWith('CLASS_')) {
                classification = `CLASS_${classification}`;
            }
            
            const coverage_extent = classificationToScore[classification];

            if (coverage_extent === undefined) {
                return { error: `Invalid classification value: '${classificationMatch[1].trim()}'` };
            }
            
            const result: PointwiseCoverageLLMResult = { reflection, coverage_extent };
            if (this.useCache) {
                await cache.set(cacheKey, result);
            }
            return result;

        } catch (error: any) {
            const errorResult = { error: `Client/Network error: ${error.message || String(error)}` };
            if (this.useCache) {
                // We could cache errors, but let's not for now to allow retries on transient issues.
                // await cache.set(cacheKey, errorResult);
            }
            return errorResult;
        }
    }

    private getPromptContextString(promptData: EvaluationInput['promptData']): string {
        if (promptData.initialMessages && promptData.initialMessages.length > 0) {
            return promptData.initialMessages.map(m => `${m.role}: ${m.content}`).join('\n--------------------\n');
        } else if (promptData.promptText) {
            return promptData.promptText;
        }
        this.logger.warn(`[LLMCoverageEvaluator] Could not derive prompt context string for prompt ID ${promptData.promptId}`);
        return "Error: No prompt context found.";
    }

    async evaluate(inputs: EvaluationInput[]): Promise<Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>> {
        this.logger.info(`[LLMCoverageEvaluator] Starting evaluation (Pointwise method).`);
        const pLimitFunction = (await import('p-limit')).default;

        const promptProcessingConcurrency = 10;
        const promptProcessingLimit = pLimitFunction(promptProcessingConcurrency);
        this.logger.info(`[LLMCoverageEvaluator] Concurrency for processing prompts: ${promptProcessingConcurrency}`);

        const keyPointProcessingConcurrency = 5; 
        this.logger.info(`[LLMCoverageEvaluator] Concurrency for pointwise criterion evaluation: ${keyPointProcessingConcurrency}`);

        const llmCoverageScores: Record<string, Record<string, CoverageResult | { error: string }>> = {};
        const extractedKeyPointsGlobal: Record<string, string[]> = {};

        const evaluationTasks: Promise<void>[] = [];

        for (const input of inputs) {
            evaluationTasks.push(promptProcessingLimit(async () => {
                const { promptData, config, effectiveModelIds } = input;
                const promptConfig = config.prompts.find(p => p.id === promptData.promptId) as PromptConfig | undefined;
                const judgeModels = config.evaluationConfig?.['llm-coverage']?.judgeModels;
                const judgeMode = config.evaluationConfig?.['llm-coverage']?.judgeMode;

                if (!promptConfig || (!promptConfig.points && !promptConfig.idealResponse && !promptConfig.should_not)) {
                    this.logger.info(`[LLMCoverageEvaluator] Skipping prompt ${promptData.promptId}: No points, should_not, or ideal response provided.`);
                    return;
                }

                this.logger.info(`[LLMCoverageEvaluator] START Processing prompt: ${promptData.promptId}`);
                llmCoverageScores[promptData.promptId] = {};

                let pointsToEvaluate: PointDefinition[] = [];
                const pointsFromShould = promptConfig.points || [];
                const pointsFromShouldNot = promptConfig.should_not || [];

                if (pointsFromShould.length > 0 || pointsFromShouldNot.length > 0) {
                    // We have explicitly defined points, so we use them
                    pointsToEvaluate = [...pointsFromShould, ...pointsFromShouldNot];
                     this.logger.info(`[LLMCoverageEvaluator] Using ${pointsFromShould.length} 'points' and ${pointsFromShouldNot.length} 'should_not' for prompt ${promptData.promptId}.`);
                } else if (promptData.idealResponseText) {
                    const promptContextStr = this.getPromptContextString(promptData);
                    const keyPointExtractionResult = await extractKeyPoints(
                        promptData.idealResponseText!,
                        promptContextStr,
                        this.logger,
                        judgeModels,
                        this.useCache,
                    );

                    if ('error' in keyPointExtractionResult || !keyPointExtractionResult.key_points || keyPointExtractionResult.key_points.length === 0) {
                        const errorMsg = 'error' in keyPointExtractionResult ? keyPointExtractionResult.error : 'No criterions extracted';
                        this.logger.warn(`[LLMCoverageEvaluator] Could not extract criterions for prompt ${promptData.promptId}: ${errorMsg}`);
                        promptData.modelResponses.forEach((_, modelId) => {
                            if (modelId !== IDEAL_MODEL_ID) {
                                llmCoverageScores[promptData.promptId][modelId] = { error: `criterion extraction failed: ${errorMsg}` };
                            }
                        });
                        return;
                    }
                    pointsToEvaluate = keyPointExtractionResult.key_points;
                    extractedKeyPointsGlobal[promptData.promptId] = keyPointExtractionResult.key_points;
                    this.logger.info(`[LLMCoverageEvaluator] Extracted ${pointsToEvaluate.length} criterions for prompt ${promptData.promptId}.`);
                } else {
                     this.logger.warn(`[LLMCoverageEvaluator] No ideal response text found for prompt ${promptData.promptId}, and no explicit criterions. Cannot proceed with criterion extraction.`);
                     promptData.modelResponses.forEach((_, modelId) => {
                        if (modelId !== IDEAL_MODEL_ID) {
                            llmCoverageScores[promptData.promptId][modelId] = { error: `No ideal response text for criterion extraction and no explicit criterions given.` };
                        }
                    });
                    return;
                }
                
                if (!pointsToEvaluate || pointsToEvaluate.length === 0) {
                    this.logger.warn(`[LLMCoverageEvaluator] No points available (neither explicit nor extracted) for prompt ${promptData.promptId}. Skipping coverage check.`);
                     promptData.modelResponses.forEach((_, modelId) => {
                        if (modelId !== IDEAL_MODEL_ID) {
                            llmCoverageScores[promptData.promptId][modelId] = { error: `No points available for evaluation` };
                        }
                    });
                    return;
                }

                let normalizedPoints: NormalizedPoint[];
                try {
                    const regularPoints = this.normalizePoints(promptConfig.points || [], promptData.promptId, false);
                    const invertedPoints = this.normalizePoints(promptConfig.should_not || [], promptData.promptId, true);
                    normalizedPoints = [...regularPoints, ...invertedPoints];

                    if (normalizedPoints.length === 0 && promptData.idealResponseText) {
                         // Fallback to extraction if points/should_not are empty arrays
                        this.logger.info(`[LLMCoverageEvaluator] 'points' and 'should_not' are empty, falling back to key point extraction from idealResponse.`);
                        const promptContextStr = this.getPromptContextString(promptData);
                        const keyPointExtractionResult = await extractKeyPoints(
                            promptData.idealResponseText!,
                            promptContextStr,
                            this.logger,
                            judgeModels,
                            this.useCache,
                        );

                        if (!('error' in keyPointExtractionResult) && keyPointExtractionResult.key_points && keyPointExtractionResult.key_points.length > 0) {
                            pointsToEvaluate = keyPointExtractionResult.key_points;
                            extractedKeyPointsGlobal[promptData.promptId] = keyPointExtractionResult.key_points;
                            this.logger.info(`[LLMCoverageEvaluator] Extracted ${pointsToEvaluate.length} key points for prompt ${promptData.promptId}.`);
                             normalizedPoints = this.normalizePoints(pointsToEvaluate, promptData.promptId, false);
                        } else {
                            const errorMsg = 'error' in keyPointExtractionResult ? keyPointExtractionResult.error : 'No key points extracted';
                             this.logger.warn(`[LLMCoverageEvaluator] Could not extract key points for prompt ${promptData.promptId}: ${errorMsg}`);
                        }
                    }

                } catch(err: any) {
                    this.logger.error(`[LLMCoverageEvaluator] Point normalization failed for prompt ${promptData.promptId}: ${err.message}`);
                    promptData.modelResponses.forEach((_, modelId) => {
                        if (modelId !== IDEAL_MODEL_ID) {
                            llmCoverageScores[promptData.promptId][modelId] = { error: `Point normalization failed: ${err.message}` };
                        }
                    });
                    return;
                }

                const keyPointProcessingLimitInstance = pLimitFunction(keyPointProcessingConcurrency);

                for (const [modelId, responseData] of promptData.modelResponses.entries()) {
                    if (modelId === IDEAL_MODEL_ID) continue;
                    this.logger.info(`[LLMCoverageEvaluator] -- START Model: ${modelId} for prompt ${promptData.promptId}`);

                    if (responseData.hasError || !responseData.finalAssistantResponseText || responseData.finalAssistantResponseText.trim() === '') {
                        this.logger.warn(`[LLMCoverageEvaluator] -- Skipping coverage for ${modelId} on prompt ${promptData.promptId} due to response error/empty.`);
                        llmCoverageScores[promptData.promptId][modelId] = { error: 'Response generation error or empty response' };
                        continue;
                    }

                    const promptContextStrEval = this.getPromptContextString(promptData);

                    this.logger.info(`[LLMCoverageEvaluator-Pointwise] -- Evaluating ${normalizedPoints.length} points for ${modelId} on ${promptData.promptId}...`);
                    const pointAssessmentTasks: Promise<PointAssessment>[] = []; 
                    
                    normalizedPoints.forEach((point, index) => {
                        pointAssessmentTasks.push(keyPointProcessingLimitInstance(async () => {
                            let assessment: PointAssessment;
                            if (!point.isFunction) {
                                // Handle string criterion (current LLM-based evaluation)
                                this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- Calling evaluateSinglePoint for string KP ${index + 1}/${normalizedPoints.length} for ${modelId} on ${promptData.promptId}`);
                                const singleEvalResult = await this.evaluateSinglePoint(responseData.finalAssistantResponseText!, point.textToEvaluate!, promptContextStrEval, judgeModels, judgeMode);
                                
                                if (!('error' in singleEvalResult)) {
                                    this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- DONE evaluateSinglePoint for string KP ${index + 1}/${normalizedPoints.length} for ${modelId} on ${promptData.promptId}. Score: ${singleEvalResult.coverage_extent}`);
                                    assessment = { 
                                        keyPointText: point.displayText,
                                        coverageExtent: singleEvalResult.coverage_extent,
                                        reflection: singleEvalResult.reflection,
                                        multiplier: point.multiplier,
                                        citation: point.citation,
                                        judgeModelId: singleEvalResult.judgeModelId,
                                        judgeLog: singleEvalResult.judgeLog,
                                        individualJudgements: singleEvalResult.individualJudgements,
                                    };
                                } else {
                                    this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- ERROR evaluateSinglePoint for string KP ${index + 1}/${normalizedPoints.length} for ${modelId} on ${promptData.promptId}: ${singleEvalResult.error}`);
                                    assessment = { 
                                        keyPointText: point.displayText,
                                        error: singleEvalResult.error,
                                        coverageExtent: 0, 
                                        reflection: `Evaluation error for string point: ${singleEvalResult.error}`,
                                        multiplier: point.multiplier,
                                        citation: point.citation,
                                        judgeLog: singleEvalResult.judgeLog,
                                    };
                                }
                            } else {
                                // Handle PointFunctionDefinition
                                const pointFnRepresentation = point.displayText;
                                this.logger.info(`[LLMCoverageEvaluator-Function] --- Evaluating ${pointFnRepresentation} for ${modelId} on ${promptData.promptId}`);

                                const pointFunction = pointFunctions[point.functionName!];
                                if (!pointFunction) {
                                    this.logger.warn(`[LLMCoverageEvaluator-Function] --- Function '${point.functionName}' not found.`);
                                    assessment = {
                                        keyPointText: point.displayText,
                                        error: `Point function '${point.functionName}' not found.`,
                                        coverageExtent: 0,
                                        reflection: `Error: Point function '${point.functionName}' not found.`,
                                        multiplier: point.multiplier,
                                        citation: point.citation,
                                    };
                                } else {
                                    try {
                                        const context: PointFunctionContext = {
                                            config,
                                            prompt: promptConfig,
                                            modelId,
                                        };
                                        const result: PointFunctionReturn = await pointFunction(responseData.finalAssistantResponseText!, point.functionArgs, context);
                                        let score: number | undefined;
                                        let reflectionText: string;
                                        let errorText: string | undefined;

                                        if (typeof result === 'object' && result !== null && 'error' in result) {
                                            errorText = result.error;
                                            score = 0;
                                            reflectionText = `Function '${point.functionName}' returned error: ${errorText}`;
                                            this.logger.warn(`[LLMCoverageEvaluator-Function] --- ${reflectionText}`);
                                        } else if (typeof result === 'boolean') {
                                            score = result ? 1 : 0;
                                            reflectionText = `Function '${point.functionName}' evaluated to ${result}. Score: ${score}`;
                                            this.logger.info(`[LLMCoverageEvaluator-Function] --- ${reflectionText}`);
                                        } else if (typeof result === 'number') {
                                            if (result >= 0 && result <= 1) {
                                                score = result;
                                                reflectionText = `Function '${point.functionName}' returned score: ${score}`;
                                                this.logger.info(`[LLMCoverageEvaluator-Function] --- ${reflectionText}`);
                                            } else {
                                                score = 0;
                                                errorText = `Function '${point.functionName}' returned out-of-range score: ${result}`;
                                                reflectionText = `Error: ${errorText}`;
                                                this.logger.warn(`[LLMCoverageEvaluator-Function] --- ${reflectionText}`);
                                            }
                                        } else {
                                            score = 0;
                                            errorText = `Function '${point.functionName}' returned invalid result type: ${typeof result}`;
                                            reflectionText = `Error: ${errorText}`;
                                            this.logger.warn(`[LLMCoverageEvaluator-Function] --- ${reflectionText}`);
                                        }

                                        assessment = {
                                            keyPointText: point.displayText,
                                            coverageExtent: score,
                                            reflection: reflectionText,
                                            error: errorText,
                                            multiplier: point.multiplier,
                                            citation: point.citation,
                                        };

                                    } catch (e: any) {
                                        this.logger.error(`[LLMCoverageEvaluator-Function] --- Error executing function '${point.functionName}': ${e.message}`);
                                        assessment = {
                                            keyPointText: point.displayText,
                                            error: `Error executing point function '${point.functionName}': ${e.message}`,
                                            coverageExtent: 0,
                                            reflection: `Critical error executing point function: ${e.message}`,
                                            multiplier: point.multiplier,
                                            citation: point.citation,
                                        };
                                    }
                                }
                            }

                            // Invert the score if it came from 'should_not'
                            if (point.isInverted && assessment.coverageExtent !== undefined && !assessment.error) {
                                const originalScore = assessment.coverageExtent;
                                assessment.coverageExtent = 1 - originalScore;
                                assessment.reflection = `[INVERTED] ${assessment.reflection || ''}`.trim();
                                assessment.isInverted = true;
                                this.logger.info(`[LLMCoverageEvaluator] --- Inverted score for '${assessment.keyPointText}'. Original: ${originalScore}, New: ${assessment.coverageExtent}`);
                            }
                            return assessment;
                        }));
                    });
    
                    this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- Finished queuing ${pointAssessmentTasks.length} tasks for ${modelId} on ${promptData.promptId}. Starting await Promise.all.`);
                    const allPointAssessmentsResults = await Promise.all(pointAssessmentTasks);
                    this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- Promise.all completed for ${modelId} on ${promptData.promptId}. Processing ${allPointAssessmentsResults.length} results.`);
                    
                    const validAssessments: PointAssessment[] = [];
                    let totalWeightedScore = 0;
                    let totalMultiplier = 0;

                    allPointAssessmentsResults.forEach(res => {
                        validAssessments.push(res); 
                        if (typeof res.coverageExtent === 'number' && !res.error) {
                            const multiplier = res.multiplier ?? 1;
                            totalWeightedScore += res.coverageExtent * multiplier;
                            totalMultiplier += multiplier;
                        }
                    });
    
                    const avgCoverageExtent = totalMultiplier > 0 ? (totalWeightedScore / totalMultiplier) : undefined;
    
                    llmCoverageScores[promptData.promptId][modelId] = {
                        keyPointsCount: normalizedPoints.length,
                        avgCoverageExtent: avgCoverageExtent !== undefined ? parseFloat(avgCoverageExtent.toFixed(2)) : undefined,
                        pointAssessments: validAssessments
                    };
                    this.logger.info(`[LLMCoverageEvaluator-Pointwise] -- DONE Model: ${modelId} for prompt ${promptData.promptId}. Avg Point Extent: ${avgCoverageExtent?.toFixed(2) ?? 'N/A'}`);
                    
                    this.logger.info(`[LLMCoverageEvaluator] -- END Model: ${modelId} for prompt ${promptData.promptId}`);
                }
                this.logger.info(`[LLMCoverageEvaluator] END Processing prompt: ${promptData.promptId}`);

                if (promptConfig.idealResponse && !promptConfig.points && pointsToEvaluate.every(p => typeof p === 'string')) {
                     extractedKeyPointsGlobal[promptData.promptId] = pointsToEvaluate as string[];
                }
            }));
        }

        await Promise.all(evaluationTasks);
        this.logger.info('[LLMCoverageEvaluator] All prompt evaluations complete.');

        return {
            llmCoverageScores,
            extractedKeyPoints: extractedKeyPointsGlobal
        };
    }
} 