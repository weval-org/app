import { ComparisonConfig, PromptConfig } from '@/cli/types/cli_types';
import { getConfig } from '@/cli/config';

type Logger = ReturnType<typeof getConfig>['logger'];

export interface PointFunctionContext {
    config: ComparisonConfig;
    prompt: PromptConfig;
    modelId: string;
    logger?: Logger;
}

export type AtLeastNOfArg = [number, string[]];
export type PointFunctionArgs = string | number | boolean | null | (string | number | boolean)[] | AtLeastNOfArg | Record<string, unknown>;

export type PointFunctionReturn = boolean | number | { error: string };

export type PointFunction = (
    llmResponseText: string,
    args: PointFunctionArgs,
    context: PointFunctionContext
) => PointFunctionReturn | Promise<PointFunctionReturn>; 