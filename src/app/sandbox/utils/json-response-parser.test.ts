import { parseJsonFromResponse, parseWevalConfigFromResponse, parsePromptsFromResponse } from './json-response-parser';
import { WevalConfig, WevalPromptConfig } from '@/types/shared';

// Mock the LLM service
jest.mock('@/cli/services/llm-service', () => ({
  getModelResponse: jest.fn()
}));

jest.mock('@/cli/utils/response-utils', () => ({
  checkForErrors: jest.fn(() => false)
}));

jest.mock('./yaml-generator', () => ({
  generateMinimalBlueprintYaml: jest.fn((config) => `title: "${config.title}"\ndescription: "${config.description}"`)
}));

describe('parseJsonFromResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('JSON extraction formats', () => {
    const testJson = {
      "title": "Test Blueprint",
      "description": "A test description",
      "models": [],
      "prompts": [
        {
          "id": "test-1",
          "promptText": "What is AI?",
          "points": ["Explains artificial intelligence"]
        }
      ]
    };

    it('should parse JSON with <JSON> tags (preferred format)', async () => {
      const response = `
Some text before
<JSON>
${JSON.stringify(testJson, null, 2)}
</JSON>
Some text after
      `;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.data.title).toBe('Test Blueprint');
      expect(result.validationError).toBeNull();
    });

    it('should parse JSON with <JSON> tags containing backticks', async () => {
      const response = `
<JSON>
\`\`\`json
${JSON.stringify(testJson, null, 2)}
\`\`\`
</JSON>
      `;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.data.title).toBe('Test Blueprint');
      expect(result.validationError).toBeNull();
    });

    it('should parse JSON with <JSON> tags containing plain backticks', async () => {
      const response = `
<JSON>
\`\`\`
${JSON.stringify(testJson, null, 2)}
\`\`\`
</JSON>
      `;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.data.title).toBe('Test Blueprint');
      expect(result.validationError).toBeNull();
    });

    it('should parse JSON in code blocks with json annotation', async () => {
      const response = `
Here's the JSON:
\`\`\`json
${JSON.stringify(testJson, null, 2)}
\`\`\`
      `;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.data.title).toBe('Test Blueprint');
      expect(result.validationError).toBeNull();
    });

    it('should parse JSON in plain code blocks', async () => {
      const response = `
Here's the response:
\`\`\`
${JSON.stringify(testJson, null, 2)}
\`\`\`
      `;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.data.title).toBe('Test Blueprint');
      expect(result.validationError).toBeNull();
    });

    it('should parse raw JSON (no formatting)', async () => {
      const response = JSON.stringify(testJson, null, 2);

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.data.title).toBe('Test Blueprint');
      expect(result.validationError).toBeNull();
    });

    it('should parse JSON embedded in text', async () => {
      const response = `
Here is your blueprint: ${JSON.stringify(testJson)} 
Please use this for testing.
      `;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.data.title).toBe('Test Blueprint');
      expect(result.validationError).toBeNull();
    });

    it('should parse JSON array formats', async () => {
      const arrayJson = [
        {
          "id": "test-1",
          "promptText": "What is AI?",
          "points": ["Explains artificial intelligence"]
        }
      ];

      const response = `
<JSON>
${JSON.stringify(arrayJson, null, 2)}
</JSON>
      `;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data[0].id).toBe('test-1');
      expect(result.validationError).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle completely invalid responses', async () => {
      const invalidResponse = `
This response has no JSON at all.
Just plain text.
      `;

      await expect(parseJsonFromResponse(invalidResponse, { 
        enableSelfCorrection: false 
      })).rejects.toThrow('The model did not return valid JSON in any recognized format.');
    });

    it('should return validation error when JSON is malformed', async () => {
      const responseWithInvalidJson = `
<JSON>
{
  "title": "Test Blueprint",
  "description": [invalid json structure,
}
</JSON>
      `;

      const result = await parseJsonFromResponse(responseWithInvalidJson, { 
        enableSelfCorrection: false 
      });

      expect(result.sanitized).toBe(false);
      expect(result.validationError).toMatch(/JSON validation failed/);
    });

    it('should handle unbalanced braces gracefully', async () => {
      const response = `
Some text { "incomplete": "json"
More text here
      `;

      await expect(parseJsonFromResponse(response, { 
        enableSelfCorrection: false 
      })).rejects.toThrow('The model did not return valid JSON in any recognized format.');
    });
  });

  describe('YAML conversion', () => {
    it('should convert valid JSON to YAML', async () => {
      const response = `
<JSON>
{
  "title": "Test Blueprint",
  "description": "A test description"
}
</JSON>
      `;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.yaml).toContain('Test Blueprint');
      expect(result.yaml).toContain('A test description');
    });
  });

  describe('edge cases and robustness', () => {
    it('should handle whitespace and newlines properly', async () => {
      const response = `

      <JSON>

      {
        "id": "test",
        "content": "data"
      }

      </JSON>

      `;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.data.id).toBe('test');
      expect(result.data.content).toBe('data');
    });

    it('should prioritize <JSON> tags over other formats when multiple are present', async () => {
      const response = `
First there's some raw JSON: {"wrong": "data"}

Then there's the proper format:
<JSON>
{
  "correct": "data",
  "id": "right-one"
}
</JSON>

And maybe some code blocks:
\`\`\`json
{"also": "wrong"}
\`\`\`
      `;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.data.correct).toBe('data');
      expect(result.data.id).toBe('right-one');
      expect(result.data.wrong).toBeUndefined();
    });

    it('should handle complex nested JSON structures', async () => {
      const complexJson = {
        title: "Complex Blueprint",
        prompts: [
          {
            id: "nested-test",
            promptText: "Test prompt with {special} characters and [arrays]",
            points: [
              "First point",
              "Second point with nested { braces } and [ brackets ]"
            ],
            metadata: {
              difficulty: "hard",
              tags: ["complex", "nested"]
            }
          }
        ]
      };

      const response = `<JSON>${JSON.stringify(complexJson)}</JSON>`;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.data.title).toBe('Complex Blueprint');
      expect(result.data.prompts[0].metadata.difficulty).toBe('hard');
      expect(result.data.prompts[0].points).toHaveLength(2);
    });

    it('should handle escaped characters in JSON', async () => {
      const jsonWithEscapes = {
        text: "This has \"quotes\" and \n newlines and \t tabs",
        regex: "\\d+\\.\\d+",
        path: "C:\\Users\\test\\file.txt"
      };

      const response = `<JSON>${JSON.stringify(jsonWithEscapes)}</JSON>`;

      const result = await parseJsonFromResponse(response, { enableSelfCorrection: false });
      expect(result.data.text).toContain('"quotes"');
      expect(result.data.regex).toBe('\\d+\\.\\d+');
      expect(result.data.path).toBe('C:\\Users\\test\\file.txt');
    });
  });
});

