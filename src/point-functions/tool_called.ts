import { PointFunction } from './types';
import { extractToolCallsFromText } from '@/cli/utils/tool-trace';

/**
 * $tool_called(toolName: string)
 * Returns true if the tool trace contains at least one call to toolName.
 */
export const tool_called: PointFunction = (llmResponseText, args, context) => {
    const toolName = typeof args === 'string' ? args : undefined;
    if (!toolName) return { error: 'tool_called expects a string tool name' };
    const modelResp = (context as any).prompt?.__modelResponse as any;
    let calls = modelResp?.toolCalls as any[] | undefined;
    if (!Array.isArray(calls)) {
        calls = extractToolCallsFromText(llmResponseText);
    }
    if (!Array.isArray(calls)) return false;
    return calls.some(c => c?.name === toolName);
};


