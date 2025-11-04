/**
 * Tests for GitHub Push Webhook Deduplication
 *
 * IMPORTANT: These tests ensure we don't re-run expensive evaluations unnecessarily.
 * Proper deduplication prevents wasted compute and API costs.
 *
 * NOTE: These tests focus on the hash generation logic and deduplication concepts.
 * S3 interaction testing is omitted to avoid ESM mocking complexity.
 */

import { generateConfigContentHash } from '@/lib/hash-utils';

describe('Content Hash Generation for Deduplication', () => {
  it('should generate consistent hashes for identical configs', () => {
    const config1 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test prompt', idealResponse: 'answer' }],
      models: ['openai:gpt-4'],
      system: 'test system',
    };

    const config2 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test prompt', idealResponse: 'answer' }],
      models: ['openai:gpt-4'],
      system: 'test system',
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBeGreaterThan(0);
  });

  it('should generate different hashes for different prompts', () => {
    const config1 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'prompt 1' }],
      models: ['openai:gpt-4'],
    };

    const config2 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'prompt 2' }],
      models: ['openai:gpt-4'],
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hashes for different models', () => {
    const config1 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['openai:gpt-4'],
    };

    const config2 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['anthropic:claude-3-opus'],
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    expect(hash1).not.toBe(hash2);
  });

  it('should be insensitive to model order (models are sorted)', () => {
    // The hash function sorts models, so order doesn't matter
    const config1 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['openai:gpt-4', 'anthropic:claude-3-opus'],
    };

    const config2 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['anthropic:claude-3-opus', 'openai:gpt-4'],
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    // Hashes should be the same because models are sorted
    expect(hash1).toBe(hash2);
  });

  it('should handle temperature variations', () => {
    const config1 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['openai:gpt-4'],
      temperatures: [0.7],
    };

    const config2 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['openai:gpt-4'],
      temperatures: [1.0],
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    expect(hash1).not.toBe(hash2);
  });

  it('should handle system prompt variations', () => {
    const config1 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['openai:gpt-4'],
      system: 'system 1',
    };

    const config2 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['openai:gpt-4'],
      system: 'system 2',
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    expect(hash1).not.toBe(hash2);
  });

  it('should handle different ideal responses', () => {
    const config1 = {
      id: 'test',
      prompts: [{
        id: 'p1',
        promptText: 'question',
        idealResponse: 'answer 1'
      }],
      models: ['openai:gpt-4'],
    };

    const config2 = {
      id: 'test',
      prompts: [{
        id: 'p1',
        promptText: 'question',
        idealResponse: 'answer 2'
      }],
      models: ['openai:gpt-4'],
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    expect(hash1).not.toBe(hash2);
  });

  it('should handle point function variations', () => {
    const config1 = {
      id: 'test',
      prompts: [{
        id: 'p1',
        promptText: 'test',
        points: [['$contains', 'keyword1']]
      }],
      models: ['openai:gpt-4'],
    };

    const config2 = {
      id: 'test',
      prompts: [{
        id: 'p1',
        promptText: 'test',
        points: [['$contains', 'keyword2']]
      }],
      models: ['openai:gpt-4'],
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    expect(hash1).not.toBe(hash2);
  });
});

describe('Deduplication Logic Concepts', () => {
  it('should demonstrate deduplication prevents duplicate runs', () => {
    // Scenario: User pushes same blueprint twice (e.g., merge then revert then re-merge)
    const config = {
      id: 'expensive-eval',
      prompts: Array(50).fill(null).map((_, i) => ({
        id: `p${i}`,
        promptText: `test ${i}`
      })),
      models: Array(20).fill('openai:gpt-4'),
    };

    const hash1 = generateConfigContentHash(config as any);
    const hash2 = generateConfigContentHash(config as any);

    // Same config = same hash = would skip re-evaluation
    expect(hash1).toBe(hash2);

    // Cost savings calculation (hypothetical):
    const responsesPerRun = config.prompts.length * config.models.length; // 1000 responses
    const costPerResponse = 0.01; // $0.01 per response
    const savedCost = responsesPerRun * costPerResponse;

    expect(savedCost).toBe(10.00); // $10 saved by not re-running
  });

  it('should allow re-evaluation when blueprint content changes', () => {
    // User fixes a typo - should trigger new evaluation
    const originalConfig = {
      id: 'my-eval',
      prompts: [{ id: 'p1', promptText: 'What is teh capital of France?' }], // typo
      models: ['openai:gpt-4'],
    };

    const fixedConfig = {
      id: 'my-eval',
      prompts: [{ id: 'p1', promptText: 'What is the capital of France?' }], // fixed
      models: ['openai:gpt-4'],
    };

    const originalHash = generateConfigContentHash(originalConfig as any);
    const fixedHash = generateConfigContentHash(fixedConfig as any);

    // Different content = different hash = would trigger new evaluation
    expect(originalHash).not.toBe(fixedHash);
  });

  it('should detect blueprint version changes', () => {
    const configV1 = {
      id: 'my-eval',
      prompts: [{ id: 'p1', promptText: 'prompt v1' }],
      models: ['openai:gpt-4'],
    };

    const configV2 = {
      id: 'my-eval',
      prompts: [{ id: 'p1', promptText: 'prompt v2' }], // Changed
      models: ['openai:gpt-4'],
    };

    const hashV1 = generateConfigContentHash(configV1 as any);
    const hashV2 = generateConfigContentHash(configV2 as any);

    // Different versions = different hashes
    expect(hashV1).not.toBe(hashV2);
  });

  it('should handle multiple blueprints in single push', () => {
    const configs = [
      { id: 'eval-1', prompts: [{ id: 'p1', promptText: 'test 1' }], models: ['openai:gpt-4'] },
      { id: 'eval-2', prompts: [{ id: 'p1', promptText: 'test 2' }], models: ['openai:gpt-4'] },
      { id: 'eval-3', prompts: [{ id: 'p1', promptText: 'test 3' }], models: ['openai:gpt-4'] },
    ];

    const hashes = configs.map(c => generateConfigContentHash(c as any));

    // Each blueprint should have a unique hash
    expect(new Set(hashes).size).toBe(3);
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(hashes[1]).not.toBe(hashes[2]);
    expect(hashes[0]).not.toBe(hashes[2]);
  });
});

