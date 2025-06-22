import * as yaml from 'js-yaml';
import { ComparisonConfig, PointDefinition, PromptConfig } from '@/cli/types/cli_types';
import { ConversationMessage } from '@/types/shared';
import { createHash } from 'crypto';
import stableStringify from 'json-stable-stringify';

/**
 * Normalizes a raw array of point definitions from a blueprint into the strict internal PointDefinition[] format.
 * This function handles various syntaxes: simple strings, idiomatic functions (e.g., { $contains: ... }),
 * tuple functions (e.g., ['$contains', ...]), point-citation pairs, and full point objects.
 *
 * @param pointsArray The raw array of points from the blueprint.
 * @param promptId The ID of the prompt for error reporting.
 * @returns A validated and normalized array of PointDefinition objects.
 */
function _normalizePointArray(pointsArray: any[], promptId: string | undefined): PointDefinition[] {
    if (!Array.isArray(pointsArray)) {
        return [];
    }
    return pointsArray.map((exp: any): PointDefinition => {
        const newPoint: Partial<PointDefinition> = {};

        // 1. Simple string: "This is a conceptual point."
        if (typeof exp === 'string') {
            return { text: exp, multiplier: 1.0 };
        }

        // 2. Tuple function: ['$contains', 'some text']
        if (Array.isArray(exp)) {
            if (typeof exp[0] !== 'string' || !exp[0].startsWith('$')) {
                throw new Error(`Invalid tuple function in prompt '${promptId}': The first element must be a function name starting with '$'. Found: ${JSON.stringify(exp[0])}`);
            }
            newPoint.fn = exp[0].substring(1);
            newPoint.fnArgs = exp.length > 2 ? exp.slice(1) : exp[1];
        } 
        
        // 3. Object-based points
        else if (typeof exp === 'object' && exp !== null) {
            const keys = Object.keys(exp);

            const idiomaticFnKey = keys.find(k => k.startsWith('$'));

            // Path 1: Idiomatic function { $contains: '...' } possibly with other keys
            if (idiomaticFnKey) {
                newPoint.fn = idiomaticFnKey.substring(1);
                newPoint.fnArgs = exp[idiomaticFnKey];
                newPoint.multiplier = exp.weight ?? exp.multiplier;
                newPoint.citation = exp.citation;
            }
            // Path 2: Full object { text: '...', ... } or { fn: '...', ... }
            else if (exp.text || exp.point || exp.fn) {
                newPoint.text = exp.text || exp.point;
                newPoint.fn = exp.fn;
                newPoint.fnArgs = exp.fnArgs || exp.arg;
                newPoint.multiplier = exp.weight ?? exp.multiplier;
                newPoint.citation = exp.citation;
            }
            // Path 3: Point-citation shorthand { 'point text': 'citation text' }
            else if (keys.length === 1 && typeof exp[keys[0]] === 'string') {
                newPoint.text = keys[0];
                newPoint.citation = exp[keys[0]];
            }
            // Let invalid objects (like { weight: 2.0 }) fall through to the validation below
        } else {
            throw new Error(`Invalid point format in prompt '${promptId}': Point must be a string, array, or object. Found: ${JSON.stringify(exp)}`);
        }

        // --- Validation and Cleanup ---
        if (newPoint.fn && newPoint.text) {
            throw new Error(`Invalid point in prompt '${promptId}': Point cannot have both 'text' and 'fn' defined. Found: ${JSON.stringify(exp)}`);
        }
        if (!newPoint.fn && !newPoint.text) {
             throw new Error(`Invalid point object in prompt '${promptId}': Point must define 'text', a function ('fn' or '$...'), or a 'Point: Citation' pair. Found: ${JSON.stringify(exp)}`);
        }
        
        // Normalize singular function names
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

        // Default and validate multiplier
        newPoint.multiplier = newPoint.multiplier ?? 1.0;
        if (typeof newPoint.multiplier !== 'number' || newPoint.multiplier < 0.1 || newPoint.multiplier > 10) {
            throw new Error(`Point multiplier must be a number between 0.1 and 10. Found ${newPoint.multiplier}. Prompt ID: '${promptId || 'unknown'}'`);
        }

        return newPoint as PointDefinition;
    });
}

/**
 * Parses the raw content of a blueprint file (either JSON or YAML) and normalizes it
 * into the strict internal ComparisonConfig format. This function handles various YAML
 * structures, legacy JSON formats, and numerous field/syntax aliases to produce a
 * single, canonical configuration object.
 *
 * @param content The raw string content of the blueprint file.
 * @param fileType 'json' or 'yaml'.
 * @returns A validated and normalized ComparisonConfig object.
 */
