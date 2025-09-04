import { Command } from 'commander';
import pLimit from '@/lib/pLimit';
import { getConfig } from '../config';
import {
  listConfigIds,
  listRunsForConfig,
  getResultByFileName,
  savePainPointsSummary,
  getCoverageResult,
} from '@/lib/storageService';
import { ComparisonDataV2 as WevalResult } from '@/app/utils/types';
import type { PointAssessment } from '@/types/shared';
import { PainPoint, PainPointsSummary } from '@/types/shared';

export async function actionGeneratePainPoints(options: {
  dryRun?: boolean;
  verbose?: boolean;
  concurrency?: number;
  threshold?: number; // legacy: treated as max
  min?: number;
  max?: number;
  limit?: number;
}) {
  const { logger } = getConfig();
  const limiter = pLimit(Math.max(1, options.concurrency ?? 8));
  // Default window focuses on informative near-failures, avoiding total breakdowns
  const min = options.min ?? 0.1;
  const max = options.max ?? (options.threshold ?? 0.5);
  const maxPoints = options.limit ?? 500; // Max number of pain points to collect

  logger.info(`Starting pain points generation with window [${min}, ${max}] and limit=${maxPoints}...`);

  let allPainPoints: PainPoint[] = [];
  let totalPairs = 0;
  let scoreNull = 0;
  let belowMin = 0;
  let aboveMax = 0;
  let withinWindow = 0;

  const configIds = await listConfigIds();
  await Promise.all(
    configIds.map((configId) =>
      limiter(async () => {
        try {
          const runs = await listRunsForConfig(configId);
          if (!runs || runs.length === 0) return;
          const latest = runs[0];
          const runData = (await getResultByFileName(
            configId,
            latest.fileName,
          )) as WevalResult | null;
          if (!runData || !runData.evaluationResults?.llmCoverageScores) return;

          const coverageScores = runData.evaluationResults.llmCoverageScores;

          for (const promptId in coverageScores) {
            const modelScores = coverageScores[promptId];
            for (const modelId in modelScores) {
              const result = modelScores[modelId];
              if (!result || (result as any)?.error) continue;

              const score = (result as any).avgCoverageExtent as number | null | undefined;
              totalPairs += 1;
              if (score === null || score === undefined || !isFinite(score)) {
                scoreNull += 1;
                continue;
              }
              if (score < min) { belowMin += 1; }
              if (score > max) { aboveMax += 1; }
              if (score >= min && score <= max) {
                withinWindow += 1;
                // Prefer detailed pointAssessments from the main result if present
                let pointAssessments: PointAssessment[] | undefined = (result as any).pointAssessments as any;

                // Fallback: try to load the detailed per-prompt/model coverage artefact
                if (!Array.isArray(pointAssessments) || pointAssessments.length === 0) {
                  try {
                    const cov = await getCoverageResult(
                      runData.configId,
                      runData.runLabel,
                      runData.timestamp,
                      promptId,
                      modelId,
                    );
                    if (cov && Array.isArray(cov.pointAssessments)) {
                      pointAssessments = cov.pointAssessments as any;
                    }
                  } catch (e: any) {
                    if (options.verbose) logger.warn(`[PainPoints] Could not fetch coverage artefact for ${configId}/${promptId}/${modelId}: ${e?.message || e}`);
                  }
                }

                const failedCriteria = (pointAssessments || [])
                  .filter((pa: PointAssessment) => (pa.coverageExtent ?? 1.0) < 0.5)
                  .map((pa: PointAssessment) => ({
                    criterion: pa.keyPointText,
                    score: pa.coverageExtent ?? null,
                    weight: pa.multiplier ?? 1,
                    reflection: pa.reflection ?? null,
                  }));

                const painPoint: PainPoint = {
                  configId: runData.configId,
                  configTitle: runData.configTitle,
                  runLabel: runData.runLabel,
                  timestamp: runData.timestamp,
                  promptId: promptId,
                  promptContext: (runData as any).promptContexts?.[promptId] ?? null,
                  modelId: modelId,
                  responseText:
                    (runData as any).allFinalAssistantResponses?.[promptId]?.[modelId] ||
                    '[Response not found]',
                  coverageScore: score,
                  failedCriteria: failedCriteria,
                };
                allPainPoints.push(painPoint);
              }
            }
          }
        } catch (err: any) {
          if (options.verbose)
            logger.warn(
              `[PainPoints] Failed processing config ${configId}: ${
                err?.message || err
              }`,
            );
        }
      }),
    ),
  );

  // Sort by score (most painful first) and take the top N
  allPainPoints.sort((a, b) => (a.coverageScore ?? 1) - (b.coverageScore ?? 1));
  const finalPainPoints = allPainPoints.slice(0, maxPoints);

  const output: PainPointsSummary = {
    painPoints: finalPainPoints,
    generatedAt: new Date().toISOString(),
  };

  if (options.dryRun) {
    logger.info(
      `[DRY RUN] Pain points computed. Pairs scanned=${totalPairs}, null=${scoreNull}, in-window=${withinWindow}, below-min=${belowMin}, above-max=${aboveMax}. Selected=${finalPainPoints.length}/${allPainPoints.length}.`,
    );
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  await savePainPointsSummary(output);
  logger.info(
    `Saved Pain Points summary with ${finalPainPoints.length} entries. Pairs scanned=${totalPairs}, null=${scoreNull}, in-window=${withinWindow}, below-min=${belowMin}, above-max=${aboveMax}.`,
  );
}

export const generatePainPointsCommand = new Command('generate-pain-points')
  .description(
    'Generates a summary of the worst model completions (Pain Points) from the latest runs.',
  )
  .option('--dry-run', 'Log result but do not save')
  .option('-v, --verbose', 'Verbose logging')
  .option(
    '-c, --concurrency <number>',
    'Parallelism for scanning configs',
    (v) => parseInt(v, 10),
  )
  .option('--min <number>', 'Minimum score for pain point inclusion (default: 0.1)', (v) => parseFloat(v))
  .option('--max <number>', 'Maximum score for pain point inclusion (default: 0.5)', (v) => parseFloat(v))
  .option(
    '--threshold <number>',
    'Legacy alias for --max',
    (v) => parseFloat(v),
  )
  .option(
    '--limit <number>',
    'Maximum number of pain points to include in the summary (default: 500)',
    (v) => parseInt(v, 10),
  )
  .action(actionGeneratePainPoints);
