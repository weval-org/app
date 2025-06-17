import { PointFunction } from './types';

export const matches_all_of: PointFunction = (
    llmResponseText: string,
    args: any, // Expect string[], but validate
): number | { error: string } => {
    if (!Array.isArray(args) || !args.every(item => typeof item === 'string')) {
        return {
            error: "Invalid arguments for 'matches_all_of'. Expected an array of regex strings.",
        };
    }
    if (args.length === 0) {
        return 1.0; // Vacuously true
    }

    let foundCount = 0;
    for (const pattern of args) {
        try {
            const regex = new RegExp(pattern);
            if (regex.test(llmResponseText)) {
                foundCount++;
            }
        } catch (e: any) {
            return { error: `Invalid regex pattern in 'matches_all_of': ${e.message}` };
        }
    }

    return foundCount / args.length;
}; 