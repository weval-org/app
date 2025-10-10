/**
 * Type definitions for regression detection system
 */

import { ModelVersion, ModelSeries } from '@/lib/model-version-registry';

export interface RegressionCriterion {
  type: 'point' | 'prompt' | 'dimension' | 'blueprint';
  severity: 'major' | 'moderate' | 'minor';

  // Context
  blueprintId: string;
  blueprintTitle: string;
  promptId?: string;
  promptText?: string;
  pointText?: string;
  dimensionKey?: string;

  // Scores
  olderVersion: {
    modelId: string;
    score: number;
    timestamp: string;
    runLabel: string;
    fileName: string;
  };
  newerVersion: {
    modelId: string;
    score: number;
    timestamp: string;
    runLabel: string;
    fileName: string;
  };

  scoreDelta: number; // Negative = regression, positive = improvement
  percentChange: number; // Percentage change
}

export interface ModelSeriesRegression {
  seriesId: string;
  seriesName: string;
  maker: string;
  tier: 'fast' | 'balanced' | 'powerful';
  versionComparison: {
    older: ModelVersion;
    newer: ModelVersion;
  };
  regressions: RegressionCriterion[];
  improvements: RegressionCriterion[];
  sharedBlueprints: Array<{
    id: string;
    title: string;
    olderRunCount: number;
    newerRunCount: number;
  }>;
  overallRegressionScore: number; // 0-100 weighted severity
}

export interface RegressionsSummary {
  regressions: ModelSeriesRegression[];
  generatedAt: string;
  thresholds: {
    minScoreDelta: number;
    majorThreshold: number;
    moderateThreshold: number;
    minorThreshold: number;
  };
  metadata: {
    totalSeriesAnalyzed: number;
    totalVersionComparisons: number;
    totalRegressions: number;
    totalImprovements: number;
    totalBlueprintsScanned: number;
  };
}

// UI-specific helpers
export interface RegressionsByMaker {
  [maker: string]: ModelSeriesRegression[];
}

export interface RegressionsByTier {
  fast: ModelSeriesRegression[];
  balanced: ModelSeriesRegression[];
  powerful: ModelSeriesRegression[];
}

export interface RegressionFilters {
  maker?: string[];
  tier?: ('fast' | 'balanced' | 'powerful')[];
  severity?: ('major' | 'moderate' | 'minor')[];
  type?: ('point' | 'prompt' | 'dimension' | 'blueprint')[];
  blueprintIds?: string[];
  minSeverityScore?: number;
}
