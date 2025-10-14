import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';
import { istarts_with } from './istarts_with';

/**
 * Negative variant of 'istarts_with'.
 * Returns true if the response text does NOT start with the specified string (case-insensitive).
 * This is the negation of the 'istarts_with' function.
 */
export const not_istarts_with: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    const result = istarts_with(llmResponseText, args, context);

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

    return { error: 'Unexpected result type from istarts_with function' };
};
