import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';

export const contains_any_of: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    if (!Array.isArray(args) || !args.every(item => typeof item === 'string')) {
        return { error: "Invalid arguments for 'contains_any_of'. Expected an array of strings." };
    }
    if (typeof llmResponseText !== 'string') {
        return false;
    }

    for (const substring of args) {
        if (llmResponseText.includes(substring)) {
            return true;
        }
    }

    return false;
}; 