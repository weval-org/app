import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions"; // Removed ScheduledEvent for now if problematic
import axios from 'axios';
import { ComparisonConfig } from "@/cli/types/comparison_v2";
import { generateConfigContentHash } from "@/lib/hash-utils";
import { listRunsForConfig } from "@/lib/storageService";
import { resolveModelsInConfig, SimpleLogger } from "@/lib/config-utils";

const EVAL_CONFIGS_REPO_API_URL = "https://api.github.com/repos/civiceval/configs/contents/blueprints";
const MODEL_COLLECTIONS_REPO_API_URL_BASE = "https://api.github.com/repos/civiceval/configs/contents/models";
const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

// Helper function to create a simple console-based logger with a prefix
const createLogger = (context: HandlerContext | null, functionName: string): SimpleLogger => {
  const prefix = `[${functionName}${context ? ` RequestId: ${context.awsRequestId}` : ''}]`;
  return {
    info: (message: string, ...args: any[]) => console.log(`${prefix} INFO:`, message, ...args),
    error: (message: string, ...args: any[]) => console.error(`${prefix} ERROR:`, message, ...args),
    warn: (message: string, ...args: any[]) => console.warn(`${prefix} WARN:`, message, ...args),
  };
};

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const logger = createLogger(context, 'fetch-and-schedule-evals');

  logger.info(`Function triggered (${new Date().toISOString()}) - event source: ${event.headers?.['x-netlify-event'] || 'unknown'}`);

  const githubToken = process.env.GITHUB_TOKEN;
  const githubHeaders: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json', // Standard for directory listing
  };
  const rawContentHeaders: Record<string, string> = { // For fetching raw file content
    'Accept': 'application/vnd.github.v3.raw',
  };

  if (githubToken) {
      logger.info("Using GITHUB_TOKEN for API calls.");
      githubHeaders['Authorization'] = `token ${githubToken}`;
      rawContentHeaders['Authorization'] = `token ${githubToken}`;
  } else {
      logger.warn("GITHUB_TOKEN not set. Making anonymous calls to GitHub API, which may be rate-limited.");
  }

  try {
    const response = await axios.get(EVAL_CONFIGS_REPO_API_URL, { headers: githubHeaders });
    const files = response.data;

    if (!Array.isArray(files)) {
      logger.error("[fetch-and-schedule-evals] Failed to fetch file list from GitHub repo, response was not an array.", files);
      return { statusCode: 500, body: "Failed to fetch file list from GitHub repo." };
    }

    logger.info(`[fetch-and-schedule-evals] Found ${files.length} items in the configs repo at ${EVAL_CONFIGS_REPO_API_URL}.`);

    for (const file of files) {
      if (file.type === "file" && file.name.endsWith(".json") && file.download_url) {
        logger.info(`[fetch-and-schedule-evals] Processing config file: ${file.name}`);
        try {
          const configFileResponse = await axios.get(file.download_url, { headers: rawContentHeaders });
          let config: ComparisonConfig = typeof configFileResponse.data === 'string' ? JSON.parse(configFileResponse.data) : configFileResponse.data;

          if (!config || (!config.id && !config.configId) || !config.prompts) {
            logger.warn(`[fetch-and-schedule-evals] Blueprint file ${file.name} is invalid or missing essential fields (id/configId, prompts). Skipping.`);
            continue;
          }

          // Default to ["CORE"] if models is not provided or is empty
          if (!config.models || !Array.isArray(config.models) || config.models.length === 0) {
            logger.info(`[fetch-and-schedule-evals] Models field for ${file.name} is missing, not an array, or empty. Defaulting to ["CORE"].`);
            config.models = ["CORE"];
          }

          const currentId = config.id || config.configId!;
          const currentTitle = config.title || config.configTitle;

          // --- Resolve Model Collections using the shared utility ---
          logger.info(`[fetch-and-schedule-evals] Attempting to resolve model collections for ${currentId} from blueprint ${file.name}`);
          config = await resolveModelsInConfig(config, githubToken, logger);
          // Log after resolution attempt
          logger.info(`[fetch-and-schedule-evals] Models for ${currentId} after resolution attempt: [${config.models.join(', ')}] (Count: ${config.models.length})`);

          // Critical check: if after resolution, models array is empty, skip this config.
          if (!config.models || config.models.length === 0) {
            logger.warn(`[fetch-and-schedule-evals] Blueprint file ${file.name} (id: ${currentId}) has no models after resolution or resolution failed. Skipping evaluation for this blueprint.`);
            continue;
          }
          // --- End Resolve Model Collections ---

          const contentHash = generateConfigContentHash(config); // Hash is now based on FULLY resolved models
          const baseRunLabelForCheck = contentHash; 

          const existingRuns = await listRunsForConfig(currentId);
          let needsRun = true;

          if (existingRuns && existingRuns.length > 0) {
            const matchingExistingRuns = existingRuns.filter(run => run.runLabel === baseRunLabelForCheck);
            if (matchingExistingRuns.length > 0) {
              const latestMatchingRun = matchingExistingRuns[0]; // Assuming sorted by timestamp desc by listRunsForConfig
              if (latestMatchingRun.timestamp) {
                const runAge = Date.now() - new Date(latestMatchingRun.timestamp).getTime();
                if (runAge < ONE_WEEK_IN_MS) {
                  logger.info(`[fetch-and-schedule-evals] Blueprint ${currentId} (file: ${file.name}, resolved hash: ${contentHash}) has a recent run (${latestMatchingRun.fileName}). Skipping.`);
                  needsRun = false;
                } else {
                  logger.info(`[fetch-and-schedule-evals] Blueprint ${currentId} (file: ${file.name}, resolved hash: ${contentHash}) has an old run (${latestMatchingRun.fileName}). Scheduling new run.`);
                }
              } else {
                 logger.info(`[fetch-and-schedule-evals] Blueprint ${currentId} (file: ${file.name}, resolved hash: ${contentHash}) has an existing run without a parsable timestamp (${latestMatchingRun.fileName}). Scheduling new run.`);
              }
            } else {
                logger.info(`[fetch-and-schedule-evals] No existing run found with resolved hash ${contentHash} for blueprint ${currentId} (file: ${file.name}). Scheduling new run.`);
            }
          } else {
            logger.info(`[fetch-and-schedule-evals] No existing runs found at all for blueprint ${currentId} (file: ${file.name}). Scheduling new run.`);
          }

          if (needsRun) {
            // This check is now redundant due to the one after resolveModelsInConfig, but kept for safety, can be removed.
            if (config.models.length === 0) {
                logger.warn(`[fetch-and-schedule-evals] Blueprint ${currentId} (file: ${file.name}) still has no models before triggering. THIS SHOULD NOT HAPPEN. Skipping.`);
                continue;
            }
            logger.info(`[fetch-and-schedule-evals] Triggering 'execute-evaluation-background' for ${currentId} (resolved hash: ${contentHash}) from blueprint file ${file.name}`);
            
            const siteUrl = process.env.URL; 
            if (!siteUrl) {
                logger.error("[fetch-and-schedule-evals] URL environment variable is not set. Cannot invoke background function.");
                // Potentially return an error or stop processing further files if this is a critical config error for all
                continue; 
            }

            const executionUrl = `${siteUrl}/.netlify/functions/execute-evaluation-background`;

            try {
                await axios.post(executionUrl, 
                    { config }, // Pass the MODIFIED config object with resolved models
                    {
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
                logger.info(`[fetch-and-schedule-evals] Successfully POSTed to '${executionUrl}' for ${currentId} from ${file.name}`);
            } catch (invokeError: any) {
                let errorDetails = invokeError.message;
                if (invokeError.response) {
                    errorDetails += ` | Status: ${invokeError.response.status} | Data: ${JSON.stringify(invokeError.response.data)}`;
                }
                logger.error(`[fetch-and-schedule-evals] Error POSTing to ${executionUrl} for ${file.name}: ${errorDetails}`);
            }
          }
        } catch (fetchConfigError: any) {
          logger.error(`[fetch-and-schedule-evals] Error fetching or processing blueprint file ${file.name}:`, fetchConfigError.message, { stack: fetchConfigError.stack });
        }
      }
    }
    return { statusCode: 200, body: "Scheduled eval check completed." };
  } catch (error: any) {
    logger.error("[fetch-and-schedule-evals] Error in handler:", error.message, { stack: error.stack });
    return { statusCode: 500, body: "Error processing scheduled eval check." };
  }
};

export { handler }; 