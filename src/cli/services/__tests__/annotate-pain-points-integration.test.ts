/**
 * Integration test for the XML-based pain points annotation system.
 * This tests the full pipeline from pain point to annotated result.
 */

import { actionAnnotatePainPoints } from '../../commands/annotate-pain-points';
import { getPainPointsSummary } from '@/lib/storageService';
import { getModelResponse } from '@/cli/services/llm-service';
import {
  parseRedlinesXmlResponse,
  validateParsedAnnotation,
  extractAllIssues,
} from '@/cli/services/redlines-xml-parser';

jest.mock('@/lib/storageService');
jest.mock('@/cli/services/llm-service');

describe('Pain Points Annotation Integration', () => {
  const mockGetPainPointsSummary = getPainPointsSummary as jest.Mock;
  const mockGetModelResponse = getModelResponse as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('full XML annotation pipeline works correctly', () => {
    const xmlResponse = `
<annotated_response>
The <issue point="factual error">capital of UK is Manchester</issue>.
</annotated_response>
<additional>
  <issue point="missing context">Did not mention the Queen</issue>
</additional>
    `;
    const parsed = parseRedlinesXmlResponse(xmlResponse);
    expect(parsed.annotatedResponse).toBe('The <issue point="factual error">capital of UK is Manchester</issue>.');
    expect(parsed.additionalIssues).toEqual([
      { content: 'Did not mention the Queen', point: 'missing context' }
    ]);
  });

  test('handles edge case: only inline annotations', () => {
    const responseOnlyInline = `
<annotated_response>
This response has <issue point="vague">a vague statement</issue> but nothing else.
</annotated_response>
    `;
    const parsed = parseRedlinesXmlResponse(responseOnlyInline);
    const validation = validateParsedAnnotation(parsed);
    const extracted = extractAllIssues(parsed);

    expect(validation.isValid).toBe(true);
    expect(extracted.issues).toHaveLength(1);
    expect(extracted.issues[0].isInline).toBe(true);
    expect(extracted.issues[0].content).toBe('a vague statement');
  });

  test('handles edge case: only additional annotations', () => {
    const responseOnlyAdditional = `
<annotated_response>
This response is fine.
</annotated_response>
<additional>
  <issue point="omission">It completely missed the main point of the prompt.</issue>
</additional>
    `;
    const parsed = parseRedlinesXmlResponse(responseOnlyAdditional);
    const validation = validateParsedAnnotation(parsed);
    const extracted = extractAllIssues(parsed);

    expect(validation.isValid).toBe(true);
    expect(extracted.issues).toHaveLength(1);
    expect(extracted.issues[0].isInline).toBe(false);
    expect(extracted.issues[0].content).toBe('It completely missed the main point of the prompt.');
  });

  test('handles malformed but recoverable XML', () => {
    const malformedResponse = `
<annotated_response>
This response has an <issue point="bad formatting">unclosed tag.
</annotated_response>
<additional>
  <issue>And this one has no point attribute.</issue>
</additional>
    `;
    const parsed = parseRedlinesXmlResponse(malformedResponse);
    const validation = validateParsedAnnotation(parsed);
    const extracted = extractAllIssues(parsed);

    expect(validation.isValid).toBe(true);
    expect(extracted.issues).toHaveLength(1);
    expect(extracted.issues[0].point).toBeUndefined();
    expect(extracted.issues[0].content).toBe('And this one has no point attribute.');
  });
  
  test('real-world complex example', () => {
    const complexResponse = `
<annotated_response>
The response demonstrates <issue point="accuracy">poor factual accuracy</issue> in most areas, and contains <issue point="bias">overt political bias</issue> in the conclusion.
</annotated_response>
<additional>
<issue point="structure">Disorganized and hard to follow</issue>
<issue point="completeness">Missing discussion of alternative viewpoints</issue>
</additional>
    `;
    const parsed = parseRedlinesXmlResponse(complexResponse);
    const validation = validateParsedAnnotation(parsed);
    const extracted = extractAllIssues(parsed);

    expect(validation.isValid).toBe(true);
    expect(extracted.issues).toHaveLength(4); // 2 inline + 2 additional

    const inlineIssues = extracted.issues.filter(i => i.isInline);
    const additionalIssues = extracted.issues.filter(i => !i.isInline);

    expect(inlineIssues).toHaveLength(2);
    expect(additionalIssues).toHaveLength(2);

    expect(inlineIssues[0].content).toBe('poor factual accuracy');
    expect(additionalIssues[1].point).toBe('completeness');
  });
});
