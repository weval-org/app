export interface EmbeddingClient {
    createEmbedding(text: string, modelId: string): Promise<number[]>;
}

export interface EmbeddingClientOptions {
    apiKey?: string;
} 