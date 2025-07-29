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
} from '@/app/components/AggregateStatsDisplay';
import { PotentialDriftInfo } from '@/app/components/ModelDriftIndicator';
import { parseEffectiveModelId, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import {
  calculateStandardDeviation,
  IDEAL_MODEL_ID,
  calculateHybridScore,
} from '@/app/utils/calculationUtils';
import { fromSafeTimestamp } from '../../lib/timestampUtils';
import { PerModelScoreStats } from '@/app/utils/homepageDataUtils';
import { WevalResult } from '@/types/shared';

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
}



export interface TopicChampion {
  modelId: string;
  averageScore: number;
  uniqueConfigsCount: number;
}

export function calculateHeadlineStats(
  configs: EnhancedComparisonConfigInfo[] | null,
  modelDimensionGrades: Map<string, Map<string, { totalScore: number; count: number; uniqueConfigs: Set<string>; scores: Array<{ score: number; configTitle: string; runLabel: string; timestamp: string; configId: string; }> }>>
): HeadlineStats {
  if (!configs || configs.length === 0) {
    return {
      bestPerformingConfig: null,
      worstPerformingConfig: null,
      leastConsistentConfig: null,
      rankedOverallModels: null,
      dimensionLeaderboards: null,
    };
  }

  // Filter out configs with 'test' tag before any calculations
  const filteredConfigs = configs.filter(
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
  const MIN_UNIQUE_CONFIGS_FOR_CHAMPION = 10;
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
  const MIN_SCORE_THRESHOLD = 5.0;
  for (const [dimension, models] of dimensionGrades.entries()) {
      const eligibleModels = models.filter(m => {
          // Must have enough unique configs AND never scored below threshold
          const hasEnoughConfigs = m.uniqueConfigsCount >= MIN_UNIQUE_CONFIGS_FOR_CHAMPION;
          const hasConsistentScores = m.latestScores.every(score => score.score >= MIN_SCORE_THRESHOLD);
          return hasEnoughConfigs && hasConsistentScores;
      });

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

    config.runs.forEach((run) => {
        if (run.perModelScores || (run as any).perModelHybridScores) {
            const isNewFormat = !!run.perModelScores;

            const scoresMap = isNewFormat
            ? run.perModelScores instanceof Map
                ? run.perModelScores
                : new Map(
                    Object.entries(run.perModelScores || {}) as [
                    string,
                    PerModelScoreStats,
                    ][],
                )
            : (run as any).perModelHybridScores instanceof Map
            ? (run as any).perModelHybridScores
            : new Map(
                Object.entries((run as any).perModelHybridScores || {}) as [
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
                            runLabel: run.runLabel,
                            timestamp: run.timestamp,
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

  return {
    bestPerformingConfig,
    worstPerformingConfig,
    leastConsistentConfig,
    rankedOverallModels: rankedOverallModels.length > 0 ? rankedOverallModels : null,
    dimensionLeaderboards: dimensionLeaderboards.length > 0 ? dimensionLeaderboards : null,
  };
}

export function calculateTopicChampions(
  topicModelScores: Map<string, Map<string, { scores: number[]; uniqueConfigs: Set<string> }>>
): Record<string, TopicChampion[]> {
  const MIN_UNIQUE_CONFIGS_FOR_TOPIC_CHAMPION = 5;
  const topicChampions: Record<string, TopicChampion[]> = {};

  topicModelScores.forEach((modelScores, topic) => {
    const champions: TopicChampion[] = [];
    modelScores.forEach((data, modelId) => {
      if (data.uniqueConfigs.size >= MIN_UNIQUE_CONFIGS_FOR_TOPIC_CHAMPION) {
        const averageScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        champions.push({
          modelId,
          averageScore,
          uniqueConfigsCount: data.uniqueConfigs.size,
        });
      }
    });

    // Sort champions by average score and take top 3
    topicChampions[topic] = champions
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 3);
  });

  return topicChampions;
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