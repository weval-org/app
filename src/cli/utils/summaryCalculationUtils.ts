import {
  EnhancedComparisonConfigInfo,
  EnhancedRunInfo,
} from '@/app/utils/homepageDataUtils';
import {
  AggregateStatsData,
  HeadlineStatInfo,
  TopModelStatInfo,
} from '@/app/components/AggregateStatsDisplay';
import { PotentialDriftInfo } from '@/app/components/ModelDriftIndicator';
import { parseEffectiveModelId, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { calculateStandardDeviation, IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { fromSafeTimestamp } from '../../lib/timestampUtils';

const SIGNIFICANT_SCORE_CHANGE_THRESHOLD = 0.1; // 10% change
const MIN_ABSOLUTE_SCORE_DIFFERENCE = 0.05; // 5 percentage points
const MIN_TIME_DIFFERENCE_FOR_DRIFT_MS = 23 * 60 * 60 * 1000; // 23 hours

export function calculateHeadlineStats(
  configs: EnhancedComparisonConfigInfo[] | null
): AggregateStatsData | null {
  if (!configs || configs.length === 0) {
    return null;
  }

  // Filter out configs with 'test' tag before any calculations
  const filteredConfigs = configs.filter(
    config => !(config.tags && config.tags.includes('test'))
  );

  if (filteredConfigs.length === 0) {
    console.log('[calculateHeadlineStats] No configs remaining after filtering out "test" tags. Returning null.');
    return null;
  }

  let bestPerformingConfig: HeadlineStatInfo | null = null;
  let worstPerformingConfig: HeadlineStatInfo | null = null;
  let mostConsistentConfig: HeadlineStatInfo | null = null;
  let leastConsistentConfig: HeadlineStatInfo | null = null;

  filteredConfigs.forEach(config => {
    const configTitle = config.title || config.configTitle || config.id || config.configId;
    if (config.overallAverageHybridScore !== null && config.overallAverageHybridScore !== undefined) {
      if (!bestPerformingConfig || config.overallAverageHybridScore > bestPerformingConfig.value) {
        bestPerformingConfig = {
          configId: config.id || config.configId,
          configTitle: configTitle,
          value: config.overallAverageHybridScore,
        };
      }
      if (!worstPerformingConfig || config.overallAverageHybridScore < worstPerformingConfig.value) {
        worstPerformingConfig = {
          configId: config.id || config.configId,
          configTitle: configTitle,
          value: config.overallAverageHybridScore,
        };
      }
    }
  });

  // For consistency, only consider configs that have been run enough times
  // to make standard deviation a meaningful metric.
  const MIN_RUNS_FOR_CONSISTENCY_CHECK = 4;
  const configsForConsistencyCheck = filteredConfigs.filter(
    config => config.runs && config.runs.length >= MIN_RUNS_FOR_CONSISTENCY_CHECK
  );

  if (configsForConsistencyCheck.length > 0) {
    console.log(`[calculateHeadlineStats] Found ${configsForConsistencyCheck.length} configs with ${MIN_RUNS_FOR_CONSISTENCY_CHECK} or more runs to check for consistency.`);
    configsForConsistencyCheck.forEach(config => {
      const configTitle = config.title || config.configTitle || config.id || config.configId;
      if (config.hybridScoreStdDev !== null && config.hybridScoreStdDev !== undefined) {
        if (!mostConsistentConfig || config.hybridScoreStdDev < mostConsistentConfig.value) {
          mostConsistentConfig = {
            configId: config.id || config.configId,
            configTitle: configTitle,
            value: config.hybridScoreStdDev,
          };
        }
        if (!leastConsistentConfig || config.hybridScoreStdDev > leastConsistentConfig.value) {
          leastConsistentConfig = {
            configId: config.id || config.configId,
            configTitle: configTitle,
            value: config.hybridScoreStdDev,
          };
        }
      }
    });
  } else {
    console.log('[calculateHeadlineStats] Not enough configs with multiple runs to determine consistency stats.');
  }

  const allModelScores = new Map<string, { totalScore: number; count: number; runs: Set<string> }>();

  filteredConfigs.forEach(config => {
    config.runs.forEach(run => {
      if (run.perModelHybridScores) {
        const scoresMap = run.perModelHybridScores instanceof Map
          ? run.perModelHybridScores
          : new Map(Object.entries(run.perModelHybridScores) as [string, { average: number | null; stddev: number | null }][]);
        
        scoresMap.forEach((scoreData, modelId) => {
          if (modelId === IDEAL_MODEL_ID) return;
          if (scoreData && scoreData.average !== null && scoreData.average !== undefined) {
            const parsed = parseEffectiveModelId(modelId);
            const baseModelId = parsed.baseId; // Group by base model ID

            const current = allModelScores.get(baseModelId) || { totalScore: 0, count: 0, runs: new Set() };
            current.totalScore += scoreData.average;
            current.count++;
            current.runs.add(`${config.id || config.configId}-${run.runLabel}-${run.timestamp}`); // Unique run identifier
            allModelScores.set(baseModelId, current);
          }
        });
      }
    });
  });

  const rankedOverallModels: TopModelStatInfo[] = Array.from(allModelScores.entries())
    .map(([modelId, data]) => ({
      modelId: modelId, // This is the baseId
      overallAverageScore: data.totalScore / data.count,
      runsParticipatedIn: data.runs.size, // Count unique runs participated in
    }))
    .sort((a, b) => b.overallAverageScore - a.overallAverageScore);

  return {
    bestPerformingConfig,
    worstPerformingConfig,
    mostConsistentConfig,
    leastConsistentConfig,
    rankedOverallModels: rankedOverallModels.length > 0 ? rankedOverallModels : null,
  };
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

  let mostSignificantDrift: PotentialDriftInfo | null = null;

  filteredConfigsForDrift.forEach(config => {
    const runsByLabel = new Map<string, EnhancedRunInfo[]>();
    config.runs.forEach(run => {
      if (run.runLabel && run.timestamp && run.hybridScoreStats?.average !== null && run.hybridScoreStats?.average !== undefined) {
        const existing = runsByLabel.get(run.runLabel) || [];
        existing.push(run);
        runsByLabel.set(run.runLabel, existing);
      }
    });

    runsByLabel.forEach(runsArray => {
      if (runsArray.length < 2) return;

      // Sort by actual date, not safe timestamp string
      const sortedRuns = runsArray.sort((a, b) => 
        new Date(fromSafeTimestamp(a.timestamp)).getTime() - new Date(fromSafeTimestamp(b.timestamp)).getTime()
      );
      
      // Iterate through all models present in these runs
      const modelsInRuns = new Set<string>();
      sortedRuns.forEach(run => {
        if (run.perModelHybridScores) {
          const scoresMap = run.perModelHybridScores instanceof Map
            ? run.perModelHybridScores
            : new Map(Object.entries(run.perModelHybridScores) as [string, { average: number | null; stddev: number | null }][]);
          scoresMap.forEach((_, modelId) => {
            if (modelId !== IDEAL_MODEL_ID) {
                 // Use base model ID for drift detection to consolidate variants (temp/sys)
                modelsInRuns.add(parseEffectiveModelId(modelId).baseId);
            }
          });
        }
      });


      modelsInRuns.forEach(baseModelId => {
        // For each base model, find its scores in the sorted runs
        const modelScoresOverTime: Array<{ timestamp: string; score: number }> = [];
        sortedRuns.forEach(run => {
            let scoreForThisRun: number | null = null;
            if (run.perModelHybridScores) {
                 const scoresMap = run.perModelHybridScores instanceof Map
                    ? run.perModelHybridScores
                    : new Map(Object.entries(run.perModelHybridScores) as [string, { average: number | null; stddev: number | null }][]);
                
                scoresMap.forEach((scoreData, fullModelId) => {
                    if (scoreData && parseEffectiveModelId(fullModelId).baseId === baseModelId && scoreData.average !== null && scoreData.average !== undefined) {
                        scoreForThisRun = scoreData.average; // Take the first one that matches baseModelId
                    }
                });
            }
            if (scoreForThisRun !== null) {
                modelScoresOverTime.push({ timestamp: run.timestamp, score: scoreForThisRun });
            }
        });

        if (modelScoresOverTime.length < 2) return; // Need at least two points for this model

        const oldestRun = modelScoresOverTime[0];
        const newestRun = modelScoresOverTime[modelScoresOverTime.length - 1];

        const timeDiff = new Date(fromSafeTimestamp(newestRun.timestamp)).getTime() - new Date(fromSafeTimestamp(oldestRun.timestamp)).getTime();

        if (timeDiff >= MIN_TIME_DIFFERENCE_FOR_DRIFT_MS) {
          const scoreDiff = newestRun.score - oldestRun.score;
          const absScoreDiff = Math.abs(scoreDiff);
          const relativeChange = oldestRun.score !== 0 ? Math.abs(scoreDiff / oldestRun.score) : (newestRun.score !== 0 ? Infinity : 0) ;

          if (absScoreDiff >= MIN_ABSOLUTE_SCORE_DIFFERENCE && relativeChange >= SIGNIFICANT_SCORE_CHANGE_THRESHOLD) {
            const currentDriftScoreRange = Math.max(...modelScoresOverTime.map(s => s.score)) - Math.min(...modelScoresOverTime.map(s => s.score));
            
            // Check if this drift is more significant than previously found ones
            // Significance can be defined by the absolute range of scores
            if (!mostSignificantDrift || currentDriftScoreRange > mostSignificantDrift.scoreRange) {
              mostSignificantDrift = {
                configId: config.id || config.configId,
                configTitle: config.title || config.configTitle || config.id || config.configId,
                runLabel: sortedRuns[0].runLabel, // All runs in sortedRuns have the same label
                modelId: baseModelId, 
                minScore: Math.min(...modelScoresOverTime.map(s => s.score)),
                maxScore: Math.max(...modelScoresOverTime.map(s => s.score)),
                scoreRange: currentDriftScoreRange,
                runsCount: modelScoresOverTime.length,
                oldestTimestamp: fromSafeTimestamp(modelScoresOverTime[0].timestamp), // Original ISO string
                newestTimestamp: fromSafeTimestamp(modelScoresOverTime[modelScoresOverTime.length - 1].timestamp), // Original ISO string
              };
            }
          }
        }
      });
    });
  });

  return mostSignificantDrift;
} 