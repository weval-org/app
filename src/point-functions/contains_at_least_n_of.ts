import { PointFunction } from './types';

export const contains_at_least_n_of: PointFunction = (
    llmResponseText: string,
    args: any,
): number | { error: string } => {
    if (
        !Array.isArray(args) ||
        args.length !== 2 ||
        typeof args[0] !== 'number' ||
        !Array.isArray(args[1]) ||
        !args[1].every(item => typeof item === 'string')
    ) {
        return {
            error: "Invalid arguments for 'contains_at_least_n_of'. Expected an array of the format [n, ['substring1', 'substring2', ...]].",
        };
    }

    const n = args[0];
    const substrings = args[1];

    if (n <= 0) {
        return 1.0; // Requirement of 0 or fewer is always met.
    }
    if (substrings.length === 0) {
        return n > 0 ? 0.0 : 1.0;
    }

    const foundCount = substrings.reduce((count, substring) => {
        if (llmResponseText.includes(substring)) {
            return count + 1;
        }
        return count;
    }, 0);

    return Math.min(1.0, foundCount / n);
}; 