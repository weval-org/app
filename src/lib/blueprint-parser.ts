import * as yaml from 'js-yaml';
import { ComparisonConfig, PointDefinition, SinglePointDefinition, PromptConfig } from '@/cli/types/cli_types';
import { ConversationMessage } from '@/types/shared';
import { createHash } from 'crypto';
import stableStringify from 'json-stable-stringify';

/**
 * Internal interface for building normalized point objects during parsing.
 * This represents the object variant of SinglePointDefinition being constructed.
 */
interface NormalizedPointObject {
    text?: string;
    fn?: string;
    fnArgs?: any;
    multiplier?: number;
    citation?: string;
}

/**
 * Normalizes a raw array of point definitions from a blueprint into the strict internal PointDefinition[] format.
 * This function handles various syntaxes: simple strings, idiomatic functions (e.g., { $contains: ... }),
 * tuple functions (e.g., ['$contains', ...]), point-citation pairs, nested arrays (alternative paths), and full point objects.
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
        const newPoint: NormalizedPointObject = {};

        // 1. Simple string: "This is a conceptual point."
        if (typeof exp === 'string') {
            return { text: exp, multiplier: 1.0 };
        }

        // 2. Array handling: Could be nested array (alternative path) only
        if (Array.isArray(exp)) {
            // Check if this is an alternative path (nested array)
            if (exp.length > 0 && Array.isArray(exp[0])) {
                // This is a nested array - not supported at this level
                throw new Error(`Nested arrays within nested arrays are not supported in prompt '${promptId}'. Found: ${JSON.stringify(exp)}`);
            }
            
            // This is an alternative path (nested array): ['point1', 'point2', ['$func', 'arg']]
            // Filter out empty arrays first
            const filteredExp = exp.filter((item: any) => {
                if (Array.isArray(item)) {
                    return item.length > 0;
                }
                return item !== null && item !== undefined;
            });
            
            if (filteredExp.length === 0) {
                // Return empty array to be filtered out later
                return [];
            }
            
            // Process each element in the nested array as a single point
            const alternativePath = filteredExp.map((nestedExp: any) => {
                if (Array.isArray(nestedExp)) {
                    // Nested arrays within alternative paths are not supported
                    throw new Error(`Nested arrays within alternative paths are not supported in prompt '${promptId}'. Found: ${JSON.stringify(nestedExp)}`);
                } else if (typeof nestedExp === 'string') {
                    return { text: nestedExp, multiplier: 1.0 };
                } else if (typeof nestedExp === 'object' && nestedExp !== null) {
                    // Handle object points within alternative paths
                    return _normalizePointArray([nestedExp], promptId)[0];
                } else {
                    throw new Error(`Invalid point format in alternative path in prompt '${promptId}'. Point must be a string or object. Found: ${JSON.stringify(nestedExp)}`);
                }
            });
            
            return alternativePath;
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

        // --- Validation and Cleanup for single points ---
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
    }).filter(point => {
        // Filter out empty alternative paths
        if (Array.isArray(point)) {
            return point.length > 0;
        }
        return true;
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
        } else if (typeof firstDoc === 'object' && firstDoc !== null) {
            // Check if this looks like a single prompt document
            if (firstDoc.prompt || firstDoc.messages || firstDoc.should || firstDoc.ideal || firstDoc.points) {
                // This is a single prompt document, treat it as such
                rawPrompts = [firstDoc];
            } else {
                // This might be a config header without prompts, or an invalid format
                // Let's be more permissive and treat it as a config header
                configHeader = { ...firstDoc };
                rawPrompts = [];
            }
        } else {
             throw new Error('Invalid YAML format: Document must be an object or array. Found: ' + typeof firstDoc);
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
            finalPrompt.messages = [{ role: 'user', content: promptSource }];
        }

        // Normalize other prompt fields
        finalPrompt.id = p.id;
        finalPrompt.description = p.description;
        finalPrompt.idealResponse = p.ideal || p.idealResponse;
        finalPrompt.system = p.system;
        finalPrompt.citation = p.citation;
        
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