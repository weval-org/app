import { getModelDisplayLabel, parseEffectiveModelId, IDEAL_MODEL_ID_BASE } from '../modelIdUtils';

describe('modelIdUtils', () => {
  describe('getModelDisplayLabel', () => {
    it('should return the baseId if no sysPrompt or temp', () => {
      const modelId = 'openrouter:test-model';
      expect(getModelDisplayLabel(modelId)).toBe('openrouter:test-model');
    });

    it('should include system prompt hash if present', () => {
      const modelId = 'openrouter:test-model[sys:1a2b3c]';
      expect(getModelDisplayLabel(modelId)).toBe('openrouter:test-model ([sys:1a2b3c])');
    });

    it('should include temperature if present', () => {
      const modelId = 'openrouter:test-model[temp:0.7]';
      expect(getModelDisplayLabel(modelId)).toBe('openrouter:test-model (T:0.7)');
    });

    it('should include both sysPrompt and temp if present', () => {
      const modelId = 'openrouter:test-model[sys:1a2b3c][temp:0.5]';
      // Note: parseEffectiveModelId parses from right to left for suffixes
      expect(getModelDisplayLabel(modelId)).toBe('openrouter:test-model ([sys:1a2b3c], T:0.5)');
    });

    it('should correctly label when [temp:...] appears before [sys:...] in string (due to parsing order)', () => {
      // parseEffectiveModelId currently only parses [temp:...] if it is the very last suffix.
      // If [sys:...] is last, [temp:...] earlier in the string becomes part of the baseId.
      const modelIdWithTempBeforeSys = 'openrouter:test-model[temp:0.9][sys:xyz789]';
      // Expected: baseId will be 'openrouter:test-model[temp:0.9]', sysHash will be '[sys:xyz789]', temp will be undefined.
      // Label then becomes baseId + (sysHash)
      expect(getModelDisplayLabel(modelIdWithTempBeforeSys)).toBe('openrouter:test-model[temp:0.9] ([sys:xyz789])');
    });

    it('should hide provider if option is true', () => {
      const modelId = 'openrouter:test-model[temp:0.7]';
      expect(getModelDisplayLabel(modelId, { hideProvider: true })).toBe('test-model (T:0.7)');
    });

    it('should handle hide provider correctly for IDs without provider prefix but with colon', () => {
      const modelId = 'custom:group:model-x[sys:abc]';
      expect(getModelDisplayLabel(modelId, { hideProvider: true })).toBe('group:model-x ([sys:abc])');
    });

    it('should not change display if hideProvider is true but no provider prefix exists', () => {
      const modelId = 'test-model-no-provider[temp:0.3]';
      expect(getModelDisplayLabel(modelId, { hideProvider: true })).toBe('test-model-no-provider (T:0.3)');
    });

    it('should handle IDEAL_MODEL_ID_BASE correctly', () => {
      expect(getModelDisplayLabel(IDEAL_MODEL_ID_BASE)).toBe(IDEAL_MODEL_ID_BASE);
      expect(getModelDisplayLabel(IDEAL_MODEL_ID_BASE, { hideProvider: true })).toBe(IDEAL_MODEL_ID_BASE);
    });

    it('should handle IDEAL_BENCHMARK (legacy) correctly', () => {
      const idealBenchmark = 'IDEAL_BENCHMARK';
      expect(getModelDisplayLabel(idealBenchmark)).toBe(IDEAL_MODEL_ID_BASE);
      expect(getModelDisplayLabel(idealBenchmark, { hideProvider: true })).toBe(IDEAL_MODEL_ID_BASE);
    });

    it('should accept ParsedModelId object as input', () => {
      const parsed = parseEffectiveModelId('openrouter:test-model[sys:hash123][temp:0.8]');
      expect(getModelDisplayLabel(parsed)).toBe('openrouter:test-model ([sys:hash123], T:0.8)');
    });

    it('should accept ParsedModelId object with hideProvider option', () => {
      const parsed = parseEffectiveModelId('openrouter:another-model[temp:0.2]');
      expect(getModelDisplayLabel(parsed, { hideProvider: true })).toBe('another-model (T:0.2)');
    });
  });
}); 