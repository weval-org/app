// Neutral shared summary types for both CLI and UI

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

export interface CapabilityRawData {
  modelDimensions: Record<string, Record<string, number>>; // modelId -> dimension -> normalized_score (0-1)
  modelTopics: Record<string, Record<string, number>>;     // modelId -> topic -> score (0-1)
  modelConfigs: Record<string, Record<string, number>>;    // modelId -> configId -> score (0-1)
  modelAxes?: Record<string, Record<string, number>>;      // modelId -> compassAxis -> value (0-1)
  qualifyingModels: string[]; // Models that meet the minimum thresholds globally
  capabilityQualifyingModels?: Record<string, string[]>; // capabilityId -> qualifying models for that capability
}

export interface PotentialDriftInfo {
  configId: string;
  configTitle: string;
  runLabel: string;
  modelId: string;
  minScore: number;
  maxScore: number;
  scoreRange: number;
  runsCount: number;
  oldestTimestamp: string;
  newestTimestamp: string;
  minScoreTimestamp: string;
  maxScoreTimestamp: string;
}


