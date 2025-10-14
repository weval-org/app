import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';
import { imatches } from './imatches';

/**
 * Negative variant of 'imatches'.
 * Returns true if the response text does NOT match the specified regex pattern (case-insensitive).
 * This is the negation of the 'imatches' function.
 */
export const not_imatches: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    const result = imatches(llmResponseText, args, context);

    // If the original function returned an error, pass it through
    if (typeof result === 'object' && 'error' in result) {
        return result;
    }

    // Invert the boolean result
    if (typeof result === 'boolean') {
        return !result;
    }

    // Invert numeric scores (though imatches only returns boolean)
    if (typeof result === 'number') {
        return 1.0 - result;
    }

    return { error: 'Unexpected result type from imatches function' };
};
