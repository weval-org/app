import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import axios from 'axios';
import { ComparisonConfig } from "@/cli/types/cli_types";
import { generateConfigContentHash } from "@/lib/hash-utils";
import { listRunsForConfig } from "@/lib/storageService";
import { resolveModelsInConfig, SimpleLogger } from "@/lib/blueprint-service";
import { parseAndNormalizeBlueprint } from "@/lib/blueprint-parser";

const EVAL_CONFIGS_REPO_API_URL = "https://api.github.com/repos/weval/configs/contents/blueprints";
const MODEL_COLLECTIONS_REPO_API_URL_BASE = "https://api.github.com/repos/weval/configs/contents/models";
const REPO_COMMITS_API_URL = "https://api.github.com/repos/weval/configs/commits/main";
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
      'Accept': 'application/vnd.github.v3+json',
  };
  const rawContentHeaders: Record<string, string> = {
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
    // Fetch the latest commit SHA for the main branch first
    let latestCommitSha: string | null = null;
    try {
      const commitResponse = await axios.get(REPO_COMMITS_API_URL, { headers: githubHeaders });
      latestCommitSha = commitResponse.data.sha;
      if (latestCommitSha) {
        logger.info(`[fetch-and-schedule-evals] Fetched latest commit SHA for weval/configs@main: ${latestCommitSha}`);
      } else {
        logger.warn(`[fetch-and-schedule-evals] Could not determine latest commit SHA from API response.`);
      }
    } catch (commitError: any) {
      logger.error(`[fetch-and-schedule-evals] Failed to fetch latest commit SHA: ${commitError.message}. Proceeding without it.`);
    }

    const treeApiUrl = `https://api.github.com/repos/weval/configs/git/trees/main?recursive=1`;
    logger.info(`[fetch-and-schedule-evals] Fetching file tree from: ${treeApiUrl}`);
    const treeResponse = await axios.get(treeApiUrl, { headers: githubHeaders });
    
    const filesInBlueprintDir = treeResponse.data.tree.filter(
      (node: any) => node.type === 'blob' && node.path.startsWith('blueprints/') && (node.path.endsWith('.yml') || node.path.endsWith('.yaml') || node.path.endsWith('.json'))
    );

    if (!Array.isArray(filesInBlueprintDir)) {
      logger.error("[fetch-and-schedule-evals] Failed to fetch or filter file list from GitHub repo tree.", treeResponse.data);
      return { statusCode: 500, body: "Failed to process file list from GitHub repo." };
    }

    logger.info(`[fetch-and-schedule-evals] Found ${filesInBlueprintDir.length} blueprint files in the repo tree.`);

    for (const file of filesInBlueprintDir) {
      const fileName = file.path.split('/').pop();
      logger.info(`[fetch-and-schedule-evals] Processing config file: ${file.path}`);
      
      try {
        const configFileResponse = await axios.get(file.url, { headers: rawContentHeaders });
        
        const fileType = (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) ? 'yaml' : 'json';
        const configContent = typeof configFileResponse.data === 'string' ? configFileResponse.data : JSON.stringify(configFileResponse.data);
        
        let config: ComparisonConfig = parseAndNormalizeBlueprint(configContent, fileType);

        // If ID is missing, derive it from the filename.
        if (!config.id) {
          const rawFileName = fileName;
          const id = rawFileName
            .replace(/\.civic\.ya?ml$/, '')
            .replace(/\.weval\.ya?ml$/, '')
            .replace(/\.ya?ml$/, '')
            .replace(/\.json$/, '');
          logger.info(`[fetch-and-schedule-evals] 'id' not found in blueprint '${fileName}'. Deriving from filename: '${id}'`);
          config.id = id;
        }

        // If title is missing, derive it from the ID.
        if (!config.title) {
          logger.info(`[fetch-and-schedule-evals] 'title' not found in blueprint '${fileName}'. Using derived or existing ID as title: '${config.id}'`);
          config.title = config.id;
        }

        if (!config.tags || !config.tags.includes('_periodic')) {
          logger.info(`[fetch-and-schedule-evals] Blueprint ${config.id || fileName} does not have the '_periodic' tag. Skipping scheduled run check.`);
          continue; // Move to the next file
        }

        if (!config.id || !config.prompts) {
          logger.warn(`[fetch-and-schedule-evals] Blueprint file ${fileName} is invalid or missing essential fields (id, prompts) after attempting to derive them. Skipping.`);
          continue;
        }

        if (!config.models || !Array.isArray(config.models) || config.models.length === 0) {
          logger.info(`[fetch-and-schedule-evals] Models field for ${fileName} is missing, not an array, or empty. Defaulting to ["CORE"].`);
          config.models = ["CORE"];
        }

        const currentId = config.id!;
        const currentTitle = config.title;

        logger.info(`[fetch-and-schedule-evals] Attempting to resolve model collections for ${currentId} from blueprint ${fileName}`);
        config = await resolveModelsInConfig(config, githubToken, logger);
        // Log after resolution attempt
        logger.info(`[fetch-and-schedule-evals] Models for ${currentId} after resolution attempt: [${config.models.join(', ')}] (Count: ${config.models.length})`);

        // Critical check: if after resolution, models array is empty, skip this config.
        if (!config.models || config.models.length === 0) {
          logger.warn(`[fetch-and-schedule-evals] Blueprint file ${fileName} (id: ${currentId}) has no models after resolution or resolution failed. Skipping evaluation for this blueprint.`);
          continue;
        }

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
                logger.info(`[fetch-and-schedule-evals] Blueprint ${currentId} (file: ${file.path}, resolved hash: ${contentHash}) has a recent run (${latestMatchingRun.fileName}). Skipping.`);
                needsRun = false;
              } else {
                logger.info(`[fetch-and-schedule-evals] Blueprint ${currentId} (file: ${file.path}, resolved hash: ${contentHash}) has an old run (${latestMatchingRun.fileName}). Scheduling new run.`);
              }
            } else {
               logger.info(`[fetch-and-schedule-evals] Blueprint ${currentId} (file: ${file.path}, resolved hash: ${contentHash}) has an existing run without a parsable timestamp (${latestMatchingRun.fileName}). Scheduling new run.`);
            }
          } else {
              logger.info(`[fetch-and-schedule-evals] No existing run found with resolved hash ${contentHash} for blueprint ${currentId} (file: ${file.path}). Scheduling new run.`);
          }
        } else {
          logger.info(`[fetch-and-schedule-evals] No existing runs found at all for blueprint ${currentId} (file: ${file.path}). Scheduling new run.`);
        }

        if (needsRun) {
          // This check is now redundant due to the one after resolveModelsInConfig, but kept for safety, can be removed.
          if (config.models.length === 0) {
              logger.warn(`[fetch-and-schedule-evals] Blueprint ${currentId} (file: ${file.path}) still has no models before triggering. THIS SHOULD NOT HAPPEN. Skipping.`);
              continue;
          }
          logger.info(`[fetch-and-schedule-evals] Triggering 'execute-evaluation-background' for ${currentId} (resolved hash: ${contentHash}) from blueprint file ${file.path}`);
          
          const siteUrl = process.env.URL; 
          if (!siteUrl) {
              logger.error("[fetch-and-schedule-evals] URL environment variable is not set. Cannot invoke background function.");
              // Potentially return an error or stop processing further files if this is a critical config error for all
              continue; 
          }

          const executionUrl = `${siteUrl}/.netlify/functions/execute-evaluation-background`;

          try {
              await axios.post(executionUrl, 
                  { 
                    config, // Pass the MODIFIED config object with resolved models
                    commitSha: latestCommitSha
                  },
                  {
                      headers: { 'Content-Type': 'application/json' }
                  }
              );
              logger.info(`[fetch-and-schedule-evals] Successfully POSTed to '${executionUrl}' for ${currentId} from ${file.path}`);
          } catch (invokeError: any) {
              let errorDetails = invokeError.message;
              if (invokeError.response) {
                  errorDetails += ` | Status: ${invokeError.response.status} | Data: ${JSON.stringify(invokeError.response.data)}`;
              }
              logger.error(`[fetch-and-schedule-evals] Error POSTing to ${executionUrl} for ${file.path}: ${errorDetails}`);
          }
        }
      } catch (fetchConfigError: any) {
        logger.error(`[fetch-and-schedule-evals] Error fetching or processing blueprint file ${file.path}:`, fetchConfigError.message, { stack: fetchConfigError.stack });
      }
    }
    return { statusCode: 200, body: "Scheduled eval check completed." };
  } catch (error: any) {
    logger.error("[fetch-and-schedule-evals] Error in handler:", error.message, { stack: error.stack });
    return { statusCode: 500, body: "Error processing scheduled eval check." };
  }
};

export { handler }; 