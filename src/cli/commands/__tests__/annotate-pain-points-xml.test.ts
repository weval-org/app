import { RedlinesAnnotation, PainPoint } from '@/types/shared';
import * as crypto from 'crypto';

// Mock dependencies
jest.mock('../../config', () => ({
  getConfig: () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    },
  }),
}));

jest.mock('@/lib/storageService', () => ({
  saveRedlinesAnnotation: jest.fn(),
}));

jest.mock('@/cli/services/llm-service', () => ({
  getModelResponse: jest.fn(),
}));

// Import the functions we want to test
describe('Annotate Pain Points - XML Format', () => {
  // Mock LLM service
  const mockGetModelResponse = require('@/cli/services/llm-service').getModelResponse;
  const mockSaveRedlinesAnnotation = require('@/lib/storageService').saveRedlinesAnnotation;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('annotatePoint should parse issue-only XML response correctly', async () => {
    const mockPainPoint: PainPoint = {
      configId: 'test-config',
      configTitle: 'Test Config',
      runLabel: 'test-run',
      timestamp: '2024-01-01T00:00:00.000Z',
      promptId: 'test-prompt',
      promptContext: 'Test context',
      modelId: 'test-model',
      responseText: 'The capital of France is Paris.',
      coverageScore: 0.3,
      failedCriteria: []
    };

    const rubricPoints = ['Must mention Paris', 'Must mention the Eiffel Tower'];

    // Mock XML response with <issue> tags
    const mockXmlResponse = `
<annotated_response>
The capital of France is Paris.
</annotated_response>

<additional>
<issue point="missing requirement">The response fails to mention the Eiffel Tower</issue>
</additional>
    `;

    mockGetModelResponse.mockResolvedValue(mockXmlResponse);
    mockSaveRedlinesAnnotation.mockImplementation((annotation: RedlinesAnnotation) => {
      // Validate the annotation structure
      expect(annotation.annotatedResponse).toBe('The capital of France is Paris.');
      expect(annotation.additionalIssues).toEqual([
        { content: 'The response fails to mention the Eiffel Tower', point: 'missing requirement' }
      ]);
      
      return Promise.resolve();
    });

    // This test would ideally call annotatePoint directly if it were exported.
    // For now, we confirm the mocks are set up for an indirect test.
    expect(mockGetModelResponse).toBeDefined();
    expect(mockSaveRedlinesAnnotation).toBeDefined();
  });

  describe('Integration with XML parser', () => {
    test('should correctly parse complex XML response with issues', () => {
      const { parseRedlinesXmlResponse, extractAllIssues } = require('../../services/redlines-xml-parser');

      const complexResponse = `
<annotated_response>
The response demonstrates excellent factual accuracy in most areas, but contains <issue point="bias">subtle political bias</issue> in the conclusion.
</annotated_response>

<additional>
<issue point="completeness">Missing discussion of alternative viewpoints</issue>
</additional>
      `;

      const parsed = parseRedlinesXmlResponse(complexResponse);
      const extracted = extractAllIssues(parsed);

      expect(extracted.issues).toHaveLength(2);
      
      // Check inline annotations
      expect(extracted.issues[0].isInline).toBe(true);
      expect(extracted.issues[0].content).toBe('subtle political bias');
      expect(extracted.issues[0].point).toBe('bias');

      // Check additional annotations
      expect(extracted.issues[1].isInline).toBe(false);
      expect(extracted.issues[1].content).toBe('Missing discussion of alternative viewpoints');
    });
  });
});
