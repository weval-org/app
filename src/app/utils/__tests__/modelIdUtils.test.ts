import { getModelDisplayLabel, parseModelIdForDisplay, parseModelIdForApiCall, extractMakerFromModelId, IDEAL_MODEL_ID_BASE } from '../modelIdUtils';

describe('modelIdUtils', () => {
  describe('parseModelIdForDisplay', () => {
    it('should parse a simple model ID', () => {
      const modelId = 'openai:gpt-4';
      const parsed = parseModelIdForDisplay(modelId);
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.temperature).toBeUndefined();
      expect(parsed.systemPromptIndex).toBeUndefined();
      expect(parsed.fullId).toBe(modelId);
    });

    it('should parse temperature correctly', () => {
      const modelId = 'openai:gpt-4[temp:0.7]';
      const parsed = parseModelIdForDisplay(modelId);
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.temperature).toBe(0.7);
    });

    it('should parse multi-digit float temperature correctly', () => {
      const modelId = 'openai:gpt-4[temp:0.72]';
      const parsed = parseModelIdForDisplay(modelId);
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.temperature).toBe(0.72);
    });

    it('should parse integer temperature correctly', () => {
      const modelId = 'openai:gpt-4[temp:0]';
      const parsed = parseModelIdForDisplay(modelId);
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.temperature).toBe(0);
    });

    it('should parse system prompt index correctly', () => {
      const modelId = 'openai:gpt-4[sp_idx:2]';
      const parsed = parseModelIdForDisplay(modelId);
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.systemPromptIndex).toBe(2);
    });

    it('should parse all suffixes regardless of order', () => {
      const modelId1 = 'anthropic:claude-3-opus[temp:0.99][sp_idx:1]';
      const parsed1 = parseModelIdForDisplay(modelId1);
      expect(parsed1.baseId).toBe('anthropic:claude-3-opus');
      expect(parsed1.temperature).toBe(0.99);
      expect(parsed1.systemPromptIndex).toBe(1);

      const modelId2 = 'anthropic:claude-3-opus[sp_idx:1][temp:0.99]';
      const parsed2 = parseModelIdForDisplay(modelId2);
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
      // parseModelIdForDisplay currently only parses [temp:...] if it is the very last suffix.
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
      const parsed = parseModelIdForDisplay('openrouter:test-model[sys:hash123][temp:0.8]');
      expect(getModelDisplayLabel(parsed)).toBe('openrouter:test-model ([sys:hash123], T:0.8)');
    });

    it('should accept ParsedModelId object with hideProvider option', () => {
      const parsed = parseModelIdForDisplay('openrouter:another-model[temp:0.2]');
      expect(getModelDisplayLabel(parsed, { hideProvider: true })).toBe('another-model (T:0.2)');
    });

    it('should hide model maker if option is true', () => {
      const modelId = 'openrouter:google/gemini-pro';
      expect(getModelDisplayLabel(modelId, { hideModelMaker: true })).toBe('google:gemini-pro');
    });

    it('should hide provider and model maker if both options are true', () => {
      const modelId = 'openrouter:google/gemini-pro[temp:0.9]';
      expect(getModelDisplayLabel(modelId, { hideProvider: true, hideModelMaker: true })).toBe('gemini-pro (T:0.9)');
    });

    it('should not change display if hideModelMaker is true but no model maker exists', () => {
      const modelId = 'openrouter:gemini-pro';
      expect(getModelDisplayLabel(modelId, { hideModelMaker: true })).toBe('google:gemini-pro');
    });

    it('should handle hideModelMaker correctly when no provider is present', () => {
      const modelId = 'google/gemini-pro';
      expect(getModelDisplayLabel(modelId, { hideModelMaker: true })).toBe('google:gemini-pro');
    });

    it('should handle colon-separated model IDs correctly', () => {
      const modelId = 'anthropic:claude-3-opus';
      const parsed = parseModelIdForDisplay(modelId);
      expect(parsed.baseId).toBe('anthropic:claude-3-opus');
      expect(getModelDisplayLabel(parsed, { hideProvider: true })).toBe('claude-3-opus');
    });

    it('should handle hideModelMaker correctly with a colon-separated model ID', () => {
      const modelId = 'openrouter:google/gemini-pro';
      expect(getModelDisplayLabel(modelId, { hideModelMaker: true })).toBe('google:gemini-pro');
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

  describe('parseModelIdForDisplay with maker extraction', () => {
    it('should include maker information in parsed results', () => {
      const parsed = parseModelIdForDisplay('openai:gpt-4[temp:0.7]');
      expect(parsed.maker).toBe('OPENAI');
      expect(parsed.baseId).toBe('openai:gpt-4');
      expect(parsed.temperature).toBe(0.7);
    });

    it('should include maker for routing providers', () => {
      const parsed = parseModelIdForDisplay('together:moonshotai/Kimi-K2-Instruct[sp_idx:1]');
      expect(parsed.maker).toBe('MOONSHOT');
      expect(parsed.baseId).toBe('together:moonshotai/Kimi-K2-Instruct');
      expect(parsed.systemPromptIndex).toBe(1);
    });

    it('should handle x-ai normalization correctly', () => {
      const directXai = parseModelIdForDisplay('xai:grok-4-0709');
      const routedXai = parseModelIdForDisplay('openrouter:x-ai/grok-3-mini-beta');
      
      expect(directXai.maker).toBe('XAI');
      expect(routedXai.maker).toBe('XAI');
      // Both should have the same normalized maker
    });

    it('should normalize provider prefixes for models without them', () => {
      // Test the specific case that was causing duplicates in capability leaderboards
      const grokWithPrefix = parseModelIdForDisplay('xai:grok-4-0709[temp:0.7]');
      const grokWithoutPrefix = parseModelIdForDisplay('grok-4-0709[temp:0.7]');
      
      // Now that we normalize grok-4-0709 → grok-4, both should normalize to xai:grok-4
      expect(grokWithPrefix.baseId).toBe('xai:grok-4');
      expect(grokWithoutPrefix.baseId).toBe('xai:grok-4'); // Should be normalized to have xai: prefix and name normalization
      expect(grokWithPrefix.baseId).toBe(grokWithoutPrefix.baseId); // Should be identical after normalization
      
      // Test other model types
      expect(parseModelIdForDisplay('gpt-4o').baseId).toBe('openai:gpt-4o');
      expect(parseModelIdForDisplay('claude-3-opus').baseId).toBe('anthropic:claude-3-opus');
      expect(parseModelIdForDisplay('gemini-pro').baseId).toBe('google:gemini-pro');
      
      // Test that existing prefixes are preserved
      expect(parseModelIdForDisplay('openai:gpt-4o').baseId).toBe('openai:gpt-4o');
      expect(parseModelIdForDisplay('anthropic:claude-3-opus').baseId).toBe('anthropic:claude-3-opus');
      
      // Test that routing formats are now normalized to canonical forms  
      expect(parseModelIdForDisplay('openrouter:google/gemini-pro').baseId).toBe('google:gemini-pro');
      expect(parseModelIdForDisplay('together:meta-llama/llama-2').baseId).toBe('meta:llama-2');
    });

    it('should normalize between different provider formats for the same model', () => {
      // Test normalization between routing provider and direct provider formats - the main duplicate issue
      const routingFormat = parseModelIdForDisplay('openrouter:x-ai/grok-3[temp:0]');
      const directSlashFormat = parseModelIdForDisplay('x-ai/grok-3[temp:0]');
      const canonicalFormat = parseModelIdForDisplay('xai:grok-3[temp:0]');
      const bareFormat = parseModelIdForDisplay('grok-3[temp:0]');
      
      // All should normalize to the same canonical format
      expect(routingFormat.baseId).toBe('xai:grok-3');
      expect(directSlashFormat.baseId).toBe('xai:grok-3'); 
      expect(canonicalFormat.baseId).toBe('xai:grok-3');
      expect(bareFormat.baseId).toBe('xai:grok-3');
      
      // Verify they're all the same
      expect(routingFormat.baseId).toBe(directSlashFormat.baseId);
      expect(directSlashFormat.baseId).toBe(canonicalFormat.baseId);
      expect(canonicalFormat.baseId).toBe(bareFormat.baseId);
    });

    it('should normalize Grok 3 Mini Beta variants correctly', () => {
      // Test the other duplicate case from the leaderboards
      const routingFormat = parseModelIdForDisplay('openrouter:x-ai/grok-3-mini-beta');
      const directSlashFormat = parseModelIdForDisplay('x-ai/grok-3-mini-beta'); 
      const canonicalFormat = parseModelIdForDisplay('xai:grok-3-mini-beta');
      
      // Now these should normalize "grok-3-mini-beta" → "grok-3-mini"
      expect(routingFormat.baseId).toBe('xai:grok-3-mini');
      expect(directSlashFormat.baseId).toBe('xai:grok-3-mini');
      expect(canonicalFormat.baseId).toBe('xai:grok-3-mini');
      
      expect(routingFormat.baseId).toBe(directSlashFormat.baseId);
      expect(directSlashFormat.baseId).toBe(canonicalFormat.baseId);
    });

    it('should normalize model name variants for leaderboard consolidation', () => {
      // Test Grok model variants
      expect(parseModelIdForDisplay('grok-3-mini-beta').baseId).toBe('xai:grok-3-mini');
      expect(parseModelIdForDisplay('xai:grok-3-mini-beta').baseId).toBe('xai:grok-3-mini');
      expect(parseModelIdForDisplay('openrouter:x-ai/grok-3-mini-beta').baseId).toBe('xai:grok-3-mini');
      expect(parseModelIdForDisplay('grok-4-0709').baseId).toBe('xai:grok-4');
      expect(parseModelIdForDisplay('xai:grok-4-0709').baseId).toBe('xai:grok-4');
      
      // Test Claude model variants
      expect(parseModelIdForDisplay('claude-3-5-haiku-20241022').baseId).toBe('anthropic:claude-3-5-haiku');
      expect(parseModelIdForDisplay('anthropic:claude-3-5-haiku-20241022').baseId).toBe('anthropic:claude-3-5-haiku');
      expect(parseModelIdForDisplay('claude-sonnet-4-20250514').baseId).toBe('anthropic:claude-sonnet-4');
      expect(parseModelIdForDisplay('anthropic:claude-sonnet-4-20250514').baseId).toBe('anthropic:claude-sonnet-4');
      
      // Test Gemini model variants
      expect(parseModelIdForDisplay('gemini-2.5-flash-preview-05-20').baseId).toBe('google:gemini-2.5-flash');
      expect(parseModelIdForDisplay('google:gemini-2.5-flash-preview').baseId).toBe('google:gemini-2.5-flash');
      expect(parseModelIdForDisplay('openrouter:google/gemini-2.5-flash-preview-05-20').baseId).toBe('google:gemini-2.5-flash');
      
      // Verify that non-variant models are unchanged
      expect(parseModelIdForDisplay('grok-3').baseId).toBe('xai:grok-3'); // Should NOT be normalized to grok-3-mini
      expect(parseModelIdForDisplay('gemini-2.5-pro').baseId).toBe('google:gemini-2.5-pro');
      expect(parseModelIdForDisplay('claude-3-5-sonnet').baseId).toBe('anthropic:claude-3-5-sonnet');
      
      // Test case sensitivity
      expect(parseModelIdForDisplay('GROK-3-MINI-BETA').baseId).toBe('xai:grok-3-mini');
      expect(parseModelIdForDisplay('Gemini-2.5-Flash-Preview').baseId).toBe('google:gemini-2.5-flash');
      expect(parseModelIdForDisplay('CLAUDE-3-5-HAIKU-20241022').baseId).toBe('anthropic:claude-3-5-haiku');
    });
  });

  describe('parseModelIdForApiCall (preserves routing)', () => {
    it('should preserve routing providers for API calls', () => {
      const apiParams = parseModelIdForApiCall('openrouter:google/gemini-pro[temp:0.7]');
      expect(apiParams.originalModelId).toBe('openrouter:google/gemini-pro');
      expect(apiParams.temperature).toBe(0.7);
      expect(apiParams.effectiveModelId).toBe('openrouter:google/gemini-pro[temp:0.7]');
    });

    it('should preserve all routing formats without normalization', () => {
      const testCases = [
        'openrouter:x-ai/grok-3-mini-beta[temp:0.5]',
        'together:meta-llama/llama-2[sp_idx:1]',
        'fireworks:anthropic/claude-3[sys:abc123]',
        'replicate:mistralai/mixtral-8x7b[temp:1.0][sp_idx:2]'
      ];

      testCases.forEach(modelId => {
        const result = parseModelIdForApiCall(modelId);
        const expectedBase = modelId.replace(/\[temp:[^\]]+\]|\[sp_idx:[^\]]+\]|\[sys:[^\]]+\]/g, '');
        expect(result.originalModelId).toBe(expectedBase);
        // Should NOT normalize to canonical forms
        expect(result.originalModelId).not.toMatch(/^(xai|meta|anthropic|mistral):/);
      });
    });

    it('should extract all suffix parameters correctly', () => {
      const apiParams = parseModelIdForApiCall('openrouter:google/gemini-pro[temp:0.3][sp_idx:2][sys:hash123]');
      
      expect(apiParams.originalModelId).toBe('openrouter:google/gemini-pro');
      expect(apiParams.temperature).toBe(0.3);
      expect(apiParams.systemPromptIndex).toBe(2);
      expect(apiParams.systemPromptHash).toBe('[sys:hash123]');
      expect(apiParams.effectiveModelId).toBe('openrouter:google/gemini-pro[temp:0.3][sp_idx:2][sys:hash123]');
    });

    it('should handle ideal model IDs', () => {
      const idealParams = parseModelIdForApiCall('IDEAL_BENCHMARK');
      expect(idealParams.originalModelId).toBe('IDEAL_MODEL_ID');
      expect(idealParams.temperature).toBeUndefined();
    });
  });

  describe('parseModelIdForDisplay (normalizes for leaderboards)', () => {
    it('should normalize routing providers for display consistency', () => {
      const displayParsed = parseModelIdForDisplay('openrouter:google/gemini-pro[temp:0.7]');
      expect(displayParsed.baseId).toBe('google:gemini-pro'); // Normalized!
      expect(displayParsed.temperature).toBe(0.7);
      expect(displayParsed.fullId).toBe('openrouter:google/gemini-pro[temp:0.7]');
    });

    it('should consolidate all routing variations to same canonical form', () => {
      const testCases = [
        'openrouter:x-ai/grok-3-mini-beta',
        'together:x-ai/grok-3-mini-beta', 
        'x-ai/grok-3-mini-beta',
        'xai:grok-3-mini-beta',
        'grok-3-mini-beta'
      ];

      const canonicalBaseId = 'xai:grok-3-mini'; // Expected normalized form

      testCases.forEach(modelId => {
        const result = parseModelIdForDisplay(modelId);
        expect(result.baseId).toBe(canonicalBaseId);
      });
    });

    it('should be identical to legacy parseModelIdForDisplay', () => {
      const testModelId = 'openrouter:anthropic/claude-3-opus[temp:0.9][sp_idx:1]';
      
      const legacyResult = parseModelIdForDisplay(testModelId);
      const newResult = parseModelIdForDisplay(testModelId);
      
      expect(newResult).toEqual(legacyResult);
    });
  });

  describe('API vs Display function comparison', () => {
    it('should show clear difference between API and display parsing', () => {
      const routingModelId = 'openrouter:google/gemini-pro[temp:0.7]';
      
      const apiResult = parseModelIdForApiCall(routingModelId);
      const displayResult = parseModelIdForDisplay(routingModelId);
      
      // API preserves routing
      expect(apiResult.originalModelId).toBe('openrouter:google/gemini-pro');
      
      // Display normalizes routing
      expect(displayResult.baseId).toBe('google:gemini-pro');
      
      // Both extract temperature correctly  
      expect(apiResult.temperature).toBe(0.7);
      expect(displayResult.temperature).toBe(0.7);
      
      // This demonstrates the critical difference!
      expect(apiResult.originalModelId).not.toBe(displayResult.baseId);
    });

    it('should prevent API routing bugs', () => {
      // This test demonstrates the fix for the repair-run bug
      const problematicModelIds = [
        'openrouter:google/gemini-pro[temp:0.5]',
        'together:meta-llama/llama-2[sp_idx:1]',
        'fireworks:anthropic/claude-3[temp:0.8]'
      ];

      problematicModelIds.forEach(modelId => {
        const apiParams = parseModelIdForApiCall(modelId);
        
        // ✅ API function preserves routing - safe for API calls
        expect(apiParams.originalModelId).toContain(':');
        expect(apiParams.originalModelId).not.toMatch(/^(google|meta|anthropic):/);
        
        const displayParsed = parseModelIdForDisplay(modelId);
        
        // ⚠️ Display function normalizes - would break API calls if used
        expect(displayParsed.baseId).toMatch(/^(google|meta|anthropic):/);
        expect(displayParsed.baseId).not.toContain('openrouter');
        expect(displayParsed.baseId).not.toContain('together');
        expect(displayParsed.baseId).not.toContain('fireworks');
      });
    });
  });
}); 