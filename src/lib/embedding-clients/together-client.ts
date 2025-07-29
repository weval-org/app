import { EmbeddingClient, EmbeddingClientOptions } from './types';

export class TogetherEmbeddingClient implements EmbeddingClient {
    private apiKey: string;
    private baseUrl = 'https://api.together.xyz/v1/embeddings';

    constructor(options?: EmbeddingClientOptions) {
        this.apiKey = options?.apiKey || process.env.TOGETHER_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('TOGETHER_API_KEY is not set. Please set it in your environment variables.');
        }
    }

    async createEmbedding(text: string, modelId: string): Promise<number[]> {
        const { modelName } = this.parseModelId(modelId);

        const payload = {
            model: modelName,
            input: text.replace(/\n/g, ' '),
        };

        try {
            // Added detailed logging for the request payload
            console.log(`[TogetherEmbeddingClient] Sending request to ${this.baseUrl} with payload:`, JSON.stringify(payload, null, 2));
            console.log(`[TogetherEmbeddingClient] API key: ${this.apiKey}`);

            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                // Added logging for the error response from the server
                console.error(`[TogetherEmbeddingClient] API call failed with status ${response.status}. Response body:`, errorBody);
                throw new Error(`API call failed with status ${response.status}: ${errorBody}`);
            }

            const data = await response.json();
            
            if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
                throw new Error('Invalid response format from Together AI API: no embeddings found.');
            }

            return data.data[0].embedding;

        } catch (error) {
            console.error(`[TogetherEmbeddingClient] API call failed for model ${modelName}:`, error);
            throw new Error(`[TogetherEmbeddingClient] Embedding generation failed for model ${modelName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private parseModelId(modelId: string): { provider: string; modelName: string } {
        const parts = modelId.split(':');
        if (parts.length !== 2) {
            throw new Error(`Invalid modelId format for Together AI: "${modelId}". Expected "together:<model-name>".`);
        }
        const [provider, modelName] = parts;
        return { provider, modelName };
    }
} 