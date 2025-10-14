import { PointFunction, PointFunctionReturn, PointFunctionContext } from './types';

/**
 * icontains_word: Case-insensitive version of contains_word.
 *
 * Checks if the response contains a word with Unicode-aware word boundaries,
 * ignoring case differences.
 *
 * Examples:
 *   - "Paraná River" with arg "paraná" -> true (case-insensitive + accents)
 *   - "São Paulo" with arg "SÃO" -> true
 *   - "HELLO world" with arg "hello" -> true
 *   - "Hello world" with arg "ell" -> false (not a complete word)
 */
export const icontains_word: PointFunction = (
    llmResponseText: string,
    args: any,
    context: PointFunctionContext,
): PointFunctionReturn => {
    if (typeof args !== 'string') {
        return { error: "Invalid arguments for 'icontains_word'. Expected a string." };
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

        // Use Unicode-aware word boundaries with case-insensitive flag
        const regex = new RegExp(
            `(?<![\\p{L}\\p{N}_])${escapedWord}(?![\\p{L}\\p{N}_])`,
            'iu' // 'i' for case-insensitive, 'u' for Unicode
        );

        return regex.test(llmResponseText);
    } catch (e: any) {
        return { error: `Error in 'icontains_word': ${e.message}` };
    }
};
