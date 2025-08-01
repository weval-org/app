import { EmbeddingClient, EmbeddingClientOptions } from './types';

export class OpenAIEmbeddingClient implements EmbeddingClient {
    private apiKey: string;

    constructor(options?: EmbeddingClientOptions) {
        let apiKey = options?.apiKey || process.env.OPENAI_API_KEY || '';
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not set. Please set it in your environment variables.');
        }
        
        // Clean the key to remove any hidden characters.
        this.apiKey = apiKey.trim().replace(/[\r\n]/g, '');
    }

    async createEmbedding(text: string, modelId: string): Promise<number[]> {
        const { modelName } = this.parseModelId(modelId);

        let dimensions: number;
        if (modelName === 'text-embedding-3-large') {
            dimensions = 3072;
        } else {
            dimensions = 1536; // Default for text-embedding-3-small and others
        }

        try {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    input: text,
                    model: modelName,
                    dimensions: dimensions,
                    encoding_format: 'float',
                })
            });

            const responseData = await response.json();

            if (!response.ok) {
                console.error(`[OpenAIEmbeddingClient] API call failed for model ${modelName}:`, responseData);
                throw new Error(`[OpenAIEmbeddingClient] Embedding generation failed: ${responseData.error?.message || response.statusText}`);
            }

            return responseData.data[0].embedding;

        } catch (error) {
            console.error(`[OpenAIEmbeddingClient] Raw fetch failed for model ${modelName}:`, error);
            throw new Error(`[OpenAIEmbeddingClient] Embedding generation failed for model ${modelName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private parseModelId(modelId: string): { provider: string; modelName: string } {
        const parts = modelId.split(':');
        if (parts.length !== 2) {
            // Fallback for cases where the raw model name is passed without a provider
            return { provider: 'openai', modelName: modelId };
        }
        const [provider, modelName] = parts;
        return { provider, modelName };
    }
} 