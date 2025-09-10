import { ControlSignalHelpers, CONTROL_SIGNALS, CONTROL_PATTERNS } from '../utils/control-signals';

describe('Story API - Control Signals', () => {
  describe('ControlSignalHelpers.extractCtas', () => {
    it('should extract single CTA', () => {
      const text = 'Hello there! <cta>Click me</cta> Thanks.';
      const ctas = ControlSignalHelpers.extractCtas(text);
      expect(ctas).toEqual(['Click me']);
    });

    it('should extract multiple CTAs', () => {
      const text = 'Choose: <cta>Option A</cta> or <cta>Option B</cta>';
      const ctas = ControlSignalHelpers.extractCtas(text);
      expect(ctas).toEqual(['Option A', 'Option B']);
    });

    it('should handle nested content in CTAs', () => {
      const text = 'Try: <cta>Run a quick test with "special" characters & symbols</cta>';
      const ctas = ControlSignalHelpers.extractCtas(text);
      expect(ctas).toEqual(['Run a quick test with "special" characters & symbols']);
    });

    it('should ignore empty CTAs', () => {
      const text = 'Empty: <cta></cta> and <cta>   </cta> and <cta>Valid</cta>';
      const ctas = ControlSignalHelpers.extractCtas(text);
      expect(ctas).toEqual(['Valid']);
    });

    it('should handle malformed CTAs gracefully', () => {
      const text = 'Broken: <cta>Unclosed and <cta>Valid</cta>';
      const ctas = ControlSignalHelpers.extractCtas(text);
      // The regex will match the longest valid CTA it can find
      expect(ctas).toEqual(['Unclosed and <cta>Valid']);
    });

    it('should handle text with no CTAs', () => {
      const text = 'Just plain text here.';
      const ctas = ControlSignalHelpers.extractCtas(text);
      expect(ctas).toEqual([]);
    });
  });

  describe('ControlSignalHelpers.extractQuickResult', () => {
    it('should extract valid JSON quick result', () => {
      const result = { prompts: [{ id: 'test', models: [] }] };
      const text = `Results: <quick_result>${JSON.stringify(result)}</quick_result>`;
      const extracted = ControlSignalHelpers.extractQuickResult(text);
      expect(extracted).toEqual(result);
    });

    it('should return null for invalid JSON', () => {
      const text = 'Results: <quick_result>{ invalid json }</quick_result>';
      const extracted = ControlSignalHelpers.extractQuickResult(text);
      expect(extracted).toBeNull();
    });

    it('should return null when no quick_result tag', () => {
      const text = 'Just regular text here.';
      const extracted = ControlSignalHelpers.extractQuickResult(text);
      expect(extracted).toBeNull();
    });

    it('should handle complex nested JSON', () => {
      const result = {
        prompts: [{
          id: 'complex',
          promptText: 'Test with "quotes" and \n newlines',
          models: [{ modelId: 'test', response: 'Complex response with {braces}' }]
        }]
      };
      const text = `<quick_result>${JSON.stringify(result)}</quick_result>`;
      const extracted = ControlSignalHelpers.extractQuickResult(text);
      expect(extracted.prompts[0].promptText).toContain('quotes');
      expect(extracted.prompts[0].models[0].response).toContain('{braces}');
    });
  });

  describe('ControlSignalHelpers.cleanText', () => {
    it('should remove all control signals', () => {
      const text = 'Hello <ready_to_begin/> there <cta>Click</cta> and <update_eval/> done.';
      const cleaned = ControlSignalHelpers.cleanText(text);
      expect(cleaned).toBe('Hello  there  and  done.');
    });

    it('should handle text with quick_result blocks', () => {
      const text = 'Before <quick_result>{"test": true}</quick_result> after.';
      const cleaned = ControlSignalHelpers.cleanText(text);
      expect(cleaned).toBe('Before  after.');
    });

    it('should preserve regular text', () => {
      const text = 'This is just regular text with no special tags.';
      const cleaned = ControlSignalHelpers.cleanText(text);
      expect(cleaned).toBe(text);
    });
  });

  describe('Signal detection helpers', () => {
    it('should detect ready signal case-insensitively', () => {
      expect(ControlSignalHelpers.hasReadySignal('Text <ready_to_begin/> more')).toBe(true);
      expect(ControlSignalHelpers.hasReadySignal('Text <READY_TO_BEGIN/> more')).toBe(true);
      expect(ControlSignalHelpers.hasReadySignal('No signal here')).toBe(false);
    });

    it('should detect update signal case-insensitively', () => {
      expect(ControlSignalHelpers.hasUpdateSignal('Text <update_eval/> more')).toBe(true);
      expect(ControlSignalHelpers.hasUpdateSignal('Text <UPDATE_EVAL/> more')).toBe(true);
      expect(ControlSignalHelpers.hasUpdateSignal('No signal here')).toBe(false);
    });

    it('should detect JSON blocks', () => {
      expect(ControlSignalHelpers.hasJsonBlock('<JSON>{"test": true}</JSON>')).toBe(true);
      expect(ControlSignalHelpers.hasJsonBlock('<json>{"test": true}</json>')).toBe(true);
      expect(ControlSignalHelpers.hasJsonBlock('No JSON here')).toBe(false);
    });
  });

  describe('Wrapper helpers', () => {
    it('should wrap CTA text correctly', () => {
      const wrapped = ControlSignalHelpers.wrapCta('Click me');
      expect(wrapped).toBe('<cta>Click me</cta>');
    });

    it('should wrap quick result data', () => {
      const data = { test: true };
      const wrapped = ControlSignalHelpers.wrapQuickResult(data);
      expect(wrapped).toBe('<quick_result>{"test":true}</quick_result>');
    });

    it('should wrap blueprint YAML', () => {
      const yaml = 'title: "Test"\nprompts: []';
      const wrapped = ControlSignalHelpers.wrapBlueprintYaml(yaml);
      expect(wrapped).toBe('<BLUEPRINT_YAML>title: "Test"\nprompts: []</BLUEPRINT_YAML>');
    });
  });
});
