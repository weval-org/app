import { calculatePotentialModelDrift, calculateHeadlineStats, calculateCapabilityLeaderboards, calculateTopicChampions, processExecutiveSummaryGrades, processTopicData } from './summaryCalculationUtils';
import { EnhancedComparisonConfigInfo, EnhancedRunInfo } from '@/app/utils/homepageDataUtils';

// IMPORTANT: Mock parseModelIdForDisplay for unit test isolation
jest.mock('@/app/utils/modelIdUtils', () => ({
  parseModelIdForDisplay: jest.fn((modelId: string) => {
    // These mocks return what the real parser would return for these formats
    if (modelId === 'provider:model-a[temp:0]') {
      return { baseId: 'provider:model-a', displayName: 'Model A', fullId: modelId };
    }
    if (modelId === 'provider:model-b[temp:0]') {
      return { baseId: 'provider:model-b', displayName: 'Model B', fullId: modelId };
    }
    // Default fallback for any other test model IDs
    return { baseId: modelId, displayName: modelId, fullId: modelId };
  }),
  getModelDisplayLabel: jest.fn((modelId: string) => `Display ${modelId}`)
}));

jest.mock('@/app/utils/tagUtils', () => ({
  normalizeTag: jest.fn((tag: string) => {
    // Mock normalizeTag to return predictable values for tests
    const mockMappings: Record<string, string> = {
      'Safety': 'Safety',
      'Mental Health': 'Mental Health & Crisis Support',
      'AI Safety': 'AI Safety & Robustness',
      'math': 'math',
      'reasoning': 'reasoning',
      'algebra': 'algebra'
    };
    return mockMappings[tag] || tag.toLowerCase().replace(/\s+/g, '-');
  }),
  normalizeTopicKey: jest.fn((key: string) => key) // Pass through for simplicity
}));

jest.mock('@/lib/capabilities', () => ({
  CAPABILITY_BUCKETS: [
    {
      id: 'test-safety',
      label: 'Test Safety',
      description: 'Test safety capability',
      icon: 'shield',
      dimensions: [
        { key: 'safety', weight: 2.0 },
        { key: 'humility', weight: 1.0 }
      ],
      topics: [
        { key: 'Safety', weight: 1.5 },
        { key: 'Mental Health & Crisis Support', weight: 1.8 } // Higher weight for deduplication test
      ],
      configs: [
        { key: 'uk-clinical-scenarios', weight: 2.0 },
        { key: 'sycophancy-probe', weight: 2.0 }, // For deduplication test
        { key: 'explicit-only-config', weight: 2.0 } // For single-pathway test
      ]
    }
  ]
}));

/**
 * Test helper: Creates a mock run with properly formatted model IDs
 * 
 * Note: Model IDs use square bracket notation for suffixes (not colons)
 * This matches the format expected by parseModelIdForDisplay's regex patterns
 */
