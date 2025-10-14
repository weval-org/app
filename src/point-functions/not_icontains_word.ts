import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';
import { icontains_word } from './icontains_word';

/**
 * not_icontains_word: Case-insensitive negation of contains_word.
 *
 * Returns true if the word is NOT found (ignoring case) with Unicode-aware boundaries.
 */
export const not_icontains_word: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    const result = icontains_word(llmResponseText, args, context);
    if (typeof result === 'object' && 'error' in result) {
        return result;
    }
    if (typeof result === 'boolean') {
        return !result;
    }
    if (typeof result === 'number') {
        return 1.0 - result;
    }
    return { error: 'Unexpected result type from icontains_word function' };
};
