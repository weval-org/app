import * as yaml from 'js-yaml';
import { ComparisonConfig, PointDefinition, PromptConfig } from '@/cli/types/cli_types';

function isDefaultPoint(p: any): boolean {
    if (typeof p !== 'object' || p === null) return false;

    // It must have text and a multiplier of 1.0
    if (p.text === undefined || p.multiplier !== 1.0) {
        return false;
    }

    // It must not have any other meaningful properties.
    // We check for any other key that has a defined (non-undefined) value.
    for (const key in p) {
        if (key !== 'text' && key !== 'multiplier') {
            if (p[key] !== undefined) {
                return false;
            }
        }
    }

    return true;
}

function isHeaderMeaningful(header: any): boolean {
    if (header.point_defs && Object.keys(header.point_defs).length > 0) return true;
    const keys = Object.keys(header);
    if (keys.length === 0) return false;
    if (header.point_defs && Object.keys(header.point_defs).length > 0) return true;
    // It's not meaningful if it only contains an empty 'models' array and no point_defs.
    if (keys.length === 1 && keys[0] === 'models' && Array.isArray(header.models) && header.models.length === 0) {
        return false;
    }
    return true;
}

export function generateMinimalBlueprintYaml(config: ComparisonConfig): string {
    const { prompts, models, ...header } = config;

    console.log('Generating minimal blueprint YAML for config:', config);

    const deNormalizedPrompts = prompts.map(p => {
        const newPrompt: any = {};

        // Keep ID only if it's not a generated hash
        if (p.id && !p.id.startsWith('hash-')) {
            newPrompt.id = p.id;
        }

        // Use 'prompt' for single user messages, 'messages' for multi-turn
        if (p.messages && p.messages.length === 1 && p.messages[0].role === 'user') {
            newPrompt.prompt = p.messages[0].content;
        } else if (p.messages && p.messages.length > 0) {
            // De-normalize to shorthand for cleaner YAML
            newPrompt.messages = p.messages.map(msg => ({
                [msg.role === 'assistant' ? 'ai' : msg.role]: msg.content
            }));
        }
        
        if (p.idealResponse) {
            newPrompt.ideal = p.idealResponse;
        }

        // Simplify 'points' to 'should' and convert default points to simple strings
        if (p.points && p.points.length > 0) {
            // Check if we have alternative paths (nested arrays)
            const hasAlternativePaths = p.points.some(point => Array.isArray(point));
            
            if (hasAlternativePaths) {
                // Preserve mixed structure for required points and alternative paths
                newPrompt.should = p.points.map(pointOrPath => {
                    if (Array.isArray(pointOrPath)) {
                        // This is an alternative path - map each point in the path
                        return pointOrPath.map(subPoint => 
                            isDefaultPoint(subPoint) ? (subPoint as any).text : subPoint
                        );
                    } else {
                        // This is a required point, do not wrap it in an array
                        return isDefaultPoint(pointOrPath) ? (pointOrPath as any).text : pointOrPath;
                    }
                });
            } else {
                // Flat structure - simplify default points to strings
                newPrompt.should = p.points.map(point => 
                    isDefaultPoint(point) ? (point as any).text : point
                );
            }
        }

        if (p.should_not && p.should_not.length > 0) {
            // Apply the same logic to should_not
            const hasAlternativePaths = p.should_not.some(point => Array.isArray(point));
            
            if (hasAlternativePaths) {
                newPrompt.should_not = p.should_not.map(pointOrPath => {
                    if (Array.isArray(pointOrPath)) {
                        return pointOrPath.map(subPoint => 
                            isDefaultPoint(subPoint) ? (subPoint as any).text : subPoint
                        );
                    } else {
                        return isDefaultPoint(pointOrPath) ? (pointOrPath as any).text : pointOrPath;
                    }
                });
            } else {
                newPrompt.should_not = p.should_not.map(point => 
                    isDefaultPoint(point) ? (point as any).text : point
                );
            }
        }

        if (p.promptText) {
            newPrompt.promptText = p.promptText;
        }

        // Preserve description at the prompt level
        if (p.description) {
            newPrompt.description = p.description;
        }

        // Preserve citation at the prompt level
        if (p.citation) {
            newPrompt.citation = p.citation;
        }

        // Preserve system prompt at the prompt level
        if (p.system) {
            newPrompt.system = p.system;
        }

        // Preserve render_as at the prompt level
        if (p.render_as) {
            newPrompt.render_as = p.render_as;
        }

        // Preserve weight/importance at the prompt level
        if (p.weight !== undefined) {
            newPrompt.weight = p.weight;
        }

        // Preserve temperature at the prompt level
        if (p.temperature !== undefined) {
            newPrompt.temperature = p.temperature;
        }

        // Preserve noCache at the prompt level
        if (p.noCache !== undefined) {
            newPrompt.noCache = p.noCache;
        }

        // Preserve tool-use constraints at the prompt level
        if ((p as any).requiredTools) {
            newPrompt.requiredTools = (p as any).requiredTools;
        }
        if ((p as any).prohibitedTools) {
            newPrompt.prohibitedTools = (p as any).prohibitedTools;
        }
        if ((p as any).maxCalls !== undefined) {
            newPrompt.maxCalls = (p as any).maxCalls;
        }

        return newPrompt;
    });

    // Ensure author remains minimally represented (string or object)
    const headerForYaml: any = { ...header };
    if (headerForYaml.author) {
        const a: any = headerForYaml.author;
        if (typeof a === 'object' && a !== null) {
            // Remove empty optional fields for cleanliness
            if (!a.url) delete a.url;
            if (!a.image_url) delete a.image_url;
        }
    }

    // Preserve tools and toolUse (trace-only tool evaluation support)
    // These are already included via the spread operator, but we ensure they're not filtered
    // by yaml.dump's skipInvalid option

    const headerYaml = isHeaderMeaningful(headerForYaml) ? yaml.dump(headerForYaml, { skipInvalid: true, indent: 2, flowLevel: -1 }) : '';
    const promptsYaml = deNormalizedPrompts.length > 0 
        ? deNormalizedPrompts
            .map(p => yaml.dump(p, { skipInvalid: true, indent: 2, flowLevel: -1 }))
            .join('---\n') 
        : '';

    if (headerYaml && promptsYaml) {
        return `${headerYaml}---\n${promptsYaml}`;
    }
    return headerYaml || promptsYaml;
} 