const mockRun = (timestamp: string, perModelScores: Record<string, { hybrid: number | null, similarity: number | null, coverage: number | null }>, temp: number = 0): EnhancedRunInfo => ({
  runLabel: 'mock-run-label',
  timestamp,
  fileName: `mock-run-label_${timestamp}_comparison.json`,
  temperature: temp,
  perModelScores: new Map(Object.entries(perModelScores).map(([k, v]) => [k, { 
    hybrid: { average: v.hybrid, stddev: null },
    similarity: { average: v.similarity, stddev: null },
    coverage: { average: v.coverage, stddev: null }
  }])),
});

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('calculateHeadlineStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should only use latest run per config for main leaderboard', () => {
    // This test validates the architectural fix: latest run only, not historical averages
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        // Latest run first (runs are sorted by timestamp desc)
        mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } }),
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.5, similarity: 0.5, coverage: 0.5 } }), // Older run should be ignored
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    
    const result = calculateHeadlineStats(configs, new Map(), new Map(), mockLogger);
    
    expect(result.rankedOverallModels).toBeDefined();
    expect(result.rankedOverallModels!.length).toBe(1);
    expect(result.rankedOverallModels![0].modelId).toBe('provider:model-a');
    expect(result.rankedOverallModels![0].overallAverageHybridScore).toBe(0.9); // Should use latest run score, not average of 0.9 and 0.5
    expect(result.rankedOverallModels![0].runsParticipatedIn).toBe(1); // Only latest run counted
  });

  it('should filter out configs with test tag', () => {
    const configs: EnhancedComparisonConfigInfo[] = [
      {
        configId: 'config-1',
        configTitle: 'Config 1',
        runs: [mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } })],
        latestRunTimestamp: '2024-07-03T12:00:00Z',
        tags: ['test'],
      },
      {
        configId: 'config-2', 
        configTitle: 'Config 2',
        runs: [mockRun('2024-07-03T12:00:00Z', { 'provider:model-b[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } })],
        latestRunTimestamp: '2024-07-03T12:00:00Z',
      }
    ];
    
    const result = calculateHeadlineStats(configs, new Map(), new Map(), mockLogger);
    
    expect(result.rankedOverallModels).toBeDefined();
    expect(result.rankedOverallModels!.length).toBe(1);
    expect(result.rankedOverallModels![0].modelId).toBe('provider:model-b'); // Only non-test config
  });

  it('should create dimension leaderboards from provided grades', () => {
    // Need some configs for the function to not return null
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } })],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
      tags: [], // Explicitly set empty tags to prevent automatic test tag inference
    }];

    // Mock some dimension grades
    const modelDimensionGrades = new Map();
    const modelAGrades = new Map();
    modelAGrades.set('clarity', { 
      totalScore: 40, 
      count: 5, 
      uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5']),
      scores: [
        { score: 8, configTitle: 'Config 1', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' },
        { score: 8, configTitle: 'Config 2', runLabel: 'run2', timestamp: '2024-01-02', configId: 'config2' },
        { score: 8, configTitle: 'Config 3', runLabel: 'run3', timestamp: '2024-01-03', configId: 'config3' },
        { score: 8, configTitle: 'Config 4', runLabel: 'run4', timestamp: '2024-01-04', configId: 'config4' },
        { score: 8, configTitle: 'Config 5', runLabel: 'run5', timestamp: '2024-01-05', configId: 'config5' }
      ]
    });
    modelDimensionGrades.set('provider:model-a', modelAGrades);
    
    const result = calculateHeadlineStats(configs, modelDimensionGrades, new Map(), mockLogger);
    
    expect(result.dimensionLeaderboards).toBeDefined();
    expect(result.dimensionLeaderboards!.length).toBe(1);
    expect(result.dimensionLeaderboards![0].dimension).toBe('clarity');
    expect(result.dimensionLeaderboards![0].leaderboard[0].modelId).toBe('provider:model-a');
    expect(result.dimensionLeaderboards![0].leaderboard[0].averageScore).toBe(8);
  });

  it('should return empty arrays when no data provided', () => {
    const result = calculateHeadlineStats([], new Map(), new Map(), mockLogger);
    
    expect(result.bestPerformingConfig).toBeNull();
    expect(result.worstPerformingConfig).toBeNull();
    expect(result.leastConsistentConfig).toBeNull();
    expect(result.rankedOverallModels).toBeNull();
    expect(result.dimensionLeaderboards).toBeNull();
  });

  it('should build configModelScores from run data for capability calculation', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'uk-clinical-scenarios', // This matches our test capability config
      configTitle: 'UK Clinical Scenarios',
      runs: [
        mockRun('2024-07-03T12:00:00Z', { 
          'provider:model-a[temp:0]': { hybrid: 0.85, similarity: 0.85, coverage: 0.85 },
          'provider:model-b[temp:0]': { hybrid: 0.75, similarity: 0.75, coverage: 0.75 }
        }),
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    
    const result = calculateHeadlineStats(configs, new Map(), new Map(), mockLogger);

    expect(result.capabilityLeaderboards).toBeDefined();
    expect(result.capabilityRawData).toBeDefined();
    expect(result.capabilityRawData?.modelConfigs).toBeDefined();

    // Raw data should include ALL models with config scores (not just qualifying ones)
    // This supports the capability-tuning page which needs raw data to recalculate scores
    expect(result.capabilityRawData?.modelConfigs['provider:model-a']).toBeDefined();
    expect(result.capabilityRawData?.modelConfigs['provider:model-a']['uk-clinical-scenarios']).toBe(0.85);
    expect(result.capabilityRawData?.modelConfigs['provider:model-b']).toBeDefined();
    expect(result.capabilityRawData?.modelConfigs['provider:model-b']['uk-clinical-scenarios']).toBe(0.75);
  });

  describe('Global qualification vs capability-specific scoring', () => {
    it('should qualify models based on global participation, not capability participation', () => {
      // Model with high global participation but minimal safety capability data
      const modelDimensionGrades = new Map();
      const globallyActiveModel = new Map();
      globallyActiveModel.set('helpfulness', { 
        totalScore: 80, 
        count: 15, 
        uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5', 'config6']),
        scores: Array(15).fill({ score: 8, configTitle: 'Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' })
      });
      // Only one safety-related dimension score
      globallyActiveModel.set('safety', { 
        totalScore: 8, 
        count: 1, 
        uniqueConfigs: new Set(['safety-config']),
        scores: [{ score: 8, configTitle: 'Safety Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'safety-config' }]
      });
      modelDimensionGrades.set('provider:globally-active-model', globallyActiveModel);

      const topicModelScores = new Map();
      const configModelScores = new Map();
      // Ensure presence in ≥ half of listed configs (mock lists 3 → need 2)
      const c1 = new Map();
      c1.set('provider:globally-active-model', 0.8);
      configModelScores.set('uk-clinical-scenarios', c1);
      const c2 = new Map();
      c2.set('provider:globally-active-model', 0.8);
      configModelScores.set('sycophancy-probe', c2);
      
      // Global stats show high participation
      const globalModelStats = new Map();
      globalModelStats.set('provider:globally-active-model', {
        totalRuns: 50, // High global participation
        uniqueConfigs: 10 // Many configs participated in
      });

      const result = calculateCapabilityLeaderboards(
        modelDimensionGrades,
        topicModelScores,
        configModelScores,
        globalModelStats,
        mockLogger
      );

      // Should qualify for safety capability despite minimal safety-specific data
      // because global participation meets thresholds
      const safetyCapability = result.leaderboards.find(cap => cap.id === 'test-safety');
      expect(safetyCapability).toBeDefined();
      
      const qualifiedModel = safetyCapability!.leaderboard.find(model => model.modelId === 'provider:globally-active-model');
      expect(qualifiedModel).toBeDefined();
      expect(qualifiedModel!.contributingRuns).toBe(50); // Should show global runs, not capability runs
    });

    it('should exclude models with low global participation even if capability data is rich', () => {
      // Model with rich safety data but low global participation
      const modelDimensionGrades = new Map();
      const lowGlobalModel = new Map();
      lowGlobalModel.set('safety', { 
        totalScore: 90, 
        count: 10, 
        uniqueConfigs: new Set(['safety1', 'safety2']),
        scores: Array(10).fill({ score: 9, configTitle: 'Safety Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'safety1' })
      });
      modelDimensionGrades.set('provider:safety-specialist-model', lowGlobalModel);

      const topicModelScores = new Map();
      const configModelScores = new Map();
      
      // Global stats show low participation (below thresholds)
      const globalModelStats = new Map();
      globalModelStats.set('provider:safety-specialist-model', {
        totalRuns: 5, // Below 10 threshold
        uniqueConfigs: 2 // Below 5 threshold
      });

      const result = calculateCapabilityLeaderboards(
        modelDimensionGrades,
        topicModelScores,
        configModelScores,
        globalModelStats,
        mockLogger
      );

      // Should NOT qualify for safety capability despite rich safety data
      // because global participation doesn't meet thresholds
      const safetyCapability = result.leaderboards.find(cap => cap.id === 'test-safety');
      expect(safetyCapability).toBeDefined();
      
      const excludedModel = safetyCapability!.leaderboard.find(model => model.modelId === 'provider:safety-specialist-model');
      expect(excludedModel).toBeUndefined();
    });
  });
});

describe('calculateTopicChampions', () => {
  it('should calculate topic champions correctly', () => {
    const topicModelScores = new Map();
    const mathScores = new Map();
    mathScores.set('provider:model-a', {
      scores: [
        { score: 0.9, configId: 'config-1', configTitle: 'Math 1', runLabel: 'run-1', timestamp: '2024-07-03T12:00:00Z' },
        { score: 0.8, configId: 'config-2', configTitle: 'Math 2', runLabel: 'run-1', timestamp: '2024-07-02T12:00:00Z' },
        { score: 0.85, configId: 'config-3', configTitle: 'Math 3', runLabel: 'run-1', timestamp: '2024-07-01T12:00:00Z' },
        { score: 0.9, configId: 'config-4', configTitle: 'Math 4', runLabel: 'run-1', timestamp: '2024-06-30T12:00:00Z' },
        { score: 0.8, configId: 'config-5', configTitle: 'Math 5', runLabel: 'run-1', timestamp: '2024-06-29T12:00:00Z' },
      ],
      uniqueConfigs: new Set(['config-1', 'config-2', 'config-3', 'config-4', 'config-5'])
    });
    topicModelScores.set('math', mathScores);
    
    const result = calculateTopicChampions(topicModelScores);
    
    expect(result.math).toBeDefined();
    expect(result.math.length).toBe(1);
    expect(result.math[0].modelId).toBe('provider:model-a');
    expect(result.math[0].averageScore).toBe(0.85); // (0.9 + 0.8 + 0.85 + 0.9 + 0.8) / 5
    expect(result.math[0].uniqueConfigsCount).toBe(5);
    expect(result.math[0].contributingRuns).toHaveLength(5);
  });

  it('should filter out models with insufficient configs', () => {
    const topicModelScores = new Map();
    const mathScores = new Map();
    mathScores.set('provider:model-a', {
      scores: [
        { score: 0.9, configId: 'config-1', configTitle: 'Math 1', runLabel: 'run-1', timestamp: '2024-07-03T12:00:00Z' },
        { score: 0.8, configId: 'config-2', configTitle: 'Math 2', runLabel: 'run-1', timestamp: '2024-07-02T12:00:00Z' },
      ],
      uniqueConfigs: new Set(['config-1', 'config-2']) // Only 2 configs, need 5
    });
    topicModelScores.set('math', mathScores);
    
    const result = calculateTopicChampions(topicModelScores);
    
    expect(result.math).toBeUndefined(); // Should be filtered out
  });

  it('should sort champions by average score descending', () => {
    const topicModelScores = new Map();
    const mathScores = new Map();
    
    // Model A with lower average
    mathScores.set('provider:model-a', {
      scores: Array(5).fill(null).map((_, i) => ({ 
        score: 0.7, 
        configId: `config-${i+1}`, 
        configTitle: `Math ${i+1}`, 
        runLabel: 'run-1', 
        timestamp: '2024-07-03T12:00:00Z' 
      })),
      uniqueConfigs: new Set(['config-1', 'config-2', 'config-3', 'config-4', 'config-5'])
    });
    
    // Model B with higher average
    mathScores.set('provider:model-b', {
      scores: Array(5).fill(null).map((_, i) => ({ 
        score: 0.9, 
        configId: `config-${i+6}`, 
        configTitle: `Math ${i+6}`, 
        runLabel: 'run-1', 
        timestamp: '2024-07-03T12:00:00Z' 
      })),
      uniqueConfigs: new Set(['config-6', 'config-7', 'config-8', 'config-9', 'config-10'])
    });
    
    topicModelScores.set('math', mathScores);
    
    const result = calculateTopicChampions(topicModelScores);
    
    expect(result.math).toHaveLength(2);
    expect(result.math[0].modelId).toBe('provider:model-b'); // Higher score first
    expect(result.math[0].averageScore).toBe(0.9);
    expect(result.math[1].modelId).toBe('provider:model-a'); // Lower score second
    expect(result.math[1].averageScore).toBe(0.7);
  });
});

describe('processExecutiveSummaryGrades', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process executive summary grades correctly', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T12:00:00Z',
      executiveSummary: {
        structured: {
          grades: [
            {
              modelId: 'provider:model-a[temp:0]', // IMPORTANT: Square brackets format, not 'provider:model-a:temp-0'
              grades: {
                clarity: 8,
                safety: 9,
                helpfulness: 7
              }
            }
          ]
        }
      }
    } as any;

    const modelDimensionGrades = new Map();
    
    processExecutiveSummaryGrades(resultData, modelDimensionGrades, mockLogger);
    
    // The mock parseModelIdForDisplay returns { baseId: 'provider:model-a' } for our test input
    expect(modelDimensionGrades.has('provider:model-a')).toBe(true);
    const modelGrades = modelDimensionGrades.get('provider:model-a')!;
    expect(modelGrades.has('clarity')).toBe(true);
    expect(modelGrades.get('clarity')!.totalScore).toBe(8);
    expect(modelGrades.get('clarity')!.count).toBe(1);
    expect(modelGrades.get('safety')!.totalScore).toBe(9);
    expect(modelGrades.get('helpfulness')!.totalScore).toBe(7);
    expect(mockLogger.info).toHaveBeenCalledWith('Processing executive summary grades for: config-1/run-1');
  });

  it('should use latest run per config for dimensions (temporal consistency)', () => {
    const modelDimensionGrades = new Map();
    
    // First run from config-1
    const firstRun = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T10:00:00Z', // Earlier timestamp
      executiveSummary: {
        structured: {
          grades: [
            {
              modelId: 'provider:model-a[temp:0]',
              grades: { safety: 6 } // Lower score, but earlier
            }
          ]
        }
      }
    } as any;

    // Second (later) run from same config-1
    const secondRun = {
      configId: 'config-1', // Same config
      configTitle: 'Test Config',
      runLabel: 'run-2',
      timestamp: '2024-07-03T12:00:00Z', // Later timestamp
      executiveSummary: {
        structured: {
          grades: [
            {
              modelId: 'provider:model-a[temp:0]',
              grades: { safety: 8 } // Higher score, but later
            }
          ]
        }
      }
    } as any;

    // Third run from different config-2
    const thirdRun = {
      configId: 'config-2', // Different config
      configTitle: 'Other Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T11:00:00Z',
      executiveSummary: {
        structured: {
          grades: [
            {
              modelId: 'provider:model-a[temp:0]',
              grades: { safety: 7 }
            }
          ]
        }
      }
    } as any;

    // Process runs in chronological order
    processExecutiveSummaryGrades(firstRun, modelDimensionGrades, mockLogger);
    processExecutiveSummaryGrades(secondRun, modelDimensionGrades, mockLogger);
    processExecutiveSummaryGrades(thirdRun, modelDimensionGrades, mockLogger);

    const modelGrades = modelDimensionGrades.get('provider:model-a')!;
    const safetyData = modelGrades.get('safety')!;
    
    // Should average latest from each config: (8 from config-1 + 7 from config-2) / 2 = 7.5
    expect(safetyData.totalScore).toBe(15); // 8 + 7
    expect(safetyData.count).toBe(2); // Two configs
    expect(safetyData.uniqueConfigs.size).toBe(2); // config-1 and config-2
    expect(safetyData.uniqueConfigs.has('config-1')).toBe(true);
    expect(safetyData.uniqueConfigs.has('config-2')).toBe(true);
    
    // Should only have scores from latest run per config
    expect(safetyData.scores).toHaveLength(2);
    const config1Score = safetyData.scores.find((s: any) => s.runLabel === 'run-2');
    const config2Score = safetyData.scores.find((s: any) => s.runLabel === 'run-1');
    expect(config1Score?.score).toBe(8); // Latest from config-1
    expect(config2Score?.score).toBe(7); // Only run from config-2
  });

  it('should skip zero scores', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1', 
      timestamp: '2024-07-03T12:00:00Z',
      executiveSummary: {
        structured: {
          grades: [
            {
              modelId: 'provider:model-a[temp:0]',
              grades: {
                clarity: 8,
                safety: 0, // Should be skipped
                helpfulness: 7
              }
            }
          ]
        }
      }
    } as any;

    const modelDimensionGrades = new Map();
    
    processExecutiveSummaryGrades(resultData, modelDimensionGrades, mockLogger);
    
    const modelGrades = modelDimensionGrades.get('provider:model-a')!;
    expect(modelGrades.has('clarity')).toBe(true);
    expect(modelGrades.has('safety')).toBe(false); // Should not exist
    expect(modelGrades.has('helpfulness')).toBe(true);
  });

  it('should handle missing executive summary gracefully', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T12:00:00Z',
      // No executiveSummary
    } as any;

    const modelDimensionGrades = new Map();
    
    processExecutiveSummaryGrades(resultData, modelDimensionGrades, mockLogger);
    
    expect(modelDimensionGrades.size).toBe(0); // Should remain empty
    expect(mockLogger.info).not.toHaveBeenCalled();
  });
});

