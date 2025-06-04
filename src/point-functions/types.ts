import { ComparisonConfig, PromptConfig as CliPromptConfig } from '@/cli/types/comparison_v2';

export interface PointFunctionContext {
    config: ComparisonConfig;
    prompt: CliPromptConfig;
    modelId: string;
}

export type PointFunctionArgs = any;

export type PointFunctionReturn = number | boolean | { error: string };

export type PointFunction = (
    llmResponseText: string,
    args: PointFunctionArgs,
    context: PointFunctionContext
) => PointFunctionReturn | Promise<PointFunctionReturn>; 