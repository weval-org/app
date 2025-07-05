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
    const keys = Object.keys(header);
    if (keys.length === 0) return false;
    // It's not meaningful if it only contains an empty 'models' array.
    if (keys.length === 1 && keys[0] === 'models' && Array.isArray(header.models) && header.models.length === 0) {
        return false;
    }
    return true;
}

export function generateMinimalBlueprintYaml(config: ComparisonConfig): string {
    const { prompts, ...header } = config;

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
            newPrompt.should = p.points.map(point => 
                isDefaultPoint(point) ? (point as any).text : point
            );
        }

        if (p.should_not && p.should_not.length > 0) {
            newPrompt.should_not = p.should_not.map(point => 
                isDefaultPoint(point) ? (point as any).text : point
            );
        }

        return newPrompt;
    });

    const headerYaml = isHeaderMeaningful(header) ? yaml.dump(header, { skipInvalid: true, indent: 2, flowLevel: -1 }) : '';
    const promptsYaml = deNormalizedPrompts.length > 0 ? yaml.dump(deNormalizedPrompts, { skipInvalid: true, indent: 2 }) : '';

    if (headerYaml && promptsYaml) {
        return `${headerYaml}---\n${promptsYaml}`;
    }
    return headerYaml || promptsYaml;
} 