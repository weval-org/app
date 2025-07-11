import { OpenAIClient } from './openai-client';
import { AnthropicClient } from './anthropic-client';
import { GoogleClient } from './google-client';
import { MistralClient } from './mistral-client';
import { TogetherClient } from './together-client';
import { XaiClient } from './xai-client';
import { OpenRouterModuleClient } from './openrouter-client';
import { BaseLLMClient, LLMApiCallOptions, LLMStreamApiCallOptions, LLMApiCallResult, StreamChunk } from './types';

// A mapping from provider prefix to the corresponding client *class*.
const clientClassMap: Record<string, new (apiKey?: string) => any> = {
    'openrouter': OpenRouterModuleClient,
    'openai': OpenAIClient,
    'anthropic': AnthropicClient,
    'google': GoogleClient,
    'mistral': MistralClient,
    'together': TogetherClient,
    'xai': XaiClient,
};

// A cache for instantiated clients, to avoid creating new ones for every call.
const clientInstances: Partial<Record<string, any>> = {};

/**
 * Parses the model ID to extract the provider and the actual model name.
 * @param modelId - The full model identifier (e.g., "openrouter:google/gemini-pro").
 * @returns An object containing the provider and the model name, or null if invalid.
 */
function parseModelId(modelId: string): { provider: string; modelName: string } | null {
    const parts = modelId.split(':');
    if (parts.length !== 2) {
        return null;
    }
    const [provider, modelName] = parts;
    return { provider: provider.toLowerCase(), modelName };
}

/**
 * Gets the appropriate LLM client based on the model ID's prefix.
 * @param modelId - The full model identifier.
 * @returns The corresponding LLM client.
 * @throws An error if the provider is unsupported.
 */
function getClient(modelId: string): any {
    console.log(`[ClientDispatcher] Getting client for modelId: ${modelId}`);
    
    const parsed = parseModelId(modelId);
    if (!parsed) {
        const error = `Invalid modelId format: "${modelId}". Expected format: "<provider>:<model-name>"`;
        console.error(`[ClientDispatcher] ${error}`);
        throw new Error(error);
    }
    
    const { provider } = parsed;
    console.log(`[ClientDispatcher] Parsed provider: ${provider}, model: ${parsed.modelName}`);

    // Check if we already have an instance for this provider
    if (clientInstances[provider]) {
        console.log(`[ClientDispatcher] Using cached client for provider: ${provider}`);
        return clientInstances[provider]!;
    }
    
    const ClientClass = clientClassMap[provider];
    if (!ClientClass) {
        const error = `Unsupported LLM provider: "${provider}" from model ID "${modelId}". Supported providers are: ${Object.keys(clientClassMap).join(', ')}.`;
        console.error(`[ClientDispatcher] ${error}`);
        throw new Error(error);
    }
    
    console.log(`[ClientDispatcher] Instantiating new client for provider: ${provider}`);
    
    try {
        // Instantiate the client on-demand. This is where the API key check will happen.
        const newInstance = new ClientClass();
        clientInstances[provider] = newInstance; // Cache the new instance
        console.log(`[ClientDispatcher] Successfully created and cached client for provider: ${provider}`);
        return newInstance;
    } catch (error: any) {
        console.error(`[ClientDispatcher] Failed to instantiate client for provider: ${provider}. Error: ${error.message}`);
        throw error;
    }
}

/**
 * A generic dispatcher for making non-streaming API calls to any supported LLM provider.
 * It determines the correct client from the modelId and forwards the call.
 */
export async function dispatchMakeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResult> {
    const { modelId } = options;
    const client = getClient(modelId);
    
    // The client's makeApiCall method now expects the full options object.
    return client.makeApiCall(options);
}

/**
 * A generic dispatcher for making streaming API calls to any supported LLM provider.
 * It determines the correct client from the modelId and forwards the call.
 */
export function dispatchStreamApiCall(options: LLMApiCallOptions): AsyncGenerator<StreamChunk> {
    const { modelId } = options;
    const client = getClient(modelId);
    
    return client.streamApiCall(options);
} 