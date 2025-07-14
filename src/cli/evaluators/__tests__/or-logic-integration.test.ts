import { parseAndNormalizeBlueprint } from '../../../lib/blueprint-parser';
import { aggregateCoverageScores } from '../coverage-logic';
import { PointAssessment } from '../../../types/shared';

describe('OR Logic Integration Demo', () => {
    const blueprintContent = `
title: "OR Logic Test Blueprint"
description: "Tests alternative paths (OR logic) with both function and LLM-judged points"
models:
  - openai:gpt-4o-mini
---
- id: recipe-request
  prompt: "I'd like help finding a recipe for pasta. What do you recommend?"
  should:
    # Path 1: Provides a direct recipe
    - - "provides a specific recipe"
      - "includes ingredients list"
      - $contains: "pasta"
    
    # Path 2: Asks for clarification (alternative valid approach)
    - - "asks about dietary preferences"
      - "asks about cuisine type"
      - $contains: "what kind"
    
    # Path 3: Offers to help (minimal but valid response)
    - - "offers to help find recipes"
      - $contains: "help"
`;

    it('should demonstrate OR logic working end-to-end', () => {
        // Parse the blueprint
        const blueprint = parseAndNormalizeBlueprint(blueprintContent, 'yaml');
        
        console.log('Blueprint parsed successfully!');
        console.log('Title:', blueprint.title);
        console.log('Prompts:', blueprint.prompts.length);
        
        // Verify the alternative paths structure
        const firstPrompt = blueprint.prompts[0];
        expect(firstPrompt.points).toBeDefined();
        expect(Array.isArray(firstPrompt.points)).toBe(true);
        expect(firstPrompt.points?.length).toBe(3); // 3 alternative paths
        
        // Each path should be an array of points
        firstPrompt.points?.forEach((path, index) => {
            expect(Array.isArray(path)).toBe(true);
            console.log(`Path ${index + 1} has ${(path as any[]).length} points`);
        });
    });

    it('should demonstrate OR logic scoring vs simple averaging', () => {
        // Simulate assessment results for a response that performs well on Path 2 and Path 3
        const assessments: PointAssessment[] = [
            // Path 1 points (poor performance)
            { keyPointText: 'provides a specific recipe', coverageExtent: 0.1, multiplier: 1.0, pathId: 'path_0' },
            { keyPointText: 'includes ingredients list', coverageExtent: 0.2, multiplier: 1.0, pathId: 'path_0' },
            { keyPointText: 'Function: contains("pasta")', coverageExtent: 0.8, multiplier: 1.0, pathId: 'path_0' },
            
            // Path 2 points (good performance)
            { keyPointText: 'asks about dietary preferences', coverageExtent: 0.8, multiplier: 1.0, pathId: 'path_1' },
            { keyPointText: 'asks about cuisine type', coverageExtent: 0.85, multiplier: 1.0, pathId: 'path_1' },
            { keyPointText: 'Function: contains("what kind")', coverageExtent: 0.9, multiplier: 1.0, pathId: 'path_1' },
            
            // Path 3 points (excellent performance)
            { keyPointText: 'offers to help find recipes', coverageExtent: 1.0, multiplier: 1.0, pathId: 'path_2' },
            { keyPointText: 'Function: contains("help")', coverageExtent: 0.9, multiplier: 1.0, pathId: 'path_2' },
        ];

        // Calculate OR logic score (should take the best path)
        const orLogicScore = aggregateCoverageScores(assessments);
        
        // Calculate what simple averaging would give
        const totalScore = assessments.reduce((sum, a) => sum + (a.coverageExtent || 0), 0);
        const simpleAverage = totalScore / assessments.length;
        
        console.log('\n=== OR Logic Integration Test Results ===');
        console.log(`Path 1 average: ${((0.1 + 0.2 + 0.8) / 3).toFixed(3)}`);
        console.log(`Path 2 average: ${((0.8 + 0.85 + 0.9) / 3).toFixed(3)}`);
        console.log(`Path 3 average: ${((1.0 + 0.9) / 2).toFixed(3)}`);
        console.log(`Best path score (OR logic): ${orLogicScore.toFixed(3)}`);
        console.log(`Simple average (old behavior): ${simpleAverage.toFixed(3)}`);
        console.log('==========================================\n');
        
        // OR logic should select the best path (Path 3: 0.95)
        expect(orLogicScore).toBeCloseTo(0.95, 2);
        
                 // Simple average would be much lower
         expect(simpleAverage).toBeCloseTo(0.694, 2);
        
        // Verify OR logic is significantly better than simple averaging
        expect(orLogicScore).toBeGreaterThan(simpleAverage);
    });

    it('should handle mixed pathId and non-pathId assessments', () => {
        const assessments: PointAssessment[] = [
            // Regular required point (no pathId)
            { keyPointText: 'always required', coverageExtent: 0.8, multiplier: 1.0 },
            
            // Alternative path points
            { keyPointText: 'path option A', coverageExtent: 0.3, multiplier: 1.0, pathId: 'path_0' },
            { keyPointText: 'path option B', coverageExtent: 0.9, multiplier: 1.0, pathId: 'path_1' },
        ];

        const score = aggregateCoverageScores(assessments);
        
        // Should average the required point (0.8) with the best path (0.9)
        // Expected: (0.8 + 0.9) / 2 = 0.85
        expect(score).toBeCloseTo(0.85, 2);
    });
}); 