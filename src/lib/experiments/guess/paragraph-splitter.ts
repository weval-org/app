/**
 * Paragraph splitting utilities for multi-sample text analysis
 */

const MIN_PARAGRAPH_LENGTH = 100; // characters
const MIN_PARAGRAPHS_FOR_SPLIT = 3;

/**
 * Detect if text should be split into paragraphs
 */
export function shouldSplitIntoParagraphs(text: string): boolean {
    const paragraphs = splitIntoParagraphs(text);
    return paragraphs.size >= MIN_PARAGRAPHS_FOR_SPLIT;
}

/**
 * Split text into paragraphs, filtering out short ones
 * Returns a Set to avoid duplicates and make it clear we're treating each as independent
 */
export function splitIntoParagraphs(text: string): Set<string> {
    // Split on double newlines (paragraph breaks)
    const rawParagraphs = text
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length >= MIN_PARAGRAPH_LENGTH);

    // Return as Set (removes duplicates if any)
    return new Set(rawParagraphs);
}

/**
 * Get a representative sample for prompt extraction
 * If multiple paragraphs, takes first 2-3 paragraphs up to ~500 chars
 * If single text, uses first ~500 chars
 */
export function getRepresentativeSample(textSet: Set<string>): string {
    const paragraphs = Array.from(textSet);

    if (paragraphs.length === 1) {
        // Single text - use first 500 chars
        return paragraphs[0].substring(0, 500);
    }

    // Multiple paragraphs - take first few up to ~500 chars
    let sample = '';
    for (const para of paragraphs.slice(0, 3)) {
        if (sample.length + para.length > 500) {
            break;
        }
        sample += para + '\n\n';
    }

    return sample.trim() || paragraphs[0].substring(0, 500);
}
