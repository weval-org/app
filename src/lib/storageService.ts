import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { RESULTS_DIR, MULTI_DIR } from '@/cli/constants'; // Assuming these are still relevant for local path structure
import { Readable } from 'stream';
import {
  EnhancedComparisonConfigInfo,
  EnhancedRunInfo
} from '@/app/utils/homepageDataUtils';
import { ComparisonDataV2 as FetchedComparisonData } from '@/app/utils/types';
import {
  calculateAverageHybridScoreForRun,
  calculatePerModelHybridScoresForRun,
  calculateStandardDeviation,
  IDEAL_MODEL_ID
} from '@/app/utils/calculationUtils';
import { AggregateStatsData } from '@/app/components/AggregateStatsDisplay';
import { PotentialDriftInfo } from '@/app/components/ModelDriftIndicator';
import {
  calculateHeadlineStats,
  calculatePotentialModelDrift,
} from '@/cli/utils/summaryCalculationUtils';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { ModelSummary } from '@/types/shared';
import { SearchDoc, SearchableBlueprintSummary } from '@/cli/types/cli_types';

const storageProvider = process.env.STORAGE_PROVIDER || (process.env.NODE_ENV === 'development' ? 'local' : 's3');

// Define and export the new summary structure type
export interface HomepageSummaryFileContent {
  configs: EnhancedComparisonConfigInfo[];
  headlineStats: AggregateStatsData | null;
  driftDetectionResult: PotentialDriftInfo | null;
  lastUpdated: string;
}

// --- New Types for Latest Runs Summary ---
export interface LatestRunSummaryItem extends EnhancedRunInfo {
  configId: string;
  configTitle?: string;
}

export interface LatestRunsSummaryFileContent {
  runs: LatestRunSummaryItem[];
  lastUpdated: string;
}
// --- End New Types ---

// Use prefixed environment variables to avoid conflicts with Netlify reserved names
const s3BucketName = process.env.APP_S3_BUCKET_NAME;
const s3Region = process.env.APP_S3_REGION;
const s3AccessKeyId = process.env.APP_AWS_ACCESS_KEY_ID;
const s3SecretAccessKey = process.env.APP_AWS_SECRET_ACCESS_KEY;

let s3Client: S3Client | null = null;

if (storageProvider === 's3') {
  if (!s3BucketName || !s3Region) {
    console.warn('S3 storage provider configured, but APP_S3_BUCKET_NAME or APP_S3_REGION is not set. S3 operations may fail if credentials are not found elsewhere (e.g. IAM role).');
  } 
  // S3Client will attempt to find credentials from the environment (AWS_ACCESS_KEY_ID, etc.) or shared files if not explicitly passed.
  // For Netlify, we are providing them via prefixed APP_ variables.
  const s3ClientOptions: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = {
    region: s3Region! // Region is required
  };

  if (s3AccessKeyId && s3SecretAccessKey) {
    s3ClientOptions.credentials = {
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
    };
    console.log("[StorageService] Using explicit S3 credentials from APP_AWS_... variables.");
  } else {
    console.log("[StorageService] Explicit APP_AWS_... S3 credentials not provided. SDK will attempt default credential discovery (e.g., IAM role if applicable, or environment variables like AWS_ACCESS_KEY_ID if set directly by the platform).");
  }
  
  if (s3Region) { // Only initialize if region is set
      s3Client = new S3Client(s3ClientOptions);
  } else if (!s3Region && (s3AccessKeyId || s3BucketName)) {
      // Warn if other S3 vars are set but region is missing, as client creation will fail or use default region which might be wrong.
      console.warn("[StorageService] S3 configuration variables (bucket/keys) found, but APP_S3_REGION is missing. S3 client not initialized.");
  }
}

const streamToString = (stream: Readable): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });

const HOMEPAGE_SUMMARY_KEY = 'multi/homepage_summary.json';
const LATEST_RUNS_SUMMARY_KEY = 'multi/latest_runs_summary.json';
const MODELS_DIR = 'models';
const MODEL_CARDS_DIR = 'model-cards';

// Helper to create a safe filename from a model ID
function getSafeModelId(modelId: string): string {
  return modelId.replace(/[:/\\?#%[\]]/g, '_');
}

// Helper types for serialization
type SerializableScoreMap = Record<string, { average: number | null; stddev: number | null }>;

interface SerializableEnhancedRunInfo extends Omit<EnhancedRunInfo, 'perModelHybridScores' /* removed perModelSemanticSimilarityToIdealScores */ > {
  perModelHybridScores?: SerializableScoreMap;
  // perModelSemanticSimilarityToIdealScores?: SerializableScoreMap;
}

interface SerializableEnhancedComparisonConfigInfo extends Omit<EnhancedComparisonConfigInfo, 'runs'> {
  runs: SerializableEnhancedRunInfo[];
}

interface SerializableHomepageSummaryFileContent extends Omit<HomepageSummaryFileContent, 'configs'> {
  configs: SerializableEnhancedComparisonConfigInfo[];
}

// --- New Serializable Types for Latest Runs Summary ---
interface SerializableLatestRunSummaryItem extends Omit<LatestRunSummaryItem, 'perModelHybridScores'> {
    perModelHybridScores?: SerializableScoreMap;
}
interface SerializableLatestRunsSummaryFileContent extends Omit<LatestRunsSummaryFileContent, 'runs'> {
    runs: SerializableLatestRunSummaryItem[];
}
// --- End New Serializable Types ---

export async function getHomepageSummary(): Promise<HomepageSummaryFileContent | null> {
  const fileName = 'homepage_summary.json';
  let fileContent: string | null = null;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      // Note: The key for the homepage summary is at the root of the bucket for legacy reasons.
      const command = new GetObjectCommand({ Bucket: s3BucketName, Key: fileName });
      const { Body } = await s3Client.send(command);
      if (Body) {
        fileContent = await streamToString(Body as Readable);
      }
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        console.log(`[StorageService] Homepage summary file not found in S3: ${fileName}`);
        return null;
      }
      console.error(`[StorageService] Error fetching homepage summary from S3: ${fileName}`, error);
      return null;
    }
  } else if (storageProvider === 'local') {
    try {
      // The homepage summary is stored in the root of the multi directory
      const filePath = path.join(RESULTS_DIR, MULTI_DIR, fileName);
      if (fsSync.existsSync(filePath)) {
        fileContent = await fs.readFile(filePath, 'utf-8');
      } else {
        console.log(`[StorageService] Homepage summary file not found locally: ${filePath}`);
        return null;
      }
    } catch (error) {
      console.error(`[StorageService] Error fetching homepage summary from local disk: ${fileName}`, error);
      return null;
    }
  } else {
    console.warn(`[StorageService] No valid storage provider configured for getHomepageSummary. STORAGE_PROVIDER: ${storageProvider}`);
    return null;
  }

  if (!fileContent) {
    return null;
  }

  try {
    const parsedContent: SerializableHomepageSummaryFileContent = JSON.parse(fileContent);
    
    // Rehydrate Maps
    const configsWithMaps: EnhancedComparisonConfigInfo[] = parsedContent.configs.map(config => ({
      ...config,
      runs: config.runs.map(run => ({
        ...run,
        perModelHybridScores: run.perModelHybridScores 
          ? new Map(Object.entries(run.perModelHybridScores)) 
          : new Map()
      })),
    }));

    return {
      ...parsedContent,
      configs: configsWithMaps,
    };
  } catch (error) {
    console.error(`[StorageService] Error parsing homepage summary content for ${fileName}:`, error);
    return null;
  }
}

