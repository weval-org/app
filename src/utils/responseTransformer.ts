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
    let unwrapped = trimmed;
    if (match && typeof match[2] === 'string') {
        unwrapped = match[2].trim();
    } else {
        match = trimmed.match(fencedInlineRegex);
        if (match && typeof match[1] === 'string') {
            unwrapped = match[1].trim();
        } else {
            match = trimmed.match(singleBacktickRegex);
            if (match && typeof match[1] === 'string') {
                unwrapped = match[1].trim();
            }
        }
    }

    // Normalize SVGs for responsive scaling
    const svgNormalized = normalizeInlineSvgs(unwrapped);
    // Inject responsive meta + styles and wrap if needed so content fits viewport width
    return injectViewportAndResponsiveStyles(svgNormalized);
}

/**
 * Ensures the returned HTML has a viewport meta tag and a small stylesheet
 * that constrains wide content to the iframe's viewport width. If the input
 * is a fragment (no <html> tag), it is wrapped in a minimal HTML document.
 */
function injectViewportAndResponsiveStyles(html: string): string {
    const STYLE_ID = 'lp-iframe-auto-fit';
    const styleLines = [
        '<meta name="viewport" content="width=device-width, initial-scale=1" />',
        '<style id="' + STYLE_ID + '">',
        '  :where(html, body) {',
        '    margin: 0;',
        '    padding: 0;',
        '  }',
        '  body {',
        '    overflow-wrap: anywhere;',
        '    word-break: break-word;',
        '  }',
        '  /* Ensure top-level blocks don\'t exceed viewport width */',
        '  body > * {',
        '    max-width: 100vw !important;',
        '    box-sizing: border-box;',
        '  }',
        '  /* Common media should scale down within the viewport */',
        '  img, video, canvas, svg, iframe {',
        '    max-width: 100%;',
        '    height: auto;',
        '  }',
        '  /* Long code and tables should be scrollable rather than overflow */',
        '  pre, code, kbd, samp {',
        '    white-space: pre-wrap;',
        '    word-break: break-word;',
        '  }',
        '  table {',
        '    display: block;',
        '    max-width: 100%;',
        '    overflow-x: auto;',
        '    border-collapse: collapse;',
        '  }',
        '</style>'
    ];
    const styleTag = styleLines.join('\n');

    const hasHtmlTag = /<html[\s\S]*?>/i.test(html);
    if (hasHtmlTag) {
        const hasHeadTag = /<head[\s\S]*?>/i.test(html);
        const alreadyInjected = new RegExp(`<style[^>]*id=["']${STYLE_ID}["']`, 'i').test(html);

        if (alreadyInjected) {
            return html;
        }

        if (hasHeadTag) {
            return html.replace(/<head([\s\S]*?)>/i, function (m) { return m + '\n' + styleTag; });
        }
        // Insert a head if missing
        return html.replace(/<html([\s\S]*?)>/i, function (m) { return m + '\n<head>' + styleTag + '</head>'; });
    }

    // Wrap fragments in a minimal document so styles apply reliably in the iframe
    // If there's an existing <body>, extract its inner content to avoid nested bodies
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;
    return '<!doctype html><html><head>' + styleTag + '</head><body>' + bodyContent + '</body></html>';
}

/**
 * Normalizes inline <svg> elements for better responsiveness:
 * - Adds a fallback viewBox using width/height if viewBox is missing
 * - Removes explicit width/height so CSS sizing can take effect
 * - Ensures preserveAspectRatio is present (xMidYMid meet) unless already set
 */
function normalizeInlineSvgs(html: string): string {
    return html.replace(/<svg\b[^>]*>/gi, (openingTag) => {
        let tag = openingTag;

        const hasViewBox = /\bviewBox\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.test(tag);
        const hasPreserve = /\bpreserveAspectRatio\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.test(tag);

        const widthMatch = tag.match(/\bwidth\s*=\s*("([0-9.]+)(?:px)?"|'([0-9.]+)(?:px)?'|([0-9.]+)(?:px)?)/i);
        const heightMatch = tag.match(/\bheight\s*=\s*("([0-9.]+)(?:px)?"|'([0-9.]+)(?:px)?'|([0-9.]+)(?:px)?)/i);

        const widthStr = widthMatch ? (widthMatch[2] || widthMatch[3] || widthMatch[4]) : undefined;
        const heightStr = heightMatch ? (heightMatch[2] || heightMatch[3] || heightMatch[4]) : undefined;
        const widthNum = widthStr ? parseFloat(widthStr) : undefined;
        const heightNum = heightStr ? parseFloat(heightStr) : undefined;

        // Remove explicit width/height to allow CSS control
        tag = tag.replace(/\swidth\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '');
        tag = tag.replace(/\sheight\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '');

        const attributesToInsert: string[] = [];
        if (!hasViewBox && typeof widthNum === 'number' && typeof heightNum === 'number' && isFinite(widthNum) && isFinite(heightNum)) {
            attributesToInsert.push(`viewBox="0 0 ${widthNum} ${heightNum}"`);
        }
        if (!hasPreserve) {
            attributesToInsert.push('preserveAspectRatio="xMidYMid meet"');
        }

        if (attributesToInsert.length === 0) {
            return tag;
        }

        // Insert attributes before the closing of the opening tag
        if (/\/>\s*$/.test(tag)) {
            return tag.replace(/\/>\s*$/i, ` ${attributesToInsert.join(' ')}/>`);
        }
        return tag.replace(/>\s*$/i, ` ${attributesToInsert.join(' ')}>`);
    });
}
