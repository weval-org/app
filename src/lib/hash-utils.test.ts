import { generateConfigContentHash } from './hash-utils';
import { ComparisonConfig } from '@/cli/types/comparison_v2';

describe('generateConfigContentHash', () => {

  const baseConfig: ComparisonConfig = {
    id: 'test-config',
    title: 'Test Config',
    models: ['openai:gpt-4o-mini', 'google:gemini-1.5-flash-latest'],
    prompts: [{
      id: 'p1',
      promptText: 'Hello world'
    }],
    temperature: 0,
  };

  it('should generate a consistent hash for the same config', () => {
    const hash1 = generateConfigContentHash(baseConfig);
    const hash2 = generateConfigContentHash(baseConfig);
    expect(hash1).toEqual(hash2);
  });

  it('should generate a different hash if models change', () => {
    const config2: ComparisonConfig = { ...baseConfig, models: ['openai:gpt-4o-mini'] };
    const hash1 = generateConfigContentHash(baseConfig);
    const hash2 = generateConfigContentHash(config2);
    expect(hash1).not.toEqual(hash2);
  });

  it('should generate a different hash if a singular system prompt changes', () => {
    const config1: ComparisonConfig = { ...baseConfig, system: 'You are a helpful assistant.' };
    const config2: ComparisonConfig = { ...baseConfig, system: 'You are a pirate.' };
    const hash1 = generateConfigContentHash(config1);
    const hash2 = generateConfigContentHash(config2);
    expect(hash1).not.toEqual(hash2);
  });

  it('should generate a different hash if system prompt variants (systems) change', () => {
    const config1: ComparisonConfig = { ...baseConfig, systems: ['You are helpful.', 'You are terse.'] };
    const config2: ComparisonConfig = { ...baseConfig, systems: ['You are helpful.', 'You are verbose.'] };
    const hash1 = generateConfigContentHash(config1);
    const hash2 = generateConfigContentHash(config2);
    expect(hash1).not.toEqual(hash2);
  });
  
  it('should generate a different hash for a singular system prompt vs. a systems array', () => {
    const config1: ComparisonConfig = { ...baseConfig, system: 'You are helpful.' };
    const config2: ComparisonConfig = { ...baseConfig, systems: ['You are helpful.'] };
    const hash1 = generateConfigContentHash(config1);
    const hash2 = generateConfigContentHash(config2);
    expect(hash1).not.toEqual(hash2);
  });

  it('should ignore the order of models', () => {
    const config1: ComparisonConfig = { ...baseConfig, models: ['modelA', 'modelB'] };
    const config2: ComparisonConfig = { ...baseConfig, models: ['modelB', 'modelA'] };
    const hash1 = generateConfigContentHash(config1);
    const hash2 = generateConfigContentHash(config2);
    expect(hash1).toEqual(hash2);
  });

  it('should ignore the order of system prompts in the systems array', () => {
    const config1: ComparisonConfig = { ...baseConfig, systems: ['helpful', 'terse'] };
    const config2: ComparisonConfig = { ...baseConfig, systems: ['terse', 'helpful'] };
    const hash1 = generateConfigContentHash(config1);
    const hash2 = generateConfigContentHash(config2);
    expect(hash1).toEqual(hash2);
  });

  it('should generate the same hash regardless of prompt order', () => {
    const configWithMultiplePrompts1: ComparisonConfig = {
      ...baseConfig,
      prompts: [
        { id: 'p1', promptText: 'Prompt 1' },
        { id: 'p2', promptText: 'Prompt 2' }
      ]
    };
     const configWithMultiplePrompts2: ComparisonConfig = {
      ...baseConfig,
      prompts: [
        { id: 'p2', promptText: 'Prompt 2' },
        { id: 'p1', promptText: 'Prompt 1' }
      ]
    };
    const hash1 = generateConfigContentHash(configWithMultiplePrompts1);
    const hash2 = generateConfigContentHash(configWithMultiplePrompts2);
    expect(hash1).toEqual(hash2);
  });

}); 