import { PointFunction } from './types';
import { extractToolCallsFromText } from '@/cli/utils/tool-trace';

/**
 * $tool_args_match({ name: string, where: object | string, normalizeWhitespace?: boolean })
 * - name: tool name to inspect
 * - where: either a partial object that must be deeply included in arguments,
 *          or a JS expression string evaluated against {args} returning boolean
 * - normalizeWhitespace (optional): when true, string comparisons in object matching ignore whitespace
 */
export const tool_args_match: PointFunction = (llmResponseText, args, context) => {
    const spec = (typeof args === 'object' && args) ? (args as any) : {};
    const name: string | undefined = spec.name;
    const where = spec.where;
    const normalizeWhitespace: boolean = Boolean(spec.normalizeWhitespace);
    if (!name) return { error: 'tool_args_match expects { name, where }' };
    const modelResp = (context as any).prompt?.__modelResponse as any;
    let calls = modelResp?.toolCalls as any[] | undefined;
    if (!Array.isArray(calls)) {
        calls = extractToolCallsFromText(llmResponseText);
    }
    if (!Array.isArray(calls)) return false;

    const stripWS = (s: string) => normalizeWhitespace ? s.replace(/\s+/g, '') : s;

    const matchesPartial = (obj: any, partial: any): boolean => {
        if (typeof partial !== 'object' || partial === null) return false;
        for (const key of Object.keys(partial)) {
            if (!(key in obj)) return false;
            const pv = (partial as any)[key];
            const ov = (obj as any)[key];
            if (typeof pv === 'object' && pv !== null) {
                if (!matchesPartial(ov, pv)) return false;
            } else if (typeof pv === 'string' && typeof ov === 'string') {
                if (stripWS(ov) !== stripWS(pv)) return false;
            } else if (ov !== pv) {
                return false;
            }
        }
        return true;
    };

    for (const c of calls) {
        if (c?.name !== name) continue;
        const argsObj = c?.arguments;
        if (argsObj == null) continue;
        if (typeof where === 'string') {
            try {
                // Unsafe in general, but this is constrained test-only usage in evals
                // Evaluate with args bound
                // eslint-disable-next-line no-new-func
                const fn = new Function('args', `return (${where});`);
                const ok = !!fn(argsObj);
                if (ok) return true;
            } catch (_e) { /* ignore expression errors */ }
        } else if (typeof where === 'object' && where) {
            if (matchesPartial(argsObj, where)) return true;
        }
    }
    return false;
};


