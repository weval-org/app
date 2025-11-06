import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import axios from 'axios';
import { ComparisonConfig } from "@/cli/types/cli_types";
import { generateConfigContentHash } from "@/lib/hash-utils";
import { listRunsForConfig } from "@/lib/storageService";
import { resolveModelsInConfig, SimpleLogger } from "@/lib/blueprint-service";
import { parseAndNormalizeBlueprint, validateReservedPrefixes } from "@/lib/blueprint-parser";
import { normalizeTag } from "@/app/utils/tagUtils";
import { generateBlueprintIdFromPath } from "@/app/utils/blueprintIdUtils";
import { getLogger } from "@/utils/logger";
import { initSentry, captureError, setContext, flushSentry } from "@/utils/sentry";
import { callBackgroundFunction } from "@/lib/background-function-client";

const EVAL_CONFIGS_REPO_API_URL = "https://api.github.com/repos/weval/configs/contents/blueprints";
const MODEL_COLLECTIONS_REPO_API_URL_BASE = "https://api.github.com/repos/weval/configs/contents/models";
const REPO_COMMITS_API_URL = "https://api.github.com/repos/weval/configs/commits/main";
const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Initialize Sentry for this function
  initSentry('fetch-and-schedule-evals');

  // Set Sentry context for this invocation
  setContext('scheduleEvals', {
    eventSource: event.headers?.['x-netlify-event'] || 'unknown',
    netlifyContext: event.headers?.['x-nf-request-id'],
  });

  const logger = await getLogger('schedule-evals:cron');

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
        logger.info(`Fetched latest commit SHA for weval/configs@main: ${latestCommitSha}`);
      } else {
        logger.warn(`Could not determine latest commit SHA from API response.`);
      }
    } catch (commitError: any) {
      logger.error(`Failed to fetch latest commit SHA: ${commitError.message}. Proceeding without it.`, commitError);
      captureError(commitError, { context: 'fetch-commit-sha' });
    }

    const treeApiUrl = `https://api.github.com/repos/weval/configs/git/trees/main?recursive=1`;
    logger.info(`Fetching file tree from: ${treeApiUrl}`);
    const treeResponse = await axios.get(treeApiUrl, { headers: githubHeaders });

    const filesInBlueprintDir = treeResponse.data.tree.filter(
      (node: any) => node.type === 'blob' && node.path.startsWith('blueprints/') && (node.path.endsWith('.yml') || node.path.endsWith('.yaml') || node.path.endsWith('.json'))
    );

    if (!Array.isArray(filesInBlueprintDir)) {
      logger.error("Failed to fetch or filter file list from GitHub repo tree.", { treeData: treeResponse.data });
      captureError(new Error('Failed to process file list from GitHub repo'), { treeData: treeResponse.data });
      await flushSentry();
      return { statusCode: 500, body: "Failed to process file list from GitHub repo." };
    }

    logger.info(`Found ${filesInBlueprintDir.length} blueprint files in the repo tree.`);

    for (const file of filesInBlueprintDir) {
      const blueprintPath = file.path.startsWith('blueprints/')
          ? file.path.substring('blueprints/'.length)
          : file.path;

      logger.info(`Processing config file: ${file.path} (path for ID: ${blueprintPath})`);
      
      try {
        const configFileResponse = await axios.get(file.url, { headers: rawContentHeaders });
        
        const fileType = (file.path.endsWith(".yaml") || file.path.endsWith(".yml")) ? 'yaml' : 'json';
        const configContent = typeof configFileResponse.data === 'string' ? configFileResponse.data : JSON.stringify(configFileResponse.data);
        
        let config: ComparisonConfig = parseAndNormalizeBlueprint(configContent, fileType);

        // --- NORMALIZE TAGS ---
        if (config.tags) {
            const originalTags = [...config.tags];
            const normalizedTags = [...new Set(originalTags.map(tag => normalizeTag(tag)).filter(tag => tag))];
            if (JSON.stringify(originalTags) !== JSON.stringify(normalizedTags)) {
                logger.info(`Blueprint tags for ${config.id || blueprintPath} were normalized from [${originalTags.join(', ')}] to [${normalizedTags.join(', ')}].`);
            }
            config.tags = normalizedTags;
        }
        // --- END NORMALIZE TAGS ---

        // The file path is now the single source of truth for the blueprint's ID.
        // Warn if a blueprint file still contains the deprecated 'id' field.
        if (config.id) {
            logger.warn(`Blueprint source '${file.path}' contains a deprecated 'id' field ('${config.id}'). This will be ignored.`);
        }

        // Always derive the ID from the file path.
        const id = generateBlueprintIdFromPath(blueprintPath);
        logger.info(`Derived ID from path '${blueprintPath}': '${id}'`);

        // Validate that the ID doesn't use a reserved prefix
        try {
          validateReservedPrefixes(id);
        } catch (error: any) {
          logger.warn(`Skipping blueprint '${file.path}': ${error.message}`);
          continue; // Skip this blueprint
        }

        config.id = id;

        // If title is missing, derive it from the ID.
        if (!config.title) {
          logger.info(`'title' not found in blueprint '${file.path}'. Using derived ID as title: '${config.id}'`);
          config.title = config.id;
        }

        if (!config.tags || !config.tags.includes('_periodic')) {
          logger.info(`Blueprint ${config.id || blueprintPath} does not have the '_periodic' tag. Skipping scheduled run check.`);
          continue; // Move to the next file
        }

        if (!config.id || !config.prompts) {
          logger.warn(`Blueprint file ${file.path} is invalid or missing essential fields (id, prompts) after attempting to derive them. Skipping.`);
          continue;
        }

        if (!config.models || !Array.isArray(config.models) || config.models.length === 0) {
          logger.info(`Models field for ${file.path} is missing, not an array, or empty. Defaulting to ["CORE"].`);
          config.models = ["CORE"];
        }

        const currentId = config.id!;
        const currentTitle = config.title;

        logger.info(`Attempting to resolve model collections for ${currentId} from blueprint ${file.path}`);
        config = await resolveModelsInConfig(config, githubToken, logger as any);
        // Log after resolution attempt
        logger.info(`Models for ${currentId} after resolution attempt: [${config.models.join(', ')}] (Count: ${config.models.length})`);

        // Critical check: if after resolution, models array is empty, skip this config.
        if (config.models.length === 0) {
          logger.warn(`Blueprint file ${file.path} (id: ${currentId}) has no models after resolution or resolution failed. Skipping evaluation for this blueprint.`);
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
                logger.info(`Blueprint ${currentId} (file: ${file.path}, resolved hash: ${contentHash}) has a recent run (${latestMatchingRun.fileName}). Skipping.`);
                needsRun = false;
              } else {
                logger.info(`Blueprint ${currentId} (file: ${file.path}, resolved hash: ${contentHash}) has an old run (${latestMatchingRun.fileName}). Scheduling new run.`);
              }
            } else {
               logger.info(`Blueprint ${currentId} (file: ${file.path}, resolved hash: ${contentHash}) has an existing run without a parsable timestamp (${latestMatchingRun.fileName}). Scheduling new run.`);
            }
          } else {
              logger.info(`No existing run found with resolved hash ${contentHash} for blueprint ${currentId} (file: ${file.path}). Scheduling new run.`);
          }
        } else {
          logger.info(`No existing runs found at all for blueprint ${currentId} (file: ${file.path}). Scheduling new run.`);
        }

        if (needsRun) {
          // This check is now redundant due to the one after resolveModelsInConfig, but kept for safety, can be removed.
          if (config.models.length === 0) {
              logger.warn(`Blueprint ${currentId} (file: ${file.path}) still has no models before triggering. THIS SHOULD NOT HAPPEN. Skipping.`);
              continue;
          }
          logger.info(`Triggering 'execute-evaluation-background' for ${currentId} (resolved hash: ${contentHash}) from blueprint file ${file.path}`);

          const siteUrl = process.env.URL;
          if (!siteUrl) {
              logger.error("URL environment variable is not set. Cannot invoke background function.");
              captureError(new Error('URL environment variable not set'), { currentId, file: file.path });
              // Potentially return an error or stop processing further files if this is a critical config error for all
              continue;
          }

          try {
              const response = await callBackgroundFunction({
                  functionName: 'execute-evaluation-background',
                  body: {
                      config: { ...config, id: currentId }, // Explicitly set the canonical ID
                      commitSha: latestCommitSha
                  }
              });

              if (response.ok) {
                  logger.info(`Successfully invoked background function for ${currentId} from ${file.path}`);
              } else {
                  logger.error(`Background function failed for ${currentId}: ${response.status} - ${response.error}`);
                  captureError(new Error(`Background function failed: ${response.error}`), { currentId, file: file.path });
              }
          } catch (invokeError: any) {
              logger.error(`Error invoking background function for ${file.path}: ${invokeError.message}`, invokeError);
              captureError(invokeError, { currentId, file: file.path });
          }
        }
      } catch (fetchConfigError: any) {
        logger.error(`Error fetching or processing blueprint file ${file.path}`, fetchConfigError);
        captureError(fetchConfigError, { file: file.path });
      }
    }

    logger.info('Scheduled eval check completed successfully');
    await flushSentry();
    return { statusCode: 200, body: "Scheduled eval check completed." };
  } catch (error: any) {
    logger.error("Error in handler", error);
    captureError(error, { handler: 'fetch-and-schedule-evals' });
    await flushSentry();
    return { statusCode: 500, body: "Error processing scheduled eval check." };
  }
};

export { handler }; 