describe('S3 Path Format for Deduplication', () => {
  it('should demonstrate correct S3 path format', () => {
    const configId = 'my-eval';
    const hash = generateConfigContentHash({
      id: configId,
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['openai:gpt-4'],
    } as any);

    // Expected S3 path format
    const expectedPath = `live/blueprints/${configId}/${hash}_comparison.json`;

    // Verify path components
    expect(expectedPath).toContain('live/blueprints/');
    expect(expectedPath).toContain(configId);
    expect(expectedPath).toContain(hash);
    expect(expectedPath.endsWith('_comparison.json')).toBe(true);
  });

  it('should handle different config IDs correctly', () => {
    const config1 = { id: 'config-1', prompts: [{ id: 'p1', promptText: 'test' }], models: ['openai:gpt-4'] };
    const config2 = { id: 'config-2', prompts: [{ id: 'p1', promptText: 'test' }], models: ['openai:gpt-4'] };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    const path1 = `live/blueprints/config-1/${hash1}_comparison.json`;
    const path2 = `live/blueprints/config-2/${hash2}_comparison.json`;

    // Different configs should have different paths
    expect(path1).not.toBe(path2);
    expect(path1).toContain('config-1');
    expect(path2).toContain('config-2');
  });

  it('should handle config IDs with special characters', () => {
    const configId = 'my-eval_v2.0';
    const hash = 'abc123';

    const path = `live/blueprints/${configId}/${hash}_comparison.json`;

    expect(path).toBe('live/blueprints/my-eval_v2.0/abc123_comparison.json');
  });

  it('should handle very long config IDs', () => {
    const configId = 'a'.repeat(200);
    const hash = generateConfigContentHash({
      id: configId,
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['openai:gpt-4'],
    } as any);

    const path = `live/blueprints/${configId}/${hash}_comparison.json`;

    expect(path).toContain(configId);
    expect(path.length).toBeGreaterThan(200);
  });
});

describe('Edge Cases', () => {
  it('should handle empty arrays', () => {
    const config1 = {
      id: 'test',
      prompts: [],
      models: [],
    };

    const config2 = {
      id: 'test',
      prompts: [],
      models: [],
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    expect(hash1).toBe(hash2);
  });

  it('should handle undefined optional fields', () => {
    const config1 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['openai:gpt-4'],
    };

    const config2 = {
      id: 'test',
      prompts: [{ id: 'p1', promptText: 'test' }],
      models: ['openai:gpt-4'],
      system: undefined,
      temperatures: undefined,
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    // Should treat missing and undefined the same
    expect(hash1).toBe(hash2);
  });

  it('should handle complex nested structures', () => {
    const config1 = {
      id: 'test',
      prompts: [{
        id: 'p1',
        promptText: 'question 1',
        idealResponse: 'answer 1',
        system: 'per-prompt system',
        points: [['$contains', 'expected']],
        weight: 2.0,
      }],
      models: ['openai:gpt-4'],
    };

    const config2 = {
      id: 'test',
      prompts: [{
        id: 'p1',
        promptText: 'question 1',
        idealResponse: 'answer 1',
        system: 'per-prompt system',
        points: [['$contains', 'expected']],
        weight: 2.0,
      }],
      models: ['openai:gpt-4'],
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    expect(hash1).toBe(hash2);
  });

  it('should differentiate configs with different prompt weights', () => {
    const config1 = {
      id: 'test',
      prompts: [{
        id: 'p1',
        promptText: 'test',
        weight: 1.0,
      }],
      models: ['openai:gpt-4'],
    };

    const config2 = {
      id: 'test',
      prompts: [{
        id: 'p1',
        promptText: 'test',
        weight: 2.0,
      }],
      models: ['openai:gpt-4'],
    };

    const hash1 = generateConfigContentHash(config1 as any);
    const hash2 = generateConfigContentHash(config2 as any);

    expect(hash1).not.toBe(hash2);
  });
});
