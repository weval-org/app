import { OpenAIClient } from './openai-client';
import { AnthropicClient } from './anthropic-client';
import { GoogleClient } from './google-client';
import { MistralClient } from './mistral-client';
import { TogetherClient } from './together-client';
import { XaiClient } from './xai-client';
import { OpenRouterModuleClient } from './openrouter-client';
import { GenericHttpClient } from './generic-client';
import { LLMApiCallOptions, LLMApiCallResult, StreamChunk, CustomModelDefinition } from './types';

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
 * Registers custom model configurations by creating and caching GenericHttpClient instances.
 * This should be called once at the beginning of an evaluation run.
 * @param customModels - An array of custom model definitions from the blueprint.
 */
export function registerCustomModels(customModels: CustomModelDefinition[]) {
    console.log(`[ClientDispatcher] Registering ${customModels.length} custom models...`);
    for (const modelDef of customModels) {
        if (!clientInstances[modelDef.id]) {
            console.log(`[ClientDispatcher] Instantiating and caching a generic client for custom model ID: ${modelDef.id}`);
            clientInstances[modelDef.id] = new GenericHttpClient(modelDef);
        }
    }
}

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
    
    // First, check if there is a cached instance for this exact modelId (for custom models).
    if (clientInstances[modelId]) {
        console.log(`[ClientDispatcher] Using cached custom client for model ID: ${modelId}`);
        return clientInstances[modelId]!;
    }

    const parsed = parseModelId(modelId);
    if (!parsed) {
        // If parsing fails, it might be a custom model ID that wasn't registered.
        // We throw an error here, but it's more specific now.
        const error = `Invalid modelId format: "${modelId}". Expected "<provider>:<model-name>" for standard models, or a registered custom model ID.`;
        console.error(`[ClientDispatcher] ${error}`);
        throw new Error(error);
    }
    
    const { provider } = parsed;
    console.log(`[ClientDispatcher] Parsed provider: ${provider}, model: ${parsed.modelName}`);

    // Check if we already have an instance for this provider (for standard models)
    if (clientInstances[provider]) {
        console.log(`[ClientDispatcher] Using cached client for provider: ${provider}`);
        return clientInstances[provider]!;
    }
    
    const ClientClass = clientClassMap[provider];
    if (!ClientClass) {
        // This error is now more specific: it means the provider is not standard and no custom model was found.
        const error = `Unsupported LLM provider: "${provider}" from model ID "${modelId}". No matching custom model registered. Supported standard providers are: ${Object.keys(clientClassMap).join(', ')}.`;
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
    console.log(`[ClientDispatcher] Dispatching API call for modelId: ${options.modelId}`);
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