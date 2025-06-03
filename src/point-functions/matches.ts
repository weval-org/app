import { PointFunction, PointFunctionReturn } from './types';

export const matches: PointFunction = (
    llmResponseText: string,
    args: any, // Expect string (regex pattern), but validate
    // context: PointFunctionContext // Not used by this simple function
): PointFunctionReturn => {
    if (typeof args !== 'string') {
        return { error: "Invalid arguments for 'matches'. Expected a regex string." };
    }
    try {
        const regex = new RegExp(args);
        return regex.test(llmResponseText);
    } catch (e: any) {
        return { error: `Invalid regex pattern for 'matches': ${e.message}` };
    }
}; 