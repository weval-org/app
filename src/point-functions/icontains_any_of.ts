import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';

export const icontains_any_of: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    if (!Array.isArray(args) || !args.every(item => typeof item === 'string')) {
        return { error: "Invalid arguments for 'icontains_any_of'. Expected an array of strings." };
    }
    if (typeof llmResponseText !== 'string') {
        return false;
    }

    const lowerResponseText = llmResponseText.toLowerCase();
    for (const substring of args) {
        if (lowerResponseText.includes(substring.toLowerCase())) {
            return true;
        }
    }

    return false;
};
