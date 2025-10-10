import { Command } from 'commander';
import { getConfig } from '../config';
import pLimit from '@/lib/pLimit';
import {
  listConfigIds,
  listRunsForConfig,
  getResultByFileName,
  saveRegressionsSummary,
} from '@/lib/storageService';
import { ComparisonDataV2 as FetchedComparisonData } from '@/app/utils/types';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import {
  MODEL_VERSION_REGISTRY,
  ModelSeries,
  ModelVersion,
  findVersionForModel,
  validateChronologicalOrdering,
} from '@/lib/model-version-registry';
import { fromSafeTimestamp } from '@/lib/timestampUtils';

// ===== TYPES =====

interface RegressionCriterion {
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

  scoreDelta: number; // Negative = regression
  percentChange: number; // Negative = regression
}

interface ModelSeriesRegression {
  seriesId: string;
  seriesName: string;
  maker: string;
  tier: string;
  versionComparison: {
    older: ModelVersion;
    newer: ModelVersion;
  };
  regressions: RegressionCriterion[];
  sharedBlueprints: Array<{
    id: string;
    title: string;
    olderRunCount: number;
    newerRunCount: number;
  }>;
  overallRegressionScore: number; // Weighted severity (0-100)
  improvements: RegressionCriterion[]; // Track improvements too!
}

