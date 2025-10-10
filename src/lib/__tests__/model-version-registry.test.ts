// Jest is the test runner, no need to import describe/it/expect
import {
  MODEL_VERSION_REGISTRY,
  getModelSeries,
  findSeriesForModel,
  findVersionForModel,
  getSeriesByMaker,
  getSeriesByTier,
  validateChronologicalOrdering,
} from '../model-version-registry';

describe('Model Version Registry', () => {
  it('should have at least some model series defined', () => {
    expect(MODEL_VERSION_REGISTRY.length).toBeGreaterThan(0);
  });

  it('should validate chronological ordering', () => {
    const issues = validateChronologicalOrdering();
    expect(issues).toEqual([]);
  });

  it('should find series by ID', () => {
    const series = getModelSeries('anthropic-claude-haiku');
    expect(series).toBeDefined();
    expect(series?.seriesName).toBe('Anthropic Claude Haiku');
    expect(series?.maker).toBe('anthropic');
    expect(series?.tier).toBe('fast');
  });

  it('should find series for a given model ID', () => {
    const series = findSeriesForModel('anthropic:claude-3-5-haiku-20241022');
    expect(series).toBeDefined();
    expect(series?.seriesId).toBe('anthropic-claude-haiku');
  });

  it('should find series for model aliases', () => {
    const series1 = findSeriesForModel('anthropic:claude-3-5-haiku');
    const series2 = findSeriesForModel('openrouter:anthropic/claude-3.5-haiku');

    expect(series1?.seriesId).toBe('anthropic-claude-haiku');
    expect(series2?.seriesId).toBe('anthropic-claude-haiku');
  });

  it('should find version for a model ID', () => {
    const result = findVersionForModel('openai:gpt-4o-2024-11-20');
    expect(result).toBeDefined();
    expect(result?.series.seriesId).toBe('openai-gpt-4o');
    expect(result?.version.name).toBe('GPT-4o (November 2024)');
  });

  it('should handle case-insensitive matching', () => {
    const result1 = findVersionForModel('ANTHROPIC:CLAUDE-3-5-HAIKU');
    const result2 = findVersionForModel('anthropic:claude-3-5-haiku');

    expect(result1?.series.seriesId).toBe(result2?.series.seriesId);
  });

  it('should get series by maker', () => {
    const anthropicSeries = getSeriesByMaker('anthropic');
    expect(anthropicSeries.length).toBeGreaterThan(0);
    expect(anthropicSeries.every(s => s.maker === 'anthropic')).toBe(true);
  });

  it('should get series by tier', () => {
    const fastModels = getSeriesByTier('fast');
    expect(fastModels.length).toBeGreaterThan(0);
    expect(fastModels.every(s => s.tier === 'fast')).toBe(true);
  });

  it('should have multiple versions in key series', () => {
    const claudeSonnet = getModelSeries('anthropic-claude-sonnet');
    expect(claudeSonnet?.versions.length).toBeGreaterThan(1);

    const gpt4o = getModelSeries('openai-gpt-4o');
    expect(gpt4o?.versions.length).toBeGreaterThan(1);
  });

  it('should have proper release dates', () => {
    const series = getModelSeries('openai-gpt-4o');
    expect(series).toBeDefined();

    // Check dates are valid and chronological
    series!.versions.forEach((version, idx) => {
      const date = new Date(version.releaseDate);
      expect(date.toString()).not.toBe('Invalid Date');

      if (idx > 0) {
        const prevDate = new Date(series!.versions[idx - 1].releaseDate);
        expect(date.getTime()).toBeGreaterThanOrEqual(prevDate.getTime());
      }
    });
  });

  it('should have unique series IDs', () => {
    const seriesIds = MODEL_VERSION_REGISTRY.map(s => s.seriesId);
    const uniqueIds = new Set(seriesIds);
    expect(uniqueIds.size).toBe(seriesIds.length);
  });

  it('should have unique version IDs within each series', () => {
    MODEL_VERSION_REGISTRY.forEach(series => {
      const versionIds = series.versions.map(v => v.id);
      const uniqueIds = new Set(versionIds);
      expect(uniqueIds.size).toBe(versionIds.length);
    });
  });

  it('should match normalized model IDs from existing system', () => {
    // Test that our canonical IDs match the normalization from modelIdUtils
    const testCases = [
      { input: 'openrouter:openai/gpt-4o', expected: 'openai-gpt-4o' },
      { input: 'anthropic:claude-3-5-haiku-20241022', expected: 'anthropic-claude-haiku' },
      { input: 'openrouter:x-ai/grok-3', expected: 'xai-grok' },
      { input: 'google:gemini-2.5-flash', expected: 'google-gemini-flash' },
    ];

    testCases.forEach(({ input, expected }) => {
      const result = findSeriesForModel(input);
      expect(result?.seriesId).toBe(expected);
    });
  });

  it('should handle all provided model samples', () => {
    const samples = [
      'openai:gpt-4o-2024-11-20',
      'openai:gpt-4o-2024-08-06',
      'openai:gpt-4o-2024-05-13',
      'openrouter:openai/gpt-4.1',
      'openrouter:anthropic/claude-sonnet-4',
      'openrouter:anthropic/claude-3.5-haiku',
      'anthropic:claude-3-7-sonnet-20250219',
      'anthropic:claude-3-5-sonnet-20241022',
      'openrouter:google/gemini-2.5-flash',
      'openrouter:x-ai/grok-3',
      'openrouter:x-ai/grok-4',
    ];

    const unmatched: string[] = [];
    samples.forEach(modelId => {
      const result = findSeriesForModel(modelId);
      if (!result) {
        unmatched.push(modelId);
      }
    });

    if (unmatched.length > 0) {
      console.warn('Unmatched models:', unmatched);
    }
    expect(unmatched.length).toBe(0);
  });
});
