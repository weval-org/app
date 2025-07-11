import { getConfig } from '../config';
import crypto from 'crypto'; // For cache key hashing
import { dispatchMakeApiCall } from '../../lib/llm-clients/client-dispatcher';
import { LLMApiCallOptions } from '../../lib/llm-clients/types';
import { getCache, generateCacheKey } from '../../lib/cache-service';

type Logger = ReturnType<typeof getConfig>['logger'];

// Define expected result types (can be inferred, but explicit helps)
type ExtractionResult = { key_points: string[] };
type EvaluationError = { error: string };

/**
 * Uses an LLM (via OpenRouter) to extract key points from an ideal response given a prompt.
 * @param idealResponse The ideal response text.
 * @param promptText The original prompt text for context.
 * @param logger The logger instance.
 * @param judgeModels Optional array of models to use for key point extraction.
 * @param useCache Optional flag to enable file-based caching.
 * @returns A promise resolving to the extracted key points or an error object.
 */
export async function extractKeyPoints(
    idealResponse: string,
    promptText: string,
    logger: Logger,
    judgeModels?: string[],
    useCache: boolean = false,
): Promise<ExtractionResult | EvaluationError> {
    const cacheKeyPayload = {
        promptText,
        idealResponse,
        judgeModels, // Include judgeModels in case they influence extraction
    };
    const cacheKey = generateCacheKey(cacheKeyPayload);
    const cache = getCache('key-point-extraction');

    if (useCache) {
        const cachedResult = await cache.get(cacheKey);
        if (cachedResult) {
            logger.info(`Cache HIT for key point extraction: ${promptText.substring(0, 30)}...`);
            return cachedResult as ExtractionResult | EvaluationError;
        }
        logger.info(`Cache MISS for key point extraction: ${promptText.substring(0, 30)}...`);
    }

    const extractionPrompt = `
Extract the most essential pieces of information, requirements, or advice from the <IDEAL_RESPONSE> below, considering it's an answer to the <PROMPT>. 
Distill these into distinct key points. Each key point MUST be enclosed in <key_point> and </key_point> tags. 
For example: <key_point>This is a key point.</key_point> 
Return ONLY the key points in this format, with each key point on a new line if possible, but the tags are the most important part.

<PROMPT>
${promptText}
</PROMPT>

<IDEAL_RESPONSE>
${idealResponse}
</IDEAL_RESPONSE>
`;

    const systemPrompt = `Your role is to extract the most pertinent pieces of content and advice covered in any given response to a prompt. You are trying to distil the key things from a response in a set of points. Be concise and focus on distinct aspects. Ensure each key point is enclosed in <key_point> and </key_point> tags.`;

    // Define default models to try for key point extraction. Can be any supported provider.
    const modelsToTry: string[] = judgeModels && judgeModels.length > 0 ? judgeModels : [
        'openai:gpt-4o-mini',
        'openrouter:google/gemini-1.5-flash-latest',
    ]; 
    // These should be sensible defaults if this function is ever called without specific models from a config.
    // However, ideally, the calling context (like LLMCoverageEvaluator) should pass specific models if needed.

    let lastError: EvaluationError | null = null;

    for (const modelId of modelsToTry) {
        try {
            logger.info(`Attempting key point extraction with model: ${modelId}`);

            const clientOptions: Omit<LLMApiCallOptions, 'modelName'> & { modelId: string } = {
                modelId: modelId,
                messages: [{ role: 'user', content: extractionPrompt }],
                systemPrompt: systemPrompt,
                temperature: 0.1,
                maxTokens: 2000, 
            };

            const response = await dispatchMakeApiCall(clientOptions);

            if (response.error) {
                const errorMsg = `API Error during key point extraction with ${modelId}: ${response.error}`;
                logger.warn(`${errorMsg} Response: ${response.responseText}`);
                lastError = { error: errorMsg };
                continue; 
            }

            if (!response.responseText || response.responseText.trim() === '') {
                const errorMsg = `Empty response from LLM for key point extraction with ${modelId}.`;
                logger.warn(errorMsg);
                lastError = { error: errorMsg };
                continue; 
            }

            const matches = response.responseText.matchAll(/<key_point>([\s\S]*?)<\/key_point>/gsi);
            const key_points = Array.from(matches, m => m[1].trim());

            if (key_points.length === 0) {
                const errorMsg = `No key points found in LLM response from ${modelId} using regex. Response: ${response.responseText.substring(0, 500)}`;
                logger.warn(errorMsg);
                lastError = { error: errorMsg };
                continue; 
            }
            
            logger.info(`Key point extraction successful with ${modelId} for prompt context: ${promptText.substring(0, 50)}... Found ${key_points.length} points.`);
            const result: ExtractionResult = { key_points };
            if (useCache) {
                await cache.set(cacheKey, result);
            }
            return result;

        } catch (error: any) {
            const errorMessage = `LLM Client Error during key point extraction with ${modelId}: ${error.message || String(error)}`;
            logger.error(errorMessage);
            lastError = { error: errorMessage };
        }
    }
    
    const finalError = lastError || { error: "All models failed for key point extraction." };
    logger.error(finalError.error);
    if (useCache) {
        await cache.set(cacheKey, finalError);
    }
    return finalError;
} 