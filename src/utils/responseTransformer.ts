/**
 * A collection of functions to transform or filter raw LLM response strings
 * before they are passed to a renderer.
 */

/**
 * Transforms a string that is supposed to be HTML.
 * If the string is wrapped in a Markdown code block (e.g., ```html...```),
 * it extracts the content within the block.
 * @param content The raw string response from the LLM.
 * @returns The cleaned HTML content.
 */
export function transformHtmlContent(content: string): string {
    // Normalize whitespace around the whole response first
    const trimmed = (content ?? '').trim();

    // Be forgiving: unwrap content if the entire string is fenced in backticks, with or without a language
    // Matches variants like:
    // ```html\n...\n```  |  ```\n...\n```  |  ```<div>...</div>```  |  `...`
    const fencedBlockRegex = /^```([a-zA-Z0-9_-]*)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i;
    const fencedInlineRegex = /^```([\s\S]+)```$/; // same-line open/close
    const singleBacktickRegex = /^`([\s\S]+)`$/;   // inline single backticks

    let match = trimmed.match(fencedBlockRegex);
    if (match && typeof match[2] === 'string') {
        return match[2].trim();
    }

    match = trimmed.match(fencedInlineRegex);
    if (match && typeof match[1] === 'string') {
        return match[1].trim();
    }

    match = trimmed.match(singleBacktickRegex);
    if (match && typeof match[1] === 'string') {
        return match[1].trim();
    }

    // No fences detected; return normalized content as-is
    return trimmed;
}