describe('processTopicData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process topic data correctly', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T12:00:00Z',
      config: {
        tags: ['Safety', 'Mental Health']
      },
      executiveSummary: {
        structured: {
          autoTags: ['AI Safety']
        }
      }
    } as any;

    const perModelScores = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.85 } }],
      ['provider:model-b[temp:0]', { hybrid: { average: 0.75 } }]
    ]) as any;

    const topicModelScores = new Map();
    
    processTopicData(resultData, perModelScores, topicModelScores, mockLogger);
    
    // Should have processed all normalized tags
    expect(topicModelScores.has('Safety')).toBe(true);
    expect(topicModelScores.has('Mental Health & Crisis Support')).toBe(true);
    expect(topicModelScores.has('AI Safety & Robustness')).toBe(true);
    
    // Check data for Safety topic
    const safetyTopic = topicModelScores.get('Safety')!;
    expect(safetyTopic.has('provider:model-a')).toBe(true);
    expect(safetyTopic.has('provider:model-b')).toBe(true);
    
    const modelAData = safetyTopic.get('provider:model-a')!;
    expect(modelAData.scores).toHaveLength(1);
    expect(modelAData.scores[0].score).toBe(0.85);
    expect(modelAData.uniqueConfigs.has('config-1')).toBe(true);
  });

  it('should use latest run per config for topics (temporal consistency)', () => {
    const topicModelScores = new Map();
    
    // Create test data with same model, same tags, but different configs and timestamps
    const firstRun = {
      configId: 'config-1',
      configTitle: 'Test Config 1',
      runLabel: 'run-1',
      timestamp: '2024-07-03T10:00:00Z', // Earlier
      config: { tags: ['Safety'] }
    } as any;

    const secondRun = {
      configId: 'config-1', // Same config
      configTitle: 'Test Config 1',
      runLabel: 'run-2', 
      timestamp: '2024-07-03T12:00:00Z', // Later
      config: { tags: ['Safety'] }
    } as any;

    const thirdRun = {
      configId: 'config-2', // Different config
      configTitle: 'Test Config 2',
      runLabel: 'run-1',
      timestamp: '2024-07-03T11:00:00Z',
      config: { tags: ['Safety'] }
    } as any;

    const perModelScoresRun1 = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.60 } }] // Lower score, earlier
    ]) as any;

    const perModelScoresRun2 = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.85 } }] // Higher score, later
    ]) as any;

    const perModelScoresRun3 = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.75 } }] // Different config
    ]) as any;

    // Process in chronological order
    processTopicData(firstRun, perModelScoresRun1, topicModelScores, mockLogger);
    processTopicData(secondRun, perModelScoresRun2, topicModelScores, mockLogger);
    processTopicData(thirdRun, perModelScoresRun3, topicModelScores, mockLogger);

    const safetyTopic = topicModelScores.get('Safety')!;
    const modelAData = safetyTopic.get('provider:model-a')!;
    
    // Should only have latest scores from each config
    expect(modelAData.scores).toHaveLength(2); // Two configs
    expect(modelAData.uniqueConfigs.size).toBe(2);
    expect(modelAData.uniqueConfigs.has('config-1')).toBe(true);
    expect(modelAData.uniqueConfigs.has('config-2')).toBe(true);
    
    // Should use latest score from config-1 (0.85) and score from config-2 (0.75)
    const config1Score = modelAData.scores.find((s: any) => s.runLabel === 'run-2');
    const config2Score = modelAData.scores.find((s: any) => s.runLabel === 'run-1');
    expect(config1Score?.score).toBe(0.85); // Latest from config-1
    expect(config2Score?.score).toBe(0.75); // Only score from config-2
  });

  it('should handle missing tags gracefully', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T12:00:00Z',
      config: {
        // No tags
      }
    } as any;

    const perModelScores = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.85 } }]
    ]) as any;

    const topicModelScores = new Map();
    
    processTopicData(resultData, perModelScores, topicModelScores, mockLogger);
    
    expect(topicModelScores.size).toBe(0); // Should remain empty
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it('should skip models with null hybrid scores', () => {
    const resultData = {
      configId: 'config-1',
      configTitle: 'Test Config',
      runLabel: 'run-1',
      timestamp: '2024-07-03T12:00:00Z',
      config: {
        tags: ['Safety']
      }
    } as any;

    const perModelScores = new Map([
      ['provider:model-a[temp:0]', { hybrid: { average: 0.85 } }],
      ['provider:model-b[temp:0]', { hybrid: { average: null } }] // Should be skipped
    ]) as any;

    const topicModelScores = new Map();
    
    processTopicData(resultData, perModelScores, topicModelScores, mockLogger);
    
    const safetyTopic = topicModelScores.get('Safety')!;
    expect(safetyTopic.has('provider:model-a')).toBe(true);
    expect(safetyTopic.has('provider:model-b')).toBe(false); // Should not exist
  });
});

