import { validateBlueprintSchema } from '../blueprint-validator';

describe('Blueprint JSON Schema validation', () => {
  test('authoring: accepts minimal JSON with prompts array and aliases', () => {
    const authoring = {
      title: 'Test',
      prompts: [
        { promptText: 'What is JSON?', idealResponse: 'A data format.' },
        { messages: [ { user: 'Hi' }, { assistant: null }, { user: 'Again' } ], should: ['be polite'] },
      ],
      point_defs: { scoreBand: 'return 1;' },
    };
    const res = validateBlueprintSchema(authoring, 'authoring');
    expect(res.valid).toBe(true);
  });

  test('canonical: validates normalized config shape', () => {
    const canonical = {
      id: 'abc',
      title: 'T',
      prompts: [
        {
          id: 'p1',
          messages: [ { role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi' } ],
          idealResponse: 'X',
          points: [ { text: 'Be polite', multiplier: 1.0 }, [ { fn: 'contains', fnArgs: 'Hello', multiplier: 1 } ] ],
          should_not: [ { fn: 'contains', fnArgs: 'rude', multiplier: 1 } ],
        },
      ],
      models: ['openai:gpt-4o-mini'],
    };
    const res = validateBlueprintSchema(canonical, 'canonical');
    expect(res.valid).toBe(true);
  });
});