export async function saveHomepageSummary(summaryData: HomepageSummaryFileContent): Promise<void> {
  const fileName = 'homepage_summary.json';

  // Prepare data for serialization: convert Maps to objects
  const serializableConfigs: SerializableEnhancedComparisonConfigInfo[] = summaryData.configs.map((config: EnhancedComparisonConfigInfo) => ({
    ...config,
    runs: config.runs.map((run: EnhancedRunInfo) => {
      const { perModelHybridScores, ...restOfRun } = run; // Destructure to separate map
      const serializableRun: SerializableEnhancedRunInfo = { ...restOfRun }; // Spread rest

      if (perModelHybridScores instanceof Map) {
        serializableRun.perModelHybridScores = Object.fromEntries(perModelHybridScores);
      } else if (perModelHybridScores) { 
        serializableRun.perModelHybridScores = perModelHybridScores as SerializableScoreMap;
      } else {
        serializableRun.perModelHybridScores = {}; 
      }

      return serializableRun;
    }),
  }));

  const serializableSummary: SerializableHomepageSummaryFileContent = {
    ...summaryData,
    configs: serializableConfigs,
  };

  const fileContent = JSON.stringify(serializableSummary, null, 2);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new PutObjectCommand({
        Bucket: s3BucketName,
        // Note: The key for the homepage summary is at the root of the bucket for legacy reasons.
        Key: fileName,
        Body: fileContent,
        ContentType: 'application/json',
      });
      await s3Client.send(command);
      console.log(`[StorageService] Homepage summary saved to S3: ${fileName}`);
    } catch (error) {
      console.error(`[StorageService] Error saving homepage summary to S3: ${fileName}`, error);
      throw error; // Re-throw to indicate failure
    }
  } else if (storageProvider === 'local') {
    const filePath = path.join(RESULTS_DIR, MULTI_DIR, fileName);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, fileContent, 'utf-8');
      console.log(`[StorageService] Homepage summary saved to local disk: ${filePath}`);
    } catch (error) {
      console.error(`[StorageService] Error saving homepage summary to local disk: ${filePath}`, error);
      throw error; // Re-throw to indicate failure
    }
  } else {
    console.warn(`[StorageService] No valid storage provider configured for saveHomepageSummary. Data not saved. STORAGE_PROVIDER: ${storageProvider}`);
    // Potentially throw an error here if saving is critical and no provider is found
  }
}

/**
 * Retrieves the summary for a single configuration.
 * @param configId The configuration ID.
 * @returns The parsed summary data for the config, or null if not found.
 */
export async function getConfigSummary(configId: string): Promise<EnhancedComparisonConfigInfo | null> {
  const fileName = 'summary.json';
  let fileContent: string | null = null;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    const s3Key = path.join(MULTI_DIR, configId, fileName);
    try {
      const command = new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key });
      const { Body } = await s3Client.send(command);
      if (Body) {
        fileContent = await streamToString(Body as Readable);
      }
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        console.log(`[StorageService] Per-config summary not found in S3: ${s3Key}`);
        return null;
      }
      console.error(`[StorageService] Error fetching per-config summary from S3: ${s3Key}`, error);
      return null;
    }
  } else if (storageProvider === 'local') {
    try {
      const filePath = path.join(RESULTS_DIR, MULTI_DIR, configId, fileName);
      if (fsSync.existsSync(filePath)) {
        fileContent = await fs.readFile(filePath, 'utf-8');
      } else {
        console.log(`[StorageService] Per-config summary not found locally: ${filePath}`);
        return null;
      }
    } catch (error) {
      console.error(`[StorageService] Error fetching per-config summary from local disk: ${fileName}`, error);
      return null;
    }
  }

  if (!fileContent) {
    return null;
  }

  try {
    const parsedContent: SerializableEnhancedComparisonConfigInfo = JSON.parse(fileContent);
    
    // Rehydrate Maps
    const configWithMaps: EnhancedComparisonConfigInfo = {
      ...parsedContent,
      runs: parsedContent.runs.map(run => ({
        ...run,
        perModelHybridScores: run.perModelHybridScores 
          ? new Map(Object.entries(run.perModelHybridScores)) 
          : new Map()
      })),
    };

    return configWithMaps;
  } catch (error) {
    console.error(`[StorageService] Error parsing per-config summary for ${configId}:`, error);
    return null;
  }
}

/**
 * Saves the summary for a single configuration.
 * @param configId The configuration ID.
 * @param summaryData The summary data for that single configuration.
 */
