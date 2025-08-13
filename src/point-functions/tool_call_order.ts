import { PointFunction } from './types';
import { extractToolCallsFromText } from '@/cli/utils/tool-trace';

/**
 * $tool_call_order(['toolA','toolB', ...])
 * Returns true if the trace contains at least those tools in that order (not necessarily contiguous).
 */
export const tool_call_order: PointFunction = (llmResponseText, args, context) => {
    const expected: string[] = Array.isArray(args) ? (args as any[]).filter(x => typeof x === 'string') : [];
    if (expected.length === 0) return { error: 'tool_call_order expects an array of tool names' };
    const modelResp = (context as any).prompt?.__modelResponse as any;
    let calls = modelResp?.toolCalls as any[] | undefined;
    if (!Array.isArray(calls)) {
        calls = extractToolCallsFromText(llmResponseText);
    }
    if (!Array.isArray(calls)) return false;

    let idx = 0;
    for (const c of calls) {
        if (c?.name === expected[idx]) {
            idx++;
            if (idx === expected.length) return true;
        }
    }
    return false;
};


