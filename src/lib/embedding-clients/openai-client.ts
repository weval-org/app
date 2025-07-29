import OpenAI from 'openai';
import { EmbeddingClient, EmbeddingClientOptions } from './types';

export class OpenAIEmbeddingClient implements EmbeddingClient {
    private client: OpenAI;
    private apiKey: string;

    constructor(options?: EmbeddingClientOptions) {
        this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('OPENAI_API_KEY is not set. Please set it in your environment variables.');
        }
        this.client = new OpenAI({
            apiKey: this.apiKey.trim(),
        });
    }

    async createEmbedding(text: string, modelId: string): Promise<number[]> {
        // modelId is expected to be the specific model name, e.g., 'text-embedding-3-small'
        const { modelName } = this.parseModelId(modelId);

        let dimensions: number;
        if (modelName === 'text-embedding-3-large') {
            dimensions = 3072;
        } else if (modelName === 'text-embedding-3-small') {
            dimensions = 1536;
        } else {
            // This is a fallback, but the dispatcher should ideally prevent this.
            // We could also choose to not support other openai embedding models if we dont want to
            console.warn(`Unsupported OpenAI embedding model ID: ${modelName}. The 'dimensions' parameter may be incorrect.`);
            dimensions = 1536; 
        }

        try {
            const response = await this.client.embeddings.create({
                model: modelName,
                input: text,
                dimensions: dimensions,
                encoding_format: 'float',
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error(`[OpenAIEmbeddingClient] API call failed for model ${modelName}:`, error);
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