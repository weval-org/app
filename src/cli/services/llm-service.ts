import { openRouterModuleClient } from '../../lib/llm-clients/openrouter-client';
import { LLMStreamApiCallOptions, StreamChunk } from '../../lib/llm-clients/types';

export interface GetModelResponseOptions {
    modelId: string; // Now expected to be the full OpenRouter model string, e.g., "openrouter:openai/gpt-4o-mini"
    prompt: string;
    systemPrompt?: string | null;
    maxTokens?: number;
    temperature?: number;
    logProgress?: boolean; 
    useCache?: boolean; 
}

const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_TEMPERATURE = 0.3;

/**
 * Gets a streamed response from the specified LLM via OpenRouter.
 * Handles model name resolution and basic error wrapping.
 */
export async function getModelResponse(options: GetModelResponseOptions): Promise<string> {
    const chalk = (await import('chalk')).default;
    
    const {
        modelId, // Full OpenRouter model string
        prompt,
        systemPrompt,
        maxTokens = DEFAULT_MAX_TOKENS,
        temperature = DEFAULT_TEMPERATURE,
        logProgress = false,
        useCache = false 
    } = options;

    try {
        const parts = modelId.split(':');
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'openrouter') {
            const errorMsg = `Invalid modelId format: ${modelId}. Expected format: \"openrouter:provider/model-name\"`;
            console.error(chalk.red(errorMsg));
            return `<error> LLM setup issue: ${errorMsg} </error>`;
        }
        const targetOpenRouterModelId = parts[1]; // This is the part after "openrouter:", e.g., "openai/gpt-4o-mini"

        if (logProgress) {
            console.log(chalk.gray(`  -> Using OpenRouter model: ${targetOpenRouterModelId} (from input: ${modelId})`));
            if (useCache) {
                console.log(chalk.yellow('  -> Caching with direct client is not yet implemented and will be ignored.'));
            }
        }

        const clientOptions: Omit<LLMStreamApiCallOptions, 'apiKey'> = {
            modelName: targetOpenRouterModelId, 
            prompt: prompt,
            systemPrompt: systemPrompt ?? undefined,
            maxTokens: maxTokens,
            temperature: temperature,
        };

        let fullResponse = '';
        for await (const chunk of openRouterModuleClient.streamApiCall(clientOptions)) {
            if (chunk.type === 'content') {
                fullResponse += chunk.content;
                if (logProgress) {
                    process.stdout.write(chalk.gray('.'));
                }
            } else if (chunk.type === 'error') {
                console.error(chalk.red(`\nError chunk from OpenRouter stream for ${modelId}: ${chunk.error}`));
                return `<error> LLM issue from OpenRouter stream for ${modelId}: ${chunk.error} </error>`;
            }
        }
        
        if (logProgress) {
           process.stdout.write('\n'); 
        }

        return fullResponse;

    } catch (error: any) {
        const errorMessage = `Error getting response for model ${modelId}: ${error.message || String(error)}`;
        console.error(chalk.red(errorMessage));
        return `<error> LLM issue: ${errorMessage} </error>`;
    }
} 