export async function saveConfigSummary(configId: string, summaryData: EnhancedComparisonConfigInfo): Promise<void> {
  const fileName = 'summary.json';

  // Prepare data for serialization: convert Maps to objects
  const serializableRuns: SerializableEnhancedRunInfo[] = summaryData.runs.map((run: EnhancedRunInfo) => {
    const { perModelHybridScores, ...restOfRun } = run;
    const serializableRun: SerializableEnhancedRunInfo = { ...restOfRun };

    if (perModelHybridScores instanceof Map) {
      serializableRun.perModelHybridScores = Object.fromEntries(perModelHybridScores);
    } else if (perModelHybridScores) { 
      serializableRun.perModelHybridScores = perModelHybridScores as SerializableScoreMap;
    } else {
      serializableRun.perModelHybridScores = {}; 
    }

    return serializableRun;
  });

  const serializableSummary: SerializableEnhancedComparisonConfigInfo = {
    ...summaryData,
    runs: serializableRuns,
  };

  const fileContent = JSON.stringify(serializableSummary, null, 2);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    const s3Key = path.join(MULTI_DIR, configId, fileName);
    try {
      const command = new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/json',
      });
      await s3Client.send(command);
      console.log(`[StorageService] Per-config summary saved to S3: ${s3Key}`);
    } catch (error) {
      console.error(`[StorageService] Error saving per-config summary to S3: ${s3Key}`, error);
      throw error;
    }
  } else if (storageProvider === 'local') {
    const filePath = path.join(RESULTS_DIR, MULTI_DIR, configId, fileName);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, fileContent, 'utf-8');
      console.log(`[StorageService] Per-config summary saved to local disk: ${filePath}`);
    } catch (error) {
      console.error(`[StorageService] Error saving per-config summary to local disk: ${filePath}`, error);
      throw error;
    }
  } else {
    console.warn(`[StorageService] No valid storage provider configured for saveConfigSummary. Data not saved.`);
  }
}

// Helper to ensure fs-sync is only imported where used if it's a conditional dependency.
// For simplicity, assuming it's available. If not, adjust local file checks.

/**
 * Saves the comparison result.
 * @param configId The configuration ID.
 * @param fileNameWithTimestamp The full filename, e.g., myrun_contenthash_2024-01-01T12-30-00Z_comparison.json.
 * @param data The JSON data to save.
 * @returns The path/key where the data was saved or null on error.
 */
export async function saveResult(configId: string, fileNameWithTimestamp: string, data: any): Promise<string | null> {
  const jsonData = JSON.stringify(data, null, 2);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    const s3Key = path.join(MULTI_DIR, configId, fileNameWithTimestamp);
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
        Body: jsonData,
        ContentType: 'application/json',
      }));
      console.log(`[StorageService] Result saved to S3: s3://${s3BucketName}/${s3Key}`);
      return s3Key;
    } catch (error) {
      console.error('[StorageService] Error saving result to S3:', error);
      return null;
    }
  } else if (storageProvider === 'local') {
    const localDir = path.join(process.cwd(), RESULTS_DIR, MULTI_DIR, configId);
    const localPath = path.join(localDir, fileNameWithTimestamp);
    try {
      await fs.mkdir(localDir, { recursive: true });
      await fs.writeFile(localPath, jsonData, 'utf-8');
      console.log(`[StorageService] Result saved locally: ${localPath}`);
      return localPath;
    } catch (error) {
      console.error('[StorageService] Error saving result locally:', error);
      return null;
    }
  } else {
    console.warn('[StorageService] No valid storage provider configured. Cannot save result.');
    return null;
  }
}

/**
 * Lists all available config IDs (directories).
 * For S3, this lists "common prefixes" under MULTI_DIR.
 * For local, this lists directories under RESULTS_DIR/MULTI_DIR.
 */
export async function listConfigIds(): Promise<string[]> {
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: s3BucketName,
        Prefix: `${MULTI_DIR}/`, // e.g., '.results/multi/'
        Delimiter: '/',
      });
      const response = await s3Client.send(command);
      const configIds = response.CommonPrefixes?.map(p => p.Prefix?.replace(MULTI_DIR + '/', '').replace('/', '')).filter(Boolean) as string[] || [];
      console.log(`[StorageService] Listed config IDs from S3: ${configIds.join(', ')}`);
      return configIds;
    } catch (error) {
      console.error('[StorageService] Error listing config IDs from S3:', error);
      return [];
    }
  } else if (storageProvider === 'local') {
    const localBaseDir = path.join(process.cwd(), RESULTS_DIR, MULTI_DIR);
    try {
      const entries = await fs.readdir(localBaseDir, { withFileTypes: true });
      const configIds = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
      console.log(`[StorageService] Listed config IDs locally: ${configIds.join(', ')}`);
      return configIds;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`[StorageService] Local results directory not found: ${localBaseDir}`);
        return [];
      }
      console.error('[StorageService] Error listing config IDs locally:', error);
      return [];
    }
  }
  console.warn('[StorageService] No valid storage provider configured. Cannot list config IDs.');
  return [];
}

/**
 * Lists all runs for a given configId.
 * For S3, lists objects within the configId "directory".
 * For local, lists files in the configId directory.
 * Returns an array of objects { runLabel: string, timestamp: string | null, fileName: string }
 */
export async function listRunsForConfig(configId: string): Promise<Array<{ runLabel: string; timestamp: string | null; fileName: string }>> {
  const runs: Array<{ runLabel: string; timestamp: string | null; fileName: string }> = [];
  const parseFileName = (fileName: string) => {
    const regex = /^(.*?)_([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}(?:-[0-9]{3})?Z)_comparison\.json$/;
    const match = fileName.match(regex);

    if (match && match[1] && match[2]) {
      return { runLabel: match[1], timestamp: match[2], fileName };
    } else {
      // If no separate timestamp is found, assume the whole baseName (before _comparison.json) is the runLabel
      const baseNameNoSuffix = fileName.endsWith('_comparison.json') ? fileName.substring(0, fileName.length - '_comparison.json'.length) : fileName;
      return { runLabel: baseNameNoSuffix, timestamp: null, fileName };
    }
  };

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    const prefix = path.join(MULTI_DIR, configId, ''); // Ensure trailing slash for prefix
    try {
      const command = new ListObjectsV2Command({
        Bucket: s3BucketName,
        Prefix: prefix,
      });
      const response = await s3Client.send(command);
      response.Contents?.forEach(item => {
        if (item.Key) {
          const fileName = path.basename(item.Key);
          if (fileName.endsWith('_comparison.json')) {
            const parsed = parseFileName(fileName);
            if (parsed) {
              runs.push(parsed);
            }
          }
        }
      });
      console.log(`[StorageService] Listed ${runs.length} runs for config '${configId}' from S3.`);
    } catch (error) {
      console.error(`[StorageService] Error listing runs for config '${configId}' from S3:`, error);
    }
  } else if (storageProvider === 'local') {
    const localDir = path.join(process.cwd(), RESULTS_DIR, MULTI_DIR, configId);
    try {
      const files = await fs.readdir(localDir);
      files.forEach(fileName => {
        if (fileName.endsWith('_comparison.json')) {
           const parsed = parseFileName(fileName);
            if (parsed) {
              runs.push(parsed);
            }
        }
      });
      console.log(`[StorageService] Listed ${runs.length} runs for config '${configId}' locally.`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // This is fine, means no runs for this config yet
      } else {
        console.error(`[StorageService] Error listing runs for config '${configId}' locally:`, error);
      }
    }
  } else {
     console.warn('[StorageService] No valid storage provider configured. Cannot list runs.');
  }
  
  // Sort by timestamp descending (newest first) if timestamp is available
  return runs.sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return b.timestamp.localeCompare(a.timestamp);
    }
    if (a.timestamp) return -1; // a has timestamp, b doesn't, a comes first
    if (b.timestamp) return 1;  // b has timestamp, a doesn't, b comes first
    return b.fileName.localeCompare(a.fileName); // fallback to filename
  });
}