interface RegressionsSummary {
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

interface RunData {
  configId: string;
  configTitle: string;
  runLabel: string;
  timestamp: string;
  fileName: string;
  resultData: FetchedComparisonData;
}

// ===== HELPER FUNCTIONS =====

function categorizeSeverity(scoreDelta: number): 'major' | 'moderate' | 'minor' {
  const absChange = Math.abs(scoreDelta);
  if (absChange >= 0.15) return 'major'; // ≥15% change
  if (absChange >= 0.08) return 'moderate'; // 8-15% change
  return 'minor'; // 5-8% change
}

function calculateOverallSeverityScore(criteria: RegressionCriterion[]): number {
  if (criteria.length === 0) return 0;

  const weights = { major: 10, moderate: 5, minor: 2 };
  const totalWeight = criteria.reduce((sum, c) => sum + weights[c.severity], 0);
  return Math.min(100, totalWeight); // Cap at 100
}

function getLatestRunForBlueprint(runs: RunData[], blueprintId: string): RunData | undefined {
  const blueprintRuns = runs.filter(r => r.configId === blueprintId);
  if (blueprintRuns.length === 0) return undefined;

  // Sort by timestamp descending, return most recent
  return blueprintRuns.sort((a, b) =>
    new Date(fromSafeTimestamp(b.timestamp)).getTime() -
    new Date(fromSafeTimestamp(a.timestamp)).getTime()
  )[0];
}

function getHybridScoreForPrompt(
  run: RunData,
  promptId: string,
  modelId: string
): number | null {
  const simData = run.resultData.evaluationResults?.perPromptSimilarities?.[promptId];
  const covData = run.resultData.evaluationResults?.llmCoverageScores?.[promptId]?.[modelId];

  const simScore = simData ? (simData[modelId]?.['IDEAL_BENCHMARK'] ?? simData['IDEAL_BENCHMARK']?.[modelId]) : null;
  const covScore = covData && !('error' in covData) ? covData.avgCoverageExtent : null;

  // Current hybrid formula: 0% similarity, 100% coverage
  if (covScore !== null && covScore !== undefined && !isNaN(covScore)) {
    return covScore;
  }
  return null;
}

// ===== CORE REGRESSION DETECTION =====

async function detectRegressions(
  olderVersion: ModelVersion,
  newerVersion: ModelVersion,
  olderRuns: RunData[],
  newerRuns: RunData[],
  options: { minScoreDelta: number; verbose: boolean }
): Promise<{ regressions: RegressionCriterion[]; improvements: RegressionCriterion[] }> {
  const { logger } = getConfig();
  const regressions: RegressionCriterion[] = [];
  const improvements: RegressionCriterion[] = [];

  // Find shared blueprints
  const olderBlueprints = new Set(olderRuns.map(r => r.configId));
  const newerBlueprints = new Set(newerRuns.map(r => r.configId));
  const sharedBlueprints = Array.from(olderBlueprints).filter(b => newerBlueprints.has(b));

  if (sharedBlueprints.length === 0) {
    if (options.verbose) {
      logger.info(`  No shared blueprints between ${olderVersion.name} and ${newerVersion.name}`);
    }
    return { regressions, improvements };
  }

  if (options.verbose) {
    logger.info(`  Comparing ${olderVersion.name} vs ${newerVersion.name} across ${sharedBlueprints.length} shared blueprints`);
  }

  for (const blueprintId of sharedBlueprints) {
    const olderRun = getLatestRunForBlueprint(olderRuns, blueprintId);
    const newerRun = getLatestRunForBlueprint(newerRuns, blueprintId);

    if (!olderRun || !newerRun) continue;

    const blueprintTitle = olderRun.configTitle;

    // 1. PROMPT-LEVEL REGRESSIONS
    const sharedPrompts = olderRun.resultData.promptIds.filter(p =>
      newerRun.resultData.promptIds.includes(p)
    );

    for (const promptId of sharedPrompts) {
      const olderScore = getHybridScoreForPrompt(olderRun, promptId, olderVersion.id);
      const newerScore = getHybridScoreForPrompt(newerRun, promptId, newerVersion.id);

      if (olderScore !== null && newerScore !== null) {
        const delta = newerScore - olderScore;
        const absChange = Math.abs(delta);

        if (absChange >= options.minScoreDelta) {
          const criterion: RegressionCriterion = {
            type: 'prompt',
            severity: categorizeSeverity(absChange),
            blueprintId,
            blueprintTitle,
            promptId,
            promptText: olderRun.resultData.promptContexts?.[promptId]
              ? (typeof olderRun.resultData.promptContexts[promptId] === 'string'
                  ? olderRun.resultData.promptContexts[promptId] as string
                  : JSON.stringify(olderRun.resultData.promptContexts[promptId]).slice(0, 200))
              : undefined,
            olderVersion: {
              modelId: olderVersion.id,
              score: olderScore,
              timestamp: olderRun.timestamp,
              runLabel: olderRun.runLabel,
              fileName: olderRun.fileName,
            },
            newerVersion: {
              modelId: newerVersion.id,
              score: newerScore,
              timestamp: newerRun.timestamp,
              runLabel: newerRun.runLabel,
              fileName: newerRun.fileName,
            },
            scoreDelta: delta,
            percentChange: (delta / olderScore) * 100,
          };

          if (delta < 0) {
            regressions.push(criterion);
          } else {
            improvements.push(criterion);
          }
        }
      }
    }

    // 2. POINT-LEVEL REGRESSIONS (most granular)
    for (const promptId of sharedPrompts) {
      const olderCoverage = olderRun.resultData.evaluationResults?.llmCoverageScores?.[promptId]?.[olderVersion.id];
      const newerCoverage = newerRun.resultData.evaluationResults?.llmCoverageScores?.[promptId]?.[newerVersion.id];

      if (!olderCoverage || 'error' in olderCoverage || !newerCoverage || 'error' in newerCoverage) continue;

      const olderPoints = olderCoverage.pointAssessments || [];
      const newerPoints = newerCoverage.pointAssessments || [];

      // Match points by keyPointText
      for (const olderPoint of olderPoints) {
        const newerPoint = newerPoints.find(p => p.keyPointText === olderPoint.keyPointText);

        if (newerPoint &&
            olderPoint.coverageExtent !== undefined &&
            newerPoint.coverageExtent !== undefined) {

          const delta = newerPoint.coverageExtent - olderPoint.coverageExtent;
          const absChange = Math.abs(delta);

          if (absChange >= options.minScoreDelta) {
            const criterion: RegressionCriterion = {
              type: 'point',
              severity: categorizeSeverity(absChange),
              blueprintId,
              blueprintTitle,
              promptId,
              pointText: olderPoint.keyPointText,
              olderVersion: {
                modelId: olderVersion.id,
                score: olderPoint.coverageExtent,
                timestamp: olderRun.timestamp,
                runLabel: olderRun.runLabel,
                fileName: olderRun.fileName,
              },
              newerVersion: {
                modelId: newerVersion.id,
                score: newerPoint.coverageExtent,
                timestamp: newerRun.timestamp,
                runLabel: newerRun.runLabel,
                fileName: newerRun.fileName,
              },
              scoreDelta: delta,
              percentChange: (delta / olderPoint.coverageExtent) * 100,
            };

            if (delta < 0) {
              regressions.push(criterion);
            } else {
              improvements.push(criterion);
            }
          }
        }
      }
    }

    // 3. DIMENSION-LEVEL REGRESSIONS (from executive summary)
    const olderGrades = olderRun.resultData.executiveSummary?.structured?.grades;
    const newerGrades = newerRun.resultData.executiveSummary?.structured?.grades;

    if (olderGrades && newerGrades) {
      // Find grades for our specific model versions
      const olderModelGrade = Object.entries(olderGrades).find(([modelId]) => {
        const parsed = parseModelIdForDisplay(modelId);
        return parsed.baseId === olderVersion.id || olderVersion.aliases.includes(parsed.baseId);
      });

      const newerModelGrade = Object.entries(newerGrades).find(([modelId]) => {
        const parsed = parseModelIdForDisplay(modelId);
        return parsed.baseId === newerVersion.id || newerVersion.aliases.includes(parsed.baseId);
      });

      if (olderModelGrade && newerModelGrade) {
        const [, olderGradeObj] = olderModelGrade;
        const [, newerGradeObj] = newerModelGrade;

        // Executive summary grades are 1-10, normalize to 0-1 for comparison
        for (const dimension of Object.keys(olderGradeObj)) {
          const olderScore = (olderGradeObj as any)[dimension];
          const newerScore = (newerGradeObj as any)[dimension];

          if (typeof olderScore === 'number' && typeof newerScore === 'number') {
            const delta = newerScore - olderScore;
            const absChange = Math.abs(delta);

            // For 1-10 scale, a 1-point drop is significant
            if (absChange >= 1.0) {
              // Normalize to 0-1 for severity calculation
              const normalizedDelta = delta / 9; // 9-point range (1-10)

              const criterion: RegressionCriterion = {
                type: 'dimension',
                severity: categorizeSeverity(Math.abs(normalizedDelta)),
                blueprintId,
                blueprintTitle,
                dimensionKey: dimension,
                olderVersion: {
                  modelId: olderVersion.id,
                  score: olderScore,
                  timestamp: olderRun.timestamp,
                  runLabel: olderRun.runLabel,
                  fileName: olderRun.fileName,
                },
                newerVersion: {
                  modelId: newerVersion.id,
                  score: newerScore,
                  timestamp: newerRun.timestamp,
                  runLabel: newerRun.runLabel,
                  fileName: newerRun.fileName,
                },
                scoreDelta: delta,
                percentChange: (delta / olderScore) * 100,
              };

              if (delta < 0) {
                regressions.push(criterion);
              } else {
                improvements.push(criterion);
              }
            }
          }
        }
      }
    }
  }

  return { regressions, improvements };
}

// ===== MAIN ACTION =====

async function actionGenerateRegressions(options: {
  verbose?: boolean;
  minScoreDelta?: number;
  seriesFilter?: string;
  excludePattern?: string;
  includeOnly?: string;
  featuredOnly?: boolean;
  excludeTags?: string;
  limit?: number;
  concurrency?: number;
}) {
  const { logger } = getConfig();

  logger.info('🔍 Starting regression detection analysis...');

  // Validate registry
  const orderingIssues = validateChronologicalOrdering();
  if (orderingIssues.length > 0) {
    logger.warn('⚠️  Found chronological ordering issues in registry:');
    orderingIssues.forEach(issue => logger.warn(`  - ${issue}`));
    logger.warn('  Please fix these before proceeding.');
    return;
  }

  const minScoreDelta = options.minScoreDelta || 0.05;
  logger.info(`Minimum score delta threshold: ${minScoreDelta} (${(minScoreDelta * 100).toFixed(1)}%)`);

  // Filter series if requested
  const seriesToAnalyze = options.seriesFilter
    ? MODEL_VERSION_REGISTRY.filter(s => {
        const filter = options.seriesFilter!;
        return s.seriesId === filter || s.seriesName.includes(filter);
      })
    : MODEL_VERSION_REGISTRY;

  if (seriesToAnalyze.length === 0) {
    logger.error(`No series found matching filter: ${options.seriesFilter}`);
    return;
  }

  logger.info(`Analyzing ${seriesToAnalyze.length} model series...`);

  // Step 1: Load all run data
  logger.info('📂 Loading all run data from storage...');
  let configIds = await listConfigIds();

  // Apply config filters
  const originalCount = configIds.length;

  // Exclude patterns (e.g., "sandbox-*,api-run-*,test-*")
  if (options.excludePattern) {
    const patterns = options.excludePattern.split(',').map(p => p.trim());
    configIds = configIds.filter(id => {
      return !patterns.some(pattern => {
        if (pattern.endsWith('*')) {
          return id.startsWith(pattern.slice(0, -1));
        }
        return id === pattern;
      });
    });
    logger.info(`Excluded ${originalCount - configIds.length} configs by pattern`);
  }

  // Include only specific configs (e.g., "mental-health,legal-reasoning")
  if (options.includeOnly) {
    const included = options.includeOnly.split(',').map(p => p.trim());
    configIds = configIds.filter(id => included.includes(id));
    logger.info(`Limited to ${configIds.length} explicitly included configs`);
  }

  // Apply limit if specified
  if (options.limit && options.limit > 0) {
    configIds = configIds.slice(0, options.limit);
    logger.info(`Limited to first ${configIds.length} configs by --limit flag`);
  }

  logger.info(`Scanning ${configIds.length} blueprints (filtered from ${originalCount})`);

  const runDataByModel = new Map<string, RunData[]>();
  const concurrency = options.concurrency || 30;
  const limit = pLimit(concurrency); // Configurable concurrency

  if (options.verbose) {
    logger.info(`Using concurrency: ${concurrency} parallel fetches`);
  }

  let totalRuns = 0;
  let skippedByTag = 0;
  const excludeTagsList = options.excludeTags ? options.excludeTags.split(',').map(t => t.trim()) : [];

  // Progress tracking
  let processedConfigs = 0;
  const progressInterval = Math.max(1, Math.floor(configIds.length / 10));

  // Parallelize config processing at the top level
  const configConcurrency = Math.max(10, Math.floor(concurrency / 2)); // Half of fetch concurrency
  const configLimit = pLimit(configConcurrency);

  await Promise.all(configIds.map(configId =>
    configLimit(async () => {
      try {
        const runs = await listRunsForConfig(configId);

        const fetchPromises = runs.map(runInfo =>
          limit(async () => {
            try {
              const resultData = await getResultByFileName(configId, runInfo.fileName) as FetchedComparisonData;
              if (!resultData) return null;

              // Filter by tags if specified
              if (excludeTagsList.length > 0) {
                const runTags = resultData.config?.tags || [];
                const hasExcludedTag = runTags.some(tag => excludeTagsList.includes(tag));
                if (hasExcludedTag) {
                  skippedByTag++;
                  return null;
                }
              }

              // Filter featured only
              if (options.featuredOnly) {
                const runTags = resultData.config?.tags || [];
                if (!runTags.includes('_featured')) {
                  return null;
                }
              }

              const runData: RunData = {
                configId,
                configTitle: resultData.configTitle || resultData.config?.title || configId,
                runLabel: resultData.runLabel,
                timestamp: resultData.timestamp,
                fileName: runInfo.fileName,
                resultData,
              };

              // Index by each model that participated
              for (const modelId of resultData.effectiveModels) {
                const versionMatch = findVersionForModel(modelId);
                if (versionMatch) {
                  const canonicalId = versionMatch.version.id;
                  if (!runDataByModel.has(canonicalId)) {
                    runDataByModel.set(canonicalId, []);
                  }
                  runDataByModel.get(canonicalId)!.push(runData);
                }
              }

              totalRuns++;
              return runData;
            } catch (error: any) {
              if (options.verbose) {
                logger.error(`  Error loading run ${runInfo.fileName}: ${error.message}`);
              }
              return null;
            }
          })
        );

        await Promise.all(fetchPromises);

        // Progress logging
        processedConfigs++;
        if (options.verbose && processedConfigs % progressInterval === 0) {
          logger.info(`  Progress: ${processedConfigs}/${configIds.length} configs processed (${totalRuns} runs loaded)`);
        }
      } catch (error: any) {
        if (options.verbose) {
          logger.error(`  Error processing config ${configId}: ${error.message}`);
        }
      }
    })
  ));

  if (skippedByTag > 0) {
    logger.info(`Skipped ${skippedByTag} runs by tag filter`);
  }

  logger.info(`✅ Loaded ${totalRuns} runs, indexed ${runDataByModel.size} model versions`);

  // Step 2: Analyze each series for regressions
  logger.info('\n🔬 Analyzing version comparisons...');
  const allRegressions: ModelSeriesRegression[] = [];

  for (const series of seriesToAnalyze) {
    if (series.versions.length < 2) {
      if (options.verbose) {
        logger.info(`⏭️  Skipping ${series.seriesName} (only 1 version)`);
      }
      continue;
    }

    logger.info(`\n📊 Analyzing: ${series.seriesName} (${series.versions.length} versions)`);

    // Compare each adjacent version pair
    for (let i = 0; i < series.versions.length - 1; i++) {
      const olderVersion = series.versions[i];
      const newerVersion = series.versions[i + 1];

      const olderRuns = runDataByModel.get(olderVersion.id) || [];
      const newerRuns = runDataByModel.get(newerVersion.id) || [];

      if (olderRuns.length === 0 || newerRuns.length === 0) {
        if (options.verbose) {
          logger.info(`  ⏭️  Skipping ${olderVersion.name} → ${newerVersion.name} (insufficient data: ${olderRuns.length} vs ${newerRuns.length} runs)`);
        }
        continue;
      }

      const { regressions, improvements } = await detectRegressions(
        olderVersion,
        newerVersion,
        olderRuns,
        newerRuns,
        { minScoreDelta, verbose: options.verbose || false }
      );

      if (regressions.length > 0 || improvements.length > 0) {
        // Find shared blueprints
        const olderBlueprints = new Set(olderRuns.map(r => r.configId));
        const newerBlueprints = new Set(newerRuns.map(r => r.configId));
        const sharedBlueprintIds = Array.from(olderBlueprints).filter(b => newerBlueprints.has(b));

        const sharedBlueprints = sharedBlueprintIds.map(id => ({
          id,
          title: olderRuns.find(r => r.configId === id)?.configTitle || id,
          olderRunCount: olderRuns.filter(r => r.configId === id).length,
          newerRunCount: newerRuns.filter(r => r.configId === id).length,
        }));

        allRegressions.push({
          seriesId: series.seriesId,
          seriesName: series.seriesName,
          maker: series.maker,
          tier: series.tier,
          versionComparison: { older: olderVersion, newer: newerVersion },
          regressions,
          improvements,
          sharedBlueprints,
          overallRegressionScore: calculateOverallSeverityScore(regressions),
        });

        logger.info(`  📈 ${olderVersion.name} → ${newerVersion.name}:`);
        logger.info(`     ${regressions.length} regressions, ${improvements.length} improvements`);
        logger.info(`     Shared blueprints: ${sharedBlueprints.length}`);
      }
    }
  }

  // Step 3: Generate summary
  const summary: RegressionsSummary = {
    regressions: allRegressions,
    generatedAt: new Date().toISOString(),
    thresholds: {
      minScoreDelta,
      majorThreshold: 0.15,
      moderateThreshold: 0.08,
      minorThreshold: 0.05,
    },
    metadata: {
      totalSeriesAnalyzed: seriesToAnalyze.length,
      totalVersionComparisons: allRegressions.length,
      totalRegressions: allRegressions.reduce((sum, sr) => sum + sr.regressions.length, 0),
      totalImprovements: allRegressions.reduce((sum, sr) => sum + sr.improvements.length, 0),
      totalBlueprintsScanned: configIds.length,
    },
  };

  // Step 4: Save output
  logger.info('\n💾 Saving regressions summary...');
  await saveRegressionsSummary(summary);

  logger.info('\n✅ Regression analysis complete!');
  logger.info(`\n📊 Summary:`);
  logger.info(`   Series analyzed: ${summary.metadata.totalSeriesAnalyzed}`);
  logger.info(`   Version comparisons: ${summary.metadata.totalVersionComparisons}`);
  logger.info(`   Total regressions found: ${summary.metadata.totalRegressions}`);
  logger.info(`   Total improvements found: ${summary.metadata.totalImprovements}`);
  logger.info(`   Blueprints scanned: ${summary.metadata.totalBlueprintsScanned}`);

  // Show top regressions
  if (allRegressions.length > 0) {
    logger.info('\n🔴 Top Regression Findings:');
    const sorted = [...allRegressions].sort((a, b) => b.overallRegressionScore - a.overallRegressionScore);
    sorted.slice(0, 5).forEach(reg => {
      logger.info(`\n   ${reg.seriesName}`);
      logger.info(`   ${reg.versionComparison.older.name} → ${reg.versionComparison.newer.name}`);
      logger.info(`   Severity Score: ${reg.overallRegressionScore}/100`);
      logger.info(`   Regressions: ${reg.regressions.length} | Improvements: ${reg.improvements.length}`);

      // Show worst regression
      const worstRegression = reg.regressions.sort((a, b) => a.scoreDelta - b.scoreDelta)[0];
      if (worstRegression) {
        logger.info(`   Worst: ${worstRegression.type} (${(worstRegression.percentChange).toFixed(1)}% drop)`);
        if (worstRegression.pointText) {
          logger.info(`          "${worstRegression.pointText.slice(0, 60)}..."`);
        }
      }
    });
  }
}

// ===== COMMAND DEFINITION =====

export const generateRegressionsCommand = new Command('generate-regressions')
  .description('Detect performance regressions across model versions by comparing chronologically ordered releases')
  .option('-v, --verbose', 'Enable verbose logging for detailed analysis')
  .option('--min-score-delta <number>', 'Minimum score change to flag as regression (default: 0.05)', parseFloat)
  .option('--series-filter <string>', 'Only analyze specific series (by ID or name)')
  .option('--exclude-pattern <patterns>', 'Comma-separated config patterns to exclude (e.g., "sandbox-*,api-run-*,test-*")')
  .option('--include-only <configs>', 'Comma-separated list of specific config IDs to include')
  .option('--featured-only', 'Only analyze runs with _featured tag')
  .option('--exclude-tags <tags>', 'Comma-separated tags to exclude (e.g., "_test,_public_api")')
  .option('--limit <number>', 'Limit to first N blueprints (for quick testing)', parseInt)
  .option('--concurrency <number>', 'Max parallel fetches (default: 30)', parseInt)
  .action(actionGenerateRegressions);
