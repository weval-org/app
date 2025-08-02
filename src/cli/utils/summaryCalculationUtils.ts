import {
  EnhancedComparisonConfigInfo,
  EnhancedRunInfo,
} from '@/app/utils/homepageDataUtils';
import {
  AggregateStatsData,
  HeadlineStatInfo,
  TopModelStatInfo,
  DimensionLeaderboard,
  DimensionScoreInfo,
} from '@/app/components/home/types';
import { PotentialDriftInfo } from '@/app/components/ModelDriftIndicator';
import { parseEffectiveModelId, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import {
  calculateStandardDeviation,
  IDEAL_MODEL_ID,
  calculateHybridScore,
} from '@/app/utils/calculationUtils';
import { fromSafeTimestamp } from '../../lib/timestampUtils';
import { PerModelScoreStats } from '@/app/utils/homepageDataUtils';
import { normalizeTag, normalizeTopicKey } from '@/app/utils/tagUtils';
import { WevalResult } from '@/types/shared';
import { CAPABILITY_BUCKETS, CapabilityBucket } from '@/lib/capabilities';
import { CapabilityLeaderboard, CapabilityScoreInfo } from '@/app/components/home/types';

// A simplified logger type for this function to avoid circular dependencies
type SimpleLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

const SIGNIFICANT_SCORE_CHANGE_THRESHOLD = 0.1; // 10% change
const MIN_ABSOLUTE_SCORE_DIFFERENCE = 0.05; // 5 percentage points
const MIN_TIME_DIFFERENCE_FOR_DRIFT_MS = 23 * 60 * 60 * 1000; // 23 hours

type GradeScoreInfo = {
  score: number;
  configTitle: string;
  runLabel: string;
  timestamp: string;
  configId: string;
};

type ChampionModelInfo = {
  modelId: string;
  avgScore: number;
  count: number;
  scores: GradeScoreInfo[];
};

export interface HeadlineStats {
  bestPerformingConfig: HeadlineStatInfo | null;
  worstPerformingConfig: HeadlineStatInfo | null;
  leastConsistentConfig: HeadlineStatInfo | null;
  rankedOverallModels: TopModelStatInfo[] | null;
  dimensionLeaderboards: DimensionLeaderboard[] | null;
  capabilityLeaderboards?: CapabilityLeaderboard[] | null;
}



export interface TopicChampion {
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

export function calculateHeadlineStats(
  allConfigs: EnhancedComparisonConfigInfo[],
  modelDimensionGrades: Map<string, Map<string, { totalScore: number; count: number; uniqueConfigs: Set<string>; scores: Array<{ score: number; configTitle: string; runLabel: string; timestamp: string; configId: string; }> }>>,
  topicModelScores: Map<string, Map<string, { scores: Array<{ score: number; configId: string; configTitle: string; runLabel: string; timestamp: string; }>; uniqueConfigs: Set<string> }>>,
  logger?: SimpleLogger,
): HeadlineStats {
  const testTaggedConfigs = new Set<string>();
  allConfigs.forEach((config) => {
    if (config.tags && config.tags.includes('test')) {
      testTaggedConfigs.add(config.id || config.configId);
    }
  });

  if (testTaggedConfigs.size > 0) {
    console.log(`[calculateHeadlineStats] Found ${testTaggedConfigs.size} configs with "test" tag. Excluding them from calculations.`);
  }

  const filteredConfigs = allConfigs.filter(
    config => !(config.tags && config.tags.includes('test'))
  );

  if (filteredConfigs.length === 0) {
    console.log('[calculateHeadlineStats] No configs remaining after filtering out "test" tags. Returning null.');
    return {
      bestPerformingConfig: null,
      worstPerformingConfig: null,
      leastConsistentConfig: null,
      rankedOverallModels: null,
      dimensionLeaderboards: null,
      capabilityLeaderboards: null,
    };
  }

  let bestPerformingConfig: HeadlineStatInfo | null = null;
  let worstPerformingConfig: HeadlineStatInfo | null = null;
  let leastConsistentConfig: HeadlineStatInfo | null = null;

  filteredConfigs.forEach(config => {
    const configTitle = config.title || config.configTitle || config.id || config.configId;
    const latestRun = config.runs?.reduce((latest, current) => 
      new Date(fromSafeTimestamp(current.timestamp)) > new Date(fromSafeTimestamp(latest.timestamp)) ? current : latest
    , config.runs[0]);

    if (config.overallAverageHybridScore !== null && config.overallAverageHybridScore !== undefined) {
      if (!bestPerformingConfig || config.overallAverageHybridScore > bestPerformingConfig.value) {
        bestPerformingConfig = {
          configId: config.id || config.configId,
          configTitle: configTitle,
          value: config.overallAverageHybridScore,
          latestRunLabel: latestRun?.runLabel,
          latestRunTimestamp: latestRun?.timestamp,
        };
      }
      if (!worstPerformingConfig || config.overallAverageHybridScore < worstPerformingConfig.value) {
        worstPerformingConfig = {
          configId: config.id || config.configId,
          configTitle: configTitle,
          value: config.overallAverageHybridScore,
          latestRunLabel: latestRun?.runLabel,
          latestRunTimestamp: latestRun?.timestamp,
        };
      }
    }
  });

  // For MOST DIFFERENTIATING, we calculate the standard deviation of the *average scores per model* for each config.
  // A high std dev here means the config is effective at separating models by performance.
  // This replaces the previous logic that used config.hybridScoreStdDev (which measured variance between runs).
  const configsForDifferentiationCheck = filteredConfigs.filter(
    config => config.runs && config.runs.length > 0,
  );

  configsForDifferentiationCheck.forEach(config => {
    const modelScoresForConfig = new Map<string, { totalScore: number; count: number }>();

    config.runs.forEach(run => {
      if (run.perModelScores) {
        const scoresMap =
          run.perModelScores instanceof Map
            ? run.perModelScores
            : new Map(
                Object.entries(run.perModelScores || {}) as [
                  string,
                  PerModelScoreStats,
                ][],
              );

        scoresMap.forEach((scoreStats, modelId) => {
          if (modelId === IDEAL_MODEL_ID) return;
          if (scoreStats && scoreStats.hybrid.average !== null && scoreStats.hybrid.average !== undefined) {
            const parsed = parseEffectiveModelId(modelId);
            const baseModelId = parsed.baseId; // Group by base model ID

            const current = modelScoresForConfig.get(baseModelId) || { totalScore: 0, count: 0 };
            current.totalScore += scoreStats.hybrid.average;
            current.count++;
            modelScoresForConfig.set(baseModelId, current);
          }
        });
      }
    });

    const averageModelScores: number[] = [];
    modelScoresForConfig.forEach(data => {
      if (data.count > 0) {
        averageModelScores.push(data.totalScore / data.count);
      }
    });

    // We need at least 2 models to calculate a meaningful standard deviation
    if (averageModelScores.length >= 2) {
      const differentiationScore = calculateStandardDeviation(averageModelScores);
      if (differentiationScore !== null) {
        const configTitle = config.title || config.configTitle || config.id || config.configId;
        const latestRun = config.runs?.reduce((latest, current) => 
            new Date(fromSafeTimestamp(current.timestamp)) > new Date(fromSafeTimestamp(latest.timestamp)) ? current : latest
        , config.runs[0]);

        if (!leastConsistentConfig || differentiationScore > leastConsistentConfig.value) {
          leastConsistentConfig = {
            configId: config.id || config.configId,
            configTitle: configTitle,
            value: differentiationScore,
            latestRunLabel: latestRun?.runLabel,
            latestRunTimestamp: latestRun?.timestamp,
          };
        }
      }
    }
  });

  const allModelScores = new Map<
    string,
    {
      totalHybridScore: number;
      hybridCount: number;
      totalSimilarityScore: number;
      similarityCount: number;
      totalCoverageScore: number;
      coverageCount: number;
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
  >();
  
  // --- For Executive Summary Grade Aggregation ---
  const MIN_UNIQUE_CONFIGS_FOR_CHAMPION = 5; // Lowered from 10
  const MIN_SCORE_THRESHOLD = 5.0;
  const CONSISTENCY_THRESHOLD = 0.8; // 80% of scores must be >= 5.0

  const dimensionLeaderboards: DimensionLeaderboard[] = [];
  const dimensionGrades = new Map<string, Array<{ modelId: string; averageScore: number; runsCount: number, uniqueConfigsCount: number, latestScores: Array<{ configTitle: string; runUrl:string; score: number; }> }>>();

  // 1. Aggregate scores per dimension
  for (const [modelId, grades] of modelDimensionGrades.entries()) {
      for (const [dimension, data] of grades.entries()) {
          if (!dimensionGrades.has(dimension)) {
              dimensionGrades.set(dimension, []);
          }
          const avgScore = data.totalScore / data.count;
          const latestScores = data.scores
              .sort((a, b) => new Date(fromSafeTimestamp(b.timestamp)).getTime() - new Date(fromSafeTimestamp(a.timestamp)).getTime())
              .slice(0, 5) // Take latest 5
              .map(s => ({
                  configTitle: s.configTitle,
                  runUrl: `/analysis/${s.configId}/${s.runLabel}/${s.timestamp}`,
                  score: s.score,
              }));

          dimensionGrades.get(dimension)!.push({
              modelId,
              averageScore: avgScore,
              runsCount: data.count,
              uniqueConfigsCount: data.uniqueConfigs.size,
              latestScores,
          });
      }
  }

  // 2. Find top models for each dimension to create a leaderboard
  const LEADERBOARD_SIZE = 3;
  for (const [dimension, models] of dimensionGrades.entries()) {
      const eligibleModels = models.filter(m => {
          const hasEnoughConfigs = m.uniqueConfigsCount >= MIN_UNIQUE_CONFIGS_FOR_CHAMPION;
          const scoresAboveThreshold = m.latestScores.filter(s => s.score >= MIN_SCORE_THRESHOLD).length;
          const consistency = m.latestScores.length > 0 ? scoresAboveThreshold / m.latestScores.length : 0;
          const hasConsistentScores = consistency >= CONSISTENCY_THRESHOLD;

          let isEligible = hasEnoughConfigs && hasConsistentScores;
          
          if (logger) {
              if (!hasEnoughConfigs) {
                  logger.info(`[${dimension}] Excluding ${m.modelId}: Not enough unique configs (${m.uniqueConfigsCount} < ${MIN_UNIQUE_CONFIGS_FOR_CHAMPION})`);
              } else if (!hasConsistentScores) {
                  logger.info(`[${dimension}] Excluding ${m.modelId}: Score consistency too low (${(consistency * 100).toFixed(0)}% < ${(CONSISTENCY_THRESHOLD * 100).toFixed(0)}%)`);
              } else {
                  logger.info(`[${dimension}] Including ${m.modelId}: Passed all checks (Configs: ${m.uniqueConfigsCount}, Consistency: ${(consistency * 100).toFixed(0)}%)`);
              }
          }
          
          return isEligible;
      });

      if (logger) {
          logger.info(`[${dimension}] Leaderboard: Found ${eligibleModels.length} eligible models.`);
      }

      if (eligibleModels.length > 0) {
          const sortedModels = eligibleModels.sort((a, b) => b.averageScore - a.averageScore);
          const leaderboard = sortedModels.slice(0, LEADERBOARD_SIZE).map((model): DimensionScoreInfo => ({
              modelId: model.modelId,
              averageScore: model.averageScore,
              runsCount: model.runsCount,
              latestScores: model.latestScores,
          }));
          
          dimensionLeaderboards.push({
              dimension,
              leaderboard,
          });
      }
  }

  dimensionLeaderboards.sort((a, b) => a.dimension.localeCompare(b.dimension));


  filteredConfigs.forEach((config) => {
    if (!config.runs || config.runs.length === 0) {
      return;
    }

    // Only process the latest run per config (runs are sorted by timestamp desc)
    // This matches the pattern used for dimension leaderboards and topic champions
    const latestRun = config.runs[0];
    
    if (latestRun.perModelScores || (latestRun as any).perModelHybridScores) {
        const isNewFormat = !!latestRun.perModelScores;

        const scoresMap = isNewFormat
        ? latestRun.perModelScores instanceof Map
            ? latestRun.perModelScores
            : new Map(
                Object.entries(latestRun.perModelScores || {}) as [
                string,
                PerModelScoreStats,
                ][],
            )
        : (latestRun as any).perModelHybridScores instanceof Map
        ? (latestRun as any).perModelHybridScores
        : new Map(
            Object.entries((latestRun as any).perModelHybridScores || {}) as [
                string,
                { average: number | null },
            ][],
            );
        
        scoresMap.forEach(
            (
                scoreStats: PerModelScoreStats | { average: number | null },
                modelId: string,
            ) => {
                if (modelId === IDEAL_MODEL_ID) return;
    
                let hybridScore: number | null | undefined;
                let similarityScore: number | null | undefined;
                let coverageScore: number | null | undefined;
    
                if (isNewFormat) {
                  const newStats = scoreStats as PerModelScoreStats;
                  hybridScore = newStats.hybrid?.average;
                  similarityScore = newStats.similarity?.average;
                  coverageScore = newStats.coverage?.average;
                } else {
                  const oldStats = scoreStats as { average: number | null };
                  hybridScore = oldStats.average;
                  similarityScore = undefined;
                  coverageScore = undefined;
                }
    
                const parsed = parseEffectiveModelId(modelId);
                const baseModelId = parsed.baseId;
                const current = allModelScores.get(baseModelId) || {
                    totalHybridScore: 0,
                    hybridCount: 0,
                    totalSimilarityScore: 0,
                    similarityCount: 0,
                    totalCoverageScore: 0,
                    coverageCount: 0,
                    runs: [],
                };
    
                if (hybridScore !== null && hybridScore !== undefined && !isNaN(hybridScore)) {
                    current.totalHybridScore += hybridScore;
                    current.hybridCount++;
                }
                if (similarityScore !== null && similarityScore !== undefined && !isNaN(similarityScore)) {
                    current.totalSimilarityScore += similarityScore;
                    current.similarityCount++;
                }
                if (coverageScore !== null && coverageScore !== undefined && !isNaN(coverageScore)) {
                    current.totalCoverageScore += coverageScore;
                    current.coverageCount++;
                }
    
                const hasValidScore = 
                    (hybridScore !== null && hybridScore !== undefined && !isNaN(hybridScore)) ||
                    (similarityScore !== null && similarityScore !== undefined && !isNaN(similarityScore)) ||
                    (coverageScore !== null && coverageScore !== undefined && !isNaN(coverageScore));

                if (hasValidScore) {
                    current.runs.push({
                        configId: config.configId,
                        configTitle: config.title || config.configTitle,
                        runLabel: latestRun.runLabel,
                        timestamp: latestRun.timestamp,
                        hybridScore,
                        similarityScore,
                        coverageScore,
                    });
                    allModelScores.set(baseModelId, current);
                }
            }
        );
    }
  });

  const rankedOverallModels: TopModelStatInfo[] = Array.from(
    allModelScores.entries(),
  )
    .map(([modelId, data]) => {
      const avgHybrid =
        data.hybridCount > 0
          ? data.totalHybridScore / data.hybridCount
          : 0;
      const avgSimilarity =
        data.similarityCount > 0
          ? data.totalSimilarityScore / data.similarityCount
          : undefined;
      const avgCoverage =
        data.coverageCount > 0
          ? data.totalCoverageScore / data.coverageCount
          : undefined;

      const uniqueConfigs = new Set(data.runs.map(r => r.configId));

      return {
        modelId: modelId,
        overallAverageHybridScore: avgHybrid,
        overallAverageSimilarityScore: avgSimilarity,
        overallAverageCoverageScore: avgCoverage,
        runsParticipatedIn: data.hybridCount,
        uniqueConfigsParticipatedIn: uniqueConfigs.size,
        runs: data.runs,
      };
    })
    .sort((a, b) => b.overallAverageHybridScore - a.overallAverageHybridScore);

  const capabilityLeaderboards = calculateCapabilityLeaderboards(
    modelDimensionGrades,
    topicModelScores,
    logger
  );

  return {
    bestPerformingConfig,
    worstPerformingConfig,
    leastConsistentConfig,
    rankedOverallModels: rankedOverallModels.length > 0 ? rankedOverallModels : null,
    dimensionLeaderboards: dimensionLeaderboards.length > 0 ? dimensionLeaderboards : null,
    capabilityLeaderboards,
  };
}

export function calculateCapabilityLeaderboards(
  modelDimensionGrades: Map<string, Map<string, { totalScore: number; count: number; uniqueConfigs: Set<string> }>>,
  topicModelScores: Map<string, Map<string, { scores: Array<{ score: number; configId: string; configTitle: string; runLabel: string; timestamp: string; }>; uniqueConfigs: Set<string> }>>,
  logger?: SimpleLogger,
): CapabilityLeaderboard[] {
  const modelCapabilityScores = new Map<string, Map<string, { totalScore: number; totalWeight: number; contributingRuns: number; contributingDimensions: number; }>>();

  if (logger) {
    logger.info('=== CAPABILITY LEADERBOARDS CALCULATION DEBUG ===');
    logger.info(`Processing ${modelDimensionGrades.size} models with dimension grades`);
    logger.info(`Processing ${topicModelScores.size} topics with model scores`);
  }

  // 1. Process Dimension Scores
  if (logger) logger.info('\n--- Processing Dimension Scores ---');
  modelDimensionGrades.forEach((dimensions, modelId) => {
    if (logger) logger.info(`\nModel: ${modelId}`);
    dimensions.forEach((data, dimensionKey) => {
      const avgDimensionScore = data.totalScore / data.count;
      const normalizedScore = (avgDimensionScore - 1) / 9; // Normalize 1-10 to 0-1
      
      if (logger) {
        logger.info(`  Dimension "${dimensionKey}": avg=${avgDimensionScore.toFixed(2)}/10, normalized=${(normalizedScore * 100).toFixed(1)}% (from ${data.count} evaluations across ${data.uniqueConfigs.size} configs)`);
      }

      CAPABILITY_BUCKETS.forEach(bucket => {
        const matchingDim = bucket.dimensions.find(d => d.key === dimensionKey);
        if (matchingDim) {
          const bucketScores = modelCapabilityScores.get(bucket.id) || new Map();
          const modelScores = bucketScores.get(modelId) || { totalScore: 0, totalWeight: 0, contributingRuns: 0, contributingDimensions: 0 };
          
          const weightedScore = normalizedScore * matchingDim.weight;
          modelScores.totalScore += weightedScore;
          modelScores.totalWeight += matchingDim.weight;
          modelScores.contributingRuns += data.count;
          modelScores.contributingDimensions++;
          
          if (logger) {
            logger.info(`    -> Contributing to "${bucket.label}" with weight=${matchingDim.weight}, weighted_score=${(weightedScore * 100).toFixed(1)}%`);
          }
          
          bucketScores.set(modelId, modelScores);
          modelCapabilityScores.set(bucket.id, bucketScores);
        }
      });
    });
  });

  // 2. Process Topic Scores
  if (logger) logger.info('\n--- Processing Topic Scores ---');
  topicModelScores.forEach((models, topicKey) => {
    if (logger) logger.info(`\nTopic: "${topicKey}"`);
    const normalizedTopicKey = normalizeTopicKey(topicKey);
    if (logger && normalizedTopicKey !== topicKey) {
      logger.info(`  Normalized "${topicKey}" -> "${normalizedTopicKey}"`);
    }
    
    models.forEach((data, modelId) => {
      const avgTopicScore = data.scores.reduce((sum, s) => sum + s.score, 0) / data.scores.length;
      
      if (logger) {
        logger.info(`  Model "${modelId}": avg=${(avgTopicScore * 100).toFixed(1)}% (from ${data.scores.length} runs across ${data.uniqueConfigs.size} configs)`);
      }

      CAPABILITY_BUCKETS.forEach(bucket => {
        const matchingTopic = bucket.topics.find(t => t.key === normalizedTopicKey);
        if (matchingTopic) {
          const bucketScores = modelCapabilityScores.get(bucket.id) || new Map();
          const modelScores = bucketScores.get(modelId) || { totalScore: 0, totalWeight: 0, contributingRuns: 0, contributingDimensions: 0 };

          const weightedScore = avgTopicScore * matchingTopic.weight;
          modelScores.totalScore += weightedScore;
          modelScores.totalWeight += matchingTopic.weight;
          modelScores.contributingRuns += data.scores.length;
          
          if (logger) {
            logger.info(`    -> Contributing to "${bucket.label}" with weight=${matchingTopic.weight}, weighted_score=${(weightedScore * 100).toFixed(1)}%`);
          }
          
          bucketScores.set(modelId, modelScores);
          modelCapabilityScores.set(bucket.id, bucketScores);
        }
      });
    });
  });

  // 3. Calculate final scores and build leaderboards
  if (logger) logger.info('\n--- Final Capability Scores ---');
  const leaderboards: CapabilityLeaderboard[] = [];
  
  // Minimum thresholds for capability leaderboards (similar to main leaderboard)
  const MIN_UNIQUE_CONFIGS_FOR_CAPABILITIES = 5;
  const MIN_TOTAL_RUNS_FOR_CAPABILITIES = 10;
  
  CAPABILITY_BUCKETS.forEach(bucket => {
    if (logger) logger.info(`\nCapability: "${bucket.label}"`);
    const bucketScores = modelCapabilityScores.get(bucket.id);
    if (bucketScores) {
      const leaderboard: CapabilityScoreInfo[] = [];
      bucketScores.forEach((data, modelId) => {
        if (data.totalWeight > 0) {
          const finalScore = data.totalScore / data.totalWeight;
          
          // Apply minimum thresholds - need to check actual unique configs for this model
          // For now, use a heuristic based on contributing runs and dimensions
          const estimatedUniqueConfigs = Math.max(data.contributingDimensions, Math.floor(data.contributingRuns / 3));
          const meetsThreshold = data.contributingRuns >= MIN_TOTAL_RUNS_FOR_CAPABILITIES && 
                                estimatedUniqueConfigs >= MIN_UNIQUE_CONFIGS_FOR_CAPABILITIES;
          
          if (logger) {
            const status = meetsThreshold ? "✓" : "✗";
            logger.info(`  ${status} ${modelId}: ${(finalScore * 100).toFixed(1)}% (total_weighted_score=${data.totalScore.toFixed(3)}, total_weight=${data.totalWeight.toFixed(1)}, runs=${data.contributingRuns}, dims=${data.contributingDimensions})`);
            if (!meetsThreshold) {
              logger.info(`    Excluded: needs ≥${MIN_TOTAL_RUNS_FOR_CAPABILITIES} runs (has ${data.contributingRuns}) and ≥${MIN_UNIQUE_CONFIGS_FOR_CAPABILITIES} configs (estimated ${estimatedUniqueConfigs})`);
            }
          }
          
          if (meetsThreshold) {
            leaderboard.push({
              modelId,
              averageScore: finalScore,
              contributingRuns: data.contributingRuns,
              contributingDimensions: data.contributingDimensions,
            });
          }
        }
      });

      if (leaderboard.length > 0) {
        const sortedLeaderboard = leaderboard.sort((a, b) => b.averageScore - a.averageScore).slice(0, 5);
        if (logger) {
          logger.info(`  Top 5 for "${bucket.label}" (after applying thresholds):`);
          sortedLeaderboard.forEach((model, idx) => {
            logger.info(`    ${idx + 1}. ${model.modelId}: ${(model.averageScore * 100).toFixed(1)}%`);
          });
        }
        
        leaderboards.push({
          ...bucket,
          leaderboard: sortedLeaderboard,
        });
      } else {
        if (logger) logger.info(`  No models meet minimum thresholds for "${bucket.label}"`);
      }
    } else {
      if (logger) logger.info(`  No data found for "${bucket.label}"`);
    }
  });

  if (logger) {
    logger.info(`\n=== CAPABILITY LEADERBOARDS CALCULATION COMPLETE ===`);
    logger.info(`Generated ${leaderboards.length} capability leaderboards`);
  }

  return leaderboards;
}


export function calculateTopicChampions(
  topicModelScores: Map<string, Map<string, { scores: Array<{ score: number; configId: string; configTitle: string; runLabel: string; timestamp: string; }>; uniqueConfigs: Set<string> }>>
): Record<string, TopicChampion[]> {
  const champions: Record<string, TopicChampion[]> = {};
  const MIN_UNIQUE_CONFIGS_FOR_TOPIC_CHAMPION = 5;

  for (const [topic, modelScores] of topicModelScores.entries()) {
    const topicChampions: TopicChampion[] = [];

    for (const [modelId, data] of modelScores.entries()) {
      if (data.uniqueConfigs.size >= MIN_UNIQUE_CONFIGS_FOR_TOPIC_CHAMPION) {
        const averageScore = data.scores.reduce((sum, s) => sum + s.score, 0) / data.scores.length;
        
        topicChampions.push({
          modelId,
          averageScore,
          uniqueConfigsCount: data.uniqueConfigs.size,
          contributingRuns: data.scores.map(s => ({
            configId: s.configId,
            configTitle: s.configTitle,
            runLabel: s.runLabel,
            timestamp: s.timestamp,
            score: s.score,
          })),
        });
      }
    }

    if (topicChampions.length > 0) {
      champions[topic] = topicChampions
        .sort((a, b) => b.averageScore - a.averageScore)
        .slice(0, 3); // Top 3 champions per topic
    }
  }

  return champions;
}

/**
 * Shared function to process executive summary grades from result data.
 * Used by both backfill-summary and run-config to maintain DRY principle.
 */
export function processExecutiveSummaryGrades(
  resultData: WevalResult,
  modelDimensionGrades: Map<string, Map<string, { totalScore: number; count: number; uniqueConfigs: Set<string>; scores: Array<{ score: number | null; configTitle: string; runLabel: string; timestamp: string; configId: string; }> }>>,
  logger?: SimpleLogger
): void {
  if (!resultData.executiveSummary?.structured?.grades) {
    return;
  }

  if (logger) {
    logger.info(`Processing executive summary grades for: ${resultData.configId}/${resultData.runLabel}`);
  }

  for (const gradeInfo of resultData.executiveSummary.structured.grades) {
    const { baseId: modelId } = parseEffectiveModelId(gradeInfo.modelId);
    if (!modelDimensionGrades.has(modelId)) {
      modelDimensionGrades.set(modelId, new Map());
    }
    const modelGrades = modelDimensionGrades.get(modelId)!;

    for (const [dimension, score] of Object.entries(gradeInfo.grades)) {
      if (score !== null && score > 0) { // Only count valid, non-zero grades
        const current = modelGrades.get(dimension) || { totalScore: 0, count: 0, uniqueConfigs: new Set(), scores: [] };
        current.totalScore += score;
        current.count++;
        current.uniqueConfigs.add(resultData.configId);
        current.scores.push({
          score,
          configTitle: resultData.configTitle || resultData.config.title || resultData.configId,
          runLabel: resultData.runLabel,
          timestamp: resultData.timestamp,
          configId: resultData.configId,
        });
        modelGrades.set(dimension, current);
      }
    }
  }
}

/**
 * Shared function to process topic data from tags and scores.
 * Used by both backfill-summary and run-config to maintain DRY principle.
 */
export function processTopicData(
  resultData: WevalResult,
  perModelScores: Map<string, PerModelScoreStats>,
  topicModelScores: Map<string, Map<string, { scores: Array<{ score: number; configId: string; configTitle: string; runLabel: string; timestamp: string; }>; uniqueConfigs: Set<string> }>>,
  logger?: SimpleLogger
): void {
  // Combine manual tags from config with auto tags from executive summary
  const manualTags = resultData.config?.tags || [];
  const autoTags = resultData.executiveSummary?.structured?.autoTags || [];
  const allTags = [...new Set([...manualTags, ...autoTags].map(tag => normalizeTag(tag)).filter(Boolean))];

  if (allTags.length === 0) {
    return;
  }

  if (logger) {
    logger.info(`Processing topic data for: ${resultData.configId}/${resultData.runLabel} with tags: [${allTags.join(', ')}]`);
  }

  perModelScores.forEach((scoreData, modelId) => {
    if (scoreData.hybrid.average !== null && scoreData.hybrid.average !== undefined) {
      const { baseId } = parseEffectiveModelId(modelId);
      
      allTags.forEach((topic: string) => {
        const currentTopicData = topicModelScores.get(topic) || new Map();
        const currentModelData = currentTopicData.get(baseId) || { scores: [], uniqueConfigs: new Set() };
        
        currentModelData.scores.push({
          score: scoreData.hybrid.average,
          configId: resultData.configId,
          configTitle: resultData.configTitle || resultData.config.title || resultData.configId,
          runLabel: resultData.runLabel,
          timestamp: resultData.timestamp,
        });
        currentModelData.uniqueConfigs.add(resultData.configId);

        currentTopicData.set(baseId, currentModelData);
        topicModelScores.set(topic, currentTopicData);
      });
    }
  });
}

export function calculatePerModelScoreStatsForRun(resultData: WevalResult): Map<string, PerModelScoreStats> {
  const perModelStats = new Map<string, PerModelScoreStats>();
  const models = resultData.effectiveModels.filter(m => m !== IDEAL_MODEL_ID);

  models.forEach(modelId => {
    const similarityScores: number[] = [];
    const coverageScores: number[] = [];
    const hybridScores: number[] = [];

    resultData.promptIds.forEach(promptId => {
      const sim = resultData.evaluationResults.perPromptSimilarities?.[promptId]?.[modelId]?.[IDEAL_MODEL_ID];
      const covResult = resultData.evaluationResults.llmCoverageScores?.[promptId]?.[modelId];

      if (sim !== undefined && sim !== null) {
        similarityScores.push(sim);
      }
      if (covResult && !('error' in covResult) && covResult.avgCoverageExtent !== undefined && covResult.avgCoverageExtent !== null) {
        coverageScores.push(covResult.avgCoverageExtent);
      }
      const hybridScore = calculateHybridScore(sim, covResult?.avgCoverageExtent);
      if (hybridScore !== null) {
        hybridScores.push(hybridScore);
      }
    });

    const avgSimilarity = similarityScores.length > 0 ? similarityScores.reduce((a, b) => a + b, 0) / similarityScores.length : null;
    const stdDevSimilarity = calculateStandardDeviation(similarityScores);

    const avgCoverage = coverageScores.length > 0 ? coverageScores.reduce((a, b) => a + b, 0) / coverageScores.length : null;
    const stdDevCoverage = calculateStandardDeviation(coverageScores);

    const avgHybridScore = hybridScores.length > 0 ? hybridScores.reduce((a, b) => a + b, 0) / hybridScores.length : null;
    const stdDevHybridScore = calculateStandardDeviation(hybridScores);

    perModelStats.set(modelId, {
      hybrid: { average: avgHybridScore, stddev: stdDevHybridScore },
      similarity: { average: avgSimilarity, stddev: stdDevSimilarity },
      coverage: { average: avgCoverage, stddev: stdDevCoverage },
    });
  });

  return perModelStats;
}

export function calculateAverageHybridScoreForRun(resultData: WevalResult): { average: number | null; stddev: number | null } {
    const scores: number[] = [];
    resultData.promptIds.forEach(promptId => {
        resultData.effectiveModels.forEach(modelId => {
            if (modelId === IDEAL_MODEL_ID) return;

            const sim = resultData.evaluationResults.perPromptSimilarities?.[promptId]?.[modelId]?.[IDEAL_MODEL_ID];
            const covResult = resultData.evaluationResults.llmCoverageScores?.[promptId]?.[modelId];

            if (sim !== undefined && sim !== null && covResult && !('error' in covResult) && covResult.avgCoverageExtent !== undefined && covResult.avgCoverageExtent !== null) {
                const hybridScore = calculateHybridScore(sim, covResult.avgCoverageExtent);
                if (hybridScore !== null) {
                  scores.push(hybridScore);
                }
            }
        });
    });

    if (scores.length === 0) {
        return { average: null, stddev: null };
    }

    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const stddev = calculateStandardDeviation(scores);

    return { average, stddev };
}

export function calculatePotentialModelDrift(
  configs: EnhancedComparisonConfigInfo[] | null
): PotentialDriftInfo | null {
  if (!configs || configs.length === 0) {
    return null;
  }

  // Also filter here if these stats should exclude 'test' configs
  const filteredConfigsForDrift = configs.filter(
    config => !(config.tags && config.tags.includes('test'))
  );

  if (filteredConfigsForDrift.length === 0) {
    console.log('[calculatePotentialModelDrift] No configs remaining after filtering out "test" tags. Returning null.');
    return null;
  }

  const DEBUG = process.env.DEBUG_DRIFT_CALC === 'true';
  let mostSignificantDrift: PotentialDriftInfo | null = null;
  if (DEBUG) console.log(`[DriftCalc] Starting drift calculation for ${filteredConfigsForDrift.length} configs.`);

  filteredConfigsForDrift.forEach(config => {
    const runsByLabel = new Map<string, EnhancedRunInfo[]>();
    config.runs.forEach(run => {
      // Only consider runs with temperature 0 for drift detection to avoid flagging intentional variance.
      if (run.temperature !== undefined && run.temperature !== 0) {
        return;
      }
      
      if (run.runLabel && run.timestamp && run.perModelScores) { // Check for perModelScores
        const existing = runsByLabel.get(run.runLabel) || [];
        existing.push(run);
        runsByLabel.set(run.runLabel, existing);
      }
    });

    runsByLabel.forEach((runsArray, runLabel) => {
      if (runsArray.length < 2) return;
      
      if (DEBUG) console.log(`\n[DriftCalc] Found ${runsArray.length} runs for label '${runLabel}' in config '${config.configId}'.`);

      const sortedRuns = runsArray.sort((a, b) => 
        new Date(fromSafeTimestamp(a.timestamp)).getTime() - new Date(fromSafeTimestamp(b.timestamp)).getTime()
      );
      
      const oldestTimestamp = sortedRuns[0].timestamp;
      const newestTimestamp = sortedRuns[sortedRuns.length - 1].timestamp;
      const timeDiff = new Date(fromSafeTimestamp(newestTimestamp)).getTime() - new Date(fromSafeTimestamp(oldestTimestamp)).getTime();
      
      if (DEBUG) console.log(`[DriftCalc] -> Oldest run: ${oldestTimestamp}, Newest run: ${newestTimestamp}. Time diff: ${timeDiff}ms.`);

      if (timeDiff < MIN_TIME_DIFFERENCE_FOR_DRIFT_MS) {
        if (DEBUG) console.log(`[DriftCalc] -> Skipping: time difference is less than threshold (${MIN_TIME_DIFFERENCE_FOR_DRIFT_MS}ms).`);
        return; // Not enough time between the oldest and newest run
      }

      // Find the intersection of models that completed successfully in ALL runs for this label
      let commonModels: Set<string> | null = null;
      for (const run of sortedRuns) {
        const modelsInRun = new Set<string>();
        const scoresMap = run.perModelScores instanceof Map
            ? run.perModelScores
            : new Map(Object.entries(run.perModelScores || {}) as [string, PerModelScoreStats][]);

        scoresMap.forEach((scoreData, modelId) => {
          if (modelId !== IDEAL_MODEL_ID && scoreData.hybrid.average !== null && scoreData.hybrid.average !== undefined) {
            modelsInRun.add(parseEffectiveModelId(modelId).baseId);
          }
        });

        if (commonModels === null) {
          commonModels = modelsInRun;
        } else {
          const commonModelsArray: string[] = [...commonModels];
          commonModels = new Set(commonModelsArray.filter((x: string) => modelsInRun.has(x)));
        }
      }

      if (!commonModels || commonModels.size < 1) {
        if (DEBUG) console.log(`[DriftCalc] -> Skipping: no common models found across all runs for label '${runLabel}'.`);
        return; // No models are common to all runs, so we can't compare.
      }
      
      if (DEBUG) console.log(`[DriftCalc] -> Found ${commonModels.size} common models: [${Array.from(commonModels).join(', ')}]. Checking each for drift...`);
      
      // For each common model, check its performance variance
      commonModels.forEach(baseModelId => {
        const modelScoresOverTime: Array<{ timestamp: string; score: number }> = [];
        
        sortedRuns.forEach(run => {
          const scoresMap = run.perModelScores instanceof Map
            ? run.perModelScores
            : new Map(Object.entries(run.perModelScores || {}) as [string, PerModelScoreStats][]);
          
          const scoresForThisRun: number[] = [];
          scoresMap.forEach((scoreData, fullModelId) => {
            if (parseEffectiveModelId(fullModelId).baseId === baseModelId && scoreData.hybrid.average !== null && scoreData.hybrid.average !== undefined) {
              scoresForThisRun.push(scoreData.hybrid.average);
            }
          });

          if (scoresForThisRun.length > 0) {
            const averageScoreForRun = scoresForThisRun.reduce((a, b) => a + b, 0) / scoresForThisRun.length;
            modelScoresOverTime.push({ timestamp: run.timestamp, score: averageScoreForRun });
          }
        });

        if (modelScoresOverTime.length < 2) return;

        // Find the runs with the true min and max scores, not just the oldest/newest
        let minScoreData = modelScoresOverTime[0];
        let maxScoreData = modelScoresOverTime[0];
        for (const scoreData of modelScoresOverTime) {
            if (scoreData.score < minScoreData.score) minScoreData = scoreData;
            if (scoreData.score > maxScoreData.score) maxScoreData = scoreData;
        }

        const scoreDiff = maxScoreData.score - minScoreData.score;
        const relativeChange = minScoreData.score > 0 ? Math.abs(scoreDiff / minScoreData.score) : (maxScoreData.score !== 0 ? Infinity : 0);

        if (DEBUG) console.log(`[DriftCalc] ->>> Model '${baseModelId}': Abs Score Diff: ${scoreDiff.toFixed(4)}, Rel Change: ${(relativeChange * 100).toFixed(2)}%`);

        if (scoreDiff >= MIN_ABSOLUTE_SCORE_DIFFERENCE && relativeChange >= SIGNIFICANT_SCORE_CHANGE_THRESHOLD) {
          const scoreRange = scoreDiff;
          
          if (DEBUG) console.log(`[DriftCalc] ->>> SIGNIFICANT DRIFT DETECTED for '${baseModelId}'. Score range: ${scoreRange.toFixed(4)}`);

          if (!mostSignificantDrift || scoreRange > mostSignificantDrift.scoreRange) {
            if (DEBUG) console.log(`[DriftCalc] ->>>> New MOST significant drift. Model: '${baseModelId}', Range: ${scoreRange.toFixed(4)}.`);
            mostSignificantDrift = {
              configId: config.id || config.configId,
              configTitle: config.title || config.configTitle || config.id || config.configId,
              runLabel: sortedRuns[0].runLabel,
              modelId: baseModelId, 
              minScore: minScoreData.score,
              maxScore: maxScoreData.score,
              scoreRange: scoreRange,
              runsCount: modelScoresOverTime.length,
              // Use the timestamps from the runs with the extreme scores for the investigation link
              minScoreTimestamp: minScoreData.timestamp,
              maxScoreTimestamp: maxScoreData.timestamp,
              // Use the chronological first/last timestamps for the display text
              oldestTimestamp: fromSafeTimestamp(sortedRuns[0].timestamp),
              newestTimestamp: fromSafeTimestamp(sortedRuns[sortedRuns.length - 1].timestamp),
            };
          }
        }
      });
    });
  });

  if (DEBUG) {
    if (!mostSignificantDrift) {
        console.log(`\n[DriftCalc] Completed. No significant drift found across all configs.`);
    } else {
        const drift = mostSignificantDrift as PotentialDriftInfo;
        console.log(`\n[DriftCalc] Completed. Most significant drift found for model '${drift.modelId}' in config '${drift.configId}'.`);
    }
  }

  return mostSignificantDrift;
}

export function calculateComparativeStats(
  perModelScores: Map<string, PerModelScoreStats>,
  targetModelEffectiveId: string,
): { peerAverageScore: number | null; rank: number | null } {
  
  const allScores: { modelId: string; score: number }[] = [];
  perModelScores.forEach((stats, modelId) => {
    // Exclude the ideal model from peer calculations
    if (modelId !== IDEAL_MODEL_ID && stats.hybrid.average !== null && stats.hybrid.average !== undefined) {
      allScores.push({ modelId: modelId, score: stats.hybrid.average });
    }
  });

  if (allScores.length === 0) {
    return { peerAverageScore: null, rank: null };
  }

  // Calculate peer average
  const peers = allScores.filter(s => s.modelId !== targetModelEffectiveId);
  let peerAverageScore: number | null = null;
  if (peers.length > 0) {
    const peerScoreSum = peers.reduce((sum, peer) => sum + peer.score, 0);
    peerAverageScore = peerScoreSum / peers.length;
  }

  // Calculate rank
  allScores.sort((a, b) => b.score - a.score);
  const rank = allScores.findIndex(s => s.modelId === targetModelEffectiveId) + 1;

  return {
    peerAverageScore,
    rank: rank > 0 ? rank : null,
  };
} 