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
    // Regular expression to find content within ```html ... ``` or ``` ... ```
    // It handles optional language specifier and multiline content.
    const codeBlockRegex = /^```(?:html)?\s*\n([\s\S]+?)\n```$/;
    const match = content.match(codeBlockRegex);

    if (match && match[1]) {
        // Return the captured group (the code inside the block), trimmed of whitespace.
        return match[1].trim();
    }

    // If no code block is found, return the original content.
    return content;
}
