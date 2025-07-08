import { generateMinimalBlueprintYaml } from './yaml-generator';
import { ComparisonConfig } from '@/cli/types/cli_types';

describe('generateMinimalBlueprintYaml', () => {
    
    test('should produce a multi-document YAML with a header and one prompt', () => {
        const config: ComparisonConfig = {
            title: 'Test Blueprint',
            models: ['openai:gpt-4o-mini'],
            prompts: [{
                id: 'p1',
                messages: [{ role: 'user', content: 'Hello' }]
            }]
        };
        const result = generateMinimalBlueprintYaml(config);
        const expected = `title: Test Blueprint
---
id: p1
prompt: Hello
`;
        expect(result.trim()).toBe(expected.trim());
    });

    test('should produce a multi-document YAML with a header and multiple prompts', () => {
        const config: ComparisonConfig = {
            title: 'Test Blueprint',
            models: [],
            prompts: [
                { id: 'p1', messages: [{ role: 'user', content: 'Prompt 1' }] },
                { id: 'p2', messages: [{ role: 'user', content: 'Prompt 2' }] }
            ]
        };
        const result = generateMinimalBlueprintYaml(config);
        const expected = `title: Test Blueprint
---
id: p1
prompt: Prompt 1
---
id: p2
prompt: Prompt 2
`;
        expect(result.trim()).toBe(expected.trim());
    });

    test('should use "prompt" for single-turn conversations', () => {
        const config: ComparisonConfig = {
            models: [],
            prompts: [{
                id: 'p1',
                messages: [{ role: 'user', content: 'A simple prompt.' }]
            }]
        };
        const result = generateMinimalBlueprintYaml(config);
        expect(result).toContain('prompt: A simple prompt.');
        expect(result).not.toContain('messages:');
        expect(result.trim().startsWith('-')).toBe(false);
    });

    test('should use "messages" for multi-turn conversations', () => {
        const config: ComparisonConfig = {
            models: [],
            prompts: [{
                id: 'p1',
                messages: [
                    { role: 'user', content: 'First turn.' },
                    { role: 'assistant', content: 'Second turn.' }
                ]
            }]
        };
        const result = generateMinimalBlueprintYaml(config);
        expect(result).toContain('messages:');
        expect(result).toContain('- user: First turn.');
        expect(result).toContain('- ai: Second turn.');
        expect(result).not.toContain('prompt:');
        expect(result.trim().startsWith('-')).toBe(false);
    });

    test('should simplify default points to plain strings in "should" and "should_not"', () => {
        const config: ComparisonConfig = {
            models: [],
            prompts: [{
                id: 'p1',
                messages: [{role: 'user', content: 'Test'}],
                points: [
                    { text: 'This is simple.', multiplier: 1.0 },
                    { text: 'This is weighted.', multiplier: 2.0 }
                ],
                should_not: [
                    { text: 'This is simple negative.', multiplier: 1.0 }
                ]
            }]
        };
        const yaml = generateMinimalBlueprintYaml(config);
        const expectedShould = 'should:\n  - This is simple.\n  - text: This is weighted.\n    multiplier: 2';
        const expectedShouldNot = 'should_not:\n  - This is simple negative.';
        
        // Use a regex to account for slight variations in spacing/quoting
        expect(yaml.replace(/"/g, '')).toMatch(/should:\s+- This is simple\./);
        expect(yaml).toContain('text: This is weighted.');
        expect(yaml.replace(/"/g, '')).toMatch(/should_not:\s+- This is simple negative\./);
        expect(yaml.trim().startsWith('-')).toBe(false);
    });

    test('should use "ideal" for idealResponse', () => {
        const config: ComparisonConfig = {
            models: [],
            prompts: [{
                id: 'p1',
                messages: [{role: 'user', content: 'test'}],
                idealResponse: 'This is the ideal response.'
            }]
        };
        const result = generateMinimalBlueprintYaml(config);
        expect(result).toContain('ideal: This is the ideal response.');
        expect(result).not.toContain('idealResponse:');
        expect(result.trim().startsWith('-')).toBe(false);
    });

    test('should omit hashed IDs', () => {
        const config: ComparisonConfig = {
            models: [],
            prompts: [{ id: 'hash-12345', messages: [{role: 'user', content: 'test'}] }]
        };
        const result = generateMinimalBlueprintYaml(config);
        expect(result).not.toContain('id: hash-12345');
        expect(result.trim().startsWith('-')).toBe(false);
    });

    test('should keep user-defined IDs', () => {
        const config: ComparisonConfig = {
            models: [],
            prompts: [{ id: 'my-custom-id', messages: [{role: 'user', content: 'test'}] }]
        };
        const result = generateMinimalBlueprintYaml(config);
        expect(result).toContain('id: my-custom-id');
        expect(result.trim().startsWith('-')).toBe(false);
    });

    test('should not output empty "should" or "should_not" arrays', () => {
        const config: ComparisonConfig = {
            models: [],
            prompts: [{
                id: 'p1',
                messages: [{role: 'user', content: 'test'}],
                points: [],
                should_not: []
            }]
        };
        const result = generateMinimalBlueprintYaml(config);
        expect(result).not.toContain('should:');
        expect(result).not.toContain('should_not:');
        expect(result.trim().startsWith('-')).toBe(false);
    });
    
    test('should handle a blueprint with only a header', () => {
        const config: ComparisonConfig = {
            title: 'Header Only',
            models: [],
            prompts: []
        };
        const result = generateMinimalBlueprintYaml(config);
        expect(result).toBe('title: Header Only\n');
        // Note: models are intentionally not included.
        expect(result).not.toContain('---');
    });

    test('should handle a blueprint with only prompts', () => {
        const config: ComparisonConfig = {
            models: [],
            prompts: [{ id: 'hash-abc', messages: [{role: 'user', content: 'Prompt only'}] }]
        };
        const result = generateMinimalBlueprintYaml(config);
        expect(result).toBe('prompt: Prompt only\n');
        expect(result).not.toContain('---');
        expect(result.trim().startsWith('-')).toBe(false);
    });

    test('should destructively normalize a verbose but simple point into a string', () => {
        const config: ComparisonConfig = {
            models: [],
            prompts: [{
                id: 'p1',
                messages: [{ role: 'user', content: 'test' }],
                points: [{
                    text: "This is a simple point.",
                    multiplier: 1.0,
                    // User might add other default-looking fields
                    citation: undefined, 
                }]
            }]
        };
        const result = generateMinimalBlueprintYaml(config);
        expect(result).toContain('- This is a simple point.');
        expect(result).not.toContain('text:');
        expect(result).not.toContain('multiplier:');
        expect(result.trim().startsWith('-')).toBe(false);
    });
}); 