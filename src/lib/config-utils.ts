import axios from 'axios';

// Define a simple logger interface for compatibility
export interface SimpleLogger {
  info: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
}

// Default console logger if no logger is provided
const defaultLogger: SimpleLogger = {
  info: console.log,
  error: console.error,
  warn: console.warn,
};

export const MODEL_COLLECTIONS_REPO_API_URL_BASE = "https://api.github.com/repos/civiceval/configs/contents/models";
const GITHUB_API_VERSION_HEADERS = { 'Accept': 'application/vnd.github.v3+json' }; // For directory listing
const GITHUB_RAW_CONTENT_HEADERS = { 'Accept': 'application/vnd.github.v3.raw' }; // For fetching raw file content

/**
 * Fetches a model collection (a JSON array of model strings) from the civiceval/configs GitHub repository.
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
  logger.info(`[config-utils] Attempting to fetch model collection: ${collectionUrl}`);

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
        logger.error(`[config-utils] Failed to parse JSON for model collection '${collectionName}' from ${collectionUrl}. Content: ${response.data}. Error: ${parseError.message}`);
        return null;
      }
    } else if (typeof response.data === 'object' && response.data !== null) {
      // If GitHub API returns pre-parsed JSON (less likely with 'application/vnd.github.v3.raw' but handle defensively)
      modelArray = response.data;
    } else {
        logger.error(`[config-utils] Unexpected data type for model collection '${collectionName}': ${typeof response.data}. Content: ${JSON.stringify(response.data)}`);
        return null;
    }

    if (Array.isArray(modelArray) && modelArray.every(m => typeof m === 'string')) {
      logger.info(`[config-utils] Successfully fetched and parsed model collection '${collectionName}'. Models found: ${modelArray.length}`);
      return modelArray;
    } else {
      logger.error(`[config-utils] Invalid format for model collection '${collectionName}'. Expected a JSON array of strings. Found: ${JSON.stringify(modelArray)}`);
      return null;
    }
  } catch (error: any) {
    logger.error(`[config-utils] Error fetching model collection '${collectionName}' from ${collectionUrl}: ${error.message}`);
    if (error.response?.status === 404) {
      logger.warn(`[config-utils] Model collection file not found: models/${collectionName}.json`);
    }
    return null;
  }
}

// Helper function to resolve models in a ComparisonConfig object
import { ComparisonConfig } from '../cli/types/comparison_v2'; // Adjust path as needed

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
    logger.warn(`[config-utils] Config '${resolvedConfig.configId}' has an invalid 'models' field (not an array). Proceeding without model resolution for this field.`);
    return resolvedConfig; // Return original config if models field is not an array
  }

  for (const modelEntry of originalModels) {
    if (typeof modelEntry === 'string' && !modelEntry.includes(':') && modelEntry.toUpperCase() === modelEntry) {
      logger.info(`[config-utils] Found model collection placeholder: '${modelEntry}' in config '${resolvedConfig.configId}'`);
      const collectionModels = await fetchModelCollection(modelEntry, githubToken, logger);
      if (collectionModels) {
        newModelsList.push(...collectionModels);
      } else {
        logger.error(`[config-utils] Could not resolve model collection '${modelEntry}' for config '${resolvedConfig.configId}'. This collection will be skipped.`);
        // Optionally, decide if this should be a critical error that stops processing
        // For now, we'll allow the config to proceed without this specific collection
        collectionProcessingError = true; 
      }
    } else if (typeof modelEntry === 'string') {
      newModelsList.push(modelEntry);
    } else {
      logger.warn(`[config-utils] Invalid entry in models array for config '${resolvedConfig.configId}': ${JSON.stringify(modelEntry)}. Skipping this entry.`);
    }
  }

  resolvedConfig.models = [...new Set(newModelsList)]; // Deduplicate
  logger.info(`[config-utils] Final models for config '${resolvedConfig.configId}' after resolution: [${resolvedConfig.models.join(', ')}] (Count: ${resolvedConfig.models.length})`);
  
  if (originalModels.length > 0 && resolvedConfig.models.length === 0 && !collectionProcessingError) {
     logger.warn(`[config-utils] Config '${resolvedConfig.configId}' resulted in an empty list of models after attempting to resolve collections (original was: [${originalModels.join(',')}]). Check collection definitions or model entries.`);
  }
  
  return resolvedConfig;
} 