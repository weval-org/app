import {
  parseRedlinesXmlResponse,
  extractAllIssues,
  validateParsedAnnotation,
  ParsedRedlinesAnnotation
} from '../redlines-xml-parser';

describe('Redlines XML Parser', () => {
  describe('parseRedlinesXmlResponse', () => {
    test('should parse basic annotated response with inline tags', () => {
      const input = `
<annotated_response>
  The capital of UK is London but <issue point="Manchester not definitively best">Manchester is the best city</issue>.
</annotated_response>
      `;

      const result = parseRedlinesXmlResponse(input);

      expect(result.annotatedResponse).toBe('The capital of UK is London but <issue point="Manchester not definitively best">Manchester is the best city</issue>.');
      expect(result.additionalIssues).toEqual([]);
    });

    test('should parse response with additional section', () => {
      const input = `
<annotated_response>
  The capital is correct.
</annotated_response>

<additional>
  <issue point="missing context">Lacks historical context</issue>
  <issue point="too brief">Could be more detailed</issue>
</additional>
      `;

      const result = parseRedlinesXmlResponse(input);

      expect(result.annotatedResponse).toBe('The capital is correct.');
      expect(result.additionalIssues).toEqual([
        { content: 'Lacks historical context', point: 'missing context' },
        { content: 'Could be more detailed', point: 'too brief' }
      ]);
    });

    test('should handle case-insensitive tags', () => {
      const input = `
<ANNOTATED_RESPONSE>
  Text with good stuff.
</ANNOTATED_RESPONSE>

<ADDITIONAL>
  <ISSUE point="test">Bad stuff</ISSUE>
</ADDITIONAL>
      `;

      const result = parseRedlinesXmlResponse(input);

      expect(result.annotatedResponse).toBe('Text with good stuff.');
      expect(result.additionalIssues).toEqual([
        { content: 'Bad stuff', point: 'test' }
      ]);
    });

    test('should handle response without wrapper tags (fallback)', () => {
      const input = 'The capital of UK is London but <issue point="bad">Manchester is best</issue>.';

      const result = parseRedlinesXmlResponse(input);

      expect(result.annotatedResponse).toBe(input);
      expect(result.additionalIssues).toEqual([]);
    });

    test('should handle multiline content within tags', () => {
      const input = `
<annotated_response>
  The response contains
  correct facts about geography but also
  <issue point="poor formatting">has formatting
  issues</issue>.
</annotated_response>
      `;

      const result = parseRedlinesXmlResponse(input);

      expect(result.annotatedResponse).toContain('has formatting\n  issues');
    });

    test('should handle empty sections gracefully', () => {
      const input = `
<annotated_response>
  Just plain text with no annotations.
</annotated_response>

<additional>
</additional>
      `;

      const result = parseRedlinesXmlResponse(input);

      expect(result.annotatedResponse).toBe('Just plain text with no annotations.');
      expect(result.additionalIssues).toEqual([]);
    });

    test('should handle malformed XML gracefully', () => {
      const input = `
<annotated_response>
  Text with <issue point="test">unclosed tag
</annotated_response>

<additional>
  <issue>No point attribute</issue>
</additional>
      `;

      const result = parseRedlinesXmlResponse(input);

      // Should still extract what it can
      expect(result.annotatedResponse).toContain('Text with <issue point="test">unclosed tag');
      expect(result.additionalIssues).toEqual([
        { content: 'No point attribute', point: undefined }
      ]);
    });

    test('should correctly parse point attributes containing apostrophes', () => {
      const input = `
        <additional>
          <issue point="3. Should include using a hen's egg or potato of similar size to test the solution's readiness.">The response does not include the method of using a hen's egg or potato to test the solution's readiness.</issue>
        </additional>
      `;
      const result = parseRedlinesXmlResponse(input);
      expect(result.additionalIssues).toHaveLength(1);
      expect(result.additionalIssues[0].point).toBe("3. Should include using a hen's egg or potato of similar size to test the solution's readiness.");
    });
  });

  describe('extractAllIssues', () => {
    test('should extract inline and additional annotations', () => {
      const parsed: ParsedRedlinesAnnotation = {
        annotatedResponse: 'The capital is London but <issue point="wrong">Paris is better</issue>.',
        additionalIssues: [
          { content: 'Missing context', point: undefined },
          { content: 'Too brief', point: undefined }
        ]
      };

      const result = extractAllIssues(parsed);

      expect(result.issues).toEqual([
        { content: 'Paris is better', point: 'wrong', isInline: true },
        { content: 'Missing context', isInline: false },
        { content: 'Too brief', isInline: false }
      ]);
    });

    test('should handle annotations without point attributes', () => {
      const parsed: ParsedRedlinesAnnotation = {
        annotatedResponse: 'Text with <issue>bad stuff</issue>.',
        additionalIssues: []
      };

      const result = extractAllIssues(parsed);

      expect(result.issues).toEqual([
        { content: 'bad stuff', point: undefined, isInline: true }
      ]);
    });

    test('should handle empty annotation content', () => {
      const parsed: ParsedRedlinesAnnotation = {
        annotatedResponse: 'Plain text with no annotations.',
        additionalIssues: []
      };

      const result = extractAllIssues(parsed);

      expect(result.issues).toEqual([]);
    });

    test('should handle complex nested content', () => {
      const parsed: ParsedRedlinesAnnotation = {
        annotatedResponse: 'Complex data with <issue point="bias">slight political bias</issue>.',
        additionalIssues: []
      };

      const result = extractAllIssues(parsed);

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toEqual({ 
        content: 'slight political bias', 
        point: 'bias', 
        isInline: true 
      });
    });
  });

  describe('validateParsedAnnotation', () => {
    test('should validate good annotation', () => {
      const parsed: ParsedRedlinesAnnotation = {
        annotatedResponse: 'Text with <issue point="good">annotations</issue>.',
        additionalIssues: []
      };

      const result = validateParsedAnnotation(parsed);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('should validate annotation with only additional content', () => {
      const parsed: ParsedRedlinesAnnotation = {
        annotatedResponse: 'Plain text with no inline annotations.',
        additionalIssues: [{ content: 'Bad structure', point: undefined }]
      };

      const result = validateParsedAnnotation(parsed);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('should reject empty annotated response', () => {
      const parsed: ParsedRedlinesAnnotation = {
        annotatedResponse: '',
        additionalIssues: [{ content: 'Some issue', point: undefined }]
      };

      const result = validateParsedAnnotation(parsed);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('No annotated response content found');
    });

    test('should reject annotation with no annotations at all', () => {
      const parsed: ParsedRedlinesAnnotation = {
        annotatedResponse: 'Plain text with no annotations whatsoever.',
        additionalIssues: []
      };

      const result = validateParsedAnnotation(parsed);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('No annotations found in response');
    });

    test('should accept annotation with issue tags', () => {
      const parsed: ParsedRedlinesAnnotation = {
        annotatedResponse: 'Text with <issue point="wrong">incorrect info</issue>.',
        additionalIssues: []
      };

      const result = validateParsedAnnotation(parsed);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('Integration scenarios', () => {
    test('should handle real-world example with only issues', () => {
      const input = `
<annotated_response>
  The capital of UK is London but <issue point="Manchester, per the rubric, is not definitively the best">Manchester is the best city</issue>.
</annotated_response>

<additional>
  <issue point="lacks supporting evidence">No citations or evidence provided for claims</issue>
</additional>
      `;

      const parsed = parseRedlinesXmlResponse(input);
      const validation = validateParsedAnnotation(parsed);
      const extracted = extractAllIssues(parsed);

      expect(validation.isValid).toBe(true);
      expect(extracted.issues).toHaveLength(2);

      // Check inline annotations
      expect(extracted.issues[0].content).toBe('Manchester is the best city');
      expect(extracted.issues[0].point).toBe('Manchester, per the rubric, is not definitively the best');
      expect(extracted.issues[0].isInline).toBe(true);

      // Check additional annotations
      expect(extracted.issues[1].content).toBe('No citations or evidence provided for claims');
      expect(extracted.issues[1].isInline).toBe(false);
    });
  });
});
