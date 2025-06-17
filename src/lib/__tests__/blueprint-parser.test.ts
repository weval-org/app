import { parseAndNormalizeBlueprint } from '../blueprint-parser';
import { ComparisonConfig } from '../../cli/types/comparison_v2';

describe('parseAndNormalizeBlueprint', () => {

    describe('YAML Parsing Structures', () => {
        test('Structure 1: should correctly parse a standard multi-document YAML with a config header', () => {
            const yamlContent = `
id: yaml-test-v1
title: YAML Test
models: [test:model]
---
- id: p1
  prompt: What is YAML?
  ideal: A human-friendly data serialization standard.
`;
            const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
            expect(result.id).toBe('yaml-test-v1');
            expect(result.title).toBe('YAML Test');
            expect(result.prompts).toHaveLength(1);
            expect(result.prompts[0].id).toBe('p1');
        });

        test('Structure 2: should correctly parse a stream of prompt documents', () => {
            const yamlContent = `
prompt: First prompt
---
prompt: Second prompt
should:
    - "Do something"
---
id: p3
prompt: Third prompt
`;
            const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
            expect(result.id).toBeUndefined(); // No config header
            expect(result.prompts).toHaveLength(3);
            expect(result.prompts[0].promptText).toBe('First prompt');
            expect(result.prompts[1].promptText).toBe('Second prompt');
            expect(result.prompts[1].points).toBeDefined();
            expect(result.prompts[2].id).toBe('p3');
        });

        test('Structure 3: should correctly parse a single document with a list of prompts', () => {
            const yamlContent = `
- id: p1
  prompt: "This is a prompts-only file."
- id: p2
  prompt: "This is the second prompt."
`;
            const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
            expect(result.id).toBeUndefined();
            expect(result.prompts).toHaveLength(2);
            expect(result.prompts[0].id).toBe('p1');
            expect(result.prompts[1].id).toBe('p2');
        });

        test('Structure 4: should correctly parse a single document with a prompts key', () => {
            const yamlContent = `
id: single-doc-with-prompts
models: [test:model]
prompts:
    - id: p1
      prompt: "First prompt"
    - id: p2
      prompt: "Second prompt"
`;
            const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
            expect(result.id).toBe('single-doc-with-prompts');
            expect(result.prompts).toHaveLength(2);
            expect(result.prompts[0].id).toBe('p1');
        });

        test('should handle a stream of documents where some are lists', () => {
            const yamlContent = `
prompt: First prompt
---
- prompt: Second prompt
  id: p2
- prompt: Third prompt
  id: p3
`;
            const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
            expect(result.prompts).toHaveLength(3);
            expect(result.prompts[0].promptText).toBe('First prompt');
            expect(result.prompts[1].id).toBe('p2');
            expect(result.prompts[2].id).toBe('p3');
        });
    });

    describe('Alias and Normalization', () => {
        test('should correctly normalize aliases for config and prompts', () => {
            const yamlContent = `
configId: alias-test
configTitle: Alias Test
---
- id: p1
  prompt: Test
  ideal: Ideal response
  expect:
    - "A simple conceptual point."
    - contain: "must-have-word"
    - { text: "A weighted conceptual point.", weight: 3.0, citation: "req-1.2.3" }
    - { fn: "match", arg: "[0-9]+", weight: 0.5 }
`;
            const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
            expect(result.id).toBe('alias-test');
            expect(result.title).toBe('Alias Test');
            const points = result.prompts[0].points;
            expect(points).toHaveLength(4);
            expect(points![0]).toEqual({ text: "A simple conceptual point.", multiplier: 1.0 });
            expect(points![1]).toEqual({ fn: "contains", fnArgs: "must-have-word", multiplier: 1.0 });
            expect(points![2]).toEqual({ text: "A weighted conceptual point.", multiplier: 3.0, citation: "req-1.2.3" });
            expect(points![3]).toEqual({ fn: "matches", fnArgs: "[0-9]+", multiplier: 0.5 });
        });

        test.each([
            ['should'],
            ['expect'],
            ['expects'],
            ['expectations'],
          ])('should correctly parse points using the "%s" alias', (alias) => {
            const yamlContent = `
---
- id: p1
  prompt: test prompt
  ${alias}:
    - "This is a conceptual point."
`;
            const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
            const points = result.prompts[0].points;
            expect(points).toBeDefined();
            expect(points).toHaveLength(1);
            expect(points![0]).toEqual({ text: "This is a conceptual point.", multiplier: 1.0 });
          });
      
          test('should correctly parse points using the "weight" alias for "multiplier"', () => {
            const yamlContent = `
---
- id: p1
  prompt: test
  should:
    - text: "This point has a weight."
      weight: 2.5
`;
            const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
            const points = result.prompts[0].points;
            expect(points).toBeDefined();
            expect(points![0]).toEqual({ text: "This point has a weight.", multiplier: 2.5 });
          });
    });

    describe('Function and Message Normalization', () => {
        test('should correctly pluralize all singular function variants', () => {
            const yamlContent = `
---
- id: p1
  prompt: test
  should:
    - contain: "a"
    - contain_any_of: ["b", "c"]
    - match: "e"
    - match_all_of: ["f", "g"]
`;
            const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
            const points = result.prompts[0].points;
            expect(points).toHaveLength(4);
            expect((points![0] as any).fn).toBe('contains');
            expect((points![1] as any).fn).toBe('contains_any_of');
            expect((points![2] as any).fn).toBe('matches');
            expect((points![3] as any).fn).toBe('matches_all_of');
        });

        test('should correctly parse all variants of idiomatic function calls', () => {
            const yamlContent = `
---
- id: p1
  prompt: test
  should:
    - contains: "sensitive"
    - icontains: "insensitive"
    - ends_with: "."
    - match: "^start"
    - imatch: "^START-INSENSITIVE"
    - contains_any_of: ["a", "b", "c"]
    - contains_all_of: ["d", "e"]
    - match_all_of: ["^f", "g$"]
    - contains_at_least_n_of: [2, ["x", "y", "z"]]
    - word_count_between: [10, 20]
`;
            const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
            const points = result.prompts[0].points;
            expect(points).toHaveLength(10);
            expect(points![0]).toEqual({ fn: "contains", fnArgs: "sensitive", multiplier: 1.0 });
            expect(points![1]).toEqual({ fn: "icontains", fnArgs: "insensitive", multiplier: 1.0 });
            expect(points![2]).toEqual({ fn: "ends_with", fnArgs: ".", multiplier: 1.0 });
            expect(points![3]).toEqual({ fn: "matches", fnArgs: "^start", multiplier: 1.0 });
            expect(points![4]).toEqual({ fn: "imatch", fnArgs: "^START-INSENSITIVE", multiplier: 1.0 });
            expect(points![5]).toEqual({ fn: "contains_any_of", fnArgs: ["a", "b", "c"], multiplier: 1.0 });
            expect(points![6]).toEqual({ fn: "contains_all_of", fnArgs: ["d", "e"], multiplier: 1.0 });
            expect(points![7]).toEqual({ fn: "matches_all_of", fnArgs: ["^f", "g$"], multiplier: 1.0 });
            expect(points![8]).toEqual({ fn: "contains_at_least_n_of", fnArgs: [2, ["x", "y", "z"]], multiplier: 1.0 });
            expect(points![9]).toEqual({ fn: "word_count_between", fnArgs: [10, 20], multiplier: 1.0 });
          });
      
          test('should correctly parse "should_not" block with idiomatic functions', () => {
              const yamlContent = `
---
- id: p1
  prompt: test
  should_not:
    - contains: "forbidden"
    - icontains: "banned"
`;
              const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
              const points = result.prompts[0].should_not;
              expect(points).toBeDefined();
              expect(points).toHaveLength(2);
              expect(points![0]).toEqual({ fn: "contains", fnArgs: "forbidden", multiplier: 1.0 });
              expect(points![1]).toEqual({ fn: "icontains", fnArgs: "banned", multiplier: 1.0 });
          });

        test('should correctly parse the shorthand messages format', () => {
            const yamlContent = `
---
- id: p1
  messages:
    - system: "You are a helpful bot."
    - user: "Hello"
    - ai: "Hi there!" # ai is an alias for assistant
    - user: "How are you?"
`;
            const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
            const messages = result.prompts[0].messages;

            expect(messages).toBeDefined();
            expect(messages).toHaveLength(4);
            expect(messages![0]).toEqual({ role: 'system', content: 'You are a helpful bot.' });
            expect(messages![1]).toEqual({ role: 'user', content: 'Hello' });
            expect(messages![2]).toEqual({ role: 'assistant', content: 'Hi there!' });
            expect(messages![3]).toEqual({ role: 'user', content: 'How are you?' });
        });
    });

    describe('ID Generation', () => {
        test('should generate a stable hash-based ID for a prompt without an ID', () => {
          const yamlContent = `
---
- prompt: "This prompt needs an ID."
  ideal: "An ideal response."
`;
          const result = parseAndNormalizeBlueprint(yamlContent, 'yaml');
          const prompt = result.prompts[0];
          expect(prompt.id).toBeDefined();
          expect(prompt.id).toMatch(/^hash-/);
          expect(prompt.id).toHaveLength(17); // "hash-" + 12 hex chars
        });
    
        test('should generate the same ID for the same prompt content', () => {
          const yamlContent1 = `
---
- prompt: "This prompt needs an ID."
  ideal: "An ideal response."
`;
          const yamlContent2 = `
---
- prompt: "This prompt needs an ID."
  ideal: "An ideal response."
`;
          const result1 = parseAndNormalizeBlueprint(yamlContent1, 'yaml');
          const result2 = parseAndNormalizeBlueprint(yamlContent2, 'yaml');
          expect(result1.prompts[0].id).toBe(result2.prompts[0].id);
        });
    
        test('should generate a different ID for different prompt content', () => {
            const yamlContent1 = `
---
- prompt: "This is the first prompt."
`;
            const yamlContent2 = `
---
- prompt: "This is the second, different prompt."
`;
            const result1 = parseAndNormalizeBlueprint(yamlContent1, 'yaml');
            const result2 = parseAndNormalizeBlueprint(yamlContent2, 'yaml');
            expect(result1.prompts[0].id).not.toBe(result2.prompts[0].id);
          });
      });

    describe('Legacy JSON Parsing', () => {
        test('should correctly parse a valid JSON file', () => {
            const jsonContent = `{
                "id": "json-test-v1",
                "prompts": [
                    {
                        "id": "p1",
                        "promptText": "What is JSON?",
                        "points": ["A simple string point"]
                    }
                ]
            }`;
            const result = parseAndNormalizeBlueprint(jsonContent, 'json');
            expect(result.id).toBe('json-test-v1');
            expect(result.prompts[0].promptText).toBe('What is JSON?');
            const firstPoint = result.prompts[0].points![0];
             if (typeof firstPoint === 'object' && 'text' in firstPoint) {
                expect(firstPoint.text).toBe('A simple string point');
            } else {
                fail('First point was not a valid Point object with a text property');
            }
        });
    });
    
    describe('Error Handling', () => {
        test('should throw an error for invalid YAML syntax', () => {
            const yamlContent = `id: yaml-test\n  bad-indent`;
            expect(() => parseAndNormalizeBlueprint(yamlContent, 'yaml')).toThrow('Failed to parse YAML blueprint');
        });
    
        test('should throw an error for invalid JSON syntax', () => {
            const jsonContent = `{"id": "json-fail", "prompts": [}`; // Missing closing brace
            expect(() => parseAndNormalizeBlueprint(jsonContent, 'json')).toThrow('Failed to parse JSON blueprint');
        });

        test('should throw an error if a point has both text and a function', () => {
            const yamlContent = `
---
- id: p1
  prompt: test
  should:
    - text: "This is a text point"
      contains: "but also a function"
`;
            expect(() => parseAndNormalizeBlueprint(yamlContent, 'yaml')).toThrow("Failed to parse YAML blueprint: Point cannot have both 'text' and a function ('contains') defined.");
        });

        test('should throw an error for invalid shorthand messages format', () => {
            const yamlContent = `
---
- id: p1
  messages:
    - user: "Hello"
    - { user: "Hi", assistant: "There" }
`;
            expect(() => parseAndNormalizeBlueprint(yamlContent, 'yaml')).toThrow("Each message in the shorthand format must have exactly one key");
        });
    
        test('should throw an error for a malformed single-document file', () => {
            const yamlContent = `
id: single-doc-fail
title: This should fail because it is an object without a prompts key.
`;
            expect(() => parseAndNormalizeBlueprint(yamlContent, 'yaml')).toThrow('A single YAML document must be an array of prompts, or an object with a "prompts" key.');
        });

        test('should throw an error for a point object with no valid content', () => {
            const yamlContent = `
---
- id: p1
  prompt: test
  should:
    - weight: 2.0 # Invalid: has a weight but no text or function
`;
            expect(() => parseAndNormalizeBlueprint(yamlContent, 'yaml')).toThrow(
              "Point object must have 'text', 'fn', or an idiomatic function name."
            );
          });
      
          test('should throw an error for a malformed shorthand message', () => {
              const yamlContent = `
---
- id: p1
  messages:
    - user: "Hello"
    - { role: 'assistant', message: 'Hi' } # Invalid key 'message' instead of 'content'
`;
              expect(() => parseAndNormalizeBlueprint(yamlContent, 'yaml')).toThrow(
                  `Each message in the shorthand format must have exactly one key (e.g., 'user', 'assistant', 'ai', 'system').`
              );
            });
      
            test('should throw an error for invalid multiplier value', () => {
              const yamlContent = `
---
- id: p1
  prompt: test
  should:
    - text: "bad weight"
      weight: 100
`;
              expect(() => parseAndNormalizeBlueprint(yamlContent, 'yaml')).toThrow(
                "Point multiplier must be a number between 0.1 and 10. Found 100. Prompt ID: 'p1'"
              );
            });
    });
}); 