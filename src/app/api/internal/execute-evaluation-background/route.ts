import { NextRequest, NextResponse } from 'next/server';
import { executeComparisonPipeline } from "@/cli/services/comparison-pipeline-service";
import { generateConfigContentHash } from "@/lib/hash-utils";
import { ComparisonConfig, EvaluationMethod } from "@/cli/types/cli_types";
import {
    getHomepageSummary,
    saveHomepageSummary,
    updateSummaryDataWithNewRun,
    getResultByFileName,
    HomepageSummaryFileContent
} from "@/lib/storageService";
import { ComparisonDataV2 as FetchedComparisonData } from '@/app/utils/types';
import path from 'path';
import {
    calculateHeadlineStats,
    calculatePotentialModelDrift
} from '@/cli/utils/summaryCalculationUtils';
import { actionBackfillSummary } from "@/cli/commands/backfill-summary";
import { populatePairwiseQueue } from "@/cli/services/pairwise-task-queue-service";
import { normalizeTag } from "@/app/utils/tagUtils";
import { CustomModelDefinition } from "@/lib/llm-clients/types";
import { registerCustomModels } from "@/lib/llm-clients/client-dispatcher";
import { getLogger } from "@/utils/logger";
import { initSentry, captureError, setContext, flushSentry } from "@/utils/sentry";
import { checkBackgroundAuth } from "@/lib/background-function-auth";

export async function POST(req: NextRequest) {
  // Initialize Sentry for this function
  initSentry('execute-evaluation-background');

  // Check authentication
  const authError = checkBackgroundAuth(req);
  if (authError) {
    await flushSentry();
    return authError;
  }

  const requestId = crypto.randomUUID();
  const logger = await getLogger(`eval:bg:${requestId}`);
  logger.info("Function invoked.");

  let requestPayload;
  try {
    requestPayload = await req.json();
    logger.info("Successfully parsed request body.");
  } catch (e: any) {
    logger.error("Failed to parse request body as JSON", e);
    captureError(e, { context: 'json_parse' });
    await flushSentry();
    return NextResponse.json(
      { error: "Invalid JSON in request body.", details: e.message },
      { status: 400 }
    );
  }

  const config = requestPayload.config as ComparisonConfig;
  const commitSha = requestPayload.commitSha as string | undefined;

  // Set Sentry context for this invocation
  setContext('evaluation', {
    configId: config?.id,
    commitSha,
    requestId,
  });

  // --- NORMALIZE TAGS ---
  if (config.tags) {
      const originalTags = [...config.tags];
      const normalizedTags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
      config.tags = normalizedTags;
  }
  // --- END NORMALIZE TAGS ---

  if (!config || typeof config !== 'object' || !config.id) {
    logger.error("Invalid or missing 'config' object in payload, or it is missing the canonical 'id'.", { payloadReceived: requestPayload });
    return NextResponse.json(
      { error: "Invalid or missing 'config' object in payload, or it is missing the canonical 'id'." },
      { status: 400 }
    );
  }
  const currentId = config.id;
  const currentTitle = config.title || config.id;

  logger.info(`Received request to execute evaluation for Blueprint ID: ${currentId}, Title: ${currentTitle}`);

  try {
    // --- Custom Model Registration ---
    const customModelDefs = config.models.filter(m => typeof m === 'object') as CustomModelDefinition[];
    if (customModelDefs.length > 0) {
        registerCustomModels(customModelDefs);
        logger.info(`Registered ${customModelDefs.length} custom model definitions.`);
    }
    const modelIdsToRun = config.models.map(m => (typeof m === 'string' ? m : m.id));
    // --- End Custom Model Registration ---

    // Generate runLabel from content hash
    const contentHash = generateConfigContentHash({ ...config, models: modelIdsToRun });
    const runLabel = contentHash; // For background functions, using hash directly is fine
    logger.info(`Generated runLabel (contentHash): ${runLabel} for Blueprint ID: ${currentId}`);
    if (commitSha) {
      logger.info(`Received commit SHA: ${commitSha} to associate with the run.`);
    } else {
      logger.warn(`No commit SHA received in payload. The resulting data will not be linked to a specific commit.`);
    }

    const evalMethods: EvaluationMethod[] = ['embedding', 'llm-coverage'];
    const useCache = true;

    logger.info(`Executing pipeline with evalMethods: ${evalMethods.join(", ")} and cache enabled.`);

    const pipelineConfig = { ...config, models: modelIdsToRun };
    const pipelineOutputKey = await executeComparisonPipeline(
      pipelineConfig,
      runLabel,
      evalMethods,
      logger,
      undefined, // outputDir override (not needed for S3)
      undefined, // fileNameOverride (not needed for S3)
      useCache,
      commitSha
    );

    let newResultData: FetchedComparisonData | null = null;
    let actualResultFileName: string | null = null;

    if (pipelineOutputKey && typeof pipelineOutputKey === 'string') {
      actualResultFileName = path.basename(pipelineOutputKey);
      newResultData = await getResultByFileName(currentId, actualResultFileName) as FetchedComparisonData;

      if (!newResultData) {
        logger.error(`Pipeline completed, result saved to: ${pipelineOutputKey}, but failed to fetch the saved data for summary update.`);
      } else {
        logger.info(`Pipeline completed successfully for ${currentId}. Result Key: ${pipelineOutputKey}. Fetched data for summary update.`);
      }
    } else {
      logger.error(`Pipeline completed for ${currentId}, but no valid output path/key was returned.`);
    }

    // Only proceed if we have the new result data and a filename.
    if (newResultData && actualResultFileName && process.env.STORAGE_PROVIDER === 's3') {
        try {
            logger.info('New evaluation run completed. Triggering full summary backfill to update all platform statistics...');

            await actionBackfillSummary({ verbose: false, dryRun: false });

            logger.info('Homepage summary, model summaries, and all related analytics rebuilt successfully.');

        } catch (summaryError: any) {
            logger.error(`Failed to rebuild all summary files`, summaryError);
            captureError(summaryError, { configId: currentId, context: 'summary_rebuild' });
        }
    } else {
        let skipReason = "";
        if (!newResultData) skipReason += "Result data not available. ";
        if (!actualResultFileName) skipReason += "Result filename not available. ";
        if (process.env.STORAGE_PROVIDER !== 's3') skipReason += "Storage provider is not S3. ";
        logger.info(`Skipping homepage summary manifest update. Reason: ${skipReason.trim()}`);
    }

    if (pipelineOutputKey) {
      logger.info(`Pipeline tasks completed for ${currentId}. Output related to: ${pipelineOutputKey}`);
      await flushSentry();
      return NextResponse.json({
        message: "Evaluation pipeline tasks completed.",
        blueprintId: currentId,
        runLabel: runLabel,
        output: pipelineOutputKey
      });
    } else {
      const error = new Error(`Pipeline execution for ${currentId} did not yield a valid output path/key.`);
      logger.error(error.message);
      captureError(error, { configId: currentId, runLabel, context: 'no_output_key' });
      await flushSentry();
      return NextResponse.json(
        {
          error: "Pipeline execution did not yield a valid output reference.",
          blueprintId: currentId,
          runLabel: runLabel
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    logger.error(`Unhandled error during pipeline execution for ${currentId}`, error);
    captureError(error, {
      configId: currentId,
      commitSha,
      context: 'pipeline_execution',
    });

    await flushSentry();

    return NextResponse.json(
      {
        error: "Unhandled error during pipeline execution.",
        details: error.message,
        blueprintId: currentId
      },
      { status: 500 }
    );
  }
}
