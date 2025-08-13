import { PointFunction } from './types';
import { extractToolCallsFromText } from '@/cli/utils/tool-trace';

/**
 * $tool_call_count_between([min, max, name?])
 * - If name provided, count only that tool; otherwise count all.
 */
export const tool_call_count_between: PointFunction = (llmResponseText, args, context) => {
    const arr = Array.isArray(args) ? args as any[] : [];
    const min = typeof arr[0] === 'number' ? arr[0] : 0;
    const max = typeof arr[1] === 'number' ? arr[1] : Number.POSITIVE_INFINITY;
    const name = typeof arr[2] === 'string' ? arr[2] : undefined;
    const modelResp = (context as any).prompt?.__modelResponse as any;
    let calls = modelResp?.toolCalls as any[] | undefined;
    if (!Array.isArray(calls)) {
        calls = extractToolCallsFromText(llmResponseText);
    }
    if (!Array.isArray(calls)) return min === 0;
    const count = calls.filter(c => !name || c?.name === name).length;
    return count >= min && count <= max;
};


