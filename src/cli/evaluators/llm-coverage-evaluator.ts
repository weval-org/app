import { getConfig } from '../config';
import {
    EvaluationInput,
    FinalComparisonOutputV2,
    Evaluator,
    EvaluationMethod,
    NormalizedPoint,
    PointDefinition,
} from '../types/cli_types';
import {
    IndividualJudgement,
    PointAssessment,
    Judge,
    LLMCoverageEvaluationConfig,
    JudgeAgreementMetrics
} from '@/types/shared';
import { extractKeyPoints } from '../services/llm-evaluation-service';
import { getModelResponse } from '../services/llm-service';
import { PointFunctionContext } from '@/point-functions/types';
import { getCache, generateCacheKey } from '../../lib/cache-service';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { evaluateFunctionPoints, aggregateCoverageScores } from './coverage-logic';
import { ProgressCallback } from '../services/comparison-pipeline-service.non-stream';
import pLimit from '@/lib/pLimit';
import { AdaptiveRateLimiter } from '@/lib/adaptive-rate-limiter';
import { extractProviderFromModelId, getProviderProfile } from '@/lib/provider-rate-limits';

const DEFAULT_JUDGE_CONCURRENCY = 20;

type Logger = ReturnType<typeof getConfig>['logger'];

// Global override to force experimental classification scale
const FORCE_EXPERIMENTAL = true;

type ClassificationScaleItem = { name: string; score: number; description: string };

export const DEFAULT_JUDGES: Judge[] = [
    // Cheap, fast, and reliable via OpenRouter:
    {
        id: 'holistic-gemini-2-5-flash',
        model: 'openrouter:google/gemini-2.5-flash',
        approach: 'holistic'
    },

    {
        id: 'holistic-gpt-4-1-mini',
        model: 'openrouter:openai/gpt-4.1-mini',
        approach: 'holistic'
    },

    {
        id: 'holistic-claude-haiku-4-5',
        model: 'openrouter:anthropic/claude-haiku-4.5',
        approach: 'holistic'
    }
];

const DEFAULT_BACKUP_JUDGE: Judge = {
    id: 'backup-claude-4-5-haiku',
    model: 'openrouter:anthropic/claude-haiku-4.5',
    approach: 'holistic'
};

const CLASSIFICATION_SCALE: ClassificationScaleItem[] = [
    // Old Approach: CLASS_ABSENT, CLASS_SLIGHTLY_PRESENT, CLASS_PARTIALLY_PRESENT, CLASS_MAJORLY_PRESENT, CLASS_FULLY_PRESENT
    { name: 'CLASS_UNMET', score: 0.0, description: 'The criterion is not met.' },
    { name: 'CLASS_PARTIALLY_MET', score: 0.25, description: 'The criterion is partially met.' },
    { name: 'CLASS_MODERATELY_MET', score: 0.5, description: 'The criterion is moderately met.' },
    { name: 'CLASS_MAJORLY_MET', score: 0.75, description: 'The criterion is mostly met.' },
    { name: 'CLASS_EXACTLY_MET', score: 1.0, description: 'The criterion is fully met.' }
];

// Experimental 9-point scale with finer granularity
const EXPERIMENTAL_CLASSIFICATION_SCALE: ClassificationScaleItem[] = [
    { name: 'CLASS_UTTERLY_UNMET', score: 0.0, description: 'The criterion is so completely absent to an extent where the content in-fact *contradicts* or contravenes the criterion.' },
    { name: 'CLASS_UNMET', score: 0.001, description: 'The criterion is not met.' },
    { name: 'CLASS_TRACE', score: 0.125, description: 'Only a trace or hint of the criterion appears.' },
    { name: 'CLASS_SLIGHT', score: 0.25, description: 'A slight presence of the criterion is detectable.' },
    { name: 'CLASS_PARTIAL', score: 0.375, description: 'Partial fulfillment; important elements are missing.' },
    { name: 'CLASS_MODERATE', score: 0.5, description: 'Moderate fulfillment; balanced presence with notable gaps.' },
    { name: 'CLASS_SUBSTANTIAL', score: 0.625, description: 'Substantial fulfillment; most key aspects are present.' },
    { name: 'CLASS_MAJOR', score: 0.75, description: 'Major fulfillment; minor omissions remain.' },
    { name: 'CLASS_VERY_NEARLY', score: 0.875, description: 'Very nearly fully met; only negligible details missing.' },
    { name: 'CLASS_EXACT', score: 1.0, description: 'Exactly and fully meets the criterion.' },
];

interface PointwiseCoverageLLMResult {
    coverage_extent: number;
    reflection: string;
}

interface JudgeResult {
    coverage_extent?: number;
    reflection?: string;
    judgeModelId?: string;
    individualJudgements?: IndividualJudgement[];
    error?: string;
    judgeLog: string[];
}

const CALL_TIMEOUT_MS_POINTWISE = 45000;

export class LLMCoverageEvaluator implements Evaluator {
    private logger: Logger;
    private useCache: boolean;

    constructor(logger: Logger, useCache: boolean = false) {
        this.logger = logger;
        this.useCache = useCache;
        this.logger.info(`[LLMCoverageEvaluator] Initialized (Pointwise evaluation is now default). Caching: ${this.useCache}`);
        const defaultScale = FORCE_EXPERIMENTAL ? EXPERIMENTAL_CLASSIFICATION_SCALE : CLASSIFICATION_SCALE;
        const strategyLabel = FORCE_EXPERIMENTAL ? 'EXPERIMENTAL (FORCED)' : 'DEFAULT';
        this.logger.info(`[LLMCoverageEvaluator] Classification scale default: ${strategyLabel}; size=${defaultScale.length}`);
    }

