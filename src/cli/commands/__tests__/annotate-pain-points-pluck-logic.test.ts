import { PainPoint } from '@/types/shared';

// Mock test to verify the pluck-from-config-max logic
describe('Annotate Pain Points - Pluck Logic', () => {
  test('should distribute candidates evenly across configs with pluck limit', () => {
    // Simulate the logic from the main function
    const mockPainPoints: PainPoint[] = [
      // Config A - 5 candidates (worse scores first)
      { configId: 'config-a', coverageScore: 0.1, responseText: 'a'.repeat(300) } as PainPoint,
      { configId: 'config-a', coverageScore: 0.15, responseText: 'a'.repeat(300) } as PainPoint,
      { configId: 'config-a', coverageScore: 0.2, responseText: 'a'.repeat(300) } as PainPoint,
      { configId: 'config-a', coverageScore: 0.25, responseText: 'a'.repeat(300) } as PainPoint,
      { configId: 'config-a', coverageScore: 0.3, responseText: 'a'.repeat(300) } as PainPoint,
      
      // Config B - 3 candidates
      { configId: 'config-b', coverageScore: 0.12, responseText: 'b'.repeat(300) } as PainPoint,
      { configId: 'config-b', coverageScore: 0.18, responseText: 'b'.repeat(300) } as PainPoint,
      { configId: 'config-b', coverageScore: 0.22, responseText: 'b'.repeat(300) } as PainPoint,
      
      // Config C - 7 candidates
      { configId: 'config-c', coverageScore: 0.05, responseText: 'c'.repeat(300) } as PainPoint,
      { configId: 'config-c', coverageScore: 0.08, responseText: 'c'.repeat(300) } as PainPoint,
      { configId: 'config-c', coverageScore: 0.13, responseText: 'c'.repeat(300) } as PainPoint,
      { configId: 'config-c', coverageScore: 0.16, responseText: 'c'.repeat(300) } as PainPoint,
      { configId: 'config-c', coverageScore: 0.19, responseText: 'c'.repeat(300) } as PainPoint,
      { configId: 'config-c', coverageScore: 0.24, responseText: 'c'.repeat(300) } as PainPoint,
      { configId: 'config-c', coverageScore: 0.28, responseText: 'c'.repeat(300) } as PainPoint,
    ];

    const pluckFromConfigMax = 3;
    const limit = 8;

    // Apply the same logic as in the main function
    const configGroups = new Map<string, PainPoint[]>();
    for (const candidate of mockPainPoints) {
      if (!configGroups.has(candidate.configId)) {
        configGroups.set(candidate.configId, []);
      }
      configGroups.get(candidate.configId)!.push(candidate);
    }

    // Sort each config's candidates by coverage score (worst first) and take at most pluckFromConfigMax
    const distributedCandidates: PainPoint[] = [];
    for (const [configId, configCandidates] of configGroups.entries()) {
      // Sort by coverage score ascending (worst first)
      const sortedConfigCandidates = configCandidates.sort((a, b) => (a.coverageScore || 0) - (b.coverageScore || 0));
      const selected = sortedConfigCandidates.slice(0, pluckFromConfigMax);
      distributedCandidates.push(...selected);
    }

    // Sort the final distributed list by coverage score (worst first) and apply global limit
    const finalCandidates = distributedCandidates
      .sort((a, b) => (a.coverageScore || 0) - (b.coverageScore || 0))
      .slice(0, limit);

    // Verify results
    expect(finalCandidates).toHaveLength(8); // Limited by global limit
    
    // Count how many from each config
    const configCounts = new Map<string, number>();
    for (const candidate of finalCandidates) {
      configCounts.set(candidate.configId, (configCounts.get(candidate.configId) || 0) + 1);
    }

    // Algorithm: 1) Take worst N from each config, 2) Sort globally, 3) Take top limit
    // Expected: Each config contributes worst 3, then global sort picks best 8 overall
    // Config-c: 0.05, 0.08, 0.13 (all 3 make it - they're among 8 worst globally)  
    // Config-a: 0.1, 0.15, 0.2 (all 3 make it - they're among 8 worst globally)
    // Config-b: 0.12, 0.18 (only 2 make it - 0.22 is 9th worst globally, gets dropped)
    expect(configCounts.get('config-c')).toBe(3);
    expect(configCounts.get('config-a')).toBe(3);
    expect(configCounts.get('config-b')).toBe(2); // 0.22 gets dropped by global limit

    // Verify that the worst scores from each config were selected
    const configASelected = finalCandidates.filter(c => c.configId === 'config-a');
    const configBSelected = finalCandidates.filter(c => c.configId === 'config-b');
    const configCSelected = finalCandidates.filter(c => c.configId === 'config-c');

    // Config A should have its 3 worst scores: 0.1, 0.15, 0.2
    expect(configASelected.map(c => c.coverageScore).sort((a, b) => a - b)).toEqual([0.1, 0.15, 0.2]);
    
    // Config B should have 2 of its worst (0.22 got dropped by global limit): 0.12, 0.18
    expect(configBSelected.map(c => c.coverageScore).sort((a, b) => a - b)).toEqual([0.12, 0.18]);
    
    // Config C should have all its 3 worst: 0.05, 0.08, 0.13  
    expect(configCSelected.map(c => c.coverageScore).sort((a, b) => a - b)).toEqual([0.05, 0.08, 0.13]);

    // Overall, the final list should be sorted by worst scores globally (top 8)
    const allScores = finalCandidates.map(c => c.coverageScore);
    expect(allScores).toEqual([0.05, 0.08, 0.1, 0.12, 0.13, 0.15, 0.18, 0.2]); // 0.22 dropped
  });

  test('should handle case where pluck limit is larger than available candidates', () => {
    const mockPainPoints: PainPoint[] = [
      { configId: 'small-config', coverageScore: 0.1, responseText: 'x'.repeat(300) } as PainPoint,
      { configId: 'small-config', coverageScore: 0.2, responseText: 'x'.repeat(300) } as PainPoint,
    ];

    const pluckFromConfigMax = 5; // More than available
    const limit = 10;

    const configGroups = new Map<string, PainPoint[]>();
    for (const candidate of mockPainPoints) {
      if (!configGroups.has(candidate.configId)) {
        configGroups.set(candidate.configId, []);
      }
      configGroups.get(candidate.configId)!.push(candidate);
    }

    const distributedCandidates: PainPoint[] = [];
    for (const [configId, configCandidates] of configGroups.entries()) {
      const sortedConfigCandidates = configCandidates.sort((a, b) => (a.coverageScore || 0) - (b.coverageScore || 0));
      const selected = sortedConfigCandidates.slice(0, pluckFromConfigMax);
      distributedCandidates.push(...selected);
    }

    const finalCandidates = distributedCandidates
      .sort((a, b) => (a.coverageScore || 0) - (b.coverageScore || 0)) 
      .slice(0, limit);

    // Should get all available candidates (2), not limited artificially
    expect(finalCandidates).toHaveLength(2);
    expect(finalCandidates.map(c => c.coverageScore)).toEqual([0.1, 0.2]);
  });
});