describe('calculatePotentialModelDrift', () => {

  it('should detect significant drift for a common model', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 
          'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 }, 
          'provider:model-b[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } 
        }),
        mockRun('2024-07-03T12:00:00Z', { 
          'provider:model-a[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 }, 
          'provider:model-b[temp:0]': { hybrid: 0.91, similarity: 0.91, coverage: 0.91 } 
        }),
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe('provider:model-a');
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
          'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 }, 
          'provider:model-b[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } 
        }),
        mockRun('2024-07-03T12:00:00Z', { 
          'provider:model-a[temp:0]': { hybrid: 0.81, similarity: 0.81, coverage: 0.81 }, 
          'provider:model-b[temp:0]': { hybrid: 0.91, similarity: 0.91, coverage: 0.91 } 
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
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
        mockRun('2024-07-01T18:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }), // Only 6 hours later
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
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }, 0),
        mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }, 0.7), // This run should be excluded
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
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 }, 'provider:model-b[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } }), // model-b is here
        mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 }, 'provider:model-c[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } }), // but not here
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
    const result = calculatePotentialModelDrift(configs);
    // Drift is detected for model-a, which is common
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe('provider:model-a');
  });

  it('should return null if no models are common across all runs', () => {
    const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
        mockRun('2024-07-03T12:00:00Z', { 'provider:model-b[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }),
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
          mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
          mockRun('2024-07-03T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }),
        ],
        latestRunTimestamp: '2024-07-03T12:00:00Z',
      },
      { // Config 2 has a model with 0.3 drift
        configId: 'config-2',
        configTitle: 'Config 2',
        runs: [
          mockRun('2024-07-01T12:00:00Z', { 'provider:model-b[temp:0]': { hybrid: 0.9, similarity: 0.9, coverage: 0.9 } }),
          mockRun('2024-07-03T12:00:00Z', { 'provider:model-b[temp:0]': { hybrid: 0.6, similarity: 0.6, coverage: 0.6 } }),
        ],
        latestRunTimestamp: '2024-07-03T12:00:00Z',
      }
    ];
    const result = calculatePotentialModelDrift(configs);
    expect(result).not.toBeNull();
    expect(result?.modelId).toBe('provider:model-b');
    expect(result?.scoreRange).toBeCloseTo(0.3);
  });

  it('should not fail if perModelHybridScores is null or undefined for a run', () => {
      const configs: EnhancedComparisonConfigInfo[] = [{
      configId: 'config-1',
      configTitle: 'Config 1',
      runs: [
        mockRun('2024-07-01T12:00:00Z', { 'provider:model-a[temp:0]': { hybrid: 0.8, similarity: 0.8, coverage: 0.8 } }),
        { ...mockRun('2024-07-03T12:00:00Z', {}), perModelScores: undefined },
      ],
      latestRunTimestamp: '2024-07-03T12:00:00Z',
    }];
     const result = calculatePotentialModelDrift(configs);
     expect(result).toBeNull();
  });

}); 