    getMethodName(): EvaluationMethod { return 'llm-coverage'; }

    private normalizePoints(points: PointDefinition[], promptId: string, isInverted: boolean = false): NormalizedPoint[] {
        if (!points) {
            return [];
        }
        
        const normalizedPoints: NormalizedPoint[] = [];
        
        points.forEach((pointDef, index) => {
            if (typeof pointDef === 'string') {
                normalizedPoints.push({
                    id: pointDef,
                    displayText: pointDef,
                    textToEvaluate: pointDef,
                    multiplier: 1,
                    isFunction: false,
                    isInverted,
                });
            } else if (Array.isArray(pointDef)) {
                // This is an alternative path (nested array) - flatten all points but mark them with the same pathId
                const pathId = `path_${index}`;
                pointDef.forEach(nestedPoint => {
                    if (typeof nestedPoint === 'string') {
                        normalizedPoints.push({
                            id: nestedPoint,
                            displayText: nestedPoint,
                            textToEvaluate: nestedPoint,
                            multiplier: 1,
                            isFunction: false,
                            isInverted,
                            pathId,
                        });
                    } else if (typeof nestedPoint === 'object' && nestedPoint !== null && !Array.isArray(nestedPoint)) {
                        const { text, fn, fnArgs, arg, multiplier, citation, ...rest } = nestedPoint as any;
                        
                        if (multiplier !== undefined && (typeof multiplier !== 'number' || multiplier < 0.1 || multiplier > 10)) {
                            throw new Error(`Point multiplier must be a number between 0.1 and 10. Found ${multiplier}. Prompt ID: '${promptId}'`);
                        }

                        const standardKeys = ['text', 'fn', 'fnArgs', 'arg', 'multiplier', 'citation'];
                        const idiomaticFnName = Object.keys(rest).find(k => !standardKeys.includes(k) && k.startsWith('$'));

                        if (text && (fn || idiomaticFnName)) {
                            throw new Error(`Point object cannot have both 'text' and a function ('fn' or idiomatic). Prompt ID: '${promptId}'`);
                        }

                        if (text) {
                            normalizedPoints.push({
                                id: text,
                                displayText: text,
                                textToEvaluate: text,
                                multiplier: multiplier ?? 1,
                                citation,
                                isFunction: false,
                                isInverted,
                                pathId,
                            });
                        } else {
                            const fnName = fn || (idiomaticFnName ? idiomaticFnName.substring(1) : undefined);
                            if (!fnName) {
                                throw new Error(`Point object must have 'text', 'fn', or an idiomatic function name (starting with $). Found: ${JSON.stringify(nestedPoint)}`);
                            }

                            const effectiveFnArgs = fnArgs ?? arg ?? (idiomaticFnName ? (nestedPoint as any)[idiomaticFnName] : undefined);
                            const displayText = `Function: ${fnName}(${JSON.stringify(effectiveFnArgs)})`;
                            normalizedPoints.push({
                                id: displayText,
                                displayText: displayText,
                                multiplier: multiplier ?? 1,
                                citation,
                                isFunction: true,
                                functionName: fnName,
                                functionArgs: effectiveFnArgs,
                                isInverted,
                                pathId,
                            });
                        }
                    } else {
                        throw new Error(`Invalid nested point definition found in prompt '${promptId}': ${JSON.stringify(nestedPoint)}`);
                    }
                });
            } else if (typeof pointDef === 'object' && pointDef !== null) {
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
                    normalizedPoints.push({
                        id: text,
                        displayText: text,
                        textToEvaluate: text,
                        multiplier: multiplier ?? 1,
                        citation,
                        isFunction: false,
                        isInverted,
                    });
                } else {
                    const fnName = fn || (idiomaticFnName ? idiomaticFnName.substring(1) : undefined);
                    if (!fnName) {
                        throw new Error(`Point object must have 'text', 'fn', or an idiomatic function name (starting with $). Found: ${JSON.stringify(pointDef)}`);
                    }

                    const effectiveFnArgs = fnArgs ?? arg ?? (idiomaticFnName ? pointDef[idiomaticFnName] : undefined);
                    const displayText = `Function: ${fnName}(${JSON.stringify(effectiveFnArgs)})`;
                    normalizedPoints.push({
                        id: displayText,
                        displayText: displayText,
                        multiplier: multiplier ?? 1,
                        citation,
                        isFunction: true,
                        functionName: fnName,
                        functionArgs: effectiveFnArgs,
                        isInverted,
                    });
                }
            } else {
                throw new Error(`Invalid point definition found in prompt '${promptId}': ${JSON.stringify(pointDef)}`);
            }
        });
        
