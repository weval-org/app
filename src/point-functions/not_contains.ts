import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';
import { contains } from './contains';

/**
 * Negative variant of 'contains'.
 * Returns true if the response text does NOT contain the specified string.
 * This is the negation of the 'contains' function.
 */
export const not_contains: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    const result = contains(llmResponseText, args, context);

    // If the original function returned an error, pass it through
    if (typeof result === 'object' && 'error' in result) {
        return result;
    }

    // Invert the boolean result
    if (typeof result === 'boolean') {
        return !result;
    }

    // Invert numeric scores (though contains only returns boolean)
    if (typeof result === 'number') {
        return 1.0 - result;
    }

    return { error: 'Unexpected result type from contains function' };
};