/**
 * Retrieves the full data for a specific comparison run using the full fileName.
 * Useful when the exact filename (including timestamp) is known.
 * @param configId The configuration ID.
 * @param fileName The full name of the comparison file (e.g., myrun_abcdef123456_2023-01-01T12-00-00Z_comparison.json)
 * @returns The parsed JSON data or null if not found or on error.
 */
export async function getResultByFileName(configId: string, fileName: string): Promise<any | null> {
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    const s3Key = path.join(MULTI_DIR, configId, fileName);
    console.log(`[StorageService] Attempting to load result by fileName from S3: s3://${s3BucketName}/${s3Key}`);
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
      }));
      if (Body) {
        const content = await streamToString(Body as Readable);
        console.log(`[StorageService] Result retrieved from S3 by fileName: s3://${s3BucketName}/${s3Key}`);
        const parsedData = JSON.parse(content);
        console.log(`[StorageService getResultByFileName DEBUG] Parsed data keys: ${Object.keys(parsedData).join(', ')}`);
        return parsedData;
      }
      return null;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        console.log(`[StorageService] Result not found in S3 by fileName: s3://${s3BucketName}/${s3Key}`);
      } else {
        console.error('[StorageService] Error getting result from S3 by fileName:', error);
      }
      return null;
    }
  } else if (storageProvider === 'local') {
    const localPath = path.join(process.cwd(), RESULTS_DIR, MULTI_DIR, configId, fileName);
    console.log(`[StorageService] Attempting to load result by fileName from local disk: ${localPath}`);
    try {
      const fileContents = await fs.readFile(localPath, 'utf-8');
      console.log(`[StorageService] Result retrieved locally by fileName: ${localPath}`);
      const parsedData = JSON.parse(fileContents);
      console.log(`[StorageService getResultByFileName DEBUG] Parsed data keys: ${Object.keys(parsedData).join(', ')}`);
      return parsedData;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`[StorageService] Result not found locally by fileName: ${localPath}`);
      } else {
        console.error('[StorageService] Error getting result locally by fileName:', error);
      }
      return null;
    }
  } else {
    console.warn('[StorageService] No valid storage provider configured. Cannot get result by fileName.');
    return null;
  }
}

/**
 * Updates the homepage summary with information from a newly completed run.
 * This function encapsulates the logic for adding/updating a run within the summary.
 */
