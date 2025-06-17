import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';

export const icontains: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    if (typeof args !== 'string') {
        return { error: "Invalid arguments for 'icontains'. Expected a string." };
    }
    if (typeof llmResponseText !== 'string') {
        return false;
    }
    return llmResponseText.toLowerCase().includes(args.toLowerCase());
}; 