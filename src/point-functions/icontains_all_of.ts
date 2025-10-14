import { PointFunction } from './types';

export const icontains_all_of: PointFunction = (
    llmResponseText: string,
    args: any, // Expect string[], but validate
): number | { error: string } => {
    if (!Array.isArray(args) || !args.every(item => typeof item === 'string')) {
        return {
            error: "Invalid arguments for 'icontains_all_of'. Expected an array of strings.",
        };
    }
    if (args.length === 0) {
        return 1.0; // Vacuously true
    }

    const lowerResponseText = llmResponseText.toLowerCase();
    const foundCount = args.reduce((count, substring) => {
        if (lowerResponseText.includes(substring.toLowerCase())) {
            return count + 1;
        }
        return count;
    }, 0);

    return foundCount / args.length;
};
