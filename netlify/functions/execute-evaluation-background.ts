import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { executeComparisonPipeline } from "../../src/cli/services/comparison-pipeline-service"; // Adjusted path
import { generateConfigContentHash } from "../../src/lib/hash-utils"; // Adjusted path
import { ComparisonConfig, EvaluationMethod } from "../../src/cli/types/cli_types"; // Adjusted path
import { 
    getHomepageSummary, 
    saveHomepageSummary, 
    updateSummaryDataWithNewRun,
    getResultByFileName,
    HomepageSummaryFileContent
} from "../../src/lib/storageService"; // Adjusted path for storage service
import { ComparisonDataV2 as FetchedComparisonData } from '../../src/app/utils/types'; // For typing the fetched result
import path from 'path'; // For path.basename
import {
    calculateHeadlineStats,
    calculatePotentialModelDrift
} from '../../src/cli/utils/summaryCalculationUtils';
import { populatePairwiseQueue } from "../../src/cli/services/pairwise-task-queue-service";
import { normalizeTag } from "../../src/app/utils/tagUtils";
import { CustomModelDefinition } from "../../src/lib/llm-clients/types";
import { registerCustomModels } from "../../src/lib/llm-clients/client-dispatcher";

// Helper to create a simple console-based logger with a prefix
const createLogger = (context: HandlerContext) => {
  const prefix = `[execute-evaluation-background Function RequestId: ${context.awsRequestId}]`;
  return {
    info: (message: string, ...args: any[]) => console.log(`${prefix} INFO:`, message, ...args),
    error: (message: string, ...args: any[]) => console.error(`${prefix} ERROR:`, message, ...args),
    warn: (message: string, ...args: any[]) => console.warn(`${prefix} WARN:`, message, ...args),
    success: (message: string, ...args: any[]) => console.log(`${prefix} SUCCESS:`, message, ...args),
  };
};

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const logger = createLogger(context);
  logger.info("Function invoked.");

  if (!event.body) {
    logger.error("No body received in the event.");
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "No body received in the event." }),
    };
  }

  let requestPayload;
  try {
    requestPayload = JSON.parse(event.body);
    logger.info("Successfully parsed request body.");
  } catch (e: any) {
    logger.error("Failed to parse request body as JSON:", e.message);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON in request body.", details: e.message }),
    };
  }

  const config = requestPayload.config as ComparisonConfig;
  const commitSha = requestPayload.commitSha as string | undefined;

  // --- NORMALIZE TAGS ---
  if (config.tags) {
      const originalTags = [...config.tags];
      const normalizedTags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
      config.tags = normalizedTags;
  }
  // --- END NORMALIZE TAGS ---

  if (!config || typeof config !== 'object' || !config.id) {
    logger.error("Invalid or missing 'config' object in payload, or it is missing the canonical 'id'.", { payloadReceived: requestPayload });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid or missing 'config' object in payload, or it is missing the canonical 'id'." }),
    };
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

    const evalMethods: EvaluationMethod[] = ['embedding', 'llm-coverage']; // As simplified previously
    const useCache = true; // As simplified previously

    logger.info(`Executing pipeline with evalMethods: ${evalMethods.join(", ")} and cache enabled.`);

    // Note: getConfig() might try to access process.env variables for its own setup.
    // Ensure these are available in the Netlify function environment if needed by getConfig().
    // We are passing our function-specific logger to the pipeline.
    const pipelineConfig = { ...config, models: modelIdsToRun };
    const pipelineOutputKey = await executeComparisonPipeline(
      pipelineConfig,
      runLabel,
      evalMethods,
      logger, // Use the function-specific logger
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
        // Depending on desired behavior, you might still proceed or return an error here.
        // For now, we log the error and newResultData remains null.
      } else {
        logger.info(`Pipeline completed successfully for ${currentId}. Result Key: ${pipelineOutputKey}. Fetched data for summary update.`);
      }
    } else {
      logger.error(`Pipeline completed for ${currentId}, but no valid output path/key was returned.`);
      // newResultData remains null, summary update will be skipped or fail if attempted directly.
    }

    // Only proceed if we have the new result data and a filename.
    if (newResultData && actualResultFileName && process.env.STORAGE_PROVIDER === 's3') { 
        try {
            logger.info('Attempting to update homepage summary manifest with new calculations...');
            const currentFullSummary = await getHomepageSummary(); // Fetches HomepageSummaryFileContent | null

            // 1. Update the configs array part of the summary
            const updatedConfigsArray = updateSummaryDataWithNewRun(
                currentFullSummary?.configs || null, // Pass only the configs array
                newResultData,
                actualResultFileName
            );

            // 2. Recalculate headlineStats and driftDetectionResult using the newly updated configs array
            const newHeadlineStats = calculateHeadlineStats(updatedConfigsArray);
            const newDriftDetectionResult = calculatePotentialModelDrift(updatedConfigsArray);

            // 3. Construct the complete new HomepageSummaryFileContent object
            const newHomepageSummaryContent: HomepageSummaryFileContent = {
                configs: updatedConfigsArray,
                headlineStats: newHeadlineStats,
                driftDetectionResult: newDriftDetectionResult,
                lastUpdated: new Date().toISOString(),
            };

            await saveHomepageSummary(newHomepageSummaryContent);
            logger.info('Homepage summary manifest updated successfully with re-calculated stats.');

            // --- BEGIN: Populate Pairwise Task Queue ---
            if (newResultData.config?.tags?.includes('_get_human_prefs')) {
                try {
                    logger.info('Found _get_human_prefs tag. Attempting to populate pairwise comparison task queue...');
                    const queueResult = await populatePairwiseQueue(newResultData, { logger });
                    logger.info(`Pairwise task queue processed. Added: ${queueResult.tasksAdded}, Total in queue: ${queueResult.totalTasksInQueue}`);
                } catch (pairwiseError: any) {
                    logger.error(`Failed to populate pairwise task queue: ${pairwiseError.message}`);
                }
            }
            // --- END: Populate Pairwise Task Queue ---
            
        } catch (summaryError: any) {
            logger.error(`Failed to update homepage summary manifest: ${summaryError.message}`);
            if (process.env.DEBUG && summaryError.stack) {
                logger.error(`Summary update stack trace: ${summaryError.stack}`);
            }
            // Do not fail the entire function here, as the main run was successful.
        }
    } else {
        let skipReason = "";
        if (!newResultData) skipReason += "Result data not available. ";
        if (!actualResultFileName) skipReason += "Result filename not available. ";
        if (process.env.STORAGE_PROVIDER !== 's3') skipReason += "Storage provider is not S3. ";
        logger.info(`Skipping homepage summary manifest update. Reason: ${skipReason.trim()}`);
    }

    if (pipelineOutputKey) { // Check original pipelineOutputKey for success reporting
      logger.success(`Pipeline tasks completed for ${currentId}. Output related to: ${pipelineOutputKey}`);
      return {
        statusCode: 200, 
        body: JSON.stringify({ 
          message: "Evaluation pipeline tasks completed.", 
          blueprintId: currentId, 
          runLabel: runLabel,
          output: pipelineOutputKey 
        }),
      };
    } else {
      // This path might be hit if pipelineOutputKey was null/undefined from executeComparisonPipeline
      logger.error(`Pipeline execution for ${currentId} did not yield a valid output path/key.`);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: "Pipeline execution did not yield a valid output reference.",
          blueprintId: currentId,
          runLabel: runLabel
        }),
      };
    }

  } catch (error: any) {
    logger.error(`Unhandled error during pipeline execution for ${currentId}:`, error.message, { stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Unhandled error during pipeline execution.", 
        details: error.message, 
        blueprintId: currentId 
      }),
    };
  }
}; 