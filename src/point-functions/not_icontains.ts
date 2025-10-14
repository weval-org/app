import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';
import { icontains } from './icontains';

/**
 * Negative variant of 'icontains'.
 * Returns true if the response text does NOT contain the specified string (case-insensitive).
 * This is the negation of the 'icontains' function.
 */
export const not_icontains: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    const result = icontains(llmResponseText, args, context);

    // If the original function returned an error, pass it through
    if (typeof result === 'object' && 'error' in result) {
        return result;
    }

    // Invert the boolean result
    if (typeof result === 'boolean') {
        return !result;
    }

    // Invert numeric scores (though icontains only returns boolean)
    if (typeof result === 'number') {
        return 1.0 - result;
    }

    return { error: 'Unexpected result type from icontains function' };
};
