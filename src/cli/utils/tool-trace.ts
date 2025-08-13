export interface ParsedToolCall {
    name: string;
    arguments: any;
}

/**
 * Extracts trace-only tool calls from assistant text.
 * Protocol: each tool call is on its own line as
 *   TOOL_CALL {"name":"<tool>","arguments":{...}}
 */
export function extractToolCallsFromText(text: string | null | undefined): ParsedToolCall[] {
    if (!text) return [];
    const results: ParsedToolCall[] = [];
    const marker = 'TOOL_CALL ';
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith(marker)) continue;
        const jsonPart = line.slice(marker.length).trim();
        try {
            const parsed = JSON.parse(jsonPart);
            if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string') {
                results.push({ name: parsed.name, arguments: parsed.arguments });
            }
        } catch {
            // ignore malformed TOOL_CALL lines
        }
    }
    return results;
}


