import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';

export const starts_with: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    if (typeof args !== 'string') {
        return { error: "Invalid arguments for 'starts_with'. Expected a string prefix." };
    }
    if (typeof llmResponseText !== 'string') {
        return false;
    }
    return llmResponseText.startsWith(args);
}; 