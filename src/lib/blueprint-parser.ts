import * as yaml from 'js-yaml';
import { ComparisonConfig, PointDefinition, PromptConfig } from '@/cli/types/comparison_v2';
import { createHash } from 'crypto';
import stableStringify from 'json-stable-stringify';

function _normalizePointArray(pointsArray: any[], promptId: string | undefined): PointDefinition[] {
    return pointsArray.map((exp: any) => {
        if (typeof exp === 'string') {
            return { text: exp, multiplier: 1.0 };
        }
        if (typeof exp === 'object' && exp !== null) {
            const newPoint: any = {};
            const potentialFnName = Object.keys(exp).find(k => !['text', 'weight', 'citation', 'fn', 'fnArgs', 'arg', 'multiplier'].includes(k));

            if (exp.text) newPoint.text = exp.text;
            if (exp.fn) newPoint.fn = exp.fn;

            if (exp.fnArgs) {
                newPoint.fnArgs = exp.fnArgs;
            } else if (exp.arg) {
                newPoint.fnArgs = exp.arg;
            } else if (potentialFnName) {
                newPoint.fn = potentialFnName;
                newPoint.fnArgs = exp[potentialFnName];
            }
            
            // Normalize singular function names to their plural form for the registry
            if (newPoint.fn) {
                let fn = newPoint.fn;
                if (fn.startsWith('contain') && !fn.startsWith('contains')) {
                    fn = fn.replace(/^contain/, 'contains');
                }
                if (fn.startsWith('match') && !fn.startsWith('matches')) {
                    fn = fn.replace(/^match/, 'matches');
                }
                newPoint.fn = fn;
            }

            newPoint.multiplier = exp.weight ?? exp.multiplier ?? 1.0;
            if (typeof newPoint.multiplier !== 'number' || newPoint.multiplier < 0.1 || newPoint.multiplier > 10) {
                throw new Error(`Point multiplier must be a number between 0.1 and 10. Found ${newPoint.multiplier}. Prompt ID: '${promptId || 'unknown'}'`);
            }

            if (exp.citation) newPoint.citation = exp.citation;
            
            if (newPoint.fn && newPoint.text) {
                throw new Error(`Point cannot have both 'text' and a function ('${newPoint.fn}') defined.`);
            }
             if (newPoint.fn && !newPoint.text && Object.keys(exp).length === 1) {
                delete newPoint.text;
            }

            if (!newPoint.text && !newPoint.fn) {
                throw new Error(`Point object must have 'text', 'fn', or an idiomatic function name. Found: ${JSON.stringify(exp)}`);
            }

            return newPoint;
        }
        return exp;
    });
}

/**
 * Parses the raw content of a blueprint file (either JSON or YAML) and normalizes it
 * into the strict internal ComparisonConfig format.
 * 
 * @param content The raw string content of the blueprint file.
 * @param fileType 'json' or 'yaml'.
 * @returns A validated and normalized ComparisonConfig object.
 */
export function parseAndNormalizeBlueprint(content: string, fileType: 'json' | 'yaml'): ComparisonConfig {
    if (fileType === 'yaml') {
        try {
            const docs = yaml.loadAll(content).filter(d => d !== null && d !== undefined);
            let configHeader: any = {};
            let prompts: PromptConfig[] = [];

            if (docs.length === 0) {
                throw new Error('YAML blueprint is empty.');
            }

            const firstDoc = docs[0] as any;
            const firstDocIsConfig = 
                typeof firstDoc === 'object' &&
                !Array.isArray(firstDoc) &&
                // Heuristic: if it has config-like keys and not prompt-like keys, it's a config.
                (firstDoc.models || firstDoc.id || firstDoc.title || firstDoc.system || firstDoc.evaluationConfig || firstDoc.configId || firstDoc.configTitle) &&
                !(firstDoc.prompt || firstDoc.messages || firstDoc.should || firstDoc.ideal);

            if (docs.length === 1) {
                if (Array.isArray(firstDoc)) {
                    // Structure 3: List of Prompts Only
                    prompts = firstDoc as PromptConfig[];
                } else if (firstDoc.prompts && Array.isArray(firstDoc.prompts)) {
                    // Structure 4: Single-Document with `prompts` key
                    configHeader = firstDoc;
                    prompts = firstDoc.prompts;
                    delete configHeader.prompts;
                } else {
                     throw new Error('Invalid YAML format: A single YAML document must be an array of prompts, or an object with a "prompts" key.');
                }
            } else { // docs.length > 1
                if (firstDocIsConfig) {
                    // Structure 1: Config Header + Prompts (Multi-Document)
                    configHeader = firstDoc;
                    prompts = (docs.slice(1) as unknown as PromptConfig[]).flat();
                } else {
                    // Structure 2: Stream of Prompt Documents
                    prompts = (docs as unknown as PromptConfig[]).flat();
                }
            }

            // Normalize config header
            const { id, configId, title, configTitle, system, ...restOfHeader } = configHeader;
            const finalId = id || configId;
            const finalTitle = title || configTitle;
            const systemPrompt = system || restOfHeader.systemPrompt;

            // Normalize prompts
            const normalizedPrompts = prompts.map((p) => {
                // Aliases for top-level prompt fields
                const { id: originalId, prompt, ideal, should, expect, expects, expectations, system: promptSystem, ...restOfPrompt } = p as any;
                const promptText = prompt || restOfPrompt.promptText;
                const idealResponse = ideal || restOfPrompt.idealResponse;
                const pointsSource = should || expect || expects || expectations || restOfPrompt.points;
                const finalPromptSystem = promptSystem !== undefined ? promptSystem : restOfPrompt.system;

                // --- Begin: Shorthand Message Normalization ---
                if (restOfPrompt.messages && Array.isArray(restOfPrompt.messages)) {
                    const firstMessage = restOfPrompt.messages[0];
                    if (typeof firstMessage === 'object' && firstMessage !== null && !('role' in firstMessage) && !('content' in firstMessage)) {
                        restOfPrompt.messages = restOfPrompt.messages.map((msg: any, index: number) => {
                            if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
                                throw new Error(`Invalid message format in prompt '${p.id}' at message index ${index}. Expected an object like { role: '...', content: '...' } or { user: '...' }.`);
                            }
                            const keys = Object.keys(msg);
                            if (keys.length !== 1) {
                                throw new Error(`Invalid message format in prompt '${p.id}' at message index ${index}. Each message in the shorthand format must have exactly one key (e.g., 'user', 'assistant', 'ai', 'system'). Found: ${JSON.stringify(msg)}`);
                            }
                            const role = keys[0];
                            const content = msg[role];

                            const validRoles = ['user', 'assistant', 'system', 'ai'];
                            if (!validRoles.includes(role)) {
                                throw new Error(`Invalid role '${role}' in message for prompt '${p.id}' at message index ${index}. Allowed roles are 'user', 'assistant', 'ai', or 'system'.`);
                            }
                            if (typeof content !== 'string') {
                                throw new Error(`Content for role '${role}' in prompt '${p.id}' at message index ${index} must be a string.`);
                            }

                            return {
                                role: role === 'ai' ? 'assistant' : role,
                                content: content
                            };
                        });
                    }
                }
                // --- End: Shorthand Message Normalization ---

                // Normalize the 'points' (or 'expect') array
                let normalizedPoints: PointDefinition[] | undefined = undefined;
                if (pointsSource && Array.isArray(pointsSource)) {
                    normalizedPoints = _normalizePointArray(pointsSource, originalId);
                }
                
                // --- Begin: should_not Normalization ---
                const { should_not, ...restOfPromptWithoutShouldNot } = restOfPrompt;
                let normalizedShouldNot: PointDefinition[] | undefined = undefined;
                if (should_not && Array.isArray(should_not)) {
                    normalizedShouldNot = _normalizePointArray(should_not, originalId);
                }
                // --- End: should_not Normalization ---

                const finalPromptObject: any = { ...restOfPromptWithoutShouldNot, promptText, idealResponse, points: normalizedPoints, should_not: normalizedShouldNot };
                if (finalPromptSystem !== undefined) {
                    finalPromptObject.system = finalPromptSystem;
                }

                if (originalId) {
                    finalPromptObject.id = originalId;
                } else {
                    const objectToHash = { ...finalPromptObject };
                    delete objectToHash.id;
                    const hash = createHash('sha256').update(stableStringify(objectToHash) || '').digest('hex');
                    finalPromptObject.id = `hash-${hash.substring(0, 12)}`;
                }
                
                return finalPromptObject;
            });

            return {
                ...restOfHeader,
                id: finalId,
                title: finalTitle,
                systemPrompt: systemPrompt,
                prompts: normalizedPrompts,
            } as ComparisonConfig;

        } catch (parseError: any) {
            throw new Error(`Failed to parse YAML blueprint: ${parseError.message}`);
        }
    } else { // Handle legacy JSON
        try {
            const configJson = JSON.parse(content);
            // --- Begin Normalization for legacy JSON ---
            if (configJson.prompts && Array.isArray(configJson.prompts)) {
                configJson.prompts.forEach((p: any) => {
                    // This is just a safety check for legacy JSON points, no complex transformation needed.
                    if (p.points && Array.isArray(p.points)) {
                        p.points = p.points.map((point: any) => {
                            if (typeof point === 'string') {
                                return { text: point, multiplier: 1.0 };
                            }
                            if (Array.isArray(point)) {
                                return { fn: point[0], fnArgs: point[1], multiplier: 1.0 };
                            }
                            return point;
                        });
                    }
                });
            }
            // --- End Normalization ---
            return configJson;
        } catch (parseError: any) {
            throw new Error(`Failed to parse JSON blueprint: ${parseError.message}`);
        }
    }
} 