export function updateSummaryDataWithNewRun(
  summary: EnhancedComparisonConfigInfo[] | null,
  newResultData: FetchedComparisonData, // The full data object from the completed run
  runFileName: string // The actual filename of the run, e.g. myrun_hash_timestamp_comparison.json
): EnhancedComparisonConfigInfo[] {
  let updatedSummary = summary ? [...summary] : []; // Operate on a copy

  const configIdFromNewResult = newResultData.configId;
  const runLabelFromNewResult = newResultData.runLabel; // This is the base runLabel
  const timestampFromNewResult = newResultData.timestamp;

  let configIndex = updatedSummary.findIndex(c => c.configId === configIdFromNewResult);

  const newRunHybridStats = calculateAverageHybridScoreForRun(
    newResultData.evaluationResults?.perPromptSimilarities,
    newResultData.evaluationResults?.llmCoverageScores,
    newResultData.effectiveModels,
    newResultData.promptIds,
    IDEAL_MODEL_ID
  );

  const perModelScoresForNewRun = calculatePerModelHybridScoresForRun(
    newResultData.evaluationResults?.perPromptSimilarities,
    newResultData.evaluationResults?.llmCoverageScores,
    newResultData.effectiveModels,
    newResultData.promptIds,
    IDEAL_MODEL_ID
  );

  // Create a "lite" version of coverage scores for the summary to avoid bloat.
  // This version includes average scores per prompt/model but excludes detailed pointAssessments.
  const fullCoverageScores = newResultData.evaluationResults?.llmCoverageScores;
  let liteCoverageScores: typeof fullCoverageScores | null = null;

  if (fullCoverageScores) {
    liteCoverageScores = {};
    for (const promptId in fullCoverageScores) {
      if (Object.prototype.hasOwnProperty.call(fullCoverageScores, promptId)) {
        liteCoverageScores[promptId] = {};
        const models = fullCoverageScores[promptId];
        for (const modelId in models) {
          if (Object.prototype.hasOwnProperty.call(models, modelId)) {
            const result = models[modelId];
            if (result && !('error' in result)) {
              // Strip out the heavy pointAssessments array for the summary
              liteCoverageScores[promptId][modelId] = {
                keyPointsCount: result.keyPointsCount,
                avgCoverageExtent: result.avgCoverageExtent,
              };
            } else if (result) {
              liteCoverageScores[promptId][modelId] = result; // Keep error objects as is
            }
          }
        }
      }
    }
  }

  // --- Create the new EnhancedRunInfo object for this run ---
  const newRunInfo: EnhancedRunInfo = {
    runLabel: newResultData.runLabel,
    timestamp: newResultData.timestamp,
    fileName: runFileName,
    temperature: newResultData.config.temperature,
    numModels: newResultData.effectiveModels.length,
    totalModelsAttempted: newResultData.config.models.length,
    numPrompts: newResultData.promptIds.length,
    hybridScoreStats: newRunHybridStats,
    perModelHybridScores: perModelScoresForNewRun,
    // Pass through the "lite" coverage and model data for the heatmap
    allCoverageScores: liteCoverageScores,
    models: newResultData.effectiveModels,
    promptIds: newResultData.promptIds,
  };

  if (configIndex === -1) { // Config not found, add new entry
    const newConfigEntry: EnhancedComparisonConfigInfo = {
      configId: configIdFromNewResult,
      configTitle: newResultData.configTitle,
      id: newResultData.config?.id || newResultData.configId,
      title: newResultData.config?.title || newResultData.configTitle,
      description: newResultData.config?.description || newResultData.description,
      runs: [newRunInfo],
      latestRunTimestamp: timestampFromNewResult,
      tags: newResultData.config?.tags || undefined,
      overallAverageHybridScore: newRunHybridStats.average,
      hybridScoreStdDev: (newRunHybridStats.average !== null && newRunHybridStats.stddev === null) ? 0 : newRunHybridStats.stddev,
    };
    updatedSummary.push(newConfigEntry);
  } else { // Existing config, update it
    const existingConfig = { ...updatedSummary[configIndex] }; // Shallow copy
    existingConfig.runs = [...existingConfig.runs]; // Shallow copy runs array

    // For now, using runLabel and timestamp combination for uniqueness within a config's runs.
    const runExistsIndex = existingConfig.runs.findIndex(r => r.runLabel === newRunInfo.runLabel && r.timestamp === newRunInfo.timestamp);
    if (runExistsIndex !== -1) {
      existingConfig.runs.splice(runExistsIndex, 1);
    }
    
    existingConfig.runs.unshift(newRunInfo); // Add new run to the beginning
    // Ensure runs are sorted by timestamp, newest first.
    existingConfig.runs.sort((a, b) => new Date(fromSafeTimestamp(b.timestamp)).getTime() - new Date(fromSafeTimestamp(a.timestamp)).getTime());

    // Update config metadata from the latest run's config object if available and this run is the latest
    if (new Date(fromSafeTimestamp(timestampFromNewResult)).getTime() >= new Date(fromSafeTimestamp(existingConfig.latestRunTimestamp)).getTime()) {
      existingConfig.latestRunTimestamp = timestampFromNewResult;
      existingConfig.id = newResultData.config?.id || existingConfig.id || newResultData.configId; // Prefer id from config object
      existingConfig.title = newResultData.config?.title || existingConfig.title || newResultData.configTitle; // Prefer title from config object
      existingConfig.configTitle = newResultData.configTitle; // Ensure configTitle is directly from newResultData
      existingConfig.description = newResultData.config?.description || newResultData.description || existingConfig.description;
      existingConfig.tags = newResultData.config?.tags || existingConfig.tags;
    }
    
    // Recalculate overallAverageHybridScore and hybridScoreStdDev for this config
    const validHybridScores = existingConfig.runs
      .map(run => run.hybridScoreStats?.average)
      .filter(score => score !== null && score !== undefined && !isNaN(score)) as number[];
    
    if (validHybridScores.length > 0) {
      existingConfig.overallAverageHybridScore = 
        validHybridScores.reduce((sum, score) => sum + score, 0) / validHybridScores.length;
      existingConfig.hybridScoreStdDev = calculateStandardDeviation(validHybridScores);
    } else {
      existingConfig.overallAverageHybridScore = null;
      existingConfig.hybridScoreStdDev = null;
    }
    updatedSummary[configIndex] = existingConfig;
  }

  // Sort all configs by their latest run's timestamp (most recent first)
  updatedSummary.sort((a, b) => new Date(fromSafeTimestamp(b.latestRunTimestamp)).getTime() - new Date(fromSafeTimestamp(a.latestRunTimestamp)).getTime());
  return updatedSummary;
}

/**
 * Deletes multiple objects from S3.
 * @param keys Array of S3 keys to delete.
 * @returns True if successful or no keys to delete, false otherwise.
 */
async function deleteS3Objects(keys: string[]): Promise<boolean> {
  if (!s3Client || !s3BucketName) {
    console.error('[StorageService] S3 client or bucket name not configured. Cannot delete objects.');
    return false;
  }
  if (keys.length === 0) {
    console.log('[StorageService] No S3 objects to delete.');
    return true;
  }

  const batchSize = 1000; // S3 DeleteObjects limit
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const deleteParams = {
      Bucket: s3BucketName,
      Delete: {
        Objects: batch.map(key => ({ Key: key })),
        Quiet: false,
      },
    };
    try {
      const command = new DeleteObjectsCommand(deleteParams);
      const output = await s3Client.send(command);
      if (output.Errors && output.Errors.length > 0) {
        output.Errors.forEach(error => {
          console.error(`[StorageService] Error deleting S3 object ${error.Key}: ${error.Message}`);
        });
        return false; // Indicate partial or full failure
      }
      console.log(`[StorageService] Successfully deleted batch of ${batch.length} S3 objects.`);
    } catch (error) {
      console.error('[StorageService] Error in DeleteObjectsCommand:', error);
      return false;
    }
  }
  return true;
}

/**
 * Deletes all data (files/objects) associated with a specific configId.
 * For S3, this means all objects under the 'MULTI_DIR/configId/' prefix.
 * For local storage, this means deleting the 'RESULTS_DIR/MULTI_DIR/configId' directory.
 * @param configId The configuration ID to delete.
 * @returns The number of files/objects deleted, or -1 on error.
 */
export async function deleteConfigData(configId: string): Promise<number> {
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    const prefix = path.join(MULTI_DIR, configId, ''); // Ensure trailing slash
    let allKeys: string[] = [];
    let continuationToken: string | undefined = undefined;

    try {
      console.log(`[StorageService] Listing objects for deletion in S3 prefix: s3://${s3BucketName}/${prefix}`);
      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: s3BucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });
        const response: import('@aws-sdk/client-s3').ListObjectsV2CommandOutput = await s3Client.send(listCommand);
        if (response.Contents) {
          allKeys.push(...response.Contents.map(obj => obj.Key).filter(Boolean) as string[]);
        }
        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      if (allKeys.length === 0) {
        console.log(`[StorageService] No objects found for configId '${configId}' in S3. Nothing to delete.`);
        return 0;
      }

      console.log(`[StorageService] Found ${allKeys.length} S3 objects to delete for configId '${configId}'.`);
      const success = await deleteS3Objects(allKeys);
      if (success) {
        console.log(`[StorageService] Successfully deleted ${allKeys.length} S3 objects for configId '${configId}'.`);
        return allKeys.length;
      } else {
        console.error(`[StorageService] Failed to delete some or all S3 objects for configId '${configId}'.`);
        return -1;
      }
    } catch (error) {
      console.error(`[StorageService] Error listing or deleting S3 objects for configId '${configId}':`, error);
      return -1;
    }
  } else if (storageProvider === 'local') {
    const localConfigDir = path.join(process.cwd(), RESULTS_DIR, MULTI_DIR, configId);
    try {
      // Check if directory exists before attempting to read and remove
      try {
        await fs.access(localConfigDir);
      } catch (e) {
        console.log(`[StorageService] Local directory for configId '${configId}' not found at ${localConfigDir}. Nothing to delete.`);
        return 0;
      }

      const files = await fs.readdir(localConfigDir); // To count files before removing directory
      await fs.rm(localConfigDir, { recursive: true, force: true });
      console.log(`[StorageService] Successfully deleted local directory for configId '${configId}': ${localConfigDir} (contained ${files.length} files/items).`);
      return files.length;
    } catch (error) {
      console.error(`[StorageService] Error deleting local directory for configId '${configId}' at ${localConfigDir}:`, error);
      return -1;
    }
  } else {
    console.warn('[StorageService] No valid storage provider configured or S3 client not initialized. Cannot delete config data.');
    return -1;
  }
}

