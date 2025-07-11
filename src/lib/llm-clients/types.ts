import { ConversationMessage } from '@/types/shared';

/**
 * Common options for making an API call to an LLM.
 * This is the primary interface used by the application to pass options down.
 */
export interface LLMApiCallOptions {
    modelId: string; // The full, prefixed model ID, e.g., "openai:gpt-4o-mini"
    messages: ConversationMessage[];
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
    stream?: boolean;
    timeout?: number; // Timeout in milliseconds
}

/**
 * Common response structure for an API call.
 */
export interface LLMApiCallResult {
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
  prompt?: string; // Now optional, prioritize 'messages' if available
  messages?: ConversationMessage[]; // For chat-based, multi-turn interactions
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
 * This is the abstract class that all clients (OpenAI, Anthropic, etc.) must extend.
 */
export abstract class BaseLLMClient {
    protected apiKey: string | undefined;
    protected client: any;

    constructor(apiKey?: string) {
        this.apiKey = apiKey;
    }
    
    /**
     * The core method for making an API call. Each client implements this.
     * It now includes the timeout option.
     */
    abstract makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResult>;

    abstract streamApiCall(options: LLMApiCallOptions): AsyncGenerator<StreamChunk, void, undefined>;
} 