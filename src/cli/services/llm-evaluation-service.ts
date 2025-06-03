import { getConfig } from '../config';
import crypto from 'crypto'; // For cache key hashing
import { openRouterModuleClient } from '../../lib/llm-clients/openrouter-client';
import { LLMApiCallOptions } from '../../lib/llm-clients/types';

type Logger = ReturnType<typeof getConfig>['logger'];

// Define expected result types (can be inferred, but explicit helps)
type ExtractionResult = { key_points: string[] };
type EvaluationError = { error: string };

// Simple in-memory cache for this run
const llmCache = new Map<string, ExtractionResult | EvaluationError>();

function getCacheKey(input: string): string {
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    return `extract:${hash}`;
}

/**
 * Uses an LLM (via OpenRouter) to extract key points from an ideal response given a prompt.
 * @param idealResponse The ideal response text.
 * @param promptText The original prompt text for context.
 * @param logger The logger instance.
 * @returns A promise resolving to the extracted key points or an error object.
 */
export async function extractKeyPoints(
    idealResponse: string,
    promptText: string,
    logger: Logger
): Promise<ExtractionResult | EvaluationError> {
    const cacheInput = `Prompt: ${promptText}\nIdeal Response: ${idealResponse}`;
    const cacheKey = getCacheKey(cacheInput);

    if (llmCache.has(cacheKey)) {
        logger.info(`Cache hit for key point extraction: ${promptText.substring(0, 30)}...`);
        return llmCache.get(cacheKey) as ExtractionResult | EvaluationError;
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

    // Define default OpenRouter models to try for key point extraction if not overridden by caller.
    const modelsToTry: string[] = [
        'openrouter:openai/gpt-4.1',
        'openrouter:openai/gpt-4.1-mini'
    ]; 
    // These should be sensible defaults if this function is ever called without specific models from a config.
    // However, ideally, the calling context (like LLMCoverageEvaluator) should pass specific models if needed.

    let lastError: EvaluationError | null = null;

    for (const fullModelString of modelsToTry) {
        const parts = fullModelString.split(':');
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'openrouter') {
            logger.warn(`Invalid model string format: ${fullModelString} in extractKeyPoints. Skipping.`);
            lastError = { error: `Invalid model string format: ${fullModelString}` };
            continue;
        }
        const targetOpenRouterModelId = parts[1]; // e.g., "openai/gpt-4o-mini"

        try {
            logger.info(`Attempting key point extraction with OpenRouter model: ${targetOpenRouterModelId} (from ${fullModelString})`);

            const clientOptions: LLMApiCallOptions = {
                modelName: targetOpenRouterModelId,
                prompt: extractionPrompt,
                systemPrompt: systemPrompt,
                temperature: 0.1,
                maxTokens: 2000, 
            };

            const response = await openRouterModuleClient.makeApiCall(clientOptions);

            if (response.error) {
                const errorMsg = `OpenRouter Error during key point extraction with ${targetOpenRouterModelId}: ${response.error}`;
                logger.warn(`${errorMsg} Response: ${response.responseText}`);
                lastError = { error: errorMsg };
                continue; 
            }

            if (!response.responseText || response.responseText.trim() === '') {
                const errorMsg = `Empty response from LLM for key point extraction with ${targetOpenRouterModelId}.`;
                logger.warn(errorMsg);
                lastError = { error: errorMsg };
                continue; 
            }

            const matches = response.responseText.matchAll(/<key_point>([\s\S]*?)<\/key_point>/gsi);
            const key_points = Array.from(matches, m => m[1].trim());

            if (key_points.length === 0) {
                const errorMsg = `No key points found in LLM response from ${targetOpenRouterModelId} using regex. Response: ${response.responseText.substring(0, 500)}`;
                logger.warn(errorMsg);
                lastError = { error: errorMsg };
                continue; 
            }
            
            logger.info(`Key point extraction successful with ${targetOpenRouterModelId} for prompt context: ${promptText.substring(0, 50)}... Found ${key_points.length} points.`);
            const result: ExtractionResult = { key_points };
            llmCache.set(cacheKey, result);
            return result;

        } catch (error: any) {
            const errorMessage = `LLM Client Error during key point extraction with ${fullModelString}: ${error.message || String(error)}`;
            logger.error(errorMessage);
            lastError = { error: errorMessage };
        }
    }
    
    const finalError = lastError || { error: "All models failed for key point extraction." };
    logger.error(finalError.error);
    llmCache.set(cacheKey, finalError);
    return finalError;
} 