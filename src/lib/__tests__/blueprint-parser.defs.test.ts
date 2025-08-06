import { parseAndNormalizeBlueprint } from '../blueprint-parser';

describe('Blueprint point_defs & $ref expansion', () => {
    const jsSnippet = `const n = +(r.match(/SCORE\\s*=\\s*(\\d+)/i) || [,0])[1];\nreturn Math.max(0, Math.min(1, (n - 70) / 30));`;

    test('YAML: point_defs with scalar $ref is expanded to $js point', () => {
        const yamlBlueprint = `
# header with reusable definition
point_defs:
  scoreBand: |\n    ${jsSnippet.replace(/\n/g, '\n    ')}
---
- id: p1
  prompt: "A prompt"
  should:
    - $ref: scoreBand
`;
        const result = parseAndNormalizeBlueprint(yamlBlueprint, 'yaml');
        expect(result.prompts).toHaveLength(1);
        const point = result.prompts[0].points?.[0] as any;
        expect(point).toBeDefined();
        expect(point.fn).toBe('js');
        expect(point.fnArgs).toContain('Math.max');
    });

    test('JSON: point_defs with scalar $ref is expanded to $js point', () => {
        const jsonBlueprint = JSON.stringify({
            point_defs: {
                scoreBand: jsSnippet,
            },
            prompts: [
                {
                    id: 'p1',
                    promptText: 'A prompt',
                    should: [ { $ref: 'scoreBand' } ],
                },
            ],
        });
        const result = parseAndNormalizeBlueprint(jsonBlueprint, 'json');
        expect(result.prompts).toHaveLength(1);
        const point = result.prompts[0].points?.[0] as any;
        expect(point.fn).toBe('js');
        expect(point.fnArgs).toContain('Math.max');
    });

    test('Referencing undefined def throws an error', () => {
        const yamlBlueprint = `
- prompt: test
  should:
    - $ref: doesNotExist
`;
        expect(() => parseAndNormalizeBlueprint(yamlBlueprint, 'yaml')).toThrow('Undefined definition');
    });
});
