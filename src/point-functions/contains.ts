import { PointFunction, PointFunctionReturn } from './types';

export const contains: PointFunction = (
    llmResponseText: string,
    args: any, // Expect string, but validate
    // context: PointFunctionContext // Not used by this simple function
): PointFunctionReturn => {
    if (typeof args !== 'string') {
        return { error: "Invalid arguments for 'contains'. Expected a string." };
    }
    return llmResponseText.includes(args);
}; 