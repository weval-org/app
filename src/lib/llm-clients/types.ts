import { ConversationMessage } from '@/types/shared';

/**
 * Common options for making an API call to an LLM.
 * This is the primary interface used by the application to pass options down.
 */
export interface LLMApiCallOptions {
    modelId: string;
    messages?: { role: string; content: string }[];
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    // Extended parameters for advanced use cases
    topP?: number;
    topK?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    stop?: string | string[];
    // Reasoning parameters
    reasoningEffort?: 'low' | 'medium' | 'high';
    thinkingBudget?: number;
    // Generic parameter passthrough for custom providers
    customParameters?: Record<string, any>;
    // Tools (optional): when provided and toolMode is 'native' or 'auto', clients may advertise tools
    tools?: ToolSpec[];
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    toolMode?: 'trace-only' | 'native' | 'auto'; // default: trace-only
}

/**
 * Common response structure for an API call.
 */
export interface LLMApiCallResult {
  responseText: string;
  error?: string; // Optional error message if the call failed
  // We can add more fields here if needed, like token counts, finish reasons etc.
}

export interface ToolSpec {
    name: string;
    description?: string;
    schema?: any;
}

export interface CustomModelDefinition {
    id: string;
    url: string;
    modelName: string;
    inherit: 'openai' | 'anthropic' | 'google' | 'mistral' | 'together' | 'xai' | 'openrouter';
    format?: 'chat' | 'completions'; // Defaults to 'chat' for backward compatibility
    promptFormat?: 'conversational' | 'raw'; // For completions format: 'conversational' adds "User: ... Assistant:", 'raw' uses just the prompt text
    headers?: Record<string, string>;
    // Advanced parameter overrides
    parameterMapping?: {
        // Map standard parameter names to provider-specific names
        temperature?: string;
        maxTokens?: string;
        topP?: string;
        topK?: string;
        presencePenalty?: string;
        frequencyPenalty?: string;
        stop?: string;
        // Reasoning-specific parameters
        reasoningEffort?: string;
        thinkingBudget?: string;
        reasoningContent?: string;
    };
    // Parameter overrides: set values or use null to exclude entirely
    parameters?: Record<string, any>;
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
    | { type: 'reasoning'; content: string }
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
     */
    abstract makeApiCall(options: LLMApiCallOptions): Promise<LLMApiCallResult>;

    abstract streamApiCall(options: LLMApiCallOptions): AsyncGenerator<StreamChunk, void, undefined>;
} 