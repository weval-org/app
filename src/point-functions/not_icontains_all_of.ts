import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';
import { icontains_all_of } from './icontains_all_of';

/**
 * Negative variant of 'icontains_all_of'.
 * Returns 1.0 if the response text does NOT contain ALL of the specified strings (case-insensitive).
 * Returns a fractional score inversely proportional to how many are present.
 * This is the negation of the 'icontains_all_of' function.
 */
export const not_icontains_all_of: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    const result = icontains_all_of(llmResponseText, args, context);

    // If the original function returned an error, pass it through
    if (typeof result === 'object' && 'error' in result) {
        return result;
    }

    // Invert the boolean result
    if (typeof result === 'boolean') {
        return !result;
    }

    // Invert numeric scores (icontains_all_of returns graded scores)
    if (typeof result === 'number') {
        return 1.0 - result;
    }

    return { error: 'Unexpected result type from icontains_all_of function' };
};
