import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/comparison_v2'; // Renamed to avoid conflict
import { PromptResponseData } from '@/cli/types/comparison_v2';

// Using CliPromptConfig to avoid naming collision if this file were to define its own PromptConfig
export interface PointFunctionContext {
    config: ComparisonConfig; // The overall comparison configuration
    prompt: CliPromptConfig;    // The specific prompt configuration being evaluated
    // responseData includes all model responses for the current prompt.
    // The point function is called for *each* model's response against a specific point.
    // So, we also need the specific modelId whose response is being evaluated.
    modelId: string; // The ID of the model whose response is being evaluated
}

export type PointFunctionArgs = any; // As defined in comparison_v2.ts, but good to have here for clarity

export type PointFunctionReturn = number | boolean | { error: string };

// A PointFunction takes the specific LLM response text, the arguments for the function,
// and the broader context of the evaluation.
export type PointFunction = (
    llmResponseText: string,
    args: PointFunctionArgs,
    context: PointFunctionContext
) => PointFunctionReturn | Promise<PointFunctionReturn>; 