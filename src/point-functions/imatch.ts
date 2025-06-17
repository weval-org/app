import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';

export const imatch: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    if (typeof args !== 'string') {
        return { error: "Invalid arguments for 'imatch'. Expected a regex string." };
    }
    if (typeof llmResponseText !== 'string') {
        return false;
    }
    try {
        const regex = new RegExp(args, 'i'); // 'i' flag for case-insensitivity
        return regex.test(llmResponseText);
    } catch (e: any) {
        return { error: `Invalid regex pattern for 'imatch': ${e.message}` };
    }
}; 