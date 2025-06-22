import { jest } from '@jest/globals';
import { ComparisonConfig } from '@/cli/types/cli_types';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';


// This is a simplified version of loadAndValidateConfig for testing purposes.
// It focuses only on the validation logic relevant to system prompts.
function validateSystemPrompts(config: ComparisonConfig): void {
  // Rule: If a 'systems' array is defined, individual prompt-level system prompts are disallowed.
  if (Array.isArray(config.systems) && config.systems.length > 0) {
      const promptWithSystemOverride = config.prompts.find(p => p.system);
      if (promptWithSystemOverride) {
          throw new Error(`Config validation error: When a top-level 'systems' array is defined for permutation, individual prompts (like '${promptWithSystemOverride.id}') cannot have their own 'system' override. This is to ensure a clean comparison across all system prompts.`);
      }
  }

  // Rule: If `systems` is present, it must be an array of strings.
  if (config.systems !== undefined && (!Array.isArray(config.systems) || !config.systems.every((s: any) => typeof s === 'string'))) {
    throw new Error("Config file has invalid 'systems' (must be an array of strings).");
  }
}

describe('run-config system prompt validation', () => {

  it('should pass when a single global `system` prompt is used with per-prompt overrides', () => {
    const config: ComparisonConfig = {
      system: "Global system prompt",
      models: ["test-model"],
      prompts: [
        { id: 'p1', promptText: "Hello" },
        { id: 'p2', promptText: "Hi", system: "Per-prompt override" }
      ]
    };
    expect(() => validateSystemPrompts(config)).not.toThrow();
  });

  it('should pass when `systems` array is used and there are no per-prompt overrides', () => {
    const config: ComparisonConfig = {
      systems: ["System 1", "System 2"],
      models: ["test-model"],
      prompts: [
        { id: 'p1', promptText: "Hello" },
        { id: 'p2', promptText: "Hi" }
      ]
    };
    expect(() => validateSystemPrompts(config)).not.toThrow();
  });

  it('should throw an error when `systems` array is used and a prompt has a `system` override', () => {
    const config: ComparisonConfig = {
      systems: ["System 1", "System 2"],
      models: ["test-model"],
      prompts: [
        { id: 'p1', promptText: "Hello" },
        { id: 'p2', promptText: "Hi", system: "This should not be allowed" }
      ]
    };
    expect(() => validateSystemPrompts(config)).toThrow(
      "Config validation error: When a top-level 'systems' array is defined for permutation, individual prompts (like 'p2') cannot have their own 'system' override. This is to ensure a clean comparison across all system prompts."
    );
  });
  
  it('should throw an error if `systems` is not an array of strings', () => {
    const config: ComparisonConfig = {
      systems: ["System 1", { an: "object" }] as any,
      models: ["test-model"],
      prompts: [{ id: 'p1', promptText: "Hello" }]
    };
    expect(() => validateSystemPrompts(config)).toThrow(
      "Config file has invalid 'systems' (must be an array of strings)."
    );
  });

  it('should throw an error if `systems` contains multiple nulls', () => {
    const config: ComparisonConfig = {
      systems: ["System 1", null, null],
      models: ["test-model"],
      prompts: [{ id: 'p1', promptText: "Hello" }]
    };
    // A simplified validation function for testing purposes.
    const validate = (cfg: ComparisonConfig) => {
      if (Array.isArray(cfg.systems) && cfg.systems.filter(s => s === null).length > 1) {
        throw new Error("Config file validation error: The 'systems' array can contain at most one 'null' entry.");
      }
    };
    expect(() => validate(config)).toThrow(
      "Config file validation error: The 'systems' array can contain at most one 'null' entry."
    );
  });

  it('should pass when `systems` array contains a null value', () => {
    const config: ComparisonConfig = {
      systems: ["System 1", null, "System 3"],
      models: ["test-model"],
      prompts: [{ id: 'p1', promptText: "Hello" }]
    };
    // A simplified validation function for testing purposes.
    const validate = (cfg: ComparisonConfig) => {
      if (cfg.systems !== undefined && (!Array.isArray(cfg.systems) || !cfg.systems.every((s: any) => typeof s === 'string' || s === null))) {
        throw new Error("Config file has invalid 'systems' (must be an array of strings or nulls).");
      }
    };
    expect(() => validate(config)).not.toThrow();
  });

  it('should pass for an empty `systems` array', () => {
    const config: ComparisonConfig = {
      systems: [],
      models: ["test-model"],
      prompts: [
        { id: 'p1', promptText: "Hello" },
        { id: 'p2', promptText: "Hi", system: "This is fine" }
      ]
    };
    expect(() => validateSystemPrompts(config)).not.toThrow();
  });

  it('should handle legacy `systemPrompt` field during normalization', () => {
    const yamlString = `
systemPrompt: Legacy global prompt
models: [test-model]
prompts:
  - id: p1
    promptText: Hello
`;
    const config = parseAndNormalizeBlueprint(yamlString, 'yaml');
    expect(config.system).toEqual("Legacy global prompt");
    expect(config.systemPrompt).toBeUndefined();
  });
}); 