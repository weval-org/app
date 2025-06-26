import { getConfig } from '../config';
import {
    EvaluationInput,
    FinalComparisonOutputV2,
    Evaluator,
    LLMCoverageScores,
    EvaluationMethod,
    NormalizedPoint,
    PromptConfig,
    PointDefinition,
    Judge
} from '../types/cli_types';
import {
    ConversationMessage,
    IndividualJudgement,
    PointAssessment,
    CoverageResult,
} from '@/types/shared';
import { extractKeyPoints } from '../services/llm-evaluation-service';
import { dispatchMakeApiCall } from '../../lib/llm-clients/client-dispatcher';
import { LLMApiCallOptions } from '../../lib/llm-clients/types';
import * as pointFunctions from '@/point-functions';
import { PointFunctionContext, PointFunctionReturn } from '@/point-functions/types';
import { getCache, generateCacheKey } from '../../lib/cache-service';
import { backOff } from 'exponential-backoff';
import xml2js from 'xml2js';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { PointFunctionDefinition } from '@/app/utils/types';
import { getModelResponse, DEFAULT_TEMPERATURE } from '../services/llm-service';
import { evaluateFunctionPoints, aggregateCoverageScores } from './coverage-logic';

type Logger = ReturnType<typeof getConfig>['logger'];

// Add local interface to fix TS error until types can be globally updated
interface LLMCoverageEvaluationConfig {
    judgeModels?: string[];
    judgeMode?: 'failover' | 'consensus';
    judges?: Judge[];
}

const DEFAULT_JUDGES: Judge[] = [
    { id: 'standard', model: 'openrouter:google/gemini-2.5-flash-preview-05-20', approach: 'standard' },
    { id: 'prompt-aware', model: 'openrouter:x-ai/grok-3-mini', approach: 'prompt-aware' },
    { id: 'holistic', model: 'openai:gpt-4.1-mini', approach: 'holistic' }
];

