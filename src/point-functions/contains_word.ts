import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';

/**
 * contains_word: Checks if the response contains a word with Unicode-aware word boundaries.
 *
 * Unlike standard \b word boundaries in JavaScript (which only work with ASCII [A-Za-z0-9_]),
 * this function uses Unicode property escapes to properly handle accented characters and
 * other Unicode letters.
 *
 * Examples:
 *   - "Paraná River" with arg "Paraná" -> true (handles accents correctly)
 *   - "São Paulo" with arg "São" -> true
 *   - "Hello world" with arg "Hello" -> true
 *   - "Hello world" with arg "ell" -> false (not a complete word)
 *
 * Word boundaries are defined as positions where:
 * - Before: start of string OR not a letter/number/underscore
 * - After: end of string OR not a letter/number/underscore
 *
 * This uses \p{L} (Unicode letters) and \p{N} (Unicode numbers) with the 'u' flag.
 */
export const contains_word: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    if (typeof args !== 'string') {
        return { error: "Invalid arguments for 'contains_word'. Expected a string." };
    }
    if (typeof llmResponseText !== 'string') {
        return false;
    }
    if (args.length === 0) {
        return true; // Empty string is vacuously present
    }

    try {
        // Escape special regex characters in the search term
        const escapedWord = args.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Use Unicode-aware word boundaries:
        // (?<![\p{L}\p{N}_]) = not preceded by letter, number, or underscore
        // (?![\p{L}\p{N}_])  = not followed by letter, number, or underscore
        // The 'u' flag enables Unicode property escapes
        const regex = new RegExp(
            `(?<![\\p{L}\\p{N}_])${escapedWord}(?![\\p{L}\\p{N}_])`,
            'u'
        );

        return regex.test(llmResponseText);
    } catch (e: any) {
        return { error: `Error in 'contains_word': ${e.message}` };
    }
};
