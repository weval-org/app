import axios from 'axios';
import { BLUEPRINT_CONFIG_REPO_SLUG } from './configConstants';
import { ComparisonConfig } from '@/cli/types/cli_types'

// Define a simple logger interface for compatibility
export interface SimpleLogger {
  info: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
}

const defaultLogger: SimpleLogger = {
  info: console.log,
  error: console.error,
  warn: console.warn,
};

export const MODEL_COLLECTIONS_REPO_API_URL_BASE = `https://api.github.com/repos/${BLUEPRINT_CONFIG_REPO_SLUG}/contents/models`;
export const BLUEPRINTS_API_URL = `https://api.github.com/repos/${BLUEPRINT_CONFIG_REPO_SLUG}/contents/blueprints`;
const GITHUB_RAW_CONTENT_HEADERS = { 'Accept': 'application/vnd.github.v3.raw' };

/**
 * Fetches a blueprint's content and metadata from the weval/configs GitHub repository by name.
 * It will try fetching .yml, .yaml, and .json extensions.
 * @param blueprintName The name of the blueprint (e.g., "my-blueprint").
 * @param githubToken Optional GitHub token for authenticated requests.
 * @param logger Optional logger instance.
 * @returns A promise that resolves to an object with content, fileType, and fileName, or null if not found.
 */
export async function fetchBlueprintContentByName(
  blueprintName: string,
  githubToken?: string,
  logger: SimpleLogger = defaultLogger
): Promise<{ content: string; fileType: 'json' | 'yaml'; fileName: string; commitSha: string | null } | null> {
  const apiHeaders: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
  const rawContentHeaders: Record<string, string> = { ...GITHUB_RAW_CONTENT_HEADERS };

  if (githubToken) {
    apiHeaders['Authorization'] = `token ${githubToken}`;
    rawContentHeaders['Authorization'] = `token ${githubToken}`;
  }

  // 1. Fetch the latest commit SHA for the main branch first
  const repoCommitsApiUrl = `https://api.github.com/repos/${BLUEPRINT_CONFIG_REPO_SLUG}/commits/main`;
  let latestCommitSha: string | null = null;
  try {
    const commitResponse = await axios.get(repoCommitsApiUrl, { headers: apiHeaders });
    latestCommitSha = commitResponse.data.sha;
    if (latestCommitSha) {
      logger.info(`[blueprint-service] Fetched latest commit SHA for ${BLUEPRINT_CONFIG_REPO_SLUG}@main: ${latestCommitSha}`);
    } else {
      logger.warn(`[blueprint-service] Could not determine latest commit SHA from API response.`);
    }
  } catch (commitError: any) {
    logger.error(`[blueprint-service] Failed to fetch latest commit SHA: ${commitError.message}. Proceeding without it.`);
  }
  
  // 2. Now, fetch the file list recursively.
  const treeApiUrl = `https://api.github.com/repos/${BLUEPRINT_CONFIG_REPO_SLUG}/git/trees/main?recursive=1`;
  logger.info(`[blueprint-service] Fetching file tree from: ${treeApiUrl}`);

  try {
    const treeResponse = await axios.get(treeApiUrl, { headers: apiHeaders });
    const blueprintFiles = treeResponse.data.tree.filter(
      (node: any) => node.type === 'blob' && node.path.startsWith('blueprints/')
    );

    const extensions = ['yml', 'yaml', 'json'];
    for (const ext of extensions) {
      const targetFileName = `${blueprintName}.${ext}`;
      const foundFile = blueprintFiles.find(
        (node: any) => node.path.endsWith(`/${targetFileName}`) || node.path === `blueprints/${targetFileName}`
      );

      if (foundFile) {
        logger.info(`[blueprint-service] Found blueprint in tree: ${foundFile.path}. Fetching content...`);
        const response = await axios.get(foundFile.url, { headers: rawContentHeaders });
        
        if (response.status === 200 && response.data) {
          logger.info(`[blueprint-service] Successfully fetched blueprint '${foundFile.path}'`);
          const content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          const fileType = ext === 'json' ? 'json' : 'yaml';
          return { content, fileType, fileName: foundFile.path.split('/').pop()!, commitSha: latestCommitSha };
        }
      }
    }
  } catch (error: any) {
    logger.error(`[blueprint-service] Error fetching or searching blueprint tree: ${error.message}`);
    return null;
  }
  
  logger.warn(`[blueprint-service] Could not find blueprint named '${blueprintName}' with any extension in the repository tree.`);
  return null;
}

/**
 * Fetches a model collection (a JSON array of model strings) from the weval/configs GitHub repository.
 * @param collectionName The name of the collection (e.g., "CORE"), which corresponds to a file like "CORE.json".
 * @param githubToken Optional GitHub token for authenticated requests.
 * @param logger Optional logger instance.
 * @returns A promise that resolves to an array of model strings or null if an error occurs.
 */
