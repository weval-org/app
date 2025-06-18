import { PointFunction, PointFunctionContext } from './types';
import vm from 'vm';

/**
 * Executes a simple JavaScript expression or script in a sandboxed environment.
 * The script has access to a single variable 'r', which is the response text.
 * The script must return a boolean or a number. Numbers will be clamped to the range [0, 1].
 * @param response The text response from the model.
 * @param args The JavaScript expression or script to evaluate.
 * @returns The result of the expression, or an error object.
 */
export const js: PointFunction = (
    response: string,
    args: any,
    _context: PointFunctionContext,
) => {
    if (typeof args !== 'string') {
        return { error: 'Argument for js must be a string expression.' };
    }

    const sandbox = { r: response };
    const context = vm.createContext(sandbox);

    try {
        // First, try running as a simple script. This handles expressions directly.
        const result = vm.runInContext(args, context, { timeout: 100 });
        return processResult(result);
    } catch (e: any) {
        // If it's an illegal return, it's a multi-line script. Wrap in an IIFE and retry.
        if (e.message.includes('Illegal return statement')) {
            try {
                const script = `(() => {
                    ${args}
                })();`;
                const result = vm.runInContext(script, context, { timeout: 100 });
                return processResult(result);
            } catch (e2: any) {
                return { error: `Expression evaluation failed on retry: ${e2.message}` };
            }
        }
        // It was a different type of error
        return { error: `Expression evaluation failed: ${e.message}` };
    }
};

function processResult(result: any): boolean | number | { error: string } {
    if (typeof result === 'boolean') {
        return result; // Will be converted to 1.0 or 0.0 by evaluator
    }

    if (typeof result === 'number') {
        // Clamp the number between 0 and 1
        return Math.max(0, Math.min(1, result));
    }

    if (result === undefined) {
        // Script ran successfully but didn't return a value. Treat as a non-match.
        return false;
    }

    return {
        error: `Script returned an invalid type: ${typeof result}. Must return a boolean or a number.`,
    };
} 