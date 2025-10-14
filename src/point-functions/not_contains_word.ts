import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';
import { contains_word } from './contains_word';

/**
 * not_contains_word: Returns true if the word is NOT found with Unicode-aware boundaries.
 *
 * This is the negation of contains_word.
 */
export const not_contains_word: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    const result = contains_word(llmResponseText, args, context);
    if (typeof result === 'object' && 'error' in result) {
        return result;
    }
    if (typeof result === 'boolean') {
        return !result;
    }
    if (typeof result === 'number') {
        return 1.0 - result;
    }
    return { error: 'Unexpected result type from contains_word function' };
};
