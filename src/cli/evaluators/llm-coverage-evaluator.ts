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
    PointDefinition
} from '../types/comparison_v2';
import { extractKeyPoints } from '../services/llm-evaluation-service';
import { openRouterModuleClient } from '../../lib/llm-clients/openrouter-client';
import { LLMApiCallOptions } from '../../lib/llm-clients/types';
import { pointFunctions } from '@/point-functions';
import { PointFunctionContext, PointFunctionReturn } from '@/point-functions/types';

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

    constructor(logger: Logger) {
        this.logger = logger;
        this.logger.info(`[LLMCoverageEvaluator] Initialized (Pointwise evaluation is now default).`);
    }

    getMethodName(): EvaluationMethod { return 'llm-coverage'; }

    private async evaluateSinglePoint(
        modelResponseText: string,
        keyPointText: string,
        promptContextText: string 
    ): Promise<PointwiseCoverageLLMResult | { error: string }> {
        const pointwisePrompt = `
Given the following <MODEL_RESPONSE> which was generated in response to the <ORIGINAL_PROMPT>:

<ORIGINAL_PROMPT>
${promptContextText}
</ORIGINAL_PROMPT>

<MODEL_RESPONSE>
${modelResponseText}
</MODEL_RESPONSE>

Now, carefully assess ONLY the following <KEY_POINT>:

<KEY_POINT>
${keyPointText}
</KEY_POINT>

Your task is to provide a 'reflection' and a 'coverage_extent' score based on the guidelines below.

Scoring guidelines for 'coverage_extent':
- 0.0: The key point is not mentioned or addressed in any way in the MODEL_RESPONSE.
- 0.1-0.3: The key point is only barely or tangentially touched upon, or hinted at without any real substance.
- 0.4-0.6: The key point is partially covered. Some core aspects of the key point are present, but significant parts are missing, or there are notable inaccuracies.
- 0.7-0.9: The key point is mostly covered. The main substance is present and largely accurate, but some minor details might be missing, or there are slight inaccuracies.
- 1.0: The key point is fully and accurately covered in the MODEL_RESPONSE.

IMPORTANT: if the key point is met by language that doesn't precisely match the wording of the key point, then that is totally fine, as long as it is reasonably clear. For example if the key point is "The cat is under the carpet", and the response states "The cat is below the carpet", that is totally fine and deserves a score of 1.0.

Your output MUST strictly follow this XML format:
<reflection>Your 1-2 sentence reflection and reasoning for the score, explaining how well the key point is met, if at all.</reflection>
<coverage_extent>A numerical score from 0.0 to 1.0 based on the guidelines. Example: 0.7</coverage_extent>
`;

        const systemPrompt = `You are an expert evaluator. Your task is to assess how well a specific key point is covered by a given model response by providing a reflection and a coverage_extent score. 
Focus solely on the provided key point, the model response, and the scoring guidelines. Adhere strictly to the XML output format specified in the user prompt.`;

        this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- begin evaluateSinglePoint for KP: "${keyPointText.substring(0, 50)}..."`);

        const modelsToTry: string[] = [
            'openrouter:google/gemini-2.5-flash-preview-05-20',
            'openrouter:openai/gpt-4.1-mini',
            'openrouter:openai/gpt-4.1-nano',
            'openrouter:openai/gpt-4.1',
        ];

        for (let attempt = 1; attempt <= MAX_RETRIES_POINTWISE + 1; attempt++) {
            for (const fullModelString of modelsToTry) {
                const parts = fullModelString.split(':');
                if (parts.length !== 2 || parts[0].toLowerCase() !== 'openrouter') {
                    this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- Invalid model string format: ${fullModelString}. Skipping.`);
                    continue; 
                }
                const targetOpenRouterModelId = parts[1];

                this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- evaluateSinglePoint (Attempt ${attempt}/${MAX_RETRIES_POINTWISE + 1}) with ${targetOpenRouterModelId} (from ${fullModelString}) for KP: "${keyPointText.substring(0, 50)}..."`);
                
                try {
                    const clientOptions: LLMApiCallOptions = {
                        modelName: targetOpenRouterModelId,
                        prompt: pointwisePrompt, 
                        systemPrompt: systemPrompt,
                        temperature: 0.0,
                        maxTokens: 500,
                        cache: true
                    };

                    const llmCallPromise = openRouterModuleClient.makeApiCall(clientOptions);
                    
                    const timeoutPromise = new Promise<never>((_, reject) => 
                        setTimeout(() => reject(new Error(`LLM call timed out after ${CALL_TIMEOUT_MS_POINTWISE}ms for ${targetOpenRouterModelId}`)), CALL_TIMEOUT_MS_POINTWISE)
                    );
                    
                    const response = await Promise.race([llmCallPromise, timeoutPromise]);

                    if (response.error) {
                        this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- (Attempt ${attempt}) API error with ${targetOpenRouterModelId} for KP "${keyPointText.substring(0,50)}...": ${response.error}`);
                        continue; 
                    }

                    if (!response.responseText || response.responseText.trim() === '') {
                        this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- (Attempt ${attempt}) Empty response from ${targetOpenRouterModelId} for KP "${keyPointText.substring(0,50)}..."`);
                        continue; 
                    }

                    const reflectionMatch = response.responseText.match(/<reflection>([\s\S]*?)<\/reflection>/);
                    const extentMatch = response.responseText.match(/<coverage_extent>([\s\S]*?)<\/coverage_extent>/);

                    if (!reflectionMatch || !extentMatch) {
                        this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- (Attempt ${attempt}) Failed to parse XML from ${targetOpenRouterModelId} for KP "${keyPointText.substring(0,50)}...". Response: ${response.responseText.substring(0,300)}`);
                        continue; 
                    }

                    const reflection = reflectionMatch[1].trim();
                    const coverageExtentStr = extentMatch[1].trim();
                    const coverage_extent = parseFloat(coverageExtentStr);

                    if (isNaN(coverage_extent) || coverage_extent < 0 || coverage_extent > 1) {
                        this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- (Attempt ${attempt}) Invalid coverage_extent value from ${targetOpenRouterModelId}: '${coverageExtentStr}'. Parsed as NaN or out of range.`);
                        continue; 
                    }

                    this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- evaluateSinglePoint (Attempt ${attempt}) with ${targetOpenRouterModelId} SUCCEEDED for KP: "${keyPointText.substring(0, 50)}..."`);
                    return { reflection, coverage_extent }; 

                } catch (error: any) {
                    this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- (Attempt ${attempt}) Client/Network error with ${fullModelString} for KP "${keyPointText.substring(0,50)}...": ${error.message || String(error)}`);
                }
            } 

            if (attempt <= MAX_RETRIES_POINTWISE) {
                this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- All models failed for KP "${keyPointText.substring(0,50)}..." on attempt ${attempt}. Retrying in ${RETRY_DELAY_MS_POINTWISE}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS_POINTWISE));
            } else {
                 this.logger.error(`[LLMCoverageEvaluator-Pointwise] --- All models failed for KP "${keyPointText.substring(0,50)}..." after ${MAX_RETRIES_POINTWISE + 1} attempts.`);
                 return { error: `LLM call failed for KP after ${MAX_RETRIES_POINTWISE + 1} attempts with all specified models.` };
            }
        } 
        
        return { error: `evaluateSinglePoint failed unexpectedly after all retries for KP "${keyPointText.substring(0,50)}..."` };
    }

    async evaluate(inputs: EvaluationInput[]): Promise<Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>> {
        this.logger.info(`[LLMCoverageEvaluator] Starting evaluation (Pointwise method).`);
        const pLimitFunction = (await import('p-limit')).default;

        const promptProcessingConcurrency = 10;
        const promptProcessingLimit = pLimitFunction(promptProcessingConcurrency);
        this.logger.info(`[LLMCoverageEvaluator] Concurrency for processing prompts: ${promptProcessingConcurrency}`);

        const keyPointProcessingConcurrency = 5; 
        this.logger.info(`[LLMCoverageEvaluator] Concurrency for pointwise key point evaluation: ${keyPointProcessingConcurrency}`);

        const llmCoverageScores: Record<string, Record<string, CoverageResult | { error: string }>> = {};
        const extractedKeyPointsGlobal: Record<string, string[]> = {};

        const evaluationTasks: Promise<void>[] = [];

        for (const input of inputs) {
            evaluationTasks.push(promptProcessingLimit(async () => {
                const { promptData, config, effectiveModelIds } = input;
                const promptConfig = config.prompts.find(p => p.id === promptData.promptId) as PromptConfig | undefined;

                if (!promptConfig || (!promptConfig.idealResponse && !promptConfig.points)) { 
                    this.logger.info(`[LLMCoverageEvaluator] Skipping prompt ${promptData.promptId}: No ideal response or points provided.`);
                    return;
                }

                this.logger.info(`[LLMCoverageEvaluator] START Processing prompt: ${promptData.promptId}`);
                llmCoverageScores[promptData.promptId] = {};

                let pointsToEvaluate: PointDefinition[] = [];

                if (promptConfig.points && promptConfig.points.length > 0) {
                    pointsToEvaluate = promptConfig.points;
                    this.logger.info(`[LLMCoverageEvaluator] Using ${pointsToEvaluate.length} explicit points (from 'points' field) for prompt ${promptData.promptId}.`);
                } else if (promptData.idealResponseText) {
                    const keyPointExtractionResult = await extractKeyPoints(
                        promptData.idealResponseText!,
                        promptData.promptText,
                        this.logger
                    );

                    if ('error' in keyPointExtractionResult || !keyPointExtractionResult.key_points || keyPointExtractionResult.key_points.length === 0) {
                        const errorMsg = 'error' in keyPointExtractionResult ? keyPointExtractionResult.error : 'No key points extracted';
                        this.logger.warn(`[LLMCoverageEvaluator] Could not extract key points for prompt ${promptData.promptId}: ${errorMsg}`);
                        promptData.modelResponses.forEach((_, modelId) => {
                            if (modelId !== IDEAL_MODEL_ID) {
                                llmCoverageScores[promptData.promptId][modelId] = { error: `Key point extraction failed: ${errorMsg}` };
                            }
                        });
                        return;
                    }
                    pointsToEvaluate = keyPointExtractionResult.key_points;
                    extractedKeyPointsGlobal[promptData.promptId] = keyPointExtractionResult.key_points;
                    this.logger.info(`[LLMCoverageEvaluator] Extracted ${pointsToEvaluate.length} key points for prompt ${promptData.promptId}.`);
                } else {
                     this.logger.warn(`[LLMCoverageEvaluator] No ideal response text found for prompt ${promptData.promptId}, and no explicit key points. Cannot proceed with key point extraction.`);
                     promptData.modelResponses.forEach((_, modelId) => {
                        if (modelId !== IDEAL_MODEL_ID) {
                            llmCoverageScores[promptData.promptId][modelId] = { error: `No ideal response text for key point extraction and no explicit key points given.` };
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

                const keyPointProcessingLimitInstance = pLimitFunction(keyPointProcessingConcurrency);

                for (const [modelId, responseData] of promptData.modelResponses.entries()) {
                    if (modelId === IDEAL_MODEL_ID) continue;
                    this.logger.info(`[LLMCoverageEvaluator] -- START Model: ${modelId} for prompt ${promptData.promptId}`);

                    if (responseData.hasError || !responseData.responseText || responseData.responseText.trim() === '') {
                        this.logger.warn(`[LLMCoverageEvaluator] -- Skipping coverage for ${modelId} on prompt ${promptData.promptId} due to response error/empty.`);
                        llmCoverageScores[promptData.promptId][modelId] = { error: 'Response generation error or empty response' };
                        continue;
                    }

                    this.logger.info(`[LLMCoverageEvaluator-Pointwise] -- Evaluating ${pointsToEvaluate.length} points for ${modelId} on ${promptData.promptId}...`);
                    const pointAssessmentTasks: Promise<PointAssessment>[] = []; 
                    
                    pointsToEvaluate.forEach((pointDefinition, index) => {
                        pointAssessmentTasks.push(keyPointProcessingLimitInstance(async () => {
                            if (typeof pointDefinition === 'string') {
                                // Handle string key point (current LLM-based evaluation)
                                this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- Calling evaluateSinglePoint for string KP ${index + 1}/${pointsToEvaluate.length} for ${modelId} on ${promptData.promptId}`);
                                const singleEvalResult = await this.evaluateSinglePoint(responseData.responseText!, pointDefinition, promptData.promptText);
                                
                                if (!('error' in singleEvalResult)) {
                                    this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- DONE evaluateSinglePoint for string KP ${index + 1}/${pointsToEvaluate.length} for ${modelId} on ${promptData.promptId}. Score: ${singleEvalResult.coverage_extent}`);
                                    return { 
                                        keyPointText: pointDefinition,
                                        coverageExtent: singleEvalResult.coverage_extent,
                                        reflection: singleEvalResult.reflection
                                    } as PointAssessment;
                                } else {
                                    this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- ERROR evaluateSinglePoint for string KP ${index + 1}/${pointsToEvaluate.length} for ${modelId} on ${promptData.promptId}: ${singleEvalResult.error}`);
                                    return { 
                                        keyPointText: pointDefinition,
                                        error: singleEvalResult.error,
                                        coverageExtent: 0, 
                                        reflection: `Evaluation error for string point: ${singleEvalResult.error}`
                                    } as PointAssessment;
                                }
                            } else {
                                // Handle PointFunctionDefinition
                                const [functionName, functionArgs] = pointDefinition;
                                const pointFnRepresentation = `Function: ${functionName}(${JSON.stringify(functionArgs).substring(0, 50)}${JSON.stringify(functionArgs).length > 50 ? '...' : ''})`;
                                this.logger.info(`[LLMCoverageEvaluator-Function] --- Evaluating ${pointFnRepresentation} for ${modelId} on ${promptData.promptId}`);

                                const pointFunction = pointFunctions[functionName];
                                if (!pointFunction) {
                                    this.logger.warn(`[LLMCoverageEvaluator-Function] --- Function '${functionName}' not found.`);
                                    return {
                                        keyPointText: pointFnRepresentation,
                                        error: `Point function '${functionName}' not found.`,
                                        coverageExtent: 0,
                                        reflection: `Error: Point function '${functionName}' not found.`
                                    } as PointAssessment;
                                }

                                try {
                                    const context: PointFunctionContext = {
                                        config,
                                        prompt: promptConfig, // The specific prompt config
                                        modelId, // The model ID being evaluated
                                    };
                                    const result: PointFunctionReturn = await pointFunction(responseData.responseText!, functionArgs, context);
                                    let score: number | undefined;
                                    let reflectionText: string;
                                    let errorText: string | undefined;

                                    if (typeof result === 'object' && result !== null && 'error' in result) {
                                        errorText = result.error;
                                        score = 0;
                                        reflectionText = `Function '${functionName}' returned error: ${errorText}`;
                                        this.logger.warn(`[LLMCoverageEvaluator-Function] --- ${reflectionText}`);
                                    } else if (typeof result === 'boolean') {
                                        score = result ? 1 : 0;
                                        reflectionText = `Function '${functionName}' evaluated to ${result}. Score: ${score}`;
                                        this.logger.info(`[LLMCoverageEvaluator-Function] --- ${reflectionText}`);
                                    } else if (typeof result === 'number') {
                                        if (result >= 0 && result <= 1) {
                                            score = result;
                                            reflectionText = `Function '${functionName}' returned score: ${score}`;
                                            this.logger.info(`[LLMCoverageEvaluator-Function] --- ${reflectionText}`);
                                        } else {
                                            score = 0;
                                            errorText = `Function '${functionName}' returned out-of-range score: ${result}`;
                                            reflectionText = `Error: ${errorText}`;
                                            this.logger.warn(`[LLMCoverageEvaluator-Function] --- ${reflectionText}`);
                                        }
                                    } else {
                                        score = 0;
                                        errorText = `Function '${functionName}' returned invalid result type: ${typeof result}`;
                                        reflectionText = `Error: ${errorText}`;
                                        this.logger.warn(`[LLMCoverageEvaluator-Function] --- ${reflectionText}`);
                                    }

                                    return {
                                        keyPointText: pointFnRepresentation,
                                        coverageExtent: score,
                                        reflection: reflectionText,
                                        error: errorText
                                    } as PointAssessment;

                                } catch (e: any) {
                                    this.logger.error(`[LLMCoverageEvaluator-Function] --- Error executing function '${functionName}': ${e.message}`);
                                    return {
                                        keyPointText: pointFnRepresentation,
                                        error: `Error executing point function '${functionName}': ${e.message}`,
                                        coverageExtent: 0,
                                        reflection: `Critical error executing point function: ${e.message}`
                                    } as PointAssessment;
                                }
                            }
                        }));
                    });
    
                    this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- Finished queuing ${pointAssessmentTasks.length} tasks for ${modelId} on ${promptData.promptId}. Starting await Promise.all.`);
                    const allPointAssessmentsResults = await Promise.all(pointAssessmentTasks);
                    this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- Promise.all completed for ${modelId} on ${promptData.promptId}. Processing ${allPointAssessmentsResults.length} results.`);
                    
                    const validAssessments: PointAssessment[] = [];
                    let totalCoverageExtent = 0;
                    let assessedPointsCount = 0; 

                    allPointAssessmentsResults.forEach(res => {
                        validAssessments.push(res); 
                        if (typeof res.coverageExtent === 'number' && res.error === undefined) { 
                            totalCoverageExtent += res.coverageExtent;
                            assessedPointsCount++;
                        }
                    });
    
                    const avgCoverageExtent = assessedPointsCount > 0 ? (totalCoverageExtent / assessedPointsCount) : undefined;
    
                    llmCoverageScores[promptData.promptId][modelId] = {
                        keyPointsCount: pointsToEvaluate.length,
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