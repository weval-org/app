import { WevalResult, ExecutiveSummary } from '@/types/shared';
import {
  parseStructuredSummary,
  parseGradeContent,
  extractScore,
  createModelAnonymizationMapping,
  deanonymizeModelNamesInText,
  anonymizeWevalResultData,
  ModelAnonymizationMapping,
  AnonymizedModelData,
} from '../executive-summary-service';
import { GradingDimension, GRADING_DIMENSIONS } from '@/lib/grading-criteria';

// Helper function to create a minimal mock mapping for tests
function createMockMapping(): ModelAnonymizationMapping {
  return {
    realToAnonymized: new Map(),
    anonymizedToReal: new Map(),
    makerToReal: new Map(),
    modelToReal: new Map(),
    sysToReal: new Map(),
    tempToReal: new Map(),
  };
}

describe('Executive Summary Parsing', () => {
  describe('parseStructuredSummary', () => {
    test('should handle malformed XML gracefully', () => {
      const content = `
<key_finding>Valid finding</key_finding>
<broken_tag>Broken content
<strength>Valid strength</strength>
            `;

      const result = parseStructuredSummary(content, createMockMapping());

      expect(result).not.toBeNull();
      expect(result!.keyFindings).toHaveLength(1);
      expect(result!.strengths).toHaveLength(1);
      expect(result!.weaknesses).toHaveLength(0);
    });

    test('should handle dimension name variations with individual grade blocks', () => {
      const content = `
            <grade maker="MK_5000" model="MD_6000" dimension="adherence">
            REASONING: The model followed instructions well.
            SCORE: 5/10
            </grade>
            
            <grade maker="MK_5000" model="MD_6000" dimension="clarity">
            REASONING: The response was clear and readable.
            SCORE: 7/10
            </grade>
            `;

      // Create a proper mapping that includes the test model
      const mapping = createMockMapping();
      const anonData: AnonymizedModelData = {
        realId: 'test-model',
        maker: 'MK_5000',
        model: 'MD_6000',
        sys: 'S_7000',
        temp: 'T_8000'
      };
      mapping.realToAnonymized.set('test-model', anonData);

      const result = parseStructuredSummary(content, mapping);

      expect(result).not.toBeNull();
      expect(result!.grades).toHaveLength(1);

      const grade = result!.grades![0];
      expect(grade.modelId).toBe('test-model'); // This should now be the clean base model ID
      expect(grade.grades.adherence).toBe(5);
      expect(grade.grades.clarity).toBe(7);
      expect(grade.reasoning?.adherence).toBe('The model followed instructions well.');
      expect(grade.reasoning?.clarity).toBe('The response was clear and readable.');
      
      // Other dimensions should be null since they weren't provided
      expect(grade.grades.tone).toBeNull();
      expect(grade.grades.depth).toBeNull();
    });

    test('should parse content with new ref tags in qualitative sections', () => {
        // Create a proper mapping that includes test models and variants
        const mapping = createMockMapping();
        
        // Create multiple variants of the same base model
        const openaiData1: AnonymizedModelData = {
            realId: 'openai:gpt-4o',
            maker: 'MK_5000',
            model: 'MD_6000',
            sys: undefined,
            temp: undefined
        };
        mapping.realToAnonymized.set('openai:gpt-4o', openaiData1);
        
        const openaiData2: AnonymizedModelData = {
            realId: 'openai:gpt-4o[temp:0.7]',
            maker: 'MK_5000', // Same maker
            model: 'MD_6000', // Same model 
            sys: undefined,
            temp: 'T_8000'
        };
        mapping.realToAnonymized.set('openai:gpt-4o[temp:0.7]', openaiData2);
        
        const claudeData: AnonymizedModelData = {
            realId: 'anthropic:claude-3-sonnet[sys:0]',
            maker: 'MK_5001',
            model: 'MD_6001',
            sys: 'S_7000',
            temp: undefined
        };
        mapping.realToAnonymized.set('anthropic:claude-3-sonnet[sys:0]', claudeData);
        
        mapping.makerToReal.set('MK_5000', 'OPENAI');
        mapping.modelToReal.set('MD_6000', 'openai:gpt-4o');
        mapping.makerToReal.set('MK_5001', 'ANTHROPIC');
        mapping.modelToReal.set('MD_6001', 'anthropic:claude-3-sonnet');
        mapping.sysToReal.set('S_7000', 0);
        
        const openaiAnon = mapping.realToAnonymized.get('openai:gpt-4o')!;
        const claudeAnon = mapping.realToAnonymized.get('anthropic:claude-3-sonnet[sys:0]')!;
        
        const content = `
<key_finding><ref maker="${openaiAnon.maker}" /> consistently outperformed others</key_finding>
<strength><ref maker="${claudeAnon.maker}" model="${claudeAnon.model}" sys="${claudeAnon.sys}" /> excelled at nuanced tasks</strength>
<weakness>Models struggled with temperature sensitivity</weakness>

<grade maker="${openaiAnon.maker}" model="${openaiAnon.model}" dimension="adherence">
REASONING: The model followed instructions well.
SCORE: 8/10
</grade>

<grade maker="${openaiAnon.maker}" model="${openaiAnon.model}" dimension="clarity">
REASONING: Clear and readable responses.
SCORE: 9/10
</grade>

<grade maker="${claudeAnon.maker}" model="${claudeAnon.model}" dimension="adherence">
REASONING: Good instruction following.
SCORE: 7/10
</grade>

<grade maker="${claudeAnon.maker}" model="${claudeAnon.model}" dimension="clarity">
REASONING: Very clear communication.
SCORE: 8/10
</grade>
        `;

        const result = parseStructuredSummary(content, mapping);
        
        expect(result).not.toBeNull();
        expect(result!.keyFindings).toHaveLength(1);
        expect(result!.keyFindings[0]).toContain('OpenAI consistently outperformed');
        
        expect(result!.strengths).toHaveLength(1);
        expect(result!.strengths[0]).toContain('[Claude 3 Sonnet (System 0)](#model-perf:anthropic:claude-3-sonnet[sys:0])');
        
        // Should have grades for 2 base models (1 OpenAI + 1 Claude)
        expect(result!.grades).toHaveLength(2);
        
        // Should have one grade for OpenAI base model
        const openaiGrade = result!.grades!.find(g => g.modelId === 'openai:gpt-4o'); // Clean base model ID
        expect(openaiGrade).toBeDefined();
        expect(openaiGrade!.grades.adherence).toBe(8);
        expect(openaiGrade!.grades.clarity).toBe(9);
        expect(openaiGrade!.reasoning?.adherence).toBe('The model followed instructions well.');
        expect(openaiGrade!.reasoning?.clarity).toBe('Clear and readable responses.');
        
        // Should not have separate grade for OpenAI variant (it uses base model grade)
        const openaiVariantGrade = result!.grades!.find(g => g.modelId === 'openai:gpt-4o[temp:0.7]');
        expect(openaiVariantGrade).toBeUndefined();
        
        const claudeGrade = result!.grades!.find(g => g.modelId === 'anthropic:claude-3-sonnet'); // Clean base model ID
        expect(claudeGrade).toBeDefined();
        expect(claudeGrade!.grades.adherence).toBe(7);
        expect(claudeGrade!.grades.clarity).toBe(8);
    });
  });

  describe('parseGradeContent', () => {
    test('should parse individual grade format with reasoning', () => {
      const content = `
            REASONING: The model followed instructions well and stayed on topic.
            SCORE: 8/10
            `;

      const result = parseGradeContent(content);

      expect(result).not.toBeNull();
      expect(result.score).toBe(8);
      expect(result.reasoning).toBe('The model followed instructions well and stayed on topic.');
    });

    test('should handle N/A scores', () => {
      const content = `
            REASONING: This dimension is not applicable to this evaluation because the task was purely factual.
            SCORE: N/A
            `;

      const result = parseGradeContent(content);

      expect(result).not.toBeNull();
      expect(result.score).toBeNull();
      expect(result.reasoning).toBe('This dimension is not applicable to this evaluation because the task was purely factual.');
    });

    test('should handle mixed score formats', () => {
      const content = `
            REASONING: Clear explanation provided.
            SCORE: 7.5/10
            `;

      const result = parseGradeContent(content);

      expect(result).not.toBeNull();
      expect(result.score).toBe(7.5);
      expect(result.reasoning).toBe('Clear explanation provided.');
    });

    test('should handle malformed grades gracefully', () => {
      const content = `
            REASONING: Good performance overall.
            INVALID_LINE_WITHOUT_SCORE
            ANOTHER_INVALID: no_score_here
            `;

      const result = parseGradeContent(content);

      expect(result).not.toBeNull();
      expect(result.score).toBeNull(); // No valid score found
      expect(result.reasoning).toBe('Good performance overall.');
    });
  });

  describe('extractScore', () => {
    test('should extract scores from various formats', () => {
      expect(extractScore('INSTRUCTION ADHERENCE & RELEVANCE: 8/10')).toBe(8);
      expect(extractScore('CLARITY & READABILITY: 9')).toBe(9);
      expect(extractScore('TONE & STYLE: 7.5/10')).toBe(7.5);
      expect(extractScore('NUANCE & DEPTH: 6.0')).toBe(6);
      expect(extractScore('SCORE: 10/10')).toBe(10);
    });

    test('should handle invalid formats', () => {
      expect(extractScore('NO_SCORE_HERE')).toBeNull();
      expect(extractScore('ADHERENCE: invalid')).toBeNull();
      expect(extractScore('')).toBeNull();
      expect(extractScore('SCORE:')).toBeNull();
    });

    test('should normalize scores over 10', () => {
      expect(extractScore('SCORE: 85')).toBe(8.5);
      expect(extractScore('SCORE: 100')).toBe(10);
      expect(extractScore('SCORE: 15')).toBe(1.5);
    });
  });
}); 
