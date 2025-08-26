// Canonical (normalized) schema for Weval blueprints.
// This describes the post-normalization shape produced by parseAndNormalizeBlueprint.
// Keep permissive where runtime permits (e.g., assistant content can be null),
// but prefer strict names (no aliases like promptText/idealResponse here).

export const BlueprintCanonicalSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://weval.org/schemas/blueprint-canonical/v1.json',
  title: 'Weval Blueprint (Canonical Normalized)',
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    author: {
      oneOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            url: { type: 'string' },
            image_url: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: true,
        }
      ]
    },
    reference: {
      oneOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {
            title: { type: 'string' },
            name: { type: 'string' }, // alias for title
            url: { type: 'string' },
          },
          anyOf: [
            { required: ['title'] },
            { required: ['name'] }
          ],
          additionalProperties: true,
        }
      ]
    },
    citation: {
      oneOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {
            title: { type: 'string' },
            name: { type: 'string' }, // alias for title
            url: { type: 'string' },
          },
          anyOf: [
            { required: ['title'] },
            { required: ['name'] }
          ],
          additionalProperties: true,
        }
      ]
    },
    tags: { type: 'array', items: { type: 'string' } },
    models: {
      type: 'array',
      items: {
        oneOf: [
          { type: 'string' },
          { $ref: '#/$defs/customModel' },
        ],
      },
    },
    embeddingModel: { type: 'string' },
    system: { type: ['string', 'null'] },
    systems: { type: 'array', items: { type: ['string', 'null'] } },
    tools: { type: 'array', items: { type: 'object' } },
    toolUse: { type: 'object' },
    context: { type: 'object' },
    point_defs: { type: 'object', additionalProperties: true },
    prompts: { type: 'array', items: { $ref: '#/$defs/prompt' } },
  },
  required: ['prompts'],
  additionalProperties: true,
  $defs: {
    prompt: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        description: { type: 'string' },
        messages: { type: 'array', items: { $ref: '#/$defs/message' } },
        idealResponse: { type: 'string' },
        system: { type: ['string', 'null'] },
        citation: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                title: { type: 'string' },
                name: { type: 'string' }, // alias for title
                url: { type: 'string' },
              },
              anyOf: [
                { required: ['title'] },
                { required: ['name'] }
              ],
              additionalProperties: true,
            }
          ]
        },
        reference: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                title: { type: 'string' },
                name: { type: 'string' }, // alias for title
                url: { type: 'string' },
              },
              anyOf: [
                { required: ['title'] },
                { required: ['name'] }
              ],
              additionalProperties: true,
            }
          ]
        },
        weight: { type: 'number', minimum: 0.1, maximum: 10 },
        points: { $ref: '#/$defs/pointBlock' },
        should_not: { $ref: '#/$defs/pointBlock' },
      },
      required: ['messages'],
      additionalProperties: true,
    },
    message: {
      type: 'object',
      properties: {
        role: { enum: ['user', 'assistant', 'system'] },
        content: { type: ['string', 'null'] },
      },
      required: ['role', 'content'],
      additionalProperties: false,
    },
    pointBlock: {
      type: 'array',
      items: {
        oneOf: [
          { $ref: '#/$defs/point' },
          { type: 'array', items: { $ref: '#/$defs/point' }, minItems: 1 },
        ],
      },
    },
    point: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        fn: { type: 'string' },
        fnArgs: {},
        multiplier: { type: 'number', minimum: 0.1, maximum: 10 },
        citation: { type: 'string' },
      },
      allOf: [
        { oneOf: [{ required: ['text'] }, { required: ['fn'] }] },
        { not: { required: ['text', 'fn'] } },
      ],
      additionalProperties: true,
    },
    customModel: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        url: { type: 'string' },
        modelName: { type: 'string' },
        inherit: { type: 'string' },
        format: { type: 'string', enum: ['chat', 'completions'], nullable: true },
        headers: { type: 'object' },
        parameters: { type: 'object' },
        parameterMapping: { type: 'object' },
      },
      required: ['id', 'url', 'modelName', 'inherit'],
      additionalProperties: true,
    },
  },
} as const;