/**
 * Removes a configuration and all its runs from the homepage summary data.
 * @param currentSummary The current homepage summary data. If null or empty, this function does nothing.
 * @param configIdToRemove The ID of the configuration to remove.
 * @returns A new summary array with the specified configId removed, or the original summary if the configId was not found.
 */
function removeConfigFromSummaryArray(
  currentSummary: EnhancedComparisonConfigInfo[] | null,
  configIdToRemove: string
): EnhancedComparisonConfigInfo[] {
  if (!currentSummary || currentSummary.length === 0) {
    return [];
  }
  const updatedSummary = currentSummary.filter(config => config.configId !== configIdToRemove);
  if (updatedSummary.length === currentSummary.length) {
    console.log(`[StorageService] Config ID '${configIdToRemove}' not found in main configs array. Stats will be recalculated to ensure its removal from aggregates.`);
  } else {
    console.log(`[StorageService] Config ID '${configIdToRemove}' removed from main configs array.`);
  }
  return updatedSummary;
}

/**
 * Fetches the homepage summary, removes a specified configId, recalculates stats, and saves the updated summary.
 * @param configIdToRemove The ID of the configuration to remove from the summary.
 * @returns True if the summary was successfully updated (or if the config was not in the summary), false on error.
 */
export async function removeConfigFromHomepageSummary(configIdToRemove: string): Promise<boolean> {
  console.log(`[StorageService] Attempting to remove configId '${configIdToRemove}' from homepage summary manifest.`);
  try {
    const currentSummaryObject = await getHomepageSummary(); // Fetches current summary (HomepageSummaryFileContent | null)
    
    if (currentSummaryObject === null) {
      console.log(`[StorageService] Homepage summary is null (e.g., does not exist). No removal needed for configId '${configIdToRemove}'.`);
      return true;
    }

    // Step 1: Remove the config from the primary array
    const updatedConfigsArray = removeConfigFromSummaryArray(currentSummaryObject.configs, configIdToRemove);

    // Step 2: Recalculate headline stats and drift from the updated array
    console.log(`[StorageService] Recalculating headline stats and drift detection after removal...`);
    const updatedHeadlineStats = calculateHeadlineStats(updatedConfigsArray);
    const updatedDriftDetection = calculatePotentialModelDrift(updatedConfigsArray);

    // Step 3: Construct the full, updated summary object to save
    const updatedSummaryToSave: HomepageSummaryFileContent = {
      configs: updatedConfigsArray,
      headlineStats: updatedHeadlineStats,
      driftDetectionResult: updatedDriftDetection,
      lastUpdated: new Date().toISOString(),
    };

    await saveHomepageSummary(updatedSummaryToSave); 
    console.log(`[StorageService] Homepage summary manifest updated after removing configId '${configIdToRemove}' and recalculating stats.`);
    return true;
  } catch (error: any) {
    console.error(`[StorageService] Error updating homepage summary manifest after attempting to remove configId '${configIdToRemove}':`, error);
    return false;
  }
}

export async function deleteResultByFileName(configId: string, fileName: string): Promise<boolean> {
    if (storageProvider === 's3' && s3Client && s3BucketName) {
        const s3Key = path.join(MULTI_DIR, configId, fileName);
        try {
            await s3Client.send(new DeleteObjectCommand({
                Bucket: s3BucketName,
                Key: s3Key,
            }));
            console.log(`[StorageService] Successfully deleted S3 object: ${s3Key}`);
            return true;
        } catch (error) {
            console.error(`[StorageService] Error deleting S3 object ${s3Key}:`, error);
            return false;
        }
    } else if (storageProvider === 'local') {
        const filePath = path.join(RESULTS_DIR, MULTI_DIR, configId, fileName);
        try {
            if (fsSync.existsSync(filePath)) {
                await fs.unlink(filePath);
                console.log(`[StorageService] Successfully deleted local file: ${filePath}`);
                return true;
            } else {
                console.warn(`[StorageService] Local file not found for deletion: ${filePath}`);
                return true; // Return true as the file is already gone
            }
        } catch (error) {
            console.error(`[StorageService] Error deleting local file ${filePath}:`, error);
            return false;
        }
    } else {
        console.warn(`[StorageService] No valid storage provider configured for deleteResultByFileName. File not deleted.`);
        return false;
    }
}

export async function getLatestRunsSummary(): Promise<LatestRunsSummaryFileContent> {
  let fileContent: string | null = null;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new GetObjectCommand({ Bucket: s3BucketName, Key: LATEST_RUNS_SUMMARY_KEY });
      const { Body } = await s3Client.send(command);
      if (Body) {
        fileContent = await streamToString(Body as Readable);
      }
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        // File doesn't exist, return default empty state
        return { runs: [], lastUpdated: '' };
      }
      console.error(`[StorageService] Error fetching latest runs summary from S3: ${LATEST_RUNS_SUMMARY_KEY}`, error);
      return { runs: [], lastUpdated: '' };
    }
  } else if (storageProvider === 'local') {
    try {
      const filePath = path.join(RESULTS_DIR, MULTI_DIR, 'latest_runs_summary.json');
      if (fsSync.existsSync(filePath)) {
        fileContent = await fs.readFile(filePath, 'utf-8');
      } else {
        // File doesn't exist, return default empty state
        return { runs: [], lastUpdated: '' };
      }
    } catch (error) {
      console.error(`[StorageService] Error fetching latest runs summary from local disk: latest_runs_summary.json`, error);
      return { runs: [], lastUpdated: '' };
    }
  }

  if (!fileContent) {
    return { runs: [], lastUpdated: '' };
  }

  try {
    const parsedContent: SerializableLatestRunsSummaryFileContent = JSON.parse(fileContent);
    const runsWithMaps: LatestRunSummaryItem[] = parsedContent.runs.map(run => ({
      ...run,
      perModelHybridScores: run.perModelHybridScores
        ? new Map(Object.entries(run.perModelHybridScores))
        : new Map(),
    }));
    return { ...parsedContent, runs: runsWithMaps };
  } catch (error) {
    console.error(`[StorageService] Error parsing latest runs summary content:`, error);
    return { runs: [], lastUpdated: '' };
  }
}

