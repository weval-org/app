import { parseYamlFromResponse } from './yaml-response-parser';

// Mock the LLM service
jest.mock('@/cli/services/llm-service', () => ({
  getModelResponse: jest.fn()
}));

jest.mock('@/cli/utils/response-utils', () => ({
  checkForErrors: jest.fn(() => false)
}));

describe('parseYamlFromResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse valid YAML successfully', async () => {
    const validResponse = `
Some text before
<YAML>
title: "Test Blueprint"
description: "A test description"
prompts:
  - id: "test-1"
    prompt: "What is AI?"
</YAML>
Some text after
    `;

    const result = await parseYamlFromResponse(validResponse, { 
      enableSelfCorrection: false 
    });

    expect(result.yaml).toContain('title: "Test Blueprint"');
    expect(result.sanitized).toBe(false);
    expect(result.validationError).toBeNull();
  });

  it('should handle missing YAML tags', async () => {
    const invalidResponse = `
This response has no YAML tags
    `;

    await expect(parseYamlFromResponse(invalidResponse, { 
      enableSelfCorrection: false 
    })).rejects.toThrow('The model did not return a valid YAML response within <YAML> tags.');
  });

  it('should sanitize YAML with unexpected end of stream', async () => {
    const responseWithBrokenYaml = `
<YAML>
title: "Test Blueprint"
description: "A test description"
prompts:
  - id: "test-1"
    prompt: "What is AI?
</YAML>
    `;

    const result = await parseYamlFromResponse(responseWithBrokenYaml, { 
      enableSelfCorrection: false 
    });

    expect(result.yaml).not.toContain('    prompt: "What is AI?');
    expect(result.sanitized).toBe(true);
    expect(result.validationError).toBeNull();
  });

  it('should return validation error when YAML is invalid and self-correction is disabled', async () => {
    const responseWithInvalidYaml = `
<YAML>
title: Test Blueprint
description: [invalid: yaml: structure
</YAML>
    `;

    const result = await parseYamlFromResponse(responseWithInvalidYaml, { 
      enableSelfCorrection: false 
    });

    expect(result.sanitized).toBe(false);
    expect(result.validationError).toMatch(/YAML validation failed/);
  });
}); 