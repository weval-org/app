import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';
import { starts_with } from './starts_with';

/**
 * Negative variant of 'starts_with'.
 * Returns true if the response text does NOT start with the specified string.
 * This is the negation of the 'starts_with' function.
 */
export const not_starts_with: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    const result = starts_with(llmResponseText, args, context);

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

    return { error: 'Unexpected result type from starts_with function' };
};