export async function saveLatestRunsSummary(summaryData: LatestRunsSummaryFileContent): Promise<void> {
    const serializableRuns: SerializableLatestRunSummaryItem[] = summaryData.runs.map(run => {
        const { perModelHybridScores, ...restOfRun } = run;
        const serializableRun: SerializableLatestRunSummaryItem = { ...restOfRun };

        if (perModelHybridScores instanceof Map) {
            serializableRun.perModelHybridScores = Object.fromEntries(perModelHybridScores);
        } else if (perModelHybridScores) {
            serializableRun.perModelHybridScores = perModelHybridScores as SerializableScoreMap;
        } else {
            serializableRun.perModelHybridScores = {};
        }
        return serializableRun;
    });

    const serializableSummary: SerializableLatestRunsSummaryFileContent = {
        ...summaryData,
        runs: serializableRuns,
    };
    
    const fileContent = JSON.stringify(serializableSummary, null, 2);

    if (storageProvider === 's3' && s3Client && s3BucketName) {
        try {
            const command = new PutObjectCommand({
                Bucket: s3BucketName,
                Key: LATEST_RUNS_SUMMARY_KEY,
                Body: fileContent,
                ContentType: 'application/json',
            });
            await s3Client.send(command);
            console.log(`[StorageService] Latest runs summary saved to S3: ${LATEST_RUNS_SUMMARY_KEY}`);
        } catch (error) {
            console.error(`[StorageService] Error saving latest runs summary to S3: ${LATEST_RUNS_SUMMARY_KEY}`, error);
            throw error;
        }
    } else if (storageProvider === 'local') {
        const filePath = path.join(RESULTS_DIR, MULTI_DIR, 'latest_runs_summary.json');
        try {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, fileContent, 'utf-8');
            console.log(`[StorageService] Latest runs summary saved to local disk: ${filePath}`);
        } catch (error) {
            console.error(`[StorageService] Error saving latest runs summary to local disk: ${filePath}`, error);
            throw error;
        }
    } else {
        console.warn(`[StorageService] No valid storage provider configured for saveLatestRunsSummary. Data not saved.`);
    }
}

export async function saveModelSummary(modelId: string, summaryData: ModelSummary): Promise<void> {
  const safeModelId = getSafeModelId(modelId);
  const fileName = `${safeModelId}.json`;
  const fileContent = JSON.stringify(summaryData, null, 2);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    const s3Key = path.join(MULTI_DIR, MODELS_DIR, fileName);
    try {
      const command = new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/json',
      });
      await s3Client.send(command);
      console.log(`[StorageService] Model summary saved to S3: ${s3Key}`);
    } catch (error) {
      console.error(`[StorageService] Error saving model summary to S3: ${s3Key}`, error);
      throw error;
    }
  } else if (storageProvider === 'local') {
    const filePath = path.join(RESULTS_DIR, MULTI_DIR, MODELS_DIR, fileName);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, fileContent, 'utf-8');
      console.log(`[StorageService] Model summary saved to local disk: ${filePath}`);
    } catch (error) {
      console.error(`[StorageService] Error saving model summary to local disk: ${filePath}`, error);
      throw error;
    }
  } else {
    console.warn(`[StorageService] No valid storage provider configured for saveModelSummary. Data not saved.`);
  }
}

export async function getModelSummary(modelId: string): Promise<ModelSummary | null> {
  const safeModelId = getSafeModelId(modelId);
  const fileName = `${safeModelId}.json`;
  let fileContent: string | null = null;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    const s3Key = path.join(MULTI_DIR, MODELS_DIR, fileName);
    try {
      const command = new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key });
      const { Body } = await s3Client.send(command);
      if (Body) {
        fileContent = await streamToString(Body as Readable);
      }
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        console.log(`[StorageService] Model summary not found in S3: ${s3Key}`);
        return null;
      }
      console.error(`[StorageService] Error fetching model summary from S3: ${s3Key}`, error);
      return null;
    }
  } else if (storageProvider === 'local') {
    const filePath = path.join(RESULTS_DIR, MULTI_DIR, MODELS_DIR, fileName);
    try {
      if (fsSync.existsSync(filePath)) {
        fileContent = await fs.readFile(filePath, 'utf-8');
      } else {
        console.log(`[StorageService] Model summary not found locally: ${filePath}`);
        return null;
      }
    } catch (error) {
      console.error(`[StorageService] Error fetching model summary from local disk: ${filePath}`, error);
      return null;
    }
  }

  if (!fileContent) {
    return null;
  }

  try {
    return JSON.parse(fileContent) as ModelSummary;
  } catch (error) {
    console.error(`[StorageService] Error parsing model summary for ${modelId}:`, error);
    return null;
  }
}

export async function listModelSummaries(): Promise<string[]> {
  const modelsDirPrefix = `${MULTI_DIR}/${MODELS_DIR}/`;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: s3BucketName,
        Prefix: modelsDirPrefix,
      });
      const response = await s3Client.send(command);
      const modelFiles = response.Contents?.map(obj => path.basename(obj.Key || ''))
        .filter(name => name.endsWith('.json'))
        .map(name => name.replace(/\.json$/, '')) || [];
      console.log(`[StorageService] Listed ${modelFiles.length} model summaries from S3.`);
      return modelFiles;
    } catch (error) {
      console.error('[StorageService] Error listing model summaries from S3:', error);
      return [];
    }
  } else if (storageProvider === 'local') {
    const localModelsDir = path.join(process.cwd(), RESULTS_DIR, MULTI_DIR, MODELS_DIR);
    try {
      const entries = await fs.readdir(localModelsDir, { withFileTypes: true });
      const modelFiles = entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => entry.name.replace(/\.json$/, ''));
      console.log(`[StorageService] Listed ${modelFiles.length} model summaries locally.`);
      return modelFiles;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return []; // Directory doesn't exist, so no summaries.
      }
      console.error('[StorageService] Error listing model summaries locally:', error);
      return [];
    }
  }

  console.warn('[StorageService] No valid storage provider configured. Cannot list model summaries.');
  return [];
}