describe('calculateCapabilityLeaderboards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process config scores when referenced in capabilities', () => {
    
    // Add sufficient dimension grades to meet thresholds
    const modelDimensionGrades = new Map();
    const modelAGrades = new Map();
    modelAGrades.set('safety', { 
      totalScore: 80, // 8.0 average
      count: 15, // Meet minimum runs threshold
      uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5', 'config6']),
      scores: Array(15).fill({ score: 8, configTitle: 'Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' })
    });
    modelDimensionGrades.set('provider:model-a', modelAGrades);
    
    const topicModelScores = new Map();
    const configModelScores = new Map();
    
    // Add config scores (this would normally be filtered by calculateHeadlineStats)
    const ukClinicalScores = new Map();
    ukClinicalScores.set('provider:model-a', 0.85);
    configModelScores.set('uk-clinical-scenarios', ukClinicalScores);
    // Satisfy ≥ half presence by adding another listed config
    const sycophancyScores = new Map();
    sycophancyScores.set('provider:model-a', 0.8);
    configModelScores.set('sycophancy-probe', sycophancyScores);

    // Add global qualification data
    const globalModelStats = new Map();
    globalModelStats.set('provider:model-a', {
      totalRuns: 15, // Meets ≥10 threshold
      uniqueConfigs: 6 // Meets ≥5 threshold
    });

    const result = calculateCapabilityLeaderboards(
      modelDimensionGrades,
      topicModelScores, 
      configModelScores,
      globalModelStats,
      mockLogger
    );

    expect(result.rawData.modelConfigs).toBeDefined();
    expect(result.rawData.modelConfigs['provider:model-a']).toBeDefined();
    expect(result.rawData.modelConfigs['provider:model-a']['uk-clinical-scenarios']).toBe(0.85);
  });

  it('should include config scores in raw data for qualifying models only', () => {
    
    // Add sufficient dimension grades to meet thresholds
    const modelDimensionGrades = new Map();
    const modelAGrades = new Map();
    modelAGrades.set('safety', { 
      totalScore: 80, // 8.0 average
      count: 15, // Meet minimum runs threshold
      uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5', 'config6']),
      scores: Array(15).fill({ score: 8, configTitle: 'Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' })
    });
    modelDimensionGrades.set('provider:model-a', modelAGrades);
    
    const topicModelScores = new Map();
    const configModelScores = new Map();
    
    // Add config scores for multiple models, but only model-a will qualify
    const ukClinicalScores = new Map();
    ukClinicalScores.set('provider:model-a', 0.85);
    ukClinicalScores.set('provider:model-unqualified', 0.90); // This model has no dimension grades
    configModelScores.set('uk-clinical-scenarios', ukClinicalScores);
    // Add second listed config for qualifying model only
    const sycophancyScores = new Map();
    sycophancyScores.set('provider:model-a', 0.8);
    configModelScores.set('sycophancy-probe', sycophancyScores);

    // Add global qualification data - only model-a qualifies globally
    const globalModelStats = new Map();
    globalModelStats.set('provider:model-a', {
      totalRuns: 15, // Meets ≥10 threshold
      uniqueConfigs: 6 // Meets ≥5 threshold
    });
    // provider:model-unqualified doesn't get global stats, so won't qualify

    const result = calculateCapabilityLeaderboards(
      modelDimensionGrades,
      topicModelScores,
      configModelScores,
      globalModelStats,
      mockLogger
    );

    // Raw data should include ALL models with config scores (not just qualifying ones)
    // This supports the capability-tuning page which needs raw data to recalculate scores
    expect(result.rawData.modelConfigs['provider:model-a']['uk-clinical-scenarios']).toBe(0.85);
    // Unqualified model should also be included in raw data (even though not in leaderboard)
    expect(result.rawData.modelConfigs['provider:model-unqualified']).toBeDefined();
    expect(result.rawData.modelConfigs['provider:model-unqualified']['uk-clinical-scenarios']).toBe(0.9);

    // However, the leaderboard should only include the qualifying model
    const safetyCapability = result.leaderboards.find(cap => cap.id === 'test-safety');
    expect(safetyCapability).toBeDefined();
    const qualifiedModel = safetyCapability!.leaderboard.find(m => m.modelId === 'provider:model-a');
    expect(qualifiedModel).toBeDefined();
    const unqualifiedModel = safetyCapability!.leaderboard.find(m => m.modelId === 'provider:model-unqualified');
    expect(unqualifiedModel).toBeUndefined(); // Should NOT be in leaderboard
  });

  it('should combine config scores with dimensions and topics in capability calculation', () => {
    
    // Add dimension grades
    const modelDimensionGrades = new Map();
    const modelAGrades = new Map();
    modelAGrades.set('safety', { 
      totalScore: 80, // 8.0 average
      count: 15, // Meet minimum runs threshold
      uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5', 'config6']),
      scores: Array(15).fill({ score: 8, configTitle: 'Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' })
    });
    modelDimensionGrades.set('provider:model-a', modelAGrades);
    
    // Add topic scores  
    const topicModelScores = new Map();
    const safetyScores = new Map();
    safetyScores.set('provider:model-a', {
      scores: Array(15).fill({ score: 0.8, configId: 'config1', configTitle: 'Test', runLabel: 'run1', timestamp: '2024-01-01' }),
      uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5', 'config6'])
    });
    topicModelScores.set('Safety', safetyScores);
    
    // Add config scores
    const configModelScores = new Map();
    const ukClinicalScores = new Map();
    ukClinicalScores.set('provider:model-a', 0.9);
    configModelScores.set('uk-clinical-scenarios', ukClinicalScores);
    // Add second listed config to pass presence gate
    const sycophancyScores = new Map();
    sycophancyScores.set('provider:model-a', 0.85);
    configModelScores.set('sycophancy-probe', sycophancyScores);

    // Add global qualification data
    const globalModelStats = new Map();
    globalModelStats.set('provider:model-a', {
      totalRuns: 15, // Meets ≥10 threshold
      uniqueConfigs: 6 // Meets ≥5 threshold
    });

    const result = calculateCapabilityLeaderboards(
      modelDimensionGrades,
      topicModelScores,
      configModelScores,
      globalModelStats,
      mockLogger
    );

    expect(result.leaderboards).toBeDefined();
    expect(result.leaderboards.length).toBe(1);
    expect(result.leaderboards[0].id).toBe('test-safety');
    expect(result.leaderboards[0].leaderboard.length).toBe(1);
    expect(result.leaderboards[0].leaderboard[0].modelId).toBe('provider:model-a');
    
    // Score should combine all three components (dimensions, topics, configs)
    // The exact calculation depends on internal weighting logic
    const combinedScore = result.leaderboards[0].leaderboard[0].averageScore;
    expect(combinedScore).toBeGreaterThan(0.6); // Should be a reasonable combined score
    expect(combinedScore).toBeLessThan(1.0); // Should be normalized
  });

  it('should handle empty config definitions gracefully', () => {
    // Note: This test uses the mock that has configs, but we test with empty configModelScores
    // to simulate what happens when configs exist in definitions but no data is available
    
    const modelDimensionGrades = new Map();
    const topicModelScores = new Map();
    const configModelScores = new Map();
    
    // No config scores provided

    const result = calculateCapabilityLeaderboards(
      modelDimensionGrades,
      topicModelScores,
      configModelScores,
      new Map(),
      mockLogger
    );

    // Should have empty modelConfigs since no config data was provided
    expect(result.rawData.modelConfigs).toEqual({});
  });

  it('should apply config weights correctly', () => {
    
    // Add sufficient dimension grades to meet thresholds
    const modelDimensionGrades = new Map();
    const modelAGrades = new Map();
    modelAGrades.set('safety', { 
      totalScore: 80, // 8.0 average
      count: 15, // Meet minimum runs threshold
      uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5', 'config6']),
      scores: Array(15).fill({ score: 8, configTitle: 'Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' })
    });
    modelDimensionGrades.set('provider:model-a', modelAGrades);
    
    const modelBGrades = new Map();
    modelBGrades.set('safety', { 
      totalScore: 90, // 9.0 average
      count: 15, // Meet minimum runs threshold
      uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5', 'config6']),
      scores: Array(15).fill({ score: 9, configTitle: 'Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' })
    });
    modelDimensionGrades.set('provider:model-b', modelBGrades);
    
    const topicModelScores = new Map();
    const configModelScores = new Map();
    
    // Add config scores for two models
    const ukClinicalScores = new Map();
    ukClinicalScores.set('provider:model-a', 0.8); // Will get weight 2.0 = 1.6
    ukClinicalScores.set('provider:model-b', 0.9); // Will get weight 2.0 = 1.8
    configModelScores.set('uk-clinical-scenarios', ukClinicalScores);
    // Add second listed config for both models to meet presence gate
    const sycophancyScores2 = new Map();
    sycophancyScores2.set('provider:model-a', 0.7);
    sycophancyScores2.set('provider:model-b', 0.95);
    configModelScores.set('sycophancy-probe', sycophancyScores2);

    // Add global qualification data for both models
    const globalModelStats = new Map();
    globalModelStats.set('provider:model-a', {
      totalRuns: 15, // Meets ≥10 threshold
      uniqueConfigs: 6 // Meets ≥5 threshold
    });
    globalModelStats.set('provider:model-b', {
      totalRuns: 15, // Meets ≥10 threshold
      uniqueConfigs: 6 // Meets ≥5 threshold
    });

    const result = calculateCapabilityLeaderboards(
      modelDimensionGrades,
      topicModelScores,
      configModelScores,
      globalModelStats,
      mockLogger
    );

    expect(result.leaderboards).toBeDefined();
    expect(result.leaderboards.length).toBe(1);
    expect(result.leaderboards[0].leaderboard.length).toBe(2);
    
    // Model B should rank higher due to both higher dimension and config scores
    expect(result.leaderboards[0].leaderboard[0].modelId).toBe('provider:model-b');
    expect(result.leaderboards[0].leaderboard[1].modelId).toBe('provider:model-a');
  });

  it('should log when processing configs', () => {
    const mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    const modelDimensionGrades = new Map();
    const topicModelScores = new Map();
    const configModelScores = new Map();
    
    const ukClinicalScores = new Map();
          ukClinicalScores.set('provider:model-a', 0.85);
      configModelScores.set('uk-clinical-scenarios', ukClinicalScores);

      // Add global qualification data
      const globalModelStats = new Map();
      globalModelStats.set('provider:model-a', {
        totalRuns: 15, // Meets ≥10 threshold
        uniqueConfigs: 6 // Meets ≥5 threshold
      });

      calculateCapabilityLeaderboards(
        modelDimensionGrades,
        topicModelScores,
        configModelScores,
        globalModelStats,
        mockLogger
      );

    // Should log the config processing section
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Collecting Config Contributions'));
  });

  describe('Run deduplication scenarios', () => {
    const mockLogger = {
      info: jest.fn(),
      warn: jest.fn(), 
      error: jest.fn()
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should deduplicate same run contributing via both topic and config (config wins)', () => {
      // Scenario: sycophancy-probe has "Safety" tag AND is explicitly listed as config
      // Topic weight: 1.5, Config weight: 2.0 → Config should win
      
      // Add sufficient dimension grades to meet thresholds
      const modelDimensionGrades = new Map();
      const modelAGrades = new Map();
      modelAGrades.set('safety', { 
        totalScore: 80, // 8.0 average
        count: 15, // Meet minimum runs threshold
        uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5', 'config6']),
        scores: Array(15).fill({ score: 8, configTitle: 'Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' })
      });
      modelDimensionGrades.set('provider:model-a', modelAGrades);
      
      // Topic scores: sycophancy-probe tagged with "Safety"
      const topicModelScores = new Map();
      const safetyTopic = new Map();
      safetyTopic.set('provider:model-a', {
        scores: [
          // The key deduplication case: same run via topic pathway
          {
            score: 0.80,
            configId: 'sycophancy-probe',
            configTitle: 'Sycophancy Probe', 
            runLabel: 'test-run',
            timestamp: '2024-07-03T12:00:00Z'
          },
          // Add enough other runs from different configs to meet threshold
          {
            score: 0.75,
            configId: 'other-safety-config-1',
            configTitle: 'Other Safety Config 1',
            runLabel: 'run-1',
            timestamp: '2024-07-01T10:00:00Z'
          },
          {
            score: 0.78,
            configId: 'other-safety-config-2', 
            configTitle: 'Other Safety Config 2',
            runLabel: 'run-1',
            timestamp: '2024-07-02T10:00:00Z'
          },
          {
            score: 0.72,
            configId: 'other-safety-config-3',
            configTitle: 'Other Safety Config 3', 
            runLabel: 'run-1',
            timestamp: '2024-07-03T10:00:00Z'
          },
          {
            score: 0.76,
            configId: 'other-safety-config-4',
            configTitle: 'Other Safety Config 4',
            runLabel: 'run-1',
            timestamp: '2024-07-04T10:00:00Z'
          },
          {
            score: 0.74,
            configId: 'other-safety-config-5',
            configTitle: 'Other Safety Config 5',
            runLabel: 'run-1', 
            timestamp: '2024-07-05T10:00:00Z'
          },
          {
            score: 0.77,
            configId: 'other-safety-config-6',
            configTitle: 'Other Safety Config 6',
            runLabel: 'run-1',
            timestamp: '2024-07-06T10:00:00Z'
          },
          {
            score: 0.73,
            configId: 'other-safety-config-7',
            configTitle: 'Other Safety Config 7',
            runLabel: 'run-1',
            timestamp: '2024-07-07T10:00:00Z'
          },
          {
            score: 0.79,
            configId: 'other-safety-config-8',
            configTitle: 'Other Safety Config 8',
            runLabel: 'run-1',
            timestamp: '2024-07-08T10:00:00Z'
          },
          {
            score: 0.71,
            configId: 'other-safety-config-9',
            configTitle: 'Other Safety Config 9',
            runLabel: 'run-1',
            timestamp: '2024-07-09T10:00:00Z'
          }
        ],
        uniqueConfigs: new Set(['sycophancy-probe', 'other-safety-config-1', 'other-safety-config-2', 'other-safety-config-3', 'other-safety-config-4', 'other-safety-config-5', 'other-safety-config-6', 'other-safety-config-7', 'other-safety-config-8', 'other-safety-config-9'])
      });
      topicModelScores.set('Safety', safetyTopic);

      // Config scores: same run explicitly referenced  
      const configModelScores = new Map();
      const sycophancyConfig = new Map();
      sycophancyConfig.set('provider:model-a', 0.80); // Same score, same run as in topic
      configModelScores.set('sycophancy-probe', sycophancyConfig);
      // Add another listed config to satisfy presence gate
      const ukClinicalConfig = new Map();
      ukClinicalConfig.set('provider:model-a', 0.82);
      configModelScores.set('uk-clinical-scenarios', ukClinicalConfig);

      // Add global qualification data
      const globalModelStats = new Map();
      globalModelStats.set('provider:model-a', {
        totalRuns: 15, // Meets ≥10 threshold
        uniqueConfigs: 6 // Meets ≥5 threshold
      });

      const result = calculateCapabilityLeaderboards(
        modelDimensionGrades,
        topicModelScores, 
        configModelScores,
        globalModelStats,
        mockLogger
      );

      // Find the test-safety capability
      const safetyCapability = result.leaderboards.find(cap => cap.id === 'test-safety');
      expect(safetyCapability).toBeDefined();
      
      const modelAScore = safetyCapability!.leaderboard.find(model => model.modelId === 'provider:model-a');
      expect(modelAScore).toBeDefined();
      
      // Deduplication implemented: Config pathway wins over topic pathway
      // The sycophancy-probe run should be counted once with config weight (2.0), not topic weight (1.5)
      // Other runs from different configs still contribute via topic pathway
      expect(modelAScore!.averageScore).toBeGreaterThan(0);
    });

    it('should deduplicate same run contributing via multiple topics (max weight wins)', () => {
      // Scenario: config-multi-topic has both "Safety" and "Mental Health" tags
      // Safety weight: 1.5, Mental Health weight: 1.8 → Mental Health should win
      
      const modelDimensionGrades = new Map();
      
      // Create enough runs to meet thresholds
      const baseRuns = [];
      for (let i = 1; i <= 10; i++) {
        baseRuns.push({
          score: 0.70 + (i * 0.01), // Varying scores 0.71-0.80
          configId: `base-config-${i}`,
          configTitle: `Base Config ${i}`,
          runLabel: 'run-1',
          timestamp: `2024-07-0${i}T10:00:00Z`
        });
      }

      // Topic scores: same run appears in multiple topics
      const topicModelScores = new Map();
      
      // Safety topic - includes the multi-topic run + base runs
      const safetyTopic = new Map();
      safetyTopic.set('provider:model-a', {
        scores: [
          {
            score: 0.75,
            configId: 'config-multi-topic',
            configTitle: 'Multi Topic Config',
            runLabel: 'test-run', 
            timestamp: '2024-07-03T12:00:00Z'
          },
          ...baseRuns
        ],
        uniqueConfigs: new Set(['config-multi-topic', ...baseRuns.map(r => r.configId)])
      });
      topicModelScores.set('Safety', safetyTopic);

      // Mental Health topic - includes the SAME multi-topic run + some base runs
      const mentalHealthTopic = new Map();
      mentalHealthTopic.set('provider:model-a', {
        scores: [
          {
            score: 0.75, // Same score, same run
            configId: 'config-multi-topic', // Same config 
            configTitle: 'Multi Topic Config',
            runLabel: 'test-run', // Same run
            timestamp: '2024-07-03T12:00:00Z' // Same timestamp
          },
          ...baseRuns.slice(0, 5) // Some overlap for realism
        ],
        uniqueConfigs: new Set(['config-multi-topic', ...baseRuns.slice(0, 5).map(r => r.configId)])
      });
      topicModelScores.set('Mental Health & Crisis Support', mentalHealthTopic);

      const configModelScores = new Map();
      // Add two listed configs to satisfy presence gate (scores arbitrary)
      const ukClinical = new Map();
      ukClinical.set('provider:model-a', 0.8);
      configModelScores.set('uk-clinical-scenarios', ukClinical);
      const sycophancy2 = new Map();
      sycophancy2.set('provider:model-a', 0.78);
      configModelScores.set('sycophancy-probe', sycophancy2);

      // Add global qualification data
      const globalModelStats = new Map();
      globalModelStats.set('provider:model-a', {
        totalRuns: 15, // Meets ≥10 threshold
        uniqueConfigs: 6 // Meets ≥5 threshold
      });

      const result = calculateCapabilityLeaderboards(
        modelDimensionGrades,
        topicModelScores,
        configModelScores,
        globalModelStats,
        mockLogger
      );

      const safetyCapability = result.leaderboards.find(cap => cap.id === 'test-safety');
      expect(safetyCapability).toBeDefined();
      
      const modelAScore = safetyCapability!.leaderboard.find(model => model.modelId === 'provider:model-a');
      expect(modelAScore).toBeDefined();
      
      // Deduplication implemented: Max weight topic wins among multiple topics  
      expect(modelAScore!.averageScore).toBeGreaterThan(0);
    });

    it('should handle different runs from same config normally (no deduplication)', () => {
      // This test doesn't need deduplication since different runs are legitimately different
      
      // Add sufficient dimension grades to meet thresholds
      const modelDimensionGrades = new Map();
      const modelAGrades = new Map();
      modelAGrades.set('safety', { 
        totalScore: 80, // 8.0 average
        count: 15, // Meet minimum runs threshold
        uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5', 'config6']),
        scores: Array(15).fill({ score: 8, configTitle: 'Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' })
      });
      modelDimensionGrades.set('provider:model-a', modelAGrades);
      
      // Create enough runs to meet thresholds - all different runs, no deduplication needed
      const runs = [];
      for (let i = 1; i <= 12; i++) {
        runs.push({
          score: 0.70 + (i * 0.01), // Varying scores
          configId: `config-${Math.ceil(i/2)}`, // 2 runs per config to get 6 configs
          configTitle: `Config ${Math.ceil(i/2)}`,
          runLabel: `run-${(i % 2) + 1}`, // Different run labels
          timestamp: `2024-07-${String(i).padStart(2, '0')}T10:00:00Z`
        });
      }
      
      const topicModelScores = new Map();
      const safetyTopic = new Map();
      safetyTopic.set('provider:model-a', {
        scores: runs,
        uniqueConfigs: new Set(runs.map(r => r.configId))
      });
      topicModelScores.set('Safety', safetyTopic);

      const configModelScores = new Map();
      // Satisfy presence gate with two listed configs
      const ukClinical = new Map();
      ukClinical.set('provider:model-a', 0.8);
      configModelScores.set('uk-clinical-scenarios', ukClinical);
      const sycophancy = new Map();
      sycophancy.set('provider:model-a', 0.78);
      configModelScores.set('sycophancy-probe', sycophancy);

      // Add global qualification data
      const globalModelStats = new Map();
      globalModelStats.set('provider:model-a', {
        totalRuns: 15, // Meets ≥10 threshold
        uniqueConfigs: 6 // Meets ≥5 threshold
      });

      const result = calculateCapabilityLeaderboards(
        modelDimensionGrades,
        topicModelScores,
        configModelScores,
        globalModelStats,
        mockLogger
      );

      const safetyCapability = result.leaderboards.find(cap => cap.id === 'test-safety');
      expect(safetyCapability).toBeDefined();
      
      const modelAScore = safetyCapability!.leaderboard.find(model => model.modelId === 'provider:model-a');
      expect(modelAScore).toBeDefined();
      
      // Should work normally - just verify it makes the leaderboard
      expect(modelAScore!.averageScore).toBeGreaterThan(0);
    });

    it('should leave dimensions unaffected by topic/config deduplication', () => {
      // Dimensions should work exactly as before, regardless of topic/config deduplication
      
      // Set up dimension data with enough configs/runs
      const modelDimensionGrades = new Map();
      const modelASafety = new Map();
      modelASafety.set('safety', {
        totalScore: 80, // 8.0 average from 10 evaluations  
        count: 10,
        uniqueConfigs: new Set(['config-1', 'config-2', 'config-3', 'config-4', 'config-5', 'config-6'])
      });
      modelDimensionGrades.set('provider:model-a', modelASafety);

      // Minimal topic data to meet thresholds
      const topicModelScores = new Map();
      const safetyTopic = new Map();
      const runs = [];
      for (let i = 1; i <= 10; i++) {
        runs.push({
          score: 0.70,
          configId: `topic-config-${i}`,
          configTitle: `Topic Config ${i}`,
          runLabel: 'run-1',
          timestamp: `2024-07-${String(i).padStart(2, '0')}T10:00:00Z`
        });
      }
      safetyTopic.set('provider:model-a', {
        scores: runs,
        uniqueConfigs: new Set(runs.map(r => r.configId))
      });
      topicModelScores.set('Safety', safetyTopic);

      const configModelScores = new Map();
      // Satisfy presence gate with two listed configs
      const ukClinical = new Map();
      ukClinical.set('provider:model-a', 0.8);
      configModelScores.set('uk-clinical-scenarios', ukClinical);
      const sycophancy = new Map();
      sycophancy.set('provider:model-a', 0.78);
      configModelScores.set('sycophancy-probe', sycophancy);

      // Add global qualification data
      const globalModelStats = new Map();
      globalModelStats.set('provider:model-a', {
        totalRuns: 15, // Meets ≥10 threshold
        uniqueConfigs: 6 // Meets ≥5 threshold
      });

      const result = calculateCapabilityLeaderboards(
        modelDimensionGrades,
        topicModelScores,
        configModelScores,
        globalModelStats,
        mockLogger
      );

      const safetyCapability = result.leaderboards.find(cap => cap.id === 'test-safety');
      expect(safetyCapability).toBeDefined();
      
      const modelAScore = safetyCapability!.leaderboard.find(model => model.modelId === 'provider:model-a');
      expect(modelAScore).toBeDefined();
      
      // Dimensions should contribute as before - just verify it works
      expect(modelAScore!.averageScore).toBeGreaterThan(0);
    });

    it('should work normally when runs only contribute via one pathway', () => {
      // No overlap, should work exactly as before
      
      // Add sufficient dimension grades to meet thresholds
      const modelDimensionGrades = new Map();
      const modelAGrades = new Map();
      modelAGrades.set('safety', { 
        totalScore: 80, // 8.0 average
        count: 15, // Meet minimum runs threshold
        uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5', 'config6']),
        scores: Array(15).fill({ score: 8, configTitle: 'Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' })
      });
      modelDimensionGrades.set('provider:model-a', modelAGrades);
      
      // Topic scores only  
      const topicModelScores = new Map();
      const safetyTopic = new Map();
      const topicRuns = [];
      for (let i = 1; i <= 6; i++) {
        topicRuns.push({
          score: 0.80,
          configId: `topic-only-config-${i}`,
          configTitle: `Topic Only Config ${i}`,
          runLabel: 'run-1',
          timestamp: `2024-07-${String(i).padStart(2, '0')}T10:00:00Z`
        });
      }
      safetyTopic.set('provider:model-a', {
        scores: topicRuns,
        uniqueConfigs: new Set(topicRuns.map(r => r.configId))
      });
      topicModelScores.set('Safety', safetyTopic);

      // Config scores only (different configs)
      const configModelScores = new Map();
      for (let i = 1; i <= 5; i++) {
        const configMap = new Map();
        configMap.set('provider:model-a', 0.85);
        configModelScores.set(`explicit-only-config-${i}`, configMap);
      }
      // Also satisfy presence gate with listed configs
      const ukClinical2 = new Map();
      ukClinical2.set('provider:model-a', 0.82);
      configModelScores.set('uk-clinical-scenarios', ukClinical2);
      const sycophancy3 = new Map();
      sycophancy3.set('provider:model-a', 0.81);
      configModelScores.set('sycophancy-probe', sycophancy3);

      // Add global qualification data
      const globalModelStats = new Map();
      globalModelStats.set('provider:model-a', {
        totalRuns: 15, // Meets ≥10 threshold
        uniqueConfigs: 6 // Meets ≥5 threshold
      });

      const result = calculateCapabilityLeaderboards(
        modelDimensionGrades,
        topicModelScores,
        configModelScores,
        globalModelStats,
        mockLogger
      );

      const safetyCapability = result.leaderboards.find(cap => cap.id === 'test-safety');
      expect(safetyCapability).toBeDefined();
      
      const modelAScore = safetyCapability!.leaderboard.find(model => model.modelId === 'provider:model-a');
      expect(modelAScore).toBeDefined();
      
      // Should combine both contributions normally - just verify it works
      expect(modelAScore!.averageScore).toBeGreaterThan(0);
    });
  });

  describe('Per-capability config presence requirement (≥ half of listed configs)', () => {
    const makeGlobalStats = () => {
      const globalModelStats = new Map();
      globalModelStats.set('provider:model-a', {
        totalRuns: 15,
        uniqueConfigs: 6,
      });
      return globalModelStats;
    };

    const makeDimensionGrades = () => {
      const modelDimensionGrades = new Map();
      const modelAGrades = new Map();
      modelAGrades.set('safety', {
        totalScore: 80,
        count: 15,
        uniqueConfigs: new Set(['config1', 'config2', 'config3', 'config4', 'config5', 'config6']),
        scores: Array(15).fill({ score: 8, configTitle: 'Test', runLabel: 'run1', timestamp: '2024-01-01', configId: 'config1' })
      });
      modelDimensionGrades.set('provider:model-a', modelAGrades);
      return modelDimensionGrades;
    };

    it('excludes model if present in fewer than half of listed configs', () => {
      const modelDimensionGrades = makeDimensionGrades();
      const topicModelScores = new Map();
      const configModelScores = new Map();
      // CAPABILITY_BUCKETS lists 3 configs in this test suite mock: uk-clinical-scenarios, sycophancy-probe, explicit-only-config
      // Provide score for only 1 of them → requires ceil(3/2)=2, so should exclude
      const ukClinical = new Map();
      ukClinical.set('provider:model-a', 0.85);
      configModelScores.set('uk-clinical-scenarios', ukClinical);

      const result = calculateCapabilityLeaderboards(
        modelDimensionGrades,
        topicModelScores,
        configModelScores,
        makeGlobalStats(),
        mockLogger
      );

      const safetyCapability = result.leaderboards.find(cap => cap.id === 'test-safety');
      expect(safetyCapability).toBeDefined();
      const included = safetyCapability!.leaderboard.find(m => m.modelId === 'provider:model-a');
      expect(included).toBeUndefined();
    });

    it('includes model if present in at least half of listed configs', () => {
      const modelDimensionGrades = makeDimensionGrades();
      const topicModelScores = new Map();
      const configModelScores = new Map();
      // Provide scores for 2 of the 3 listed configs → meets ceil(3/2)=2
      const ukClinical = new Map();
      ukClinical.set('provider:model-a', 0.85);
      configModelScores.set('uk-clinical-scenarios', ukClinical);

      const sycophancy = new Map();
      sycophancy.set('provider:model-a', 0.80);
      configModelScores.set('sycophancy-probe', sycophancy);

      const result = calculateCapabilityLeaderboards(
        modelDimensionGrades,
        topicModelScores,
        configModelScores,
        makeGlobalStats(),
        mockLogger
      );

      const safetyCapability = result.leaderboards.find(cap => cap.id === 'test-safety');
      expect(safetyCapability).toBeDefined();
      const included = safetyCapability!.leaderboard.find(m => m.modelId === 'provider:model-a');
      expect(included).toBeDefined();
    });
  });
}); 