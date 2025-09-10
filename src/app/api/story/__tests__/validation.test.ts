import { 
  sanitizeUserInput, 
  validateAndSanitizeMessages, 
  validateBlueprintStructure,
  sanitizeCtaText,
  LIMITS 
} from '../utils/validation';
import { CONTROL_PATTERNS } from '../utils/control-signals';

describe('Story API - Input Validation', () => {
  describe('sanitizeUserInput', () => {
    it('should remove script tags', () => {
      const input = 'Hello <script>alert("xss")</script> world';
      const sanitized = sanitizeUserInput(input);
      expect(sanitized).toBe('Hello  world');
    });

    it('should remove javascript: URLs', () => {
      const input = 'Click <a href="javascript:alert()">here</a>';
      const sanitized = sanitizeUserInput(input);
      expect(sanitized).toBe('Click here');
    });

    it('should remove event handlers', () => {
      const input = 'Button onclick="alert()" onmouseover="hack()"';
      const sanitized = sanitizeUserInput(input);
      expect(sanitized).toBe('Button');
    });

    it('should preserve legitimate control signals', () => {
      const input = 'Please <cta>run test</cta> and <ready_to_begin/>';
      const sanitized = sanitizeUserInput(input);
      expect(sanitized).toBe('Please <cta>run test</cta> and <ready_to_begin/>');
    });

    it('should remove dangerous HTML but keep text', () => {
      const input = 'Normal text <img src="x" onerror="alert()"> more text';
      const sanitized = sanitizeUserInput(input);
      expect(sanitized).toBe('Normal text  more text');
    });

    it('should handle non-string input', () => {
      expect(sanitizeUserInput(null as any)).toBe('');
      expect(sanitizeUserInput(undefined as any)).toBe('');
      expect(sanitizeUserInput(123 as any)).toBe('');
    });

    it('should truncate very long input', () => {
      const longInput = 'a'.repeat(LIMITS.MAX_MESSAGE_LENGTH + 1000);
      const sanitized = sanitizeUserInput(longInput);
      expect(sanitized.length).toBe(LIMITS.MAX_MESSAGE_LENGTH);
    });
  });

  describe('validateAndSanitizeMessages', () => {
    it('should validate and sanitize valid messages', () => {
      const messages = [
        { role: 'user', content: 'Hello there!' },
        { role: 'assistant', content: 'Hi! <cta>Click me</cta>' }
      ];
      const result = validateAndSanitizeMessages(messages);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello there!' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi! <cta>Click me</cta>' });
    });

    it('should filter out invalid messages', () => {
      const messages = [
        { role: 'user', content: 'Valid message' },
        { role: 'invalid', content: 'Bad role' },
        { role: 'user', content: '' }, // Too short
        { role: 'assistant' }, // No content
        null,
        undefined,
        'not an object'
      ];
      const result = validateAndSanitizeMessages(messages);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'user', content: 'Valid message' });
    });

    it('should sanitize message content', () => {
      const messages = [
        { role: 'user', content: 'Hello <script>alert("xss")</script> world' }
      ];
      const result = validateAndSanitizeMessages(messages);
      expect(result[0].content).toBe('Hello  world');
    });

    it('should limit context window size', () => {
      const messages = Array.from({ length: LIMITS.MAX_MESSAGES_IN_CONTEXT + 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`
      }));
      const result = validateAndSanitizeMessages(messages);
      expect(result.length).toBe(LIMITS.MAX_MESSAGES_IN_CONTEXT);
      // Should keep the most recent messages
      expect(result[result.length - 1].content).toBe(`Message ${messages.length - 1}`);
    });

    it('should handle non-array input', () => {
      expect(validateAndSanitizeMessages(null as any)).toEqual([]);
      expect(validateAndSanitizeMessages(undefined as any)).toEqual([]);
      expect(validateAndSanitizeMessages('not an array' as any)).toEqual([]);
    });
  });

  describe('validateBlueprintStructure', () => {
    it('should validate correct blueprint structure', () => {
      const blueprint = {
        title: 'Test Blueprint',
        prompts: [
          { id: 'test-1', promptText: 'What is AI?' },
          { id: 'test-2', promptText: 'How does ML work?', points: ['Explains concepts'] }
        ]
      };
      expect(validateBlueprintStructure(blueprint)).toBe(true);
    });

    it('should reject blueprint without prompts', () => {
      const blueprint = { title: 'Test Blueprint' };
      expect(validateBlueprintStructure(blueprint)).toBe(false);
    });

    it('should reject blueprint with empty prompts array', () => {
      const blueprint = { title: 'Test Blueprint', prompts: [] };
      expect(validateBlueprintStructure(blueprint)).toBe(false);
    });

    it('should reject prompts without required fields', () => {
      const blueprint = {
        prompts: [
          { id: 'test-1' }, // Missing promptText
          { promptText: 'What is AI?' }, // Missing id
          { id: '', promptText: 'Valid text' }, // Empty id
          { id: 'valid', promptText: '' }, // Empty promptText
        ]
      };
      expect(validateBlueprintStructure(blueprint)).toBe(false);
    });

    it('should handle non-object input', () => {
      expect(validateBlueprintStructure(null)).toBe(false);
      expect(validateBlueprintStructure(undefined)).toBe(false);
      expect(validateBlueprintStructure('string')).toBe(false);
      expect(validateBlueprintStructure([])).toBe(false);
    });
  });

  describe('sanitizeCtaText', () => {
    it('should remove angle brackets', () => {
      const input = 'Click <here> now';
      const sanitized = sanitizeCtaText(input);
      expect(sanitized).toBe('Click here now');
    });

    it('should remove dangerous protocols', () => {
      const input = 'javascript:alert() and data:text/html,<script>';
      const sanitized = sanitizeCtaText(input);
      expect(sanitized).toBe('alert() and text/html,script');
    });

    it('should truncate long CTA text', () => {
      const longInput = 'a'.repeat(200);
      const sanitized = sanitizeCtaText(longInput);
      expect(sanitized.length).toBe(100);
    });

    it('should handle non-string input', () => {
      expect(sanitizeCtaText(null as any)).toBe('');
      expect(sanitizeCtaText(undefined as any)).toBe('');
      expect(sanitizeCtaText(123 as any)).toBe('');
    });
  });

  describe('Pattern matching', () => {
    it('should match control patterns case-insensitively', () => {
      expect(CONTROL_PATTERNS.READY_TO_BEGIN.test('<ready_to_begin/>')).toBe(true);
      expect(CONTROL_PATTERNS.READY_TO_BEGIN.test('<READY_TO_BEGIN/>')).toBe(true);
      expect(CONTROL_PATTERNS.UPDATE_EVAL.test('<update_eval/>')).toBe(true);
      expect(CONTROL_PATTERNS.UPDATE_EVAL.test('<UPDATE_EVAL/>')).toBe(true);
    });

    it('should match JSON blocks case-insensitively', () => {
      expect(CONTROL_PATTERNS.JSON_BLOCK.test('<JSON>{"test": true}</JSON>')).toBe(true);
      expect(CONTROL_PATTERNS.JSON_BLOCK.test('<json>{"test": true}</json>')).toBe(true);
    });
  });
});
