import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';
import { iends_with } from './iends_with';

/**
 * Negative variant of 'iends_with'.
 * Returns true if the response text does NOT end with the specified string (case-insensitive).
 * This is the negation of the 'iends_with' function.
 */
export const not_iends_with: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    const result = iends_with(llmResponseText, args, context);

    // If the original function returned an error, pass it through
    if (typeof result === 'object' && 'error' in result) {
        return result;
    }

    // Invert the boolean result
    if (typeof result === 'boolean') {
        return !result;
    }

    // Invert numeric scores
    if (typeof result === 'number') {
        return 1.0 - result;
    }

    return { error: 'Unexpected result type from iends_with function' };
};
