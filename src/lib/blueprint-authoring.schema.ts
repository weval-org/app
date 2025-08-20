// Authoring schema (permissive) for Weval blueprints.
// Accepts YAML/JSON authoring variants and aliases; still encourages canonical names.

export const BlueprintAuthoringSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://weval.org/schemas/blueprint-authoring/v1.json',
  title: 'Weval Blueprint (Authoring)',
  type: ['object', 'array'],
  oneOf: [
    {
      // Header + prompts object (JSON single doc or YAML header doc)
      type: 'object',
      properties: {
        id: { type: 'string', deprecated: true, description: 'Ignored at runtime; ID derived from path or server policy.' },
        title: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        models: {
          type: 'array',
          items: { anyOf: [{ type: 'string' }, { $ref: '#/$defs/customModel' }] },
        },
        system: { type: ['string', 'array'] },
        temperatures: { type: 'array', items: { type: 'number' } },
        temperature: { type: 'number' },
        point_defs: { type: 'object', additionalProperties: true },
        tools: { type: 'array', items: { type: 'object' } },
        toolUse: { type: 'object' },
        context: { type: 'object' },
        prompts: { $ref: '#/$defs/promptList' },
      },
      required: ['prompts'],
      additionalProperties: true,
    },
    {
      // Prompts list only (YAML single doc or JSON array). Equivalent to stream of docs.
      $ref: '#/$defs/promptList',
    },
  ],
  $defs: {
    promptList: {
      type: 'array',
      items: { $ref: '#/$defs/prompt' },
      minItems: 0,
    },
    prompt: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        // Canonical single-turn field
        prompt: { type: 'string' },
        // Alias for JSON legacy
        promptText: { type: 'string', deprecated: true },
        // Multi-turn
        messages: {
          type: 'array',
          items: { $ref: '#/$defs/messageItem' },
        },
        // Canonical ideal
        ideal: { type: 'string' },
        // Alias for JSON legacy
        idealResponse: { type: 'string', deprecated: true },
        description: { type: 'string' },
        citation: { type: 'string' },
        system: { type: ['string', 'null'] },
        // Canonical rubric names
        should: { $ref: '#/$defs/pointBlock' },
        should_not: { $ref: '#/$defs/pointBlock' },
        // Aliases
        points: { $ref: '#/$defs/pointBlock', deprecated: true },
        expect: { $ref: '#/$defs/pointBlock', deprecated: true },
        expects: { $ref: '#/$defs/pointBlock', deprecated: true },
        expectations: { $ref: '#/$defs/pointBlock', deprecated: true },
        weight: { type: 'number', minimum: 0.1, maximum: 10 },
        multiplier: { type: 'number', minimum: 0.1, maximum: 10, deprecated: true },
      },
      // Either prompt or messages is required (but parser enforces exactly-one at runtime)
      anyOf: [
        { required: ['prompt'] },
        { required: ['promptText'] },
        { required: ['messages'] },
      ],
      additionalProperties: true,
    },
    messageItem: {
      oneOf: [
        {
          type: 'object',
          properties: {
            role: { enum: ['user', 'assistant', 'system'] },
            content: { type: ['string', 'null'] },
          },
          required: ['role', 'content'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: { user: { type: 'string' } },
          required: ['user'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: { assistant: { type: ['string', 'null'] } },
          required: ['assistant'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: { ai: { type: 'string' } },
          required: ['ai'],
          additionalProperties: false,
        },
      ],
    },
    pointBlock: {
      type: 'array',
      items: {
        oneOf: [
          { $ref: '#/$defs/pointItem' },
          { type: 'array', items: { $ref: '#/$defs/pointItem' }, minItems: 1 },
        ],
      },
    },
    pointItem: {
      oneOf: [
        { type: 'string' },
        {
          // Idiomatic $function or citation shorthand {"Some point": "citation"}
          type: 'object',
          minProperties: 1,
          additionalProperties: true,
        },
        {
          // Full-object form with aliases
          type: 'object',
          properties: {
            text: { type: 'string' },
            point: { type: 'string', deprecated: true },
            fn: { type: 'string' },
            fnArgs: {},
            arg: { deprecated: true },
            weight: { type: 'number', minimum: 0.1, maximum: 10 },
            multiplier: { type: 'number', minimum: 0.1, maximum: 10, deprecated: true },
            citation: { type: 'string' },
          },
          additionalProperties: true,
        },
      ],
    },
    customModel: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        url: { type: 'string' },
        modelName: { type: 'string' },
        inherit: { type: 'string' },
        format: { type: 'string', enum: ['chat', 'completions'] },
        headers: { type: 'object' },
        parameters: { type: 'object' },
        parameterMapping: { type: 'object' },
      },
      required: ['id', 'url', 'modelName', 'inherit'],
      additionalProperties: true,
    },
  },
} as const;


