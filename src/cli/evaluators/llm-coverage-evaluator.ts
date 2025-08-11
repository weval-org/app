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
    Judge
} from '@/types/shared';
import { extractKeyPoints } from '../services/llm-evaluation-service';
import { dispatchMakeApiCall } from '../../lib/llm-clients/client-dispatcher';
import { LLMApiCallOptions } from '../../lib/llm-clients/types';
import { PointFunctionContext } from '@/point-functions/types';
import { getCache, generateCacheKey } from '../../lib/cache-service';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { evaluateFunctionPoints, aggregateCoverageScores } from './coverage-logic';
import { ProgressCallback } from '../services/comparison-pipeline-service.non-stream';
import pLimit from '@/lib/pLimit';

const DEFAULT_JUDGE_CONCURRENCY = 20;

type Logger = ReturnType<typeof getConfig>['logger'];

// Add local interface to fix TS error until types can be globally updated
interface LLMCoverageEvaluationConfig {
    judgeModels?: string[];
    judgeMode?: 'failover' | 'consensus';
    judges?: Judge[];
}

export const DEFAULT_JUDGES: Judge[] = [
    { id: 'prompt-aware-openai-gpt-4-1-mini', model: 'openai:gpt-4.1-mini', approach: 'prompt-aware' },
    { id: 'prompt-aware-gemini-2-5-flash', model: 'openrouter:google/gemini-2.5-flash', approach: 'prompt-aware' },
    { id: 'holistic-openai-gpt-4-1-mini', model: 'openai:gpt-4.1-mini', approach: 'holistic' }
];

const DEFAULT_BACKUP_JUDGE: Judge = {
    id: 'backup-claude-3-5-haiku',
    model: 'anthropic:claude-3.5-haiku',
    approach: 'prompt-aware'
};