        return normalizedPoints;
    }

    private async evaluateSinglePoint(
        modelResponseText: string,
        pointToEvaluate: NormalizedPoint,
        allPointsInPrompt: NormalizedPoint[],
        promptContextText: string,
        suiteDescription: string | undefined,
        judges?: Judge[],
        judgeMode?: 'failover' | 'consensus', // Legacy
        classificationScale: ClassificationScaleItem[] = CLASSIFICATION_SCALE,
        providerLimiters?: Map<string, { adaptive: AdaptiveRateLimiter; limit: ReturnType<typeof pLimit> }>,
    ): Promise<JudgeResult> {
        const judgeLog: string[] = [];
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
        const totalJudgesAttempted = judgesToUse.length;

        const allKeyPointTexts = allPointsInPrompt.map(p => `${p.isInverted ? '[should not]' : '[should]'} ${p.displayText}`);

        // Phase 1: Try primary judges
        const evaluationPromises = judgesToUse.map((judge, index) => {
            // Get provider-specific limiter, or use a fallback
            const provider = extractProviderFromModelId(judge.model);
            const providerLimiterObj = providerLimiters?.get(provider);
            const providerLimit = providerLimiterObj?.limit || pLimit(5);
            const adaptiveLimiter = providerLimiterObj?.adaptive;

            return providerLimit(async () => {
                const judgeIdentifier = judge.id || `judge-${index}`;
                this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- [Primary] Requesting judge: ${judgeIdentifier} (Model: ${judge.model}, Approach: ${judge.approach}) for KP: "${pointToEvaluate.textToEvaluate!.substring(0, 50)}..."`);
                judgeLog.push(`[${judgeIdentifier}] Starting evaluation with model ${judge.model} and approach ${judge.approach}.`);

                const singleEvalResult = await this.requestIndividualJudge(
                    modelResponseText,
                    pointToEvaluate.textToEvaluate!,
                    allKeyPointTexts,
                    promptContextText,
                    suiteDescription,
                    judge,
                    classificationScale,
                    judgeLog
                );

                if ('error' in singleEvalResult) {
                    judgeLog.push(`[${judgeIdentifier}] FAILED: ${singleEvalResult.error}`);
                    // Check if it's a rate limit error
                    if (singleEvalResult.error?.includes('rate limit') || singleEvalResult.error?.includes('429')) {
                        adaptiveLimiter?.onRateLimit();
                    } else {
                        adaptiveLimiter?.onError();
                    }
                } else {
                    const finalJudgeId = judge.id ? `${judge.id}(${judge.model})` : `${judge.approach}(${judge.model})`;
                    judgeLog.push(`[${judgeIdentifier}] SUCCEEDED. Score: ${singleEvalResult.coverage_extent}`);
                    successfulJudgements.push({ ...singleEvalResult, judgeModelId: finalJudgeId });
                    adaptiveLimiter?.onSuccess();
                }
            });
        });

        await Promise.all(evaluationPromises);

        // Phase 2: Use backup judge if needed
        const usedBackupJudge = await this.tryBackupJudge(
            modelResponseText,
            pointToEvaluate,
            allKeyPointTexts,
            promptContextText,
            suiteDescription,
            successfulJudgements,
            totalJudgesAttempted,
            judges,
            judgeLog,
            classificationScale,
            providerLimiters
        );

        if (successfulJudgements.length === 0) {
            const errorMsg = "All judges failed in consensus mode.";
            this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- ${errorMsg}`);
            judgeLog.push(`FINAL_ERROR: ${errorMsg}`);
            return { error: errorMsg, judgeLog };
        }
        
        const totalScore = successfulJudgements.reduce((sum, judgement) => sum + judgement.coverage_extent, 0);
        const avgScore = totalScore / successfulJudgements.length;
        let consensusReflection = `Consensus from ${successfulJudgements.length} judge(s). Average score: ${avgScore.toFixed(2)}. See breakdown for individual reflections.`;
        const consensusJudgeId = `consensus(${successfulJudgements.map(e => e.judgeModelId).join(', ')})`;
        
        let errorField: string | undefined = undefined;
        if (successfulJudgements.length < totalJudgesAttempted && !usedBackupJudge) {
            const failedCount = totalJudgesAttempted - successfulJudgements.length;
            errorField = `${failedCount} of ${totalJudgesAttempted} judges failed to return a valid assessment. The backup judge was not used or also failed. The final score is based on a partial consensus.`;
            consensusReflection += `\n\nWARNING: ${errorField}`;
            judgeLog.push(`WARNING: ${errorField}`);
            this.logger.warn(`[LLMCoverageEvaluator-Pointwise] --- Partial success: ${errorField}`);
        } else if (usedBackupJudge) {
            judgeLog.push(`BACKUP_USED: Backup judge was successfully used to supplement failed primary judges.`);
            consensusReflection += `\n\nNOTE: Backup judge was used to supplement failed primary judges.`;
        }

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
            error: errorField,
        };
    }

    private async tryBackupJudge(
        modelResponseText: string,
        pointToEvaluate: NormalizedPoint,
        allKeyPointTexts: string[],
        promptContextText: string,
        suiteDescription: string | undefined,
        successfulJudgements: (PointwiseCoverageLLMResult & { judgeModelId: string })[],
        totalJudgesAttempted: number,
        judges?: Judge[],
        judgeLog: string[] = [],
        classificationScale: ClassificationScaleItem[] = CLASSIFICATION_SCALE,
        providerLimiters?: Map<string, { adaptive: AdaptiveRateLimiter; limit: ReturnType<typeof pLimit> }>,
    ): Promise<boolean> {
        // Only use backup judge if we have fewer successful judgements than expected 
        // and we're not using custom judges (to preserve user configurations)
        if (successfulJudgements.length >= totalJudgesAttempted || (judges && judges.length > 0)) {
            return false;
        }

        this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- Only ${successfulJudgements.length}/${totalJudgesAttempted} primary judges succeeded. Trying backup judge...`);
        judgeLog.push(`PRIMARY_PHASE_COMPLETE: ${successfulJudgements.length}/${totalJudgesAttempted} judges succeeded. Activating backup judge.`);

        const backupJudgeIdentifier = DEFAULT_BACKUP_JUDGE.id || 'backup-judge';
        this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- [Backup] Requesting judge: ${backupJudgeIdentifier} (Model: ${DEFAULT_BACKUP_JUDGE.model}, Approach: ${DEFAULT_BACKUP_JUDGE.approach}) for KP: "${pointToEvaluate.textToEvaluate!.substring(0, 50)}..."`);
        judgeLog.push(`[${backupJudgeIdentifier}] Starting backup evaluation with model ${DEFAULT_BACKUP_JUDGE.model} and approach ${DEFAULT_BACKUP_JUDGE.approach}.`);

        // Get adaptive limiter for backup judge
        const backupProvider = extractProviderFromModelId(DEFAULT_BACKUP_JUDGE.model);
        const backupLimiterObj = providerLimiters?.get(backupProvider);
        const backupAdaptiveLimiter = backupLimiterObj?.adaptive;

        const backupEvalResult = await this.requestIndividualJudge(
            modelResponseText,
            pointToEvaluate.textToEvaluate!,
            allKeyPointTexts,
            promptContextText,
            suiteDescription,
            DEFAULT_BACKUP_JUDGE,
            classificationScale,
            judgeLog
        );

        if ('error' in backupEvalResult) {
            judgeLog.push(`[${backupJudgeIdentifier}] BACKUP FAILED: ${backupEvalResult.error}`);
            // Check if it's a rate limit error
            if (backupEvalResult.error?.includes('rate limit') || backupEvalResult.error?.includes('429')) {
                backupAdaptiveLimiter?.onRateLimit();
            } else {
                backupAdaptiveLimiter?.onError();
            }
            return false;
        } else {
            const finalBackupJudgeId = DEFAULT_BACKUP_JUDGE.id ? `${DEFAULT_BACKUP_JUDGE.id}(${DEFAULT_BACKUP_JUDGE.model})` : `${DEFAULT_BACKUP_JUDGE.approach}(${DEFAULT_BACKUP_JUDGE.model})`;
            judgeLog.push(`[${backupJudgeIdentifier}] BACKUP SUCCEEDED. Score: ${backupEvalResult.coverage_extent}`);
            successfulJudgements.push({ ...backupEvalResult, judgeModelId: finalBackupJudgeId });
            backupAdaptiveLimiter?.onSuccess();
            return true;
        }
    }

    private async requestIndividualJudge(
        modelResponseText: string,
        keyPointText: string,
        allOtherKeyPoints: string[],
        promptContextText: string,
        suiteDescription: string | undefined,
        judge: Judge,
        classificationScale: ClassificationScaleItem[] = CLASSIFICATION_SCALE,
        judgeLog?: string[]
    ): Promise<PointwiseCoverageLLMResult | { error: string }> {
        const { model: modelId, approach } = judge;

        let pointwisePrompt: string;

        switch (approach) {
            case 'prompt-aware':
            case 'holistic':
                pointwisePrompt = `
You are given a multi-turn conversation transcript and a criterion. Evaluate ONLY the content produced by the candidate model (marked as [Assistant (generated)]). Do not give credit for [Assistant (fixed)] turns.

<TRANSCRIPT>
${promptContextText}
</TRANSCRIPT>

<TEXT>
${modelResponseText}
</TEXT>

Carefully assess how well THIS SPECIFIC <CRITERION> is expressed in the generated assistant content:
<CRITERION>
${keyPointText}
</CRITERION>
`;
                break;

            case 'standard':
            default:
                 pointwisePrompt = `
You are given a multi-turn conversation transcript and a criterion. Evaluate ONLY the content produced by the candidate model (marked as [Assistant (generated)]). Do not give credit for [Assistant (fixed)] turns.

<TRANSCRIPT>
${promptContextText}
</TRANSCRIPT>

<TEXT>
${modelResponseText}
</TEXT>

Carefully assess how well the following <CRITERION> is expressed in the generated assistant content:
<CRITERION>
${keyPointText}
</CRITERION>
`;
                break;
        }

        const classificationGuidelines = classificationScale.map(c => `- ${c.name}: ${c.description}`).join('\n');

        const finalPrompt = `${pointwisePrompt}

Your task is to provide a 'reflection' and a 'classification' based on the guidelines below. Your classification should indicate which class the text falls into, according to the wording of the criterion.

Classification Guidelines:
${classificationGuidelines}

Your output MUST strictly follow this XML format:
<reflection>Your 1-2 sentence reflection and reasoning for the classification, explaining how well the criterion is met, if at all.</reflection>
<classification>ONE of the ${classificationScale.length} class names (e.g., ${classificationScale[classificationScale.length - 1].name})</classification>
`;
        
        const systemPrompt = `
You are an expert evaluator and examiner. You are incredibly precise. Your task is to assess how well a specific criterion is covered by a given text by providing a reflection and a precise classification. 
Focus solely on the provided criterion, the text, and the classification guidelines. Adhere strictly to the XML output format specified in the user prompt. Be brief if possible.

${approach === 'holistic' && suiteDescription?.trim() !== '' ? `
For context, this evaluation is part of a broader suite with the following description (please recognize this merely as context, and not a part of the evaluation itself):

<BROAD_EVALUATION_DESCRIPTION>
${suiteDescription}
</BROAD_EVALUATION_DESCRIPTION>
` : ''}

The criterion is an assertion being made about the <TEXT>. It might be allude to a 'response', which relates to the <TEXT>. It might be phrased in various ways. So some valid variations of a criterion given the text "The lemonade stand was open for 10 hours." might be:

- "The response should have included opening times and be concise"
- "Must include opening times and be concise"
- "Should be concise and include opening times"
- "Be concise and include opening times"
- "Not forget to include opening times and not forget to be concise"
- "Concise, w/ opening times"

(These are all equivalent ways to express the same criterion)

Here are examples of correct outputs:

-----
Input: <TEXT>The people in the room were not happy.</TEXT><CRITERION>The people in the room were happy.</CRITERION>
Output: <reflection>The text states that the people in the room were NOT happy. However, the criterion is that the people in the room WERE happy, which means the criterion is entirely UNMET.</reflection><classification>${CLASSIFICATION_SCALE[0].name}</classification>
-----
Input: <TEXT>The population is 8,000,000</TEXT><CRITERION>The population is 8,019,828</CRITERION>
Output: <reflection>The number provided in the text is very close to the number in the criterion. Therefore, the criterion is nearly met, i.e. ${CLASSIFICATION_SCALE[3].name}.</reflection><classification>${CLASSIFICATION_SCALE[3].name}</classification>
-----
Input: <TEXT>Handling a situation where a colleague consistently takes credit for your ideas requires a balance of assertiveness, empathy, and strategic communication</TEXT><CRITERION>Mentions empathy</CRITERION>
Output: <reflection>The text mentions empathy, which means the criterion is MET precisely.</reflection><classification>${CLASSIFICATION_SCALE[CLASSIFICATION_SCALE.length - 1].name}</classification>
-----
        `.trim();
        
        // Now that prompts are constructed, check cache
        const cacheKeyPayload = {
            modelResponseText,
            keyPointText,
            allOtherKeyPoints,
            promptContextText,
            suiteDescription,
            judge, // Judge object includes model and approach
            finalPrompt,
            systemPrompt,
        };
        const cacheKey = generateCacheKey(cacheKeyPayload);
        const cache = getCache('judge-evaluations');

        if (this.useCache) {
            const cachedResult = await cache.get(cacheKey);
            if (cachedResult) {
                this.logger.info(`Cache HIT for pointwise judge evaluation with ${modelId} (${approach})`);
                return cachedResult as PointwiseCoverageLLMResult;
            }
            this.logger.info(`Cache MISS for pointwise judge evaluation with ${modelId} (${approach})`);
        }
        
        try {
            // Use getModelResponse which has smart retry and rate limit handling
            const responseText = await getModelResponse({
                modelId: modelId,
                messages: [{ role: 'user', content: finalPrompt }],
                systemPrompt: systemPrompt,
                temperature: 0.0,
                maxTokens: 500,
                useCache: this.useCache,
                timeout: CALL_TIMEOUT_MS_POINTWISE,
                retries: 1,
            });

            if (!responseText || responseText.trim() === '') {
                return { error: "Empty response" };
            }

            const reflectionMatch = responseText.match(/<reflection>([\s\S]*?)<\/reflection>/);
            const classificationMatch = responseText.match(/<classification>([\s\S]*?)<\/classification>/);

            if (!reflectionMatch || !classificationMatch) {
                return { error: `Failed to parse XML. Response: ${responseText.substring(0,100)}...` };
            }

            const classificationToScore: Record<string, number> = Object.fromEntries(
                classificationScale.map(item => [item.name, item.score])
            );

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

    /**
     * Calculates Krippendorff's alpha for inter-judge agreement.
     * Uses interval distance metric (squared differences) on 0-1 coverage scores.
     *
     * @param pointAssessments - All assessments for a single (prompt, model) pair
     * @param judgesToUse - The judge configuration that was used (for fingerprint)
     * @returns Agreement metrics or undefined if insufficient data
     */
    private calculateJudgeAgreement(
        pointAssessments: PointAssessment[],
        judgesToUse: Judge[]
    ): JudgeAgreementMetrics | undefined {
        // Filter to points with multiple judges (need ≥2 for agreement)
        const pointsWithMultipleJudges = pointAssessments.filter(
            pa => pa.individualJudgements && pa.individualJudgements.length >= 2
        );

        if (pointsWithMultipleJudges.length === 0) {
            return undefined; // No multi-judge assessments
        }

        // Extract all judge scores per point
        interface ScoredItem {
            pointText: string;
            scores: Array<{ value: number; judgeId: string }>;
        }

        const items: ScoredItem[] = [];
        for (const assessment of pointsWithMultipleJudges) {
            if (!assessment.individualJudgements) continue;

            const scores: Array<{ value: number; judgeId: string }> = [];
            for (const judgement of assessment.individualJudgements) {
                if (judgement.coverageExtent !== undefined && !isNaN(judgement.coverageExtent)) {
                    // Extract judge ID from the judgeModelId format: "id(model)" or "approach(model)"
                    const judgeId = judgement.judgeModelId.split('(')[0];
                    scores.push({
                        value: judgement.coverageExtent,
                        judgeId
                    });
                }
            }

            if (scores.length >= 2) {
                items.push({
                    pointText: assessment.keyPointText,
                    scores
                });
            }
        }

        if (items.length === 0) {
            return undefined;
        }

        // Step 1: Calculate observed disagreement (average pairwise squared diff)
        let observedDisagreement = 0;
        let numComparisons = 0;

        for (const item of items) {
            for (let i = 0; i < item.scores.length; i++) {
                for (let j = i + 1; j < item.scores.length; j++) {
                    observedDisagreement += Math.pow(item.scores[i].value - item.scores[j].value, 2);
                    numComparisons++;
                }
            }
        }

        if (numComparisons === 0) {
            return undefined;
        }

        observedDisagreement /= numComparisons;

        // Step 2: Calculate expected disagreement (marginal distribution variance)
        const allScores = items.flatMap(item => item.scores.map(s => s.value));
        let expectedDisagreement = 0;
        let totalPairs = 0;

        for (let i = 0; i < allScores.length; i++) {
            for (let j = i + 1; j < allScores.length; j++) {
                expectedDisagreement += Math.pow(allScores[i] - allScores[j], 2);
                totalPairs++;
            }
        }

        if (totalPairs === 0 || expectedDisagreement === 0) {
            // Perfect agreement (all scores identical)
            const judgeSetFingerprint = this.generateJudgeSetFingerprint(items);
            const judgesUsed = this.extractJudgesUsed(items, judgesToUse);

            return {
                krippendorffsAlpha: 1.0,
                numItems: items.length,
                numJudges: items[0]?.scores.length || 0,
                numComparisons,
                interpretation: 'reliable',
                judgeSetFingerprint,
                judgesUsed
            };
        }

        expectedDisagreement /= totalPairs;

        // Step 3: Calculate alpha
        const alpha = 1 - (observedDisagreement / expectedDisagreement);

        // Step 4: Calculate score variance to detect low-variance instability
        const mean = allScores.reduce((sum, s) => sum + s, 0) / allScores.length;
        const variance = allScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / allScores.length;

        // Determine interpretation based on standard thresholds
        let interpretation: 'reliable' | 'tentative' | 'unreliable' | 'unstable';
        if (alpha >= 0.800) {
            interpretation = 'reliable';
        } else if (alpha >= 0.667) {
            interpretation = 'tentative';
        } else if (Math.abs(alpha) < 0.1 && variance < 0.02) {
            // Near-zero α with low variance = metric instability, not actual disagreement
            // This occurs when all judges give nearly identical scores (e.g., all 0s)
            interpretation = 'unstable';
            this.logger.info(
                `[LLMCoverageEvaluator] Detected low-variance instability: α=${alpha.toFixed(3)}, variance=${variance.toFixed(4)}. ` +
                `Judges agreed (low variance) but α metric is unstable.`
            );
        } else {
            interpretation = 'unreliable';
        }

        // Generate judge set fingerprint
        const judgeSetFingerprint = this.generateJudgeSetFingerprint(items);
        const judgesUsed = this.extractJudgesUsed(items, judgesToUse);

        return {
            krippendorffsAlpha: parseFloat(alpha.toFixed(3)),
            numItems: items.length,
            numJudges: items[0]?.scores.length || 0,
            numComparisons,
            interpretation,
            judgeSetFingerprint,
            judgesUsed
        };
    }

    /**
     * Generates a stable fingerprint hash for the set of judges used.
     * Helps identify when judge sets change over time for comparability.
     */
    private generateJudgeSetFingerprint(items: Array<{ pointText: string; scores: Array<{ value: number; judgeId: string }> }>): string {
        // Collect all unique judge IDs used
        const judgeIds = new Set<string>();
        for (const item of items) {
            for (const score of item.scores) {
                judgeIds.add(score.judgeId);
            }
        }

        // Sort for deterministic hash
        const sortedIds = Array.from(judgeIds).sort();

        // Generate SHA-256 hash (use first 12 chars for brevity)
        const crypto = require('crypto');
        return crypto
            .createHash('sha256')
            .update(sortedIds.join(','))
            .digest('hex')
            .slice(0, 12);
    }

    /**
     * Extracts metadata about which judges participated and how many assessments each made.
     */
    private extractJudgesUsed(
        items: Array<{ pointText: string; scores: Array<{ value: number; judgeId: string }> }>,
        judgesToUse: Judge[]
    ): Array<{ judgeId: string; model: string; approach: string; assessmentCount: number }> {
        // Count assessments per judge
        const judgeAssessmentCounts = new Map<string, number>();
        for (const item of items) {
            for (const score of item.scores) {
                judgeAssessmentCounts.set(
                    score.judgeId,
                    (judgeAssessmentCounts.get(score.judgeId) || 0) + 1
                );
            }
        }

        // Build result array with full judge metadata
        const result: Array<{ judgeId: string; model: string; approach: string; assessmentCount: number }> = [];

        for (const [judgeId, count] of judgeAssessmentCounts.entries()) {
            // Find matching judge configuration
            const judge = judgesToUse.find(j => j.id === judgeId || j.model.includes(judgeId));

            result.push({
                judgeId,
                model: judge?.model || 'unknown',
                approach: judge?.approach || 'unknown',
                assessmentCount: count
            });
        }

        return result.sort((a, b) => b.assessmentCount - a.assessmentCount);
    }

    private getPromptContextString(promptData: EvaluationInput['promptData']): string {
        if (promptData.initialMessages && promptData.initialMessages.length > 0) {
            return promptData.initialMessages.map(m => {
                const roleLabel = m.role === 'assistant' && m.content === null ? 'assistant (placeholder-null)' : m.role;
                return `${roleLabel}: ${m.content === null ? '<TO_BE_GENERATED>' : m.content}`;
            }).join('\n--------------------\n');
        } else if (promptData.promptText) {
            return promptData.promptText;
        }
        this.logger.warn(`[LLMCoverageEvaluator] Could not derive prompt context string for prompt ID ${promptData.promptId}`);
        return "Error: No prompt context found.";
    }

    private getTranscriptForModel(promptData: EvaluationInput['promptData'], modelId: string): string {
        const response = promptData.modelResponses[modelId];
        if (!response || !response.fullConversationHistory || response.fullConversationHistory.length === 0) {
            return this.getPromptContextString(promptData);
        }
        // Build labels for assistant generated turns
        const generatedSet = new Set<number>((response as any).generatedAssistantIndices || []);
        let assistantTurnCounter = 0;
        return response.fullConversationHistory.map(m => {
            if (m.role === 'assistant') {
                const label = generatedSet.has(assistantTurnCounter) ? 'assistant (generated)' : 'assistant (fixed)';
                assistantTurnCounter++;
                return `${label}: ${m.content}`;
            }
            return `${m.role}: ${m.content}`;
        }).join('\n--------------------\n');
    }

    async evaluate(
        inputs: EvaluationInput[],
        onProgress?: ProgressCallback,
    ): Promise<Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>> {
        this.logger.info(`[LLMCoverageEvaluator] Starting evaluation for ${inputs.length} prompts.`);

        // --- Adaptive Rate Limiting Setup ---
        // Collect all judge models across all configs to group by provider
        const allJudgeModels = new Set<string>();
        for (const input of inputs) {
            const llmCoverageConfig = input.config.evaluationConfig?.['llm-coverage'] as LLMCoverageEvaluationConfig | undefined;
            const judges = (llmCoverageConfig?.judges && llmCoverageConfig.judges.length > 0)
                ? llmCoverageConfig.judges
                : DEFAULT_JUDGES;

            judges.forEach(judge => allJudgeModels.add(judge.model));
            // Also add backup judge
            allJudgeModels.add(DEFAULT_BACKUP_JUDGE.model);
        }

        // Group judge models by provider
        const judgesByProvider = new Map<string, string[]>();
        for (const judgeModel of allJudgeModels) {
            const provider = extractProviderFromModelId(judgeModel);
            if (!judgesByProvider.has(provider)) {
                judgesByProvider.set(provider, []);
            }
            judgesByProvider.get(provider)!.push(judgeModel);
        }

        // Create adaptive limiter for each provider
        const providerLimiters = new Map<string, { adaptive: AdaptiveRateLimiter; limit: ReturnType<typeof pLimit> }>();
        for (const [provider, models] of judgesByProvider.entries()) {
            const profile = getProviderProfile(provider);
            // Reuse the same provider profiles as candidate generation
            const adaptiveLimiter = new AdaptiveRateLimiter(provider, profile, this.logger);

            const initialConcurrency = adaptiveLimiter.getCurrentConcurrency();
            const pLimiter = pLimit(initialConcurrency);

            providerLimiters.set(provider, {
                adaptive: adaptiveLimiter,
                limit: pLimiter,
            });

            this.logger.info(
                `[LLMCoverageEvaluator] Configured adaptive rate limiter for '${provider}': ` +
                `${models.length} judge model(s), initial concurrency=${initialConcurrency}, ` +
                `max=${profile.maxConcurrency}, adaptive=${profile.adaptiveEnabled}`
            );
        }

        // Global limiter for overall concurrency control
        const limit = pLimit(DEFAULT_JUDGE_CONCURRENCY);
        const tasks: Promise<void>[] = [];

        const llmCoverageScores: FinalComparisonOutputV2['evaluationResults']['llmCoverageScores'] = {};
        const extractedKeyPoints: FinalComparisonOutputV2['extractedKeyPoints'] = {};

        const totalTasks = inputs.reduce((sum, input) => {
            const modelsToEval = Object.keys(input.promptData.modelResponses).filter(m => m !== IDEAL_MODEL_ID);
            return sum + modelsToEval.length;
        }, 0);
        let completedTasks = 0;

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
                // This part remains sequential as it modifies a shared object and is not the common path.
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
            const classificationScale = (FORCE_EXPERIMENTAL || llmCoverageConfig?.useExperimentalScale)
                ? EXPERIMENTAL_CLASSIFICATION_SCALE
                : CLASSIFICATION_SCALE;
            const usingExperimental = classificationScale === EXPERIMENTAL_CLASSIFICATION_SCALE;
            const reason = FORCE_EXPERIMENTAL ? 'FORCE_EXPERIMENTAL=true' : (llmCoverageConfig?.useExperimentalScale ? 'per-blueprint flag' : 'default');
            this.logger.info(`[LLMCoverageEvaluator] Using ${usingExperimental ? 'EXPERIMENTAL' : 'DEFAULT'} classification scale (${reason}) for prompt ${promptData.promptId}; size=${classificationScale.length}`);

            for (const [modelId, responseData] of Object.entries(promptData.modelResponses)) {
                if (modelId === IDEAL_MODEL_ID) continue;

                // Do not evaluate if the response text is missing or an error occurred during generation.
                if (responseData.hasError || !responseData.finalAssistantResponseText) {
                    const errorMessage = responseData.errorMessage || "Model response generation failed or returned empty.";
                    this.logger.warn(`[LLMCoverageEvaluator] Skipping evaluation for model ${modelId} on prompt ${promptData.promptId} due to generation error: ${errorMessage}`);
                    llmCoverageScores[promptData.promptId][modelId] = { error: `Generation failed: ${errorMessage}` };
                    // Increment completed tasks even for skipped ones to keep progress accurate
                    completedTasks++;
                    if (onProgress) {
                        await onProgress(completedTasks, totalTasks);
                    }
                    continue;
                }

                tasks.push(limit(async () => {
                    try {
                        const functionPoints = combinedNormalizedPoints.filter(p => p.isFunction);
                        const textPoints = combinedNormalizedPoints.filter(p => !p.isFunction);

                        // Create a modified prompt config with full conversation history (including generated messages)
                        // This ensures context.messages in point functions includes all generated content
                        const promptConfigWithHistory = {
                            ...promptConfig,
                            messages: responseData.fullConversationHistory || promptConfig.messages
                        };

                        const context: PointFunctionContext = {
                            config,
                            prompt: promptConfigWithHistory,
                            modelId,
                            logger: this.logger,
                            generatedAssistantIndices: (responseData as any).generatedAssistantIndices
                        };

                        // Build aggregated subject text: concat all generated assistant turns; fallback to final-only
                        let subjectText = responseData.finalAssistantResponseText;
                        const genList = (responseData as any).generatedAssistantTexts as string[] | undefined;
                        if (Array.isArray(genList) && genList.length > 0) {
                            subjectText = genList.join('\n\n');
                        }

                        // 1. Evaluate function points using our new helper
                        const functionAssessments = await evaluateFunctionPoints(functionPoints, subjectText, context);

                        // 2. Evaluate text points (LLM-judged) - parallelized for performance
                        let textAssessments: PointAssessment[] = [];
                        if (textPoints.length > 0) {
                            // Prepare transcript once for all points (doesn't vary per point)
                            const transcriptForModel = this.getTranscriptForModel(promptData, modelId);

                            // Evaluate all points in parallel
                            const judgePromises = textPoints.map(async (point) => {
                                const judgeResult = await this.evaluateSinglePoint(
                                    subjectText,
                                    point,
                                    textPoints,
                                    transcriptForModel,
                                    config.description,
                                    llmCoverageConfig?.judges,
                                    llmCoverageConfig?.judgeMode,
                                    classificationScale,
                                    providerLimiters
                                );

                                let finalScore = judgeResult.coverage_extent;
                                if (finalScore !== undefined && point.isInverted) {
                                    finalScore = 1.0 - finalScore;
                                }

                                return {
                                    keyPointText: point.displayText,
                                    coverageExtent: finalScore,
                                    reflection: judgeResult.reflection ? `${point.isInverted ? '[INVERTED] ' : ''}${judgeResult.reflection}` : undefined,
                                    error: judgeResult.error,
                                    individualJudgements: judgeResult.individualJudgements,
                                    judgeModelId: judgeResult.judgeModelId,
                                    multiplier: point.multiplier,
                                    citation: point.citation,
                                    isInverted: point.isInverted,
                                    pathId: point.pathId,
                                } as PointAssessment;
                            });

                            textAssessments = await Promise.all(judgePromises);
                        }

                        // 3. Combine and aggregate scores
                        const allAssessments = [...functionAssessments, ...textAssessments];
                        const finalAverage = aggregateCoverageScores(allAssessments);

                        // 4. Calculate inter-judge agreement (Krippendorff's alpha)
                        const judgesToUse = (llmCoverageConfig?.judges && llmCoverageConfig.judges.length > 0)
                            ? llmCoverageConfig.judges
                            : DEFAULT_JUDGES;
                        const judgeAgreement = this.calculateJudgeAgreement(allAssessments, judgesToUse);

                        // Log warning if agreement is low
                        if (judgeAgreement && judgeAgreement.interpretation === 'unreliable') {
                            this.logger.warn(
                                `[LLMCoverageEvaluator] Low judge agreement (α=${judgeAgreement.krippendorffsAlpha}) ` +
                                `for model ${modelId} on prompt ${promptData.promptId}`
                            );
                        }

                        llmCoverageScores[promptData.promptId][modelId] = {
                            keyPointsCount: allAssessments.length,
                            avgCoverageExtent: allAssessments.length > 0 ? parseFloat(finalAverage.toFixed(2)) : undefined,
                            pointAssessments: allAssessments,
                            judgeAgreement, // NEW: Include agreement metrics
                        };
                    
                    } catch (e: any) {
                        this.logger.error(`[LLMCoverageEvaluator] Unexpected error during point evaluation for model ${modelId} on prompt ${promptData.promptId}: ${e.message}`);
                        llmCoverageScores[promptData.promptId][modelId] = { error: `Internal evaluator error: ${e.message}` };
                    }

                    completedTasks++;
                    this.logger.info(`[LLMCoverageEvaluator] Progress: ${completedTasks}/${totalTasks}`);
                    if (onProgress) {
                        await onProgress(completedTasks, totalTasks);
                    }
                }));
            }
        }
        
        await Promise.all(tasks);

        return {
            llmCoverageScores,
            extractedKeyPoints,
        };
    }

} 