interface PointwiseCoverageLLMResult {
    coverage_extent: number;
    reflection: string;
}

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
        pointToEvaluate: NormalizedPoint,
        allPointsInPrompt: NormalizedPoint[],
        promptContextText: string,
        judges?: Judge[],
        judgeMode?: 'failover' | 'consensus' // Legacy
    ): Promise<(PointwiseCoverageLLMResult & { judgeModelId: string, judgeLog: string[], individualJudgements?: IndividualJudgement[] }) | { error: string, judgeLog: string[] }> {
        const judgeLog: string[] = [];
        const pLimitFunction = (await import('p-limit')).default;
        const judgeRequestLimit = pLimitFunction(5);
        const successfulJudgements: (PointwiseCoverageLLMResult & { judgeModelId: string })[] = [];

        // Determine which judges to use
        let judgesToUse: Judge[];
        if (judges && judges.length > 0) {
            this.logger.info(`[LLMCoverageEvaluator] Using custom judges configuration with ${judges.length} judges.`);
            judgesToUse = judges;
        } else {
            this.logger.info(`[LLMCoverageEvaluator] No custom judges configured. Using default set of ${DEFAULT_JUDGES.length} judges.`);
            judgesToUse = DEFAULT_JUDGES;
        }

        const allKeyPointTexts = allPointsInPrompt.map(p => `${p.isInverted ? '[should not]' : '[should]'} ${p.displayText}`);
        
        const evaluationPromises = judgesToUse.map((judge, index) =>
            judgeRequestLimit(async () => {
                const judgeIdentifier = judge.id || `judge-${index}`;
                this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- [Consensus] Requesting judge: ${judgeIdentifier} (Model: ${judge.model}, Approach: ${judge.approach}) for KP: "${pointToEvaluate.textToEvaluate!.substring(0, 50)}..."`);
                judgeLog.push(`[${judgeIdentifier}] Starting evaluation with model ${judge.model} and approach ${judge.approach}.`);

                const singleEvalResult = await this.requestIndividualJudge(
                    modelResponseText,
                    pointToEvaluate.textToEvaluate!,
                    allKeyPointTexts,
                    promptContextText,
                    judge
                );

                if ('error' in singleEvalResult) {
                    judgeLog.push(`[${judgeIdentifier}] FAILED: ${singleEvalResult.error}`);
                } else {
                    const finalJudgeId = judge.id ? `${judge.id}(${judge.model})` : `${judge.approach}(${judge.model})`;
                    judgeLog.push(`[${judgeIdentifier}] SUCCEEDED. Score: ${singleEvalResult.coverage_extent}`);
                    successfulJudgements.push({ ...singleEvalResult, judgeModelId: finalJudgeId });
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

    private async requestIndividualJudge(
        modelResponseText: string,
        keyPointText: string,
        allOtherKeyPoints: string[],
        promptContextText: string,
        judge: Judge
    ): Promise<PointwiseCoverageLLMResult | { error: string }> {
        const cacheKeyPayload = {
            modelResponseText,
            keyPointText,
            allOtherKeyPoints,
            promptContextText,
            judge, // Judge object includes model and approach
        };
        const cacheKey = generateCacheKey(cacheKeyPayload);
        const cache = getCache('judge-evaluations');
        const { model: modelId, approach } = judge;

        if (this.useCache) {
            const cachedResult = await cache.get(cacheKey);
            if (cachedResult) {
                this.logger.info(`Cache HIT for pointwise judge evaluation with ${modelId} (${approach})`);
                return cachedResult as PointwiseCoverageLLMResult;
            }
            this.logger.info(`Cache MISS for pointwise judge evaluation with ${modelId} (${approach})`);
        }

        let pointwisePrompt: string;

        switch (approach) {
            case 'prompt-aware':
                pointwisePrompt = `
The user's original request was:
<PROMPT>
${promptContextText}
</PROMPT>

Given the following <TEXT> which was generated in response to the prompt:
<TEXT>
${modelResponseText}
</TEXT>

Carefully assess how well the following <CRITERION> is expressed in the text:
<CRITERION>
${keyPointText}
</CRITERION>
`;
                break;
            
            case 'holistic':
                pointwisePrompt = `
The user's original request was:
<PROMPT>
${promptContextText}
</PROMPT>

You are evaluating a response against a rubric of several criteria.
For context only, the full list of criteria is:
<CRITERIA_LIST>
${allOtherKeyPoints.map(kp => `- ${kp}`).join('\n')}
</CRITERIA_LIST>

Given the following <TEXT> which was generated in response to the prompt:
<TEXT>
${modelResponseText}
</TEXT>

Now, carefully assess how well THIS SPECIFIC <CRITERION> ONLY is expressed in the text:
<CRITERION>
${keyPointText}
</CRITERION>
`;
                break;

            case 'standard':
            default:
                 pointwisePrompt = `
Given the following <TEXT>:
<TEXT>
${modelResponseText}
</TEXT>

Carefully assess how well the following <CRITERION> is expressed in the text:
<CRITERION>
${keyPointText}
</CRITERION>
`;
                break;
        }

        const finalPrompt = `${pointwisePrompt}

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
                prompt: finalPrompt, 
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
        this.logger.info(`[LLMCoverageEvaluator] Starting evaluation for ${inputs.length} prompts.`);
        const llmCoverageScores: FinalComparisonOutputV2['evaluationResults']['llmCoverageScores'] = {};
        const extractedKeyPoints: FinalComparisonOutputV2['extractedKeyPoints'] = {};

        for (const input of inputs) {
            const { promptData, config } = input;
            const promptConfig = config.prompts.find(p => p.id === promptData.promptId);

            if (!promptConfig) {
                this.logger.warn(`[LLMCoverageEvaluator] Could not find prompt config for ID: ${promptData.promptId}. Skipping.`);
                continue;
            }

            llmCoverageScores[promptData.promptId] = {};
            
            // Normalize points from both 'should' and 'should_not' blocks
            const regularPoints = this.normalizePoints(promptConfig.points || [], promptData.promptId, false);
            const invertedPoints = this.normalizePoints(promptConfig.should_not || [], promptData.promptId, true);
            let combinedNormalizedPoints = [...regularPoints, ...invertedPoints];

            // Handle automatic key point extraction if no points are manually defined
            if (combinedNormalizedPoints.length === 0 && promptData.idealResponseText) {
                const promptContextStr = this.getPromptContextString(promptData);
                const keyPointExtractionResult = await extractKeyPoints(
                    promptData.idealResponseText!,
                    promptContextStr,
                    this.logger,
                    config.evaluationConfig?.['llm-coverage']?.judgeModels,
                    this.useCache,
                );

                if ('error' in keyPointExtractionResult) {
                    this.logger.error(`[LLMCoverageEvaluator] Failed to extract key points for prompt ${promptData.promptId}: ${keyPointExtractionResult.error}`);
                    continue; // Skip this prompt if extraction fails
                }
                
                extractedKeyPoints[promptData.promptId] = keyPointExtractionResult.key_points;
                // Normalize the freshly extracted points
                combinedNormalizedPoints = this.normalizePoints(keyPointExtractionResult.key_points, promptData.promptId, false);
            }

            const llmCoverageConfig = config.evaluationConfig?.['llm-coverage'] as LLMCoverageEvaluationConfig | undefined;

            for (const [modelId, responseData] of promptData.modelResponses.entries()) {
                if (modelId === IDEAL_MODEL_ID) continue;

                try {
                    const functionPoints = combinedNormalizedPoints.filter(p => p.isFunction);
                    const textPoints = combinedNormalizedPoints.filter(p => !p.isFunction);
                    
                    const context: PointFunctionContext = { config, prompt: promptConfig, modelId, logger: this.logger };

                    // 1. Evaluate function points using our new helper
                    const functionAssessments = await evaluateFunctionPoints(functionPoints, responseData.finalAssistantResponseText, context);

                    // 2. Evaluate text points (LLM-judged)
                    const textAssessments: PointAssessment[] = [];
                    if (textPoints.length > 0) {
                        const promptContextString = this.getPromptContextString(promptData);
                        for (const point of textPoints) {
                            const judgeResult = await this.evaluateSinglePoint(
                                responseData.finalAssistantResponseText,
                                point,
                                textPoints,
                                promptContextString,
                                llmCoverageConfig?.judges,
                                llmCoverageConfig?.judgeMode
                            );

                            let finalScore = 'error' in judgeResult ? undefined : judgeResult.coverage_extent;
                            if (finalScore !== undefined && point.isInverted) {
                                finalScore = 1.0 - finalScore;
                            }
                            
                            textAssessments.push({
                                keyPointText: point.displayText,
                                coverageExtent: finalScore,
                                reflection: 'error' in judgeResult ? undefined : `${point.isInverted ? '[INVERTED] ' : ''}${judgeResult.reflection}`,
                                error: 'error' in judgeResult ? judgeResult.error : undefined,
                                individualJudgements: 'individualJudgements' in judgeResult ? judgeResult.individualJudgements : undefined,
                                judgeModelId: 'judgeModelId' in judgeResult ? judgeResult.judgeModelId : undefined,
                                multiplier: point.multiplier,
                                citation: point.citation,
                                isInverted: point.isInverted,
                            });
                        }
                    }

                    // 3. Combine and aggregate scores using our new helper
                    const allAssessments = [...functionAssessments, ...textAssessments];
                    const finalAverage = aggregateCoverageScores(allAssessments);

                    llmCoverageScores[promptData.promptId][modelId] = {
                        keyPointsCount: allAssessments.length,
                        avgCoverageExtent: allAssessments.length > 0 ? parseFloat(finalAverage.toFixed(2)) : undefined,
                        pointAssessments: allAssessments,
                    };

                } catch (error: any) {
                    this.logger.error(`[LLMCoverageEvaluator] Error processing model ${modelId} for prompt ${promptData.promptId}: ${error.message}`);
                    llmCoverageScores[promptData.promptId][modelId] = { error: error.message };
                }
            }
        }

        return { llmCoverageScores, extractedKeyPoints };
    }

} 