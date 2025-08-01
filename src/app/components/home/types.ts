export interface HeadlineStatInfo {
  configId: string;
  configTitle: string;
  value: number;
  description?: string;
  latestRunLabel?: string;
  latestRunTimestamp?: string;
}

export interface TopModelStatInfo {
  modelId: string;
  overallAverageHybridScore: number;
  overallAverageSimilarityScore?: number;
  overallAverageCoverageScore?: number;
  runsParticipatedIn: number;
  uniqueConfigsParticipatedIn: number;
  runs: Array<{
    configId: string;
    configTitle: string;
    runLabel: string;
    timestamp: string;
    hybridScore?: number | null;
    similarityScore?: number | null;
    coverageScore?: number | null;
  }>;
}

export interface DimensionScoreInfo {
  modelId: string;
  averageScore: number;
  runsCount: number;
  latestScores?: Array<{
    configTitle: string;
    runUrl: string;
    score: number;
  }>;
}

export interface DimensionLeaderboard {
  dimension: string;
  leaderboard: DimensionScoreInfo[];
}

export interface TopicChampionInfo {
  modelId: string;
  averageScore: number;
  uniqueConfigsCount: number;
  contributingRuns: Array<{
    configId: string;
    configTitle: string;
    runLabel: string;
    timestamp: string;
    score: number;
  }>;
}

export interface AggregateStatsData {
  bestPerformingConfig: HeadlineStatInfo | null;
  worstPerformingConfig: HeadlineStatInfo | null;
  leastConsistentConfig: HeadlineStatInfo | null;
  rankedOverallModels: TopModelStatInfo[] | null;
  dimensionLeaderboards?: DimensionLeaderboard[] | null;
  topicChampions?: Record<string, TopicChampionInfo[]> | null;
  capabilityLeaderboards?: CapabilityLeaderboard[] | null;
}

export interface CapabilityScoreInfo {
  modelId: string;
  averageScore: number;
  contributingRuns: number;
  contributingDimensions: number;
}

export interface CapabilityLeaderboard {
  id: string;
  label: string;
  description: string;
  icon: string;
  leaderboard: CapabilityScoreInfo[];
} 