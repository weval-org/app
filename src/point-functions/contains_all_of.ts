import { PointFunction } from './types';

export const contains_all_of: PointFunction = (
    llmResponseText: string,
    args: any, // Expect string[], but validate
): number | { error: string } => {
    if (!Array.isArray(args) || !args.every(item => typeof item === 'string')) {
        return {
            error: "Invalid arguments for 'contains_all_of'. Expected an array of strings.",
        };
    }
    if (args.length === 0) {
        return 1.0; // Vacuously true
    }

    const foundCount = args.reduce((count, substring) => {
        if (llmResponseText.includes(substring)) {
            return count + 1;
        }
        return count;
    }, 0);

    return foundCount / args.length;
}; 