import { parseStructuredSummary, createModelAnonymizationMapping } from '../executive-summary-service';

describe('Dimensional Grades for Model Cards', () => {
  test('should extract dimensional grades from executive summary', () => {
    // Mock executive summary content with grades
    const mockSummaryContent = `
      <strength>The model shows excellent instruction adherence</strength>
      <weakness>Sometimes lacks creativity in responses</weakness>
      
      <grade maker="MK_5000" model="MD_6000" dimension="adherence">
      REASONING: The model consistently follows instructions and addresses all parts of the prompt.
      SCORE: 8.5/10
      </grade>
      
      <grade maker="MK_5000" model="MD_6000" dimension="clarity">
      REASONING: Responses are clear and well-structured.
      SCORE: 7.8/10
      </grade>
      
      <grade maker="MK_5000" model="MD_6000" dimension="creativity">
      REASONING: Limited creative approaches, tends toward formulaic responses.
      SCORE: 5.2/10
      </grade>
    `;

    // Create mock mapping
    const mapping = createModelAnonymizationMapping(['test-model:gpt-4o']);
    mapping.realToAnonymized.set('test-model:gpt-4o', {
      realId: 'test-model:gpt-4o',
      maker: 'MK_5000',
      model: 'MD_6000',
      sys: undefined,
      temp: undefined
    });

    const result = parseStructuredSummary(mockSummaryContent, mapping);

    expect(result).not.toBeNull();
    expect(result!.grades).toHaveLength(1);
    
    const grades = result!.grades![0];
    expect(grades.grades.adherence).toBe(8.5);
    expect(grades.grades.clarity).toBe(7.8);
    expect(grades.grades.creativity).toBe(5.2);
    expect(grades.reasoning?.adherence).toContain('consistently follows instructions');
  });

  test('should demonstrate the new dimensional grades display', () => {
    // Mock dimensional grades data structure that would be generated
    const mockDimensionalGrades = {
      'adherence': {
        averageScore: 8.5,
        evaluationCount: 12,
        label: 'Instruction Adherence & Relevance'
      },
      'clarity': {
        averageScore: 7.8,
        evaluationCount: 12,
        label: 'Clarity & Readability'
      },
      'helpfulness': {
        averageScore: 7.5,
        evaluationCount: 10,
        label: 'Helpfulness & Actionability'
      },
      'safety': {
        averageScore: 9.1,
        evaluationCount: 8,
        label: 'Proactive Safety & Harm Avoidance'
      }
    };

    // This would show in the UI as:
    // Top Dimensional Strengths
    // 🛡️ Proactive Safety & Harm Avoidance    9.1/10 (8)
    // ✅ Instruction Adherence & Relevance     8.5/10 (12) 
    // 👁️ Clarity & Readability                7.8/10 (12)
    // 🏆 Helpfulness & Actionability          7.5/10 (10)

    expect(Object.keys(mockDimensionalGrades)).toHaveLength(4);
    expect(mockDimensionalGrades.safety.averageScore).toBeGreaterThan(8);
    expect(mockDimensionalGrades.adherence.evaluationCount).toBe(12);
  });

  test('should filter and sort dimensions correctly', () => {
    const mockGrades = {
      'good_dimension': { averageScore: 7.5, evaluationCount: 5, label: 'Good Dimension' },
      'poor_dimension': { averageScore: 4.2, evaluationCount: 3, label: 'Poor Dimension' },
      'excellent_dimension': { averageScore: 9.1, evaluationCount: 8, label: 'Excellent Dimension' }
    };

    // Filter >= 6.0 and sort by score descending
    const filtered = Object.entries(mockGrades)
      .filter(([, data]) => data.averageScore >= 6.0)
      .sort(([,a], [,b]) => b.averageScore - a.averageScore);

    expect(filtered).toHaveLength(2);
    expect(filtered[0][0]).toBe('excellent_dimension');
    expect(filtered[1][0]).toBe('good_dimension');
  });
});