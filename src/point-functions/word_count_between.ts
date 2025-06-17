import { PointFunction, PointFunctionReturn } from './types';

export const word_count_between: PointFunction = (
    llmResponseText: string,
    args: any,
): PointFunctionReturn => {
    if (
        !Array.isArray(args) ||
        args.length !== 2 ||
        typeof args[0] !== 'number' ||
        typeof args[1] !== 'number' ||
        args[0] < 0 ||
        args[1] < args[0]
    ) {
        return { error: "Invalid arguments for 'word_count_between'. Expected an array with two numbers [min, max] where 0 <= min <= max." };
    }
    if (typeof llmResponseText !== 'string') {
        return 0; // Or false, 0 seems more appropriate for a numeric function
    }

    const wordCount = (llmResponseText.match(/\S+/g) || []).length;
    const [min, max] = args;

    if (wordCount < min) {
        // Linearly scale score from 0 (at 0 words) to 1 (at min words)
        return min === 0 ? 1.0 : wordCount / min;
    } else if (wordCount > max) {
        // Scale score from 1 (at max words) down towards 0 as word count increases
        return max === 0 ? 0.0 : max / wordCount;
    }

    // If wordCount is between min and max (inclusive)
    return 1.0;
}; 