/**
 * Common options for making a non-streaming API call to an LLM.
 */
export interface LLMApiCallOptions {
  apiKey?: string; // Made optional, client can fetch from env
  modelName: string; // The specific model name expected by the provider
  prompt: string;
  systemPrompt?: string | null;
  temperature?: number;
  maxTokens?: number;
  cache?: boolean;
  // Additional provider-specific options can be added here if necessary
  // e.g., topP, presencePenalty, frequencyPenalty for OpenAI
}

/**
 * Common response structure for a non-streaming API call.
 * We expect the primary text output from the LLM.
 */
export interface LLMApiCallResponse {
  responseText: string;
  error?: string; // Optional error message if the call failed
  // We can add more fields here if needed, like token counts, finish reasons etc.
}

/**
 * Common options for making a streaming API call to an LLM.
 */
export interface LLMStreamApiCallOptions {
  apiKey?: string; // Made optional, client can fetch from env
  modelName: string;
  prompt: string;
  systemPrompt?: string | null;
  temperature?: number;
  maxTokens?: number;
  // Additional provider-specific options can be added here
}

/**
 * Represents a chunk of data from a streaming API call.
 * It can either be a piece of text or an error.
 */
export type StreamChunk = 
  | { type: 'content'; content: string }
  | { type: 'error'; error: string };

/**
 * Defines the structure for a provider-specific API client.
 */
export interface LLMClient {
  makeApiCall: (options: LLMApiCallOptions) => Promise<LLMApiCallResponse>;
  streamApiCall: (options: LLMStreamApiCallOptions) => AsyncGenerator<StreamChunk, void, undefined>;
} 