export async function fetchModelCollection(
  collectionName: string,
  githubToken?: string,
  logger: SimpleLogger = defaultLogger
): Promise<string[] | null> {
  const collectionUrl = `${MODEL_COLLECTIONS_REPO_API_URL_BASE}/${collectionName}.json`;
  logger.info(`[blueprint-service] Attempting to fetch model collection: ${collectionUrl}`);

  const headers: Record<string, string> = { ...GITHUB_RAW_CONTENT_HEADERS };
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  try {
    const response = await axios.get(collectionUrl, { headers });
    
    let modelArray: any;
    if (typeof response.data === 'string') {
      try {
        modelArray = JSON.parse(response.data);
      } catch (parseError: any) {
        logger.error(`[blueprint-service] Failed to parse JSON for model collection '${collectionName}' from ${collectionUrl}. Content: ${response.data}. Error: ${parseError.message}`);
        return null;
      }
    } else if (typeof response.data === 'object' && response.data !== null) {
      // If GitHub API returns pre-parsed JSON (less likely with 'application/vnd.github.v3.raw' but handle defensively)
      modelArray = response.data;
    } else {
        logger.error(`[blueprint-service] Unexpected data type for model collection '${collectionName}': ${typeof response.data}. Content: ${JSON.stringify(response.data)}`);
        return null;
    }

    if (Array.isArray(modelArray) && modelArray.every(m => typeof m === 'string')) {
      logger.info(`[blueprint-service] Successfully fetched and parsed model collection '${collectionName}'. Models found: ${modelArray.length}`);
      return modelArray;
    } else {
      logger.error(`[blueprint-service] Invalid format for model collection '${collectionName}'. Expected a JSON array of strings. Found: ${JSON.stringify(modelArray)}`);
      return null;
    }
  } catch (error: any) {
    logger.error(`[blueprint-service] Error fetching model collection '${collectionName}' from ${collectionUrl}: ${error.message}`);
    if (error.response?.status === 404) {
      logger.warn(`[blueprint-service] Model collection file not found: models/${collectionName}.json`);
    }
    return null;
  }
};

export async function resolveModelsInConfig(
  config: ComparisonConfig,
  githubToken?: string,
  logger: SimpleLogger = defaultLogger
): Promise<ComparisonConfig> {
  const resolvedConfig = { ...config };
  const originalModels = Array.isArray(resolvedConfig.models) ? [...resolvedConfig.models] : [];
  const newModelsList: string[] = [];
  let collectionProcessingError = false;

  if (!Array.isArray(resolvedConfig.models)) {
    logger.warn(`[blueprint-service] Config '${resolvedConfig.configId}' has an invalid 'models' field (not an array). Proceeding without model resolution for this field.`);
    return resolvedConfig; // Return original config if models field is not an array
  }

  for (const modelEntry of originalModels) {
    if (typeof modelEntry === 'string' && !modelEntry.includes(':') && modelEntry.toUpperCase() === modelEntry) {
      logger.info(`[blueprint-service] Found model collection placeholder: '${modelEntry}' in config '${resolvedConfig.configId}'`);
      const collectionModels = await fetchModelCollection(modelEntry, githubToken, logger);
      if (collectionModels) {
        newModelsList.push(...collectionModels);
      } else {
        logger.error(`[blueprint-service] Could not resolve model collection '${modelEntry}' for config '${resolvedConfig.configId}'. This collection will be skipped.`);
        // Optionally, decide if this should be a critical error that stops processing
        // For now, we'll allow the config to proceed without this specific collection
        collectionProcessingError = true; 
      }
    } else if (typeof modelEntry === 'string') {
      newModelsList.push(modelEntry);
    } else {
      logger.warn(`[blueprint-service] Invalid entry in models array for config '${resolvedConfig.configId}': ${JSON.stringify(modelEntry)}. Skipping this entry.`);
    }
  }

  resolvedConfig.models = [...new Set(newModelsList)]; // Deduplicate
  logger.info(`[blueprint-service] Final models for config '${resolvedConfig.configId}' after resolution: [${resolvedConfig.models.join(', ')}] (Count: ${resolvedConfig.models.length})`);
  
  if (originalModels.length > 0 && resolvedConfig.models.length === 0 && !collectionProcessingError) {
     logger.warn(`[blueprint-service] Config '${resolvedConfig.configId}' resulted in an empty list of models after attempting to resolve collections (original was: [${originalModels.join(',')}]). Check collection definitions or model entries.`);
  }
  
  return resolvedConfig;
} 