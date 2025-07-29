import { OpenAIEmbeddingClient } from './openai-client';
import { TogetherEmbeddingClient } from './together-client';
import { EmbeddingClient, EmbeddingClientOptions } from './types';

// A mapping from provider prefix to the corresponding client *class*.
const clientClassMap: Record<string, new (options?: EmbeddingClientOptions) => EmbeddingClient> = {
    'openai': OpenAIEmbeddingClient,
    'together': TogetherEmbeddingClient,
};

// A cache for instantiated clients, to avoid creating new ones for every call.
const clientInstances: Partial<Record<string, EmbeddingClient>> = {};

/**
 * Parses the model ID to extract the provider and the actual model name.
 * @param modelId - The full model identifier (e.g., "openai:text-embedding-3-small").
 * @returns An object containing the provider and the model name.
 * @throws An error if the format is invalid.
 */
function parseModelId(modelId: string): { provider: string; modelName: string } {
    const parts = modelId.split(':');
    if (parts.length !== 2) {
        // Fallback for backward compatibility. If no provider is specified, assume openai.
        console.warn(`[EmbeddingDispatcher] Model ID "${modelId}" is missing a provider prefix. Assuming "openai". Please update your blueprint to use the format "provider:model_name".`);
        return { provider: 'openai', modelName: modelId };
    }
    const [provider, modelName] = parts;
    return { provider: provider.toLowerCase(), modelName };
}

/**
 * Gets the appropriate embedding client based on the model ID's prefix.
 * @param modelId - The full model identifier.
 * @returns The corresponding embedding client.
 * @throws An error if the provider is unsupported.
 */
function getClient(modelId: string): EmbeddingClient {
    const { provider } = parseModelId(modelId);

    if (clientInstances[provider]) {
        return clientInstances[provider]!;
    }

    const ClientClass = clientClassMap[provider];
    if (!ClientClass) {
        throw new Error(`Unsupported embedding provider: "${provider}" from model ID "${modelId}". Supported providers are: ${Object.keys(clientClassMap).join(', ')}.`);
    }

    try {
        const newInstance = new ClientClass();
        clientInstances[provider] = newInstance;
        return newInstance;
    } catch (error: any) {
        console.error(`[EmbeddingDispatcher] Failed to instantiate client for provider: ${provider}. Error: ${error.message}`);
        throw error;
    }
}

/**
 * A generic dispatcher for creating an embedding from any supported provider.
 */
export async function dispatchCreateEmbedding(text: string, modelId: string): Promise<number[]> {
    const client = getClient(modelId);
    return client.createEmbedding(text, modelId);
} 