const CLASSIFICATION_SCALE = [
    // Old Approach: CLASS_ABSENT, CLASS_SLIGHTLY_PRESENT, CLASS_PARTIALLY_PRESENT, CLASS_MAJORLY_PRESENT, CLASS_FULLY_PRESENT
    { name: 'CLASS_UNMET', score: 0.0, description: 'The criterion is not met.' },
    { name: 'CLASS_PARTIALLY_MET', score: 0.25, description: 'The criterion is partially met.' },
    { name: 'CLASS_MODERATELY_MET', score: 0.5, description: 'The criterion is moderately met.' },
    { name: 'CLASS_MAJORLY_MET', score: 0.75, description: 'The criterion is mostly met.' },
    { name: 'CLASS_EXACTLY_MET', score: 1.0, description: 'The criterion is fully met.' }
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
        judgeMode?: 'failover' | 'consensus' // Legacy
    ): Promise<JudgeResult> {
        const judgeLog: string[] = [];
        const judgeRequestLimit = pLimit(5);
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
        const evaluationPromises = judgesToUse.map((judge, index) =>
            judgeRequestLimit(async () => {
                const judgeIdentifier = judge.id || `judge-${index}`;
                this.logger.info(`[LLMCoverageEvaluator-Pointwise] --- [Primary] Requesting judge: ${judgeIdentifier} (Model: ${judge.model}, Approach: ${judge.approach}) for KP: "${pointToEvaluate.textToEvaluate!.substring(0, 50)}..."`);
                judgeLog.push(`[${judgeIdentifier}] Starting evaluation with model ${judge.model} and approach ${judge.approach}.`);

                const singleEvalResult = await this.requestIndividualJudge(
                    modelResponseText,
                    pointToEvaluate.textToEvaluate!,
                    allKeyPointTexts,
                    promptContextText,
                    suiteDescription,
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
            judgeLog
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
        judgeLog: string[] = []
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

        const backupEvalResult = await this.requestIndividualJudge(
            modelResponseText,
            pointToEvaluate.textToEvaluate!,
            allKeyPointTexts,
            promptContextText,
            suiteDescription,
            DEFAULT_BACKUP_JUDGE
        );

        if ('error' in backupEvalResult) {
            judgeLog.push(`[${backupJudgeIdentifier}] BACKUP FAILED: ${backupEvalResult.error}`);
            return false;
        } else {
            const finalBackupJudgeId = DEFAULT_BACKUP_JUDGE.id ? `${DEFAULT_BACKUP_JUDGE.id}(${DEFAULT_BACKUP_JUDGE.model})` : `${DEFAULT_BACKUP_JUDGE.approach}(${DEFAULT_BACKUP_JUDGE.model})`;
            judgeLog.push(`[${backupJudgeIdentifier}] BACKUP SUCCEEDED. Score: ${backupEvalResult.coverage_extent}`);
            successfulJudgements.push({ ...backupEvalResult, judgeModelId: finalBackupJudgeId });
            return true;
        }
    }

    private async requestIndividualJudge(
        modelResponseText: string,
        keyPointText: string,
        allOtherKeyPoints: string[],
        promptContextText: string,
        suiteDescription: string | undefined,
        judge: Judge
    ): Promise<PointwiseCoverageLLMResult | { error: string }> {
        const cacheKeyPayload = {
            modelResponseText,
            keyPointText,
            allOtherKeyPoints,
            promptContextText,
            suiteDescription,
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

Carefully assess to what degree the following <CRITERION> is met in the text:
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

        const classificationGuidelines = CLASSIFICATION_SCALE.map(c => `- ${c.name}: ${c.description}`).join('\n');

        const finalPrompt = `${pointwisePrompt}

Your task is to provide a 'reflection' and a 'classification' based on the guidelines below. Your classification should indicate which class the text falls into, according to the wording of the criterion.

Classification Guidelines:
${classificationGuidelines}

Your output MUST strictly follow this XML format:
<reflection>Your 1-2 sentence reflection and reasoning for the classification, explaining how well the criterion is met, if at all.</reflection>
<classification>ONE of the ${CLASSIFICATION_SCALE.length} class names (e.g., ${CLASSIFICATION_SCALE[CLASSIFICATION_SCALE.length - 1].name})</classification>
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
        
        try {
             const clientOptions: Omit<LLMApiCallOptions, 'modelName'> & { modelId: string } = {
                modelId: modelId,
                messages: [{ role: 'user', content: finalPrompt }],
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

            const classificationToScore: Record<string, number> = Object.fromEntries(
                CLASSIFICATION_SCALE.map(item => [item.name, item.score])
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

    private getPromptContextString(promptData: EvaluationInput['promptData']): string {
        if (promptData.initialMessages && promptData.initialMessages.length > 0) {
            return promptData.initialMessages.map(m => `${m.role}: ${m.content}`).join('\n--------------------\n');
        } else if (promptData.promptText) {
            return promptData.promptText;
        }
        this.logger.warn(`[LLMCoverageEvaluator] Could not derive prompt context string for prompt ID ${promptData.promptId}`);
        return "Error: No prompt context found.";
    }

    async evaluate(
        inputs: EvaluationInput[],
        onProgress?: ProgressCallback,
    ): Promise<Partial<FinalComparisonOutputV2['evaluationResults'] & Pick<FinalComparisonOutputV2, 'extractedKeyPoints'>>> {
        this.logger.info(`[LLMCoverageEvaluator] Starting evaluation for ${inputs.length} prompts.`);
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
                                    config.description,
                                    llmCoverageConfig?.judges,
                                    llmCoverageConfig?.judgeMode
                                );

                                let finalScore = judgeResult.coverage_extent;
                                if (finalScore !== undefined && point.isInverted) {
                                    finalScore = 1.0 - finalScore;
                                }
                                
                                textAssessments.push({
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
                                });
                            }
                        }

                        // 3. Combine and aggregate scores
                        const allAssessments = [...functionAssessments, ...textAssessments];
                        const finalAverage = aggregateCoverageScores(allAssessments);

                        llmCoverageScores[promptData.promptId][modelId] = {
                            keyPointsCount: allAssessments.length,
                            avgCoverageExtent: allAssessments.length > 0 ? parseFloat(finalAverage.toFixed(2)) : undefined,
                            pointAssessments: allAssessments,
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