describe('parseWevalConfigFromResponse', () => {
  it('should parse a valid WevalConfig', async () => {
    const validConfigResponse = `
<JSON>
{
  "title": "Stoicism Test",
  "description": "Tests knowledge of Stoic philosophy",
  "models": ["openai:gpt-4"],
  "prompts": [
    {
      "id": "stoic-basics",
      "promptText": "What are the core tenets of Stoicism?",
      "idealResponse": "The dichotomy of control...",
      "points": ["Mentions dichotomy of control", "Lists the four virtues"]
    }
  ]
}
</JSON>
    `;

    const result = await parseWevalConfigFromResponse(validConfigResponse, { 
      enableSelfCorrection: false 
    });

    expect(result.data.title).toBe('Stoicism Test');
    expect(result.data.prompts).toHaveLength(1);
    expect(result.data.prompts[0].id).toBe('stoic-basics');
    expect(result.validationError).toBeNull();
  });
});

describe('parsePromptsFromResponse', () => {
  it('should parse a valid prompts array', async () => {
    const validPromptsResponse = `
<JSON>
[
  {
    "id": "new-prompt-1",
    "promptText": "How does Stoicism apply to modern life?",
    "points": ["Provides practical examples"],
    "should_not": ["Gives generic advice"]
  }
]
</JSON>
    `;

    const result = await parsePromptsFromResponse(validPromptsResponse, { 
      enableSelfCorrection: false 
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('new-prompt-1');
    expect(result.validationError).toBeNull();
  });

  it('should handle prompts wrapped in object', async () => {
    const validPromptsObjectResponse = `
<JSON>
{
  "prompts": [
    {
      "id": "new-prompt-2",
      "promptText": "What is virtue ethics?",
      "points": ["Defines virtue ethics"]
    }
  ]
}
</JSON>
    `;

    const result = await parsePromptsFromResponse(validPromptsObjectResponse, { 
      enableSelfCorrection: false 
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('new-prompt-2');
    expect(result.validationError).toBeNull();
  });

  it('should handle invalid prompts format', async () => {
    const invalidPromptsResponse = `
<JSON>
{
  "not_prompts": "invalid"
}
</JSON>
    `;

    const result = await parsePromptsFromResponse(invalidPromptsResponse, { 
      enableSelfCorrection: false 
    });

    expect(result.data).toHaveLength(0);
    expect(result.validationError).toMatch(/not a valid prompts array/);
  });
}); 