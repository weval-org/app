import { parseConfigReferences } from '../model-summary-service';

describe('Model Summary Service', () => {
  describe('parseConfigReferences', () => {
    test('should convert config references to markdown links', () => {
      const input = 'The model excels in <ref config="dmv-registration-renewal" title="DMV Registration Renewal" /> tasks.';
      const expected = 'The model excels in [DMV Registration Renewal](/analysis/dmv-registration-renewal) tasks.';
      
      const result = parseConfigReferences(input);
      
      expect(result).toBe(expected);
    });

    test('should handle multiple config references', () => {
      const input = 'Performance varies between <ref config="task-a" title="Task A" /> and <ref config="task-b" title="Task B" />.';
      const expected = 'Performance varies between [Task A](/analysis/task-a) and [Task B](/analysis/task-b).';
      
      const result = parseConfigReferences(input);
      
      expect(result).toBe(expected);
    });

    test('should use config id as title when title is missing', () => {
      const input = 'See <ref config="test-config" /> for details.';
      const expected = 'See [test-config](/analysis/test-config) for details.';
      
      const result = parseConfigReferences(input);
      
      expect(result).toBe(expected);
    });

    test('should leave non-config references unchanged', () => {
      const input = 'This is <ref unknown="value" /> unchanged text.';
      const expected = 'This is <ref unknown="value" /> unchanged text.';
      
      const result = parseConfigReferences(input);
      
      expect(result).toBe(expected);
    });

    test('should handle text without references', () => {
      const input = 'This is plain text without any references.';
      const expected = 'This is plain text without any references.';
      
      const result = parseConfigReferences(input);
      
      expect(result).toBe(expected);
    });
  });
});