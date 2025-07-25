import { calculatePotentialModelDrift } from './summaryCalculationUtils';
import { EnhancedComparisonConfigInfo, EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import { PerModelScoreStats } from '@/app/utils/homepageDataUtils';

const mockRun = (timestamp: string, perModelScores: Record<string, { hybrid: number | null, similarity: number | null, coverage: number | null }>, temp: number = 0): EnhancedRunInfo => ({
  runLabel: 'test-run-label',
  timestamp,
  fileName: `test-run-label_${timestamp}_comparison.json`,
  temperature: temp,
  perModelScores: new Map(Object.entries(perModelScores).map(([k, v]) => [k, { 
    hybrid: { average: v.hybrid, stddev: null },
    similarity: { average: v.similarity, stddev: null },
    coverage: { average: v.coverage, stddev: null }
  }])),
});

describe('calculatePotentialModelDrift', () => {

  it('should detect significant drift for a common model', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 
          'model-a': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 }, 
          'model-b': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } 
        }),
        mockRun('2024-07-03T12:00:00Z', { 
          'model-a': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 }, 
          'model-b': { hybrid: 0.91, similarity: 0.91, coverage: 0.91 } 
        }),
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe('model-a');
    expect(result?.scoreRange).toBeCloseTo(0.2);
    expect(result?.minScore).toBe(0.6);
    expect(result?.maxScore).toBe(0.8);
  });

  it('should return null if no drift is significant', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 
          'model-a': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 }, 
          'model-b': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } 
        }),
        mockRun('2024-07-03T12:00:00Z', { 
          'model-a': { hybrid: 0.81, similarity: 0.81, coverage: 0.81 }, 
          'model-b': { hybrid: 0.91, similarity: 0.91, coverage: 0.91 } 
        }),
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    expect(result).toBeNull();
  });
  
  it('should return null if time difference is less than the threshold', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'model-a': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
        mockRun('2024-07-01T18:00:00Z', { 'model-a': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }), // Only 6 hours later
      ],
      latestRunTimestamp: '2024-07-01T18:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    expect(result).toBeNull();
  });
  
  it('should ignore runs with non-zero temperature', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'model-a': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }, 0),
        mockRun('2024-07-03T12:00:00Z', { 'model-a': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }, 0.7), // This run should be excluded
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    // Not enough runs with temp 0 to calculate drift
    expect(result).toBeNull();
  });

  it('should not detect drift if a model is not common to all runs', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'model-a': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 }, 'model-b': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } }), // model-b is here
        mockRun('2024-07-03T12:00:00Z', { 'model-a': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 }, 'model-c': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } }), // but not here
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    // Drift is detected for model-a, which is common
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe('model-a');
  });

  it('should return null if no models are common across all runs', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'model-a': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
        mockRun('2024-07-03T12:00:00Z', { 'model-b': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }),
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    expect(result).toBeNull();
  });
  
  it('should pick the model with the most significant drift across multiple configs', () => {
    const configs: EnhancedComparisonConfigInfo[] = [
      { // Config 1 has a model with 0.2 drift
        configId: 'config-1',
        configTitle: 'Config 1',
        runs: [
          mockRun('2024-07-01T12:00:00Z', { 'model-a': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
          mockRun('2024-07-03T12:00:00Z', { 'model-a': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }),
        ],
        latestRunTimestamp: '2024-07-03T12:00:00Z',
      },
      { // Config 2 has a model with 0.3 drift
        configId: 'config-2',
        configTitle: 'Config 2',
        runs: [
          mockRun('2024-07-01T12:00:00Z', { 'model-b': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } }),
          mockRun('2024-07-03T12:00:00Z', { 'model-b': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }),
        ],
        latestRunTimestamp: '2024-07-03T12:00:00Z',
      }
    ];
    const result = calculatePotentialModelDrift(configs);
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe('model-b');
    expect(result?.scoreRange).toBeCloseTo(0.3);
  });

  it('should not fail if perModelHybridScores is null or undefined for a run', () => {
      const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'model-a': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
        { ...mockRun('2024-07-03T12:00:00Z', {}), perModelScores: undefined },
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
     const result = calculatePotentialModelDrift(configs);
     expect(result).toBeNull();
  });

}); 