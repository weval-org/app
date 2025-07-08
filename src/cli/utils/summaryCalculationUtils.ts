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
      if (run.perModelHybridScores) {
        const scoresMap =
          run.perModelHybridScores instanceof Map
            ? run.perModelHybridScores
            : new Map(
                Object.entries(run.perModelHybridScores) as [
                  string,
                  { average: number | null; stddev: number | null },
                ][],
              );

        scoresMap.forEach((scoreData, modelId) => {
          if (modelId === IDEAL_MODEL_ID) return;
          if (scoreData && scoreData.average !== null && scoreData.average !== undefined) {
            const parsed = parseEffectiveModelId(modelId);
            const baseModelId = parsed.baseId; // Group by base model ID

            const current = modelScoresForConfig.get(baseModelId) || { totalScore: 0, count: 0 };
            current.totalScore += scoreData.average;
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

  const allModelScores = new Map<string, { totalScore: number; count: number }>();

  filteredConfigs.forEach(config => {
    if (!config.runs || config.runs.length === 0) {
      return;
    }

    // Find the latest run for the current config
    const latestRun = config.runs.reduce((latest, current) => {
      const latestDate = new Date(fromSafeTimestamp(latest.timestamp));
      const currentDate = new Date(fromSafeTimestamp(current.timestamp));
      return currentDate > latestDate ? current : latest;
    });

    // Now, only use the scores from this latestRun
    if (latestRun.perModelHybridScores) {
      const scoresMap =
        latestRun.perModelHybridScores instanceof Map
          ? latestRun.perModelHybridScores
          : new Map(
              Object.entries(latestRun.perModelHybridScores) as [
                string,
                { average: number | null; stddev: number | null },
              ][],
            );

      scoresMap.forEach((scoreData, modelId) => {
        if (modelId === IDEAL_MODEL_ID) return;
        if (scoreData && scoreData.average !== null && scoreData.average !== undefined) {
          const parsed = parseEffectiveModelId(modelId);
          const baseModelId = parsed.baseId;

          const current = allModelScores.get(baseModelId) || { totalScore: 0, count: 0 };
          current.totalScore += scoreData.average;
          current.count++;
          allModelScores.set(baseModelId, current);
        }
      });
    }
  });

  const rankedOverallModels: TopModelStatInfo[] = Array.from(allModelScores.entries())
    .map(([modelId, data]) => ({
      modelId: modelId,
      overallAverageScore: data.totalScore / data.count,
      runsParticipatedIn: data.count,
    }))
    .sort((a, b) => b.overallAverageScore - a.overallAverageScore);

  return {
    bestPerformingConfig,
    worstPerformingConfig,
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
      
      if (run.runLabel && run.timestamp && run.perModelHybridScores) { // Check for perModelHybridScores
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
        const scoresMap = run.perModelHybridScores instanceof Map
            ? run.perModelHybridScores
            : new Map(Object.entries(run.perModelHybridScores || {}) as [string, { average: number | null; stddev: number | null }][]);

        scoresMap.forEach((scoreData, modelId) => {
          if (modelId !== IDEAL_MODEL_ID && scoreData.average !== null && scoreData.average !== undefined) {
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
          const scoresMap = run.perModelHybridScores instanceof Map
            ? run.perModelHybridScores
            : new Map(Object.entries(run.perModelHybridScores || {}) as [string, { average: number | null; stddev: number | null }][]);
          
          const scoresForThisRun: number[] = [];
          scoresMap.forEach((scoreData, fullModelId) => {
            if (parseEffectiveModelId(fullModelId).baseId === baseModelId && scoreData.average !== null && scoreData.average !== undefined) {
              scoresForThisRun.push(scoreData.average);
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