// --- Model Card Storage Functions ---

export async function saveModelCard(modelId: string, cardData: any): Promise<void> {
  const safeModelId = getSafeModelId(modelId);
  const fileName = `${safeModelId}.json`;
  const fileContent = JSON.stringify(cardData, null, 2);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    const s3Key = path.join(MULTI_DIR, MODEL_CARDS_DIR, fileName);
    try {
      const command = new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/json',
      });
      await s3Client.send(command);
      console.log(`[StorageService] Model card saved to S3: ${s3Key}`);
    } catch (error) {
      console.error(`[StorageService] Error saving model card to S3: ${s3Key}`, error);
      throw error;
    }
  } else if (storageProvider === 'local') {
    const filePath = path.join(RESULTS_DIR, MULTI_DIR, MODEL_CARDS_DIR, fileName);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, fileContent, 'utf-8');
      console.log(`[StorageService] Model card saved to local disk: ${filePath}`);
    } catch (error) {
      console.error(`[StorageService] Error saving model card to local disk: ${filePath}`, error);
      throw error;
    }
  } else {
    console.warn(`[StorageService] No valid storage provider configured for saveModelCard. Data not saved.`);
  }
}

export async function getModelCard(modelId: string): Promise<any | null> {
  const safeModelId = getSafeModelId(modelId);
  const fileName = `${safeModelId}.json`;
  let fileContent: string | null = null;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    const s3Key = path.join(MULTI_DIR, MODEL_CARDS_DIR, fileName);
    try {
      const command = new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key });
      const { Body } = await s3Client.send(command);
      if (Body) {
        fileContent = await streamToString(Body as Readable);
      }
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        console.log(`[StorageService] Model card not found in S3: ${s3Key}`);
        return null;
      }
      console.error(`[StorageService] Error fetching model card from S3: ${s3Key}`, error);
      return null;
    }
  } else if (storageProvider === 'local') {
    const filePath = path.join(RESULTS_DIR, MULTI_DIR, MODEL_CARDS_DIR, fileName);
    try {
      if (fsSync.existsSync(filePath)) {
        fileContent = await fs.readFile(filePath, 'utf-8');
      } else {
        console.log(`[StorageService] Model card not found locally: ${filePath}`);
        return null;
      }
    } catch (error) {
      console.error(`[StorageService] Error fetching model card from local disk: ${filePath}`, error);
      return null;
    }
  }

  if (!fileContent) {
    return null;
  }

  try {
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`[StorageService] Error parsing model card for ${modelId}:`, error);
    return null;
  }
}

export async function listModelCards(): Promise<string[]> {
  const modelCardsDirPrefix = `${MULTI_DIR}/${MODEL_CARDS_DIR}/`;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: s3BucketName,
        Prefix: modelCardsDirPrefix,
      });
      const response = await s3Client.send(command);
      const modelFiles = response.Contents?.map(obj => path.basename(obj.Key || ''))
        .filter(name => name.endsWith('.json'))
        .map(name => name.replace(/\.json$/, '')) || [];
      console.log(`[StorageService] Listed ${modelFiles.length} model cards from S3.`);
      return modelFiles;
    } catch (error) {
      console.error('[StorageService] Error listing model cards from S3:', error);
      return [];
    }
  } else if (storageProvider === 'local') {
    const localModelCardsDir = path.join(process.cwd(), RESULTS_DIR, MULTI_DIR, MODEL_CARDS_DIR);
    try {
      const entries = await fs.readdir(localModelCardsDir, { withFileTypes: true });
      const modelFiles = entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => entry.name.replace(/\.json$/, ''));
      console.log(`[StorageService] Listed ${modelFiles.length} model cards locally.`);
      return modelFiles;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return []; // Directory doesn't exist, so no cards.
      }
      console.error('[StorageService] Error listing model cards locally:', error);
      return [];
    }
  }

  console.warn('[StorageService] No valid storage provider configured. Cannot list model cards.');
  return [];
}

export async function saveSearchIndex(index: SearchableBlueprintSummary[]): Promise<number> {
    const filePath = 'search-index.json';
    const fileContent = JSON.stringify(index, null, 2);
    const fileSizeInBytes = Buffer.byteLength(fileContent, 'utf8');

    if (storageProvider === 's3') {
        if (!s3Client || !s3BucketName) {
            throw new Error('S3 client or bucket name is not configured.');
        }
        await s3Client.send(new PutObjectCommand({
            Bucket: s3BucketName,
            Key: filePath,
            Body: fileContent,
            ContentType: 'application/json',
        }));
        console.log(`[StorageService] Search index saved to S3: ${filePath}`);
    } else {
        // For local, save it to the root of the .results directory
        const localFilePath = path.join(RESULTS_DIR, filePath);
        await fs.mkdir(path.dirname(localFilePath), { recursive: true });
        await fs.writeFile(localFilePath, fileContent);
        console.log(`[StorageService] Search index saved locally: ${localFilePath}`);
    }
    return fileSizeInBytes;
}

export async function getSearchIndex(): Promise<SearchableBlueprintSummary[] | null> {
    const filePath = 'search-index.json';
    try {
        if (storageProvider === 's3') {
            if (!s3Client || !s3BucketName) throw new Error('S3 client or bucket name not configured.');
            const command = new GetObjectCommand({ Bucket: s3BucketName, Key: filePath });
            const { Body } = await s3Client.send(command);
            if (!Body) return null;
            const bodyString = await streamToString(Body as Readable);
            return JSON.parse(bodyString);
        } else {
            const localFilePath = path.join(RESULTS_DIR, filePath);
            try {
                await fs.access(localFilePath);
            } catch {
                return null; // File does not exist
            }
            const data = await fs.readFile(localFilePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error: any) {
        if (error.name === 'NoSuchKey' || error.code === 'ENOENT') {
            return null; // File doesn't exist, return null which is an expected condition
        }
        console.error(`[StorageService] Failed to get search index: ${error.message}`);
        throw error;
    }
} 