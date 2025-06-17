import { PointFunction } from './types';

export const matches_at_least_n_of: PointFunction = (
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
            error: "Invalid arguments for 'matches_at_least_n_of'. Expected an array of the format [n, ['pattern1', 'pattern2', ...]].",
        };
    }

    const n = args[0];
    const patterns = args[1];

    if (n <= 0) {
        return 1.0; // Requirement of 0 or fewer is always met.
    }
    if (patterns.length === 0) {
        return n > 0 ? 0.0 : 1.0;
    }

    let foundCount = 0;
    for (const pattern of patterns) {
        try {
            const regex = new RegExp(pattern);
            if (regex.test(llmResponseText)) {
                foundCount++;
            }
        } catch (e: any) {
            return { error: `Invalid regex pattern in 'matches_at_least_n_of': ${e.message}` };
        }
    }

    return Math.min(1.0, foundCount / n);
}; 