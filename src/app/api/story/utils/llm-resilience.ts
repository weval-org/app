/**
 * LLM resilience utilities for Story feature
 * Handles fallbacks, retries, and error recovery
 */

import { getModelResponse, GetModelResponseParams } from '@/cli/services/llm-service';
import { checkForErrors } from '@/cli/utils/response-utils';

export const FALLBACK_MODELS = [
  'openrouter:google/gemini-2.5-flash',
  'openrouter:google/gemini-2.5-pro',
  'openrouter:openai/gpt-5',
  'anthropic:claude-3.5-haiku',
  'openrouter:qwen/qwen3-30b-a3b-instruct-2507',
] as const;

export interface ResilientLLMOptions extends Omit<GetModelResponseParams, 'modelId'> {
  preferredModel?: string;
  maxRetries?: number;
  backoffMs?: number;
}

export class LLMCallError extends Error {
  constructor(
    message: string,
    public readonly attemptedModels: string[],
    public readonly lastError?: Error
  ) {
    super(message);
    this.name = 'LLMCallError';
  }
}

/**
 * Resilient LLM call with fallback models and exponential backoff
 */
export async function resilientLLMCall(options: ResilientLLMOptions): Promise<string> {
  const {
    preferredModel = FALLBACK_MODELS[0],
    maxRetries = 2,
    backoffMs = 1000,
    ...llmOptions
  } = options;

  const modelsToTry = [preferredModel, ...FALLBACK_MODELS.filter(m => m !== preferredModel)];
  const attemptedModels: string[] = [];
  let lastError: Error | undefined;

  for (const modelId of modelsToTry) {
    attemptedModels.push(modelId);
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await getModelResponse({
          ...llmOptions,
          modelId,
          retries: 0, // We handle retries here
        });

        if (checkForErrors(response) || !response || !response.trim()) {
          throw new Error(`Empty or error response from ${modelId}`);
        }

        return response;
      } catch (error: any) {
        lastError = error;
        
        if (attempt < maxRetries) {
          // Exponential backoff for retries on same model
          const delay = backoffMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  throw new LLMCallError(
    `All models failed after ${maxRetries + 1} attempts each. Attempted: ${attemptedModels.join(', ')}`,
    attemptedModels,
    lastError
  );
}

/**
 * Quick validation for Story-specific responses
 */
export function validateStoryResponse(response: string, expectedFormat: 'chat' | 'json'): boolean {
  if (!response || response.trim().length === 0) return false;
  
  if (expectedFormat === 'json') {
    return /<JSON>[\s\S]*?<\/JSON>/i.test(response) || response.includes('{');
  }
  
  // For chat responses, just ensure non-empty and reasonable length
  return response.trim().length > 10 && response.trim().length < 5000;
}
