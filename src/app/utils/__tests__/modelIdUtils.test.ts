import { getModelDisplayLabel, parseEffectiveModelId, extractMakerFromModelId, IDEAL_MODEL_ID_BASE } from '../modelIdUtils';

describe('modelIdUtils', () => {
  describe('parseEffectiveModelId', () => {
    it('should parse a simple model ID', () => {
      const modelId = 'openai:gpt-4';
      const parsed = parseEffectiveModelId(modelId);
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.temperature).toBeUndefined();
      expect(parsed.systemPromptIndex).toBeUndefined();
      expect(parsed.fullId).toBe(modelId);
    });

    it('should parse temperature correctly', () => {
      const modelId = 'openai:gpt-4[temp:0.7]';
      const parsed = parseEffectiveModelId(modelId);
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.temperature).toBe(0.7);
    });

    it('should parse multi-digit float temperature correctly', () => {
      const modelId = 'openai:gpt-4[temp:0.72]';
      const parsed = parseEffectiveModelId(modelId);
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.temperature).toBe(0.72);
    });

    it('should parse integer temperature correctly', () => {
      const modelId = 'openai:gpt-4[temp:0]';
      const parsed = parseEffectiveModelId(modelId);
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.temperature).toBe(0);
    });

    it('should parse system prompt index correctly', () => {
      const modelId = 'openai:gpt-4[sp_idx:2]';
      const parsed = parseEffectiveModelId(modelId);
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.systemPromptIndex).toBe(2);
    });

    it('should parse all suffixes regardless of order', () => {
      const modelId1 = 'anthropic:claude-3-opus[temp:0.99][sp_idx:1]';
      const parsed1 = parseEffectiveModelId(modelId1);
      expect(parsed1.baseId).toBe('anthropic:claude-3-opus');
      expect(parsed1.temperature).toBe(0.99);
      expect(parsed1.systemPromptIndex).toBe(1);

      const modelId2 = 'anthropic:claude-3-opus[sp_idx:1][temp:0.99]';
      const parsed2 = parseEffectiveModelId(modelId2);
      expect(parsed2.baseId).toBe('anthropic:claude-3-opus');
      expect(parsed2.temperature).toBe(0.99);
      expect(parsed2.systemPromptIndex).toBe(1);
    });
  });

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

    it('should not include temperature suffix if temperature is 0', () => {
      const modelIdWithTempZero = 'openrouter:test-model[temp:0]';
      expect(getModelDisplayLabel(modelIdWithTempZero)).toBe('openrouter:test-model');

      const modelIdWithTempZeroAndSysPrompt = 'openrouter:test-model[sys:1a2b3c][temp:0]';
      expect(getModelDisplayLabel(modelIdWithTempZeroAndSysPrompt)).toBe('openrouter:test-model ([sys:1a2b3c])');

      const modelIdWithTempFloatZero = 'openrouter:test-model[temp:0.0]';
      expect(getModelDisplayLabel(modelIdWithTempFloatZero)).toBe('openrouter:test-model');
    });

    it('should include both sysPrompt and temp if present, regardless of order', () => {
      let modelId = 'openrouter:test-model[sys:1a2b3c][temp:0.5]';
      expect(getModelDisplayLabel(modelId)).toBe('openrouter:test-model ([sys:1a2b3c], T:0.5)');

      modelId = 'openrouter:test-model[temp:0.5][sys:1a2b3c]';
      expect(getModelDisplayLabel(modelId)).toBe('openrouter:test-model ([sys:1a2b3c], T:0.5)');
    });

    it('should correctly label when [temp:...] appears before [sys:...] in string (due to parsing order)', () => {
      // parseEffectiveModelId currently only parses [temp:...] if it is the very last suffix.
      // If [sys:...] is last, [temp:...] earlier in the string becomes part of the baseId.
      const modelIdWithTempBeforeSys = 'openrouter:test-model[temp:0.9][sys:xyz789]';
      // Expected: baseId will be 'openrouter:test-model[temp:0.9]', sysHash will be '[sys:xyz789]', temp will be undefined.
      // Label then becomes baseId + (sysHash)
      expect(getModelDisplayLabel(modelIdWithTempBeforeSys)).toBe('openrouter:test-model ([sys:xyz789], T:0.9)');
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

    it('should hide model maker if option is true', () => {
      const modelId = 'openrouter:google/gemini-pro';
      expect(getModelDisplayLabel(modelId, { hideModelMaker: true })).toBe('openrouter:gemini-pro');
    });

    it('should hide provider and model maker if both options are true', () => {
      const modelId = 'openrouter:google/gemini-pro[temp:0.9]';
      expect(getModelDisplayLabel(modelId, { hideProvider: true, hideModelMaker: true })).toBe('gemini-pro (T:0.9)');
    });

    it('should not change display if hideModelMaker is true but no model maker exists', () => {
      const modelId = 'openrouter:gemini-pro';
      expect(getModelDisplayLabel(modelId, { hideModelMaker: true })).toBe('openrouter:gemini-pro');
    });

    it('should handle hideModelMaker correctly when no provider is present', () => {
      const modelId = 'google/gemini-pro';
      expect(getModelDisplayLabel(modelId, { hideModelMaker: true })).toBe('gemini-pro');
    });

    it('should handle colon-separated model IDs correctly', () => {
      const modelId = 'anthropic:claude-3-opus';
      const parsed = parseEffectiveModelId(modelId);
      expect(parsed.baseId).toBe('anthropic:claude-3-opus');
      expect(getModelDisplayLabel(parsed, { hideProvider: true })).toBe('claude-3-opus');
    });

    it('should handle hideModelMaker correctly with a colon-separated model ID', () => {
      const modelId = 'openrouter:google/gemini-pro';
      expect(getModelDisplayLabel(modelId, { hideModelMaker: true })).toBe('openrouter:gemini-pro');
    });
  });

  describe('extractMakerFromModelId', () => {
    it('should extract makers from direct provider patterns', () => {
      expect(extractMakerFromModelId('openai:gpt-4')).toBe('OPENAI');
      expect(extractMakerFromModelId('anthropic:claude-3-opus')).toBe('ANTHROPIC');
      expect(extractMakerFromModelId('google:gemini-pro')).toBe('GOOGLE');
      expect(extractMakerFromModelId('xai:grok-4-0709')).toBe('XAI');
      expect(extractMakerFromModelId('x-ai:grok-beta')).toBe('XAI'); // normalized
    });

    it('should extract makers from routing providers', () => {
      expect(extractMakerFromModelId('openrouter:x-ai/grok-3-mini-beta')).toBe('XAI');
      expect(extractMakerFromModelId('together:moonshotai/Kimi-K2-Instruct')).toBe('MOONSHOT');
      expect(extractMakerFromModelId('together:meta-llama/Meta-Llama-3.1-405B')).toBe('META');
      expect(extractMakerFromModelId('fireworks:anthropic/claude-3-sonnet')).toBe('ANTHROPIC');
      expect(extractMakerFromModelId('replicate:mistralai/mixtral-8x7b')).toBe('MISTRAL');
    });

    it('should handle known provider mappings in routing providers', () => {
      expect(extractMakerFromModelId('openrouter:anthropic/claude-3')).toBe('ANTHROPIC');
      expect(extractMakerFromModelId('openrouter:google/gemini-pro')).toBe('GOOGLE');
      expect(extractMakerFromModelId('openrouter:meta-llama/llama-2')).toBe('META');
      expect(extractMakerFromModelId('openrouter:mistralai/mistral-7b')).toBe('MISTRAL');
      expect(extractMakerFromModelId('openrouter:openai/gpt-4')).toBe('OPENAI');
    });

    it('should normalize unknown routing provider names', () => {
      expect(extractMakerFromModelId('together:some-company/model')).toBe('SOME-COMPANY');
      expect(extractMakerFromModelId('openrouter:new-ai-company/model')).toBe('NEW-AI-COMPANY');
    });

    it('should return UNKNOWN for unrecognized patterns', () => {
      expect(extractMakerFromModelId('unknown-provider:model')).toBe('UNKNOWN');
      expect(extractMakerFromModelId('just-a-model-name')).toBe('UNKNOWN');
      expect(extractMakerFromModelId('')).toBe('UNKNOWN');
    });

    it('should handle model IDs with variants', () => {
      expect(extractMakerFromModelId('openai:gpt-4[temp:0.7]')).toBe('OPENAI');
      expect(extractMakerFromModelId('together:moonshotai/model[sp_idx:1][temp:0.5]')).toBe('MOONSHOT');
    });
  });

  describe('parseEffectiveModelId with maker extraction', () => {
    it('should include maker information in parsed results', () => {
      const parsed = parseEffectiveModelId('openai:gpt-4[temp:0.7]');
      expect(parsed.maker).toBe('OPENAI');
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.temperature).toBe(0.7);
    });

    it('should include maker for routing providers', () => {
      const parsed = parseEffectiveModelId('together:moonshotai/Kimi-K2-Instruct[sp_idx:1]');
      expect(parsed.maker).toBe('MOONSHOT');
      expect(parsed.baseId).toBe('together:moonshotai/Kimi-K2-Instruct');
      expect(parsed.systemPromptIndex).toBe(1);
    });

    it('should handle x-ai normalization correctly', () => {
      const directXai = parseEffectiveModelId('xai:grok-4-0709');
      const routedXai = parseEffectiveModelId('openrouter:x-ai/grok-3-mini-beta');
      
      expect(directXai.maker).toBe('XAI');
      expect(routedXai.maker).toBe('XAI');
      // Both should have the same normalized maker
    });
  });
}); 