export function parseAndNormalizeBlueprint(content: string, fileType: 'json' | 'yaml'): ComparisonConfig {
    let rawDocs: any[];
    try {
        if (fileType === 'yaml') {
            const loaded = yaml.loadAll(content).filter(d => d !== null && d !== undefined);
            if (loaded.length === 0) throw new Error('YAML blueprint is empty or contains only null documents.');
            rawDocs = loaded;
        } else { // json
            rawDocs = [JSON.parse(content)];
        }
    } catch (e: any) {
        throw new Error(`Failed to parse ${fileType.toUpperCase()} blueprint: ${e.message}`);
    }
    
    let configHeader: any = {};
    let rawPrompts: any[] = [];
    const firstDoc = rawDocs[0];

    // Determine YAML structure and separate header from prompts
    if (rawDocs.length === 1) {
        if (Array.isArray(firstDoc)) {
            // Structure 3: List of Prompts Only
            rawPrompts = firstDoc;
        } else if (typeof firstDoc === 'object' && firstDoc.prompts && Array.isArray(firstDoc.prompts)) {
            // Structure 4: Single-Document with `prompts` key
            configHeader = { ...firstDoc };
            rawPrompts = configHeader.prompts;
            delete configHeader.prompts;
        } else if (fileType === 'json') {
             // Legacy JSON: assume it's a config object with a prompts key
             configHeader = { ...firstDoc };
             rawPrompts = configHeader.prompts || [];
             delete configHeader.prompts;
        }
        else {
             throw new Error('Invalid YAML format: A single YAML document must be an array of prompts, or an object with a "prompts" key.');
        }
    } else { // Multiple YAML documents
        const firstDocIsConfig = 
            typeof firstDoc === 'object' &&
            !Array.isArray(firstDoc) &&
            // Heuristic: if it has config-like keys and not prompt-like keys, it's a config.
            (firstDoc.models || firstDoc.id || firstDoc.title || firstDoc.system || firstDoc.evaluationConfig || firstDoc.configId || firstDoc.configTitle) &&
            !(firstDoc.prompt || firstDoc.messages || firstDoc.should || firstDoc.ideal || firstDoc.points);

        if (firstDocIsConfig) {
            // Structure 1: Config Header + Prompts
            configHeader = firstDoc;
            rawPrompts = rawDocs.slice(1).flat();
        } else {
            // Structure 2: Stream of Prompt Documents
            rawPrompts = rawDocs.flat();
        }
    }

    // --- Unified Normalization ---
    const finalConfig: Partial<ComparisonConfig> = { ...configHeader };
    
    // Normalize header fields
    finalConfig.id = finalConfig.id || configHeader.configId;
    finalConfig.title = finalConfig.title || configHeader.configTitle;
    finalConfig.system = finalConfig.system || configHeader.systemPrompt; // Legacy alias
    
    // Clean up header aliases and old fields
    delete (finalConfig as any).configId;
    delete (finalConfig as any).configTitle;
    delete (finalConfig as any).systemPrompt;

    // Normalize prompts
    finalConfig.prompts = (rawPrompts || []).map((p: any) => {
        const finalPrompt: Partial<PromptConfig> = {};

        // Normalize prompt content (prompt/promptText vs messages)
        const promptSource = p.prompt || p.promptText;
        if (p.messages) {
            finalPrompt.messages = p.messages.map((msg: any, index: number) => {
                // Handle shorthand: { user: '...' }
                if (typeof msg === 'object' && msg !== null && !msg.role && !msg.content) {
                    const keys = Object.keys(msg);
                    if (keys.length !== 1) {
                        throw new Error(`Each message in the shorthand format must have exactly one key (e.g., 'user', 'assistant', 'ai', 'system'). Invalid message at index ${index} in prompt '${p.id}'. Found: ${JSON.stringify(msg)}`);
                    }
                    const role = keys[0];
                    const content = msg[role];
                    const validRoles = ['user', 'assistant', 'system', 'ai'];
                     if (!validRoles.includes(role)) {
                        throw new Error(`Invalid role '${role}' in message at index ${index} in prompt '${p.id}'.`);
                    }
                    return { role: role === 'ai' ? 'assistant' : role, content };
                }
                return msg as ConversationMessage;
            });
        } else if (promptSource) {
            finalPrompt.promptText = promptSource;
        }

        // Normalize other prompt fields
        finalPrompt.id = p.id;
        finalPrompt.idealResponse = p.ideal || p.idealResponse;
        finalPrompt.system = p.system;
        
        // Consolidate all possible point sources
        const pointsSource = p.should || p.points || p.expect || p.expects || p.expectations;
        if (pointsSource) {
            finalPrompt.points = _normalizePointArray(pointsSource, p.id);
        }

        const shouldNotSource = p.should_not;
        if (shouldNotSource) {
            finalPrompt.should_not = _normalizePointArray(shouldNotSource, p.id);
        }

        // Generate ID if missing (must be done last)
        if (!finalPrompt.id) {
            const objectToHash = { ...finalPrompt }; // create a copy
            delete objectToHash.id;
            const hash = createHash('sha256').update(stableStringify(objectToHash) || '').digest('hex');
            finalPrompt.id = `hash-${hash.substring(0, 12)}`;
        }

        return finalPrompt as PromptConfig;
    });

    return finalConfig as ComparisonConfig;
} 