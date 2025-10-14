import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';
import { matches } from './matches';

/**
 * Negative variant of 'matches'.
 * Returns true if the response text does NOT match the specified regex pattern.
 * This is the negation of the 'matches' function.
 */
export const not_matches: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    const result = matches(llmResponseText, args, context);

    // If the original function returned an error, pass it through
    if (typeof result === 'object' && 'error' in result) {
        return result;
    }

    // Invert the boolean result
    if (typeof result === 'boolean') {
        return !result;
    }

    // Invert numeric scores (though matches only returns boolean)
    if (typeof result === 'number') {
        return 1.0 - result;
    }

    return { error: 'Unexpected result type from matches function' };
};
