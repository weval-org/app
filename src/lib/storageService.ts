import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  ListObjectsV2CommandOutput,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import {
  calculateStandardDeviation,
} from '@/app/utils/calculationUtils';
import {
  EnhancedComparisonConfigInfo,
  EnhancedRunInfo,
  PerModelScoreStats,
} from '@/app/utils/homepageDataUtils';
import type { CapabilityLeaderboard, CapabilityRawData } from '../types/summary';
import type { PotentialDriftInfo } from '../types/summary';
import { ComparisonDataV2 as FetchedComparisonData } from '@/app/utils/types';
import {
    calculateHeadlineStats,
    calculatePotentialModelDrift,
    calculatePerModelScoreStatsForRun,
    calculateAverageHybridScoreForRun
} from '@/cli/utils/summaryCalculationUtils';
import { fromSafeTimestamp, toSafeTimestamp } from '@/lib/timestampUtils';
// ModelSummary is imported below with other shared types to avoid duplication
import { SearchableBlueprintSummary } from '@/cli/types/cli_types';
import {
    RESULTS_DIR,
    MULTI_DIR,
    BACKUPS_DIR,
    SANDBOX_DIR,
    LIVE_DIR,
    MODEL_DIR,
    MODEL_CARDS_DIR
} from '@/cli/constants';
import { getConfig } from '@/cli/config';
import pLimit from '@/lib/pLimit';
import { ModelSummary, PainPointsSummary, RedlinesAnnotation } from '@/types/shared';
import { TopicChampionInfo } from '@/app/components/home/types';

const storageProvider = process.env.STORAGE_PROVIDER || (['development', 'test'].includes(process.env.NODE_ENV || '') ? 'local' : 's3');

// Define and export the new summary structure type
export interface HomepageSummaryFileContent {
  configs: EnhancedComparisonConfigInfo[];
  headlineStats: any; // Consider creating a specific type for this
  driftDetectionResult: PotentialDriftInfo | null;
  lastUpdated: string;
  capabilityLeaderboards?: CapabilityLeaderboard[] | null;
  topicChampions?: Record<string, TopicChampionInfo[]> | null;
  capabilityRawData?: CapabilityRawData | null;
  modelCardMappings?: Record<string, string>; // model variant -> card base model
  fileSizeKB?: number;
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

// Expose minimal getters so other modules (and helpers below) can reference configured storage
export function getStorageProvider(): 's3' | 'local' {
  return (storageProvider === 's3' ? 's3' : 'local');
}

export function getS3Client(): S3Client {
  if (!s3Client) {
    throw new Error('S3 client is not initialized. Ensure APP_S3_REGION (and credentials) are set when STORAGE_PROVIDER=s3.');
  }
  return s3Client;
}

export function getBucketName(): string {
  if (!s3BucketName) {
    throw new Error('S3 bucket name is not configured (APP_S3_BUCKET_NAME).');
  }
  return s3BucketName;
}

export const streamToString = (stream: Readable): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });

export const streamToBuffer = (stream: Readable): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });

const LATEST_RUNS_SUMMARY_KEY = 'multi/latest_runs_summary.json';
const MODELS_DIR = 'models';

const HOMEPAGE_SUMMARY_FILENAME = 'homepage_summary.json';
const SEARCH_INDEX_FILENAME = 'search-index.json';
const MANIFEST_FILENAME = 'manifest.json';
const AUTOBACKUP_PREFIX = 'autobackup-before-restore-';

const CACHE_DIR = path.join(os.tmpdir(), 'weval_run_cache');

// Helper to create a safe filename from a model ID
function getSafeModelId(modelId: string): string {
  return modelId.replace(/[:/\\?#%[\]]/g, '_');
}

// Helper types for serialization
type SerializableScoreMap = Record<string, { average: number | null; stddev: number | null }>;

interface SerializableEnhancedRunInfo extends Omit<EnhancedRunInfo, 'perModelScores' | 'perModelHybridScores'> {
    perModelScores?: Record<string, PerModelScoreStats>;
    perModelHybridScores?: Record<string, { average: number | null, stddev?: number | null }>;
}

interface SerializableEnhancedComparisonConfigInfo extends Omit<EnhancedComparisonConfigInfo, 'runs'> {
  runs: SerializableEnhancedRunInfo[];
}

interface SerializableCapabilityRawData {
    modelDimensions: Record<string, Record<string, number>>;
    modelTopics: Record<string, Record<string, number>>;
    modelConfigs: Record<string, Record<string, number>>;
    modelAxes?: Record<string, Record<string, number>>;
    qualifyingModels: string[];
    capabilityQualifyingModels?: Record<string, string[]>;
}

interface SerializableHomepageSummaryFileContent extends Omit<HomepageSummaryFileContent, 'configs' | 'capabilityRawData'> {
    configs: (Omit<EnhancedComparisonConfigInfo, 'runs'> & { runs: SerializableEnhancedRunInfo[] })[];
    capabilityRawData?: SerializableCapabilityRawData;
}

// --- New Serializable Types for Latest Runs Summary ---
interface SerializableLatestRunSummaryItem extends Omit<LatestRunSummaryItem, 'perModelScores' | 'perModelHybridScores'> {
    perModelScores?: Record<string, any>;
    perModelHybridScores?: SerializableScoreMap;
}
interface SerializableLatestRunsSummaryFileContent extends Omit<LatestRunsSummaryFileContent, 'runs'> {
    runs: SerializableLatestRunSummaryItem[];
}
// --- End New Serializable Types ---

export async function getHomepageSummary(): Promise<HomepageSummaryFileContent | null> {
  const fileName = 'homepage_summary.json';
  let fileContent: string | null = null;
  const s3Key = path.join(LIVE_DIR, 'aggregates', fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      // Note: The key for the homepage summary is at the root of the bucket for legacy reasons.
      const command = new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key });
      const { Body } = await s3Client.send(command);
      if (Body) {
        fileContent = await streamToString(Body as Readable);
      }
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        console.log(`[StorageService] Homepage summary file not found in S3: ${s3Key}`);
        return null;
      }
      console.error(`[StorageService] Error fetching homepage summary from S3: ${s3Key}`, error);
      return null;
    }
  } else if (storageProvider === 'local') {
    try {
      // The homepage summary is stored in the root of the multi directory
      if (fsSync.existsSync(localPath)) {
        fileContent = await fs.readFile(localPath, 'utf-8');
      } else {
        console.log(`[StorageService] Homepage summary file not found locally: ${localPath}`);
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
    
    // Calculate file size in KB for debugging
    const fileSizeBytes = Buffer.byteLength(fileContent, 'utf8');
    const fileSizeKB = Math.round(fileSizeBytes / 1024 * 100) / 100; // Round to 2 decimal places
    
    // Rehydrate Maps
    const configsWithMaps: EnhancedComparisonConfigInfo[] = parsedContent.configs.map(config => ({
      ...config,
      runs: config.runs.map(run => ({
        ...run,
        perModelScores: run.perModelScores
          ? new Map(Object.entries(run.perModelScores))
          : undefined,
        perModelHybridScores: run.perModelHybridScores 
          ? new Map(Object.entries(run.perModelHybridScores)) 
          : new Map()
      })),
    }));

    return {
      ...parsedContent,
      configs: configsWithMaps,
      fileSizeKB,
    };
  } catch (error) {
    console.error(`[StorageService] Error parsing homepage summary content for ${fileName}:`, error);
    return null;
  }
}

export async function saveHomepageSummary(summaryData: HomepageSummaryFileContent): Promise<void> {
  const fileName = 'homepage_summary.json';
  const s3Key = path.join(LIVE_DIR, 'aggregates', fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);

  // Prepare data for serialization: convert Maps to objects
  // Map objects don't serialize nicely, so we convert them to plain objects
  const serializableConfigs = summaryData.configs.map(config => ({
    ...config,
    runs: config.runs.map(run => {
      const { perModelScores, perModelHybridScores, ...restOfRun } = run;
      const serializableRun: SerializableEnhancedRunInfo = { ...restOfRun };

      // Handle the new perModelScores (Map -> object)
      if (perModelScores instanceof Map) {
        serializableRun.perModelScores = Object.fromEntries(perModelScores);
        // For backward compatibility, also create the old hybrid score field from the new data
        serializableRun.perModelHybridScores = Object.fromEntries(
          Array.from(perModelScores.entries()).map(([modelId, scores]) => [
            modelId,
            scores.hybrid
          ])
        );
      } else if ((perModelHybridScores as any) instanceof Map) {
        // If we only have the old format as a Map, just serialize that, ensuring stddev key exists
        serializableRun.perModelHybridScores = Object.fromEntries(
          Array.from((perModelHybridScores as Map<string, { average: number | null; stddev?: number | null }>).entries()).map(([modelId, score]) => [
            modelId,
            { average: score.average, stddev: score.stddev ?? null }
          ])
        );
      } else if (perModelHybridScores && typeof perModelHybridScores === 'object') {
        serializableRun.perModelHybridScores = Object.fromEntries(
          Object.entries(perModelHybridScores as Record<string, { average: number | null; stddev?: number | null }>).
            map(([modelId, score]) => [modelId, { average: score.average, stddev: score.stddev ?? null }])
        );
      }

      return serializableRun;
    }),
  }));

  // Serialize capabilityRawData if it exists
  let serializableCapabilityRawData: SerializableCapabilityRawData | undefined = undefined;
  if (summaryData.capabilityRawData) {
    serializableCapabilityRawData = {
        modelDimensions: summaryData.capabilityRawData.modelDimensions,
        modelTopics: summaryData.capabilityRawData.modelTopics,
        modelConfigs: summaryData.capabilityRawData.modelConfigs,
        modelAxes: summaryData.capabilityRawData.modelAxes,
        qualifyingModels: summaryData.capabilityRawData.qualifyingModels,
        capabilityQualifyingModels: summaryData.capabilityRawData.capabilityQualifyingModels,
    };
  }

  const serializableSummary: SerializableHomepageSummaryFileContent = {
    ...summaryData,
    configs: serializableConfigs,
    capabilityRawData: serializableCapabilityRawData,
  };

  const fileContent = JSON.stringify(serializableSummary, null, 2);
  const fileSizeInKB = (Buffer.byteLength(fileContent, 'utf8') / 1024).toFixed(2);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new PutObjectCommand({
        Bucket: s3BucketName,
        // Note: The key for the homepage summary is at the root of the bucket for legacy reasons.
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/json',
      });
      await s3Client.send(command);
      console.log(`[StorageService] Homepage summary saved to S3: ${s3Key} (${fileSizeInKB} KB)`);
    } catch (error) {
      console.error(`[StorageService] Error saving homepage summary to S3: ${s3Key}`, error);
      throw error; // Re-throw to indicate failure
    }
  } else if (storageProvider === 'local') {
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, fileContent, 'utf-8');
      console.log(`[StorageService] Homepage summary saved to local disk: ${localPath} (${fileSizeInKB} KB)`);
    } catch (error) {
      console.error(`[StorageService] Error saving homepage summary to local disk: ${localPath}`, error);
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
  const s3Key = path.join(LIVE_DIR, 'blueprints', configId, fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
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
      if (fsSync.existsSync(localPath)) {
        fileContent = await fs.readFile(localPath, 'utf-8');
      } else {
        console.log(`[StorageService] Per-config summary not found locally: ${localPath}`);
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
        perModelScores: run.perModelScores
            ? new Map(Object.entries(run.perModelScores))
            : undefined,
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
  const s3Key = path.join(LIVE_DIR, 'blueprints', configId, fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);

  // Prepare data for serialization: convert Maps to objects
  const serializableRuns: SerializableEnhancedRunInfo[] = summaryData.runs.map((run: EnhancedRunInfo) => {
    // Exclude the bulky heatmap data from the summary file
    const { perModelScores, perModelHybridScores, allCoverageScores, ...restOfRun } = run;
    const serializableRun: SerializableEnhancedRunInfo = { ...restOfRun };

    if (perModelScores instanceof Map) {
      serializableRun.perModelScores = Object.fromEntries(perModelScores);
      serializableRun.perModelHybridScores = Object.fromEntries(
        Array.from(perModelScores.entries()).map(([modelId, scores]) => [
          modelId, 
          scores.hybrid
        ])
      );
    } else if ((perModelHybridScores as any) instanceof Map) {
      serializableRun.perModelHybridScores = Object.fromEntries((perModelHybridScores as Map<string, { average: number | null; stddev?: number | null }>));
    } else if (perModelHybridScores && typeof perModelHybridScores === 'object') {
      serializableRun.perModelHybridScores = perModelHybridScores as Record<string, { average: number | null; stddev?: number | null }>;
    }

    return serializableRun;
  });

  const serializableSummary: SerializableEnhancedComparisonConfigInfo = {
    ...summaryData,
    runs: serializableRuns,
  };

  const fileContent = JSON.stringify(serializableSummary, null, 2);
  const fileSizeInKB = (Buffer.byteLength(fileContent, 'utf8') / 1024).toFixed(2);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/json',
      });
      await s3Client.send(command);
      console.log(`[StorageService] Per-config summary saved to S3: ${s3Key} (${fileSizeInKB} KB)`);
    } catch (error) {
      console.error(`[StorageService] Error saving per-config summary to S3: ${s3Key}`, error);
      throw error;
    }
  } else if (storageProvider === 'local') {
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, fileContent, 'utf-8');
      console.log(`[StorageService] Per-config summary saved to local disk: ${localPath} (${fileSizeInKB} KB)`);
    } catch (error) {
      console.error(`[StorageService] Error saving per-config summary to local disk: ${localPath}`, error);
      throw error;
    }
  } else {
    console.warn(`[StorageService] No valid storage provider configured for saveConfigSummary. Data not saved.`);
  }
}

// ----------------------
// Companion artefact READ HELPERS (core.json, responses, etc.)
// ----------------------

/** Build artefact paths */
function artefactPaths(configId: string, runBase: string, relative: string) {
  const s3Key = path.join(LIVE_DIR, 'blueprints', configId, runBase, relative);
  const localPath = path.join(RESULTS_DIR, s3Key);
  const cachePath = path.join(CACHE_DIR, configId, runBase, relative);
  return { s3Key, localPath, cachePath };
}

async function readJsonFromStorage(configId: string, runBase: string, relative: string): Promise<any | null> {
  const { s3Key, localPath, cachePath } = artefactPaths(configId, runBase, relative);

  // 1. cache
  try {
    if (fsSync.existsSync(cachePath)) {
      const cached = await fs.readFile(cachePath, 'utf-8');
      return JSON.parse(cached);
    }
  } catch {}

  const loadAndCache = async (content: string) => {
    try {
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, content, 'utf-8');
    } catch {}
    return JSON.parse(content);
  };

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const obj = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key }));
      if (obj.Body) {
        const lastMod = obj.LastModified ? obj.LastModified.toISOString() : 'unknown';
        console.log(`[StorageService] S3 GET ${s3Key} (LastModified: ${lastMod})`);
        const content = await streamToString(obj.Body as Readable);
        return await loadAndCache(content);
      }
    } catch (err: any) {
      if (err.name !== 'NoSuchKey') console.warn('[StorageService] readJsonFromStorage error:', err.message);
    }
  } else if (storageProvider === 'local') {
    try {
      const stats = await fs.stat(localPath);
      console.log(`[StorageService] Local read ${localPath} (mtime: ${stats.mtime.toISOString()})`);
      const content = await fs.readFile(localPath, 'utf-8');
      return await loadAndCache(content);
    } catch {}
  }
  return null;
}

/**
 * Fetch the lightweight core.json artefact if present; otherwise fall back to legacy _comparison.json.
 */
export async function getCoreResult(configId: string, runLabel: string, timestamp: string): Promise<any | null> {
  const runBase = `${runLabel}_${timestamp}`;
  // Try artefact first
  const coreData = await readJsonFromStorage(configId, runBase, 'core.json');

  if (coreData) {
    console.log(`[StorageService] getCoreResult → using core.json artefact for ${configId}/${runBase} (promptIds: ${coreData.promptIds?.length || 0}, models: ${coreData.effectiveModels?.length || 0})`);
    return coreData;
  }

  console.log(`[StorageService] getCoreResult → core.json missing, falling back to legacy _comparison.json for ${configId}/${runBase}`);
  // Fallback legacy
  const legacyFile = `${runBase}_comparison.json`;
  return await getResultByFileName(configId, legacyFile);
}

/**
 * Fetch detailed coverage result for a prompt+model
 */
export async function getCoverageResult(configId: string, runLabel: string, timestamp: string, promptId: string, modelId: string): Promise<any | null> {
  const runBase = `${runLabel}_${timestamp}`;
  const artefact = await readJsonFromStorage(configId, runBase, path.join('coverage', promptId, `${getSafeModelId(modelId)}.json`));
  if (artefact) return artefact;
  // legacy fallback
  const legacyFile = `${runBase}_comparison.json`;
  const legacy = await getResultByFileName(configId, legacyFile);
  return legacy?.evaluationResults?.llmCoverageScores?.[promptId]?.[modelId] || null;
}

/**
 * Fetch responses for a specific promptId. Falls back to legacy file if artefact missing.
 */
export async function getPromptResponses(configId: string, runLabel: string, timestamp: string, promptId: string): Promise<Record<string,string> | null> {
  const runBase = `${runLabel}_${timestamp}`;
  const artefact = await readJsonFromStorage(configId, runBase, path.join('responses', `${promptId}.json`));
  if (artefact) return artefact;

  // legacy fallback
  const legacyFile = `${runBase}_comparison.json`;
  const legacy = await getResultByFileName(configId, legacyFile);
  if (legacy?.allFinalAssistantResponses) {
    const decodedPromptId = decodeURIComponent(promptId);
    return legacy.allFinalAssistantResponses[decodedPromptId] || null;
  }
  return null;
}

/**
 * Fetch full conversation history for a specific prompt+model if history artefact exists.
 * Returns an array of ConversationMessage or null if not found.
 */
export async function getConversationHistory(
  configId: string,
  runLabel: string,
  timestamp: string,
  promptId: string,
  modelId: string
): Promise<any[] | null> {
  const runBase = `${runLabel}_${timestamp}`;
  // Match the same safe model id logic used when writing artefacts
  const safeModel = getSafeModelId(modelId);
  const relative = path.join('histories', promptId, `${safeModel}.json`);
  const artefact = await readJsonFromStorage(configId, runBase, relative);
  if (artefact && Array.isArray(artefact.history)) return artefact.history;
  return null;
}

// ----------------------
// Existence checker (used by migration tool)
// ----------------------
export async function artefactExists(configId: string, runBase: string, relativePath: string): Promise<boolean> {
  const { s3Key, localPath } = artefactPaths(configId, runBase, relativePath);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: s3BucketName, Key: s3Key }));
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.name === 'NoSuchKey') return false;
      // Some providers throw 404 differently
      if (err.$metadata?.httpStatusCode === 404) return false;
      console.warn('[StorageService] artefactExists HeadObject error:', err.message);
      return false;
    }
  } else if (storageProvider === 'local') {
    return fsSync.existsSync(localPath);
  }
  return false;
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
  // 1. Save legacy monolithic file (back-compat during migration)
  const jsonData = JSON.stringify(data, null, 2);
  const s3Key = path.join(LIVE_DIR, 'blueprints', configId, fileNameWithTimestamp);
  const localPath = path.join(RESULTS_DIR, s3Key);

  let savedPath: string | null = null;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
        Body: jsonData,
        ContentType: 'application/json',
      }));
      console.log(`[StorageService] Result saved to S3: s3://${s3BucketName}/${s3Key}`);
      savedPath = s3Key;
    } catch (error) {
      console.error('[StorageService] Error saving result to S3:', error);
      return null;
    }
  } else if (storageProvider === 'local') {
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, jsonData, 'utf-8');
      console.log(`[StorageService] Result saved locally: ${localPath}`);
      savedPath = localPath;
    } catch (error) {
      console.error('[StorageService] Error saving result locally:', error);
      return null;
    }
  } else {
    console.warn('[StorageService] No valid storage provider configured. Cannot save result.');
    return null;
  }

  // 2. Write companion artefacts (core.json + prompt responses)
  try {
    const runBase = fileNameWithTimestamp.replace(/_comparison\.json$/i, '');

    // helper to write a JSON artefact to the same provider we just used
    const writeJsonArtefact = async (relativePath: string, obj: any) => {
      const artefactJson = JSON.stringify(obj);
      const artefactS3Key = path.join(LIVE_DIR, 'blueprints', configId, runBase, relativePath);
      const artefactLocalPath = path.join(RESULTS_DIR, artefactS3Key);

      if (storageProvider === 's3' && s3Client && s3BucketName) {
        await s3Client.send(new PutObjectCommand({
          Bucket: s3BucketName,
          Key: artefactS3Key,
          Body: artefactJson,
          ContentType: 'application/json',
        }));
      } else if (storageProvider === 'local') {
        await fs.mkdir(path.dirname(artefactLocalPath), { recursive: true });
        await fs.writeFile(artefactLocalPath, artefactJson, 'utf-8');
      }

      // Invalidate any cached copy of this artefact
      try {
        const { cachePath } = artefactPaths(configId, runBase, relativePath);
        if (fsSync.existsSync(cachePath)) {
          await fs.unlink(cachePath);
          console.log(`[StorageService] Cache invalidated for ${cachePath}`);
        }
      } catch {}

    };

    // Build core.json (lightweight slice)
    const buildCoreData = (full: any) => {
      const clone = { ...full } as any;

      // ---- Trim config.prompts (remove heavy text, keep IDs and weights only) ----
      if (clone.config?.prompts) {
        clone.config.prompts = clone.config.prompts.map((p: any) => ({ 
          id: p.id,
          ...(typeof p.weight === 'number' ? { weight: p.weight } : {})
        }));
      }

      // ---- Prompt contexts: keep as-is for quick display (single string or msgs array) ----
      // ---- Remove heavy response-side fields ----
      delete clone.allFinalAssistantResponses;
      delete clone.fullConversationHistories;

      // Replace heavy fields with placeholder matrices
      const buildPlaceholderMatrix = () => {
        const out: Record<string, Record<string, null>> = {};
        const prompts = full.promptIds || Object.keys(full.allFinalAssistantResponses || {});
        const models  = full.effectiveModels || [];
        for (const p of prompts) {
          out[p] = {};
          for (const m of models) {
            out[p][m] = null;
          }
        }
        return out;
      };
      clone.allFinalAssistantResponses = buildPlaceholderMatrix();
      // Reset excludedModels; will be recalculated client-side based on artefacts
      if (clone.excludedModels) delete clone.excludedModels;
      clone.fullConversationHistories = buildPlaceholderMatrix();
      // Trim coverage scores (retain essential fields & lightweight point assessments)
      const llmCoverage = full.evaluationResults?.llmCoverageScores || {};
      const strippedCoverage: Record<string, any> = {};
      for (const pid in llmCoverage) {
        strippedCoverage[pid] = {};
        for (const mid in llmCoverage[pid]) {
          const r = llmCoverage[pid][mid] || {};

          // Build lightweight point assessments (omit bulky reflection text)
          let lightPointAssessments: any[] | undefined;
          if (Array.isArray(r.pointAssessments)) {
            lightPointAssessments = r.pointAssessments.map((pa: any) => {
              // Pre-compute judge score standard deviation for disagreement indicator
              let judgeStdDev: number | undefined;
              if (Array.isArray(pa.individualJudgements) && pa.individualJudgements.length > 1) {
                const scores = pa.individualJudgements.map((j: any) => j.coverageExtent);
                const mean = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
                const variance = scores.reduce((a: number, b: number) => a + Math.pow(b - mean, 2), 0) / scores.length;
                judgeStdDev = Math.sqrt(variance);
              }

              return {
                coverageExtent: pa.coverageExtent,
                multiplier: pa.multiplier,
                isInverted: pa.isInverted,
                judgeStdDev,
                pathId: pa.pathId,
              };
            });
          }

          strippedCoverage[pid][mid] = {
            avgCoverageExtent: r.avgCoverageExtent,
            keyPointsCount: r.keyPointsCount,
            sampleCount: r.sampleCount,
            stdDev: r.stdDev,
            judgeModelId: r.judgeModelId,
            error: r.error,
            pointAssessments: lightPointAssessments,
          };
        }
      }
      clone.evaluationResults = {
        similarityMatrix: full.evaluationResults?.similarityMatrix || {},
        llmCoverageScores: strippedCoverage,
      };
      return clone;
    };

    await writeJsonArtefact('core.json', buildCoreData(data));

    // Concurrency limiter: lower for S3, higher for local FS
    const limit = pLimit(storageProvider === 's3' ? 8 : 32);
    const artefactWrites: Promise<void>[] = [];

    // Prompt-level responses
    if (data.allFinalAssistantResponses) {
      for (const promptId of Object.keys(data.allFinalAssistantResponses)) {
        artefactWrites.push(
          limit(() => writeJsonArtefact(path.join('responses', `${promptId}.json`), data.allFinalAssistantResponses[promptId]))
        );
      }
    }

    // Coverage artefacts per prompt/model
    const coverage = data.evaluationResults?.llmCoverageScores || {};
    for (const pid of Object.keys(coverage)) {
      for (const mid of Object.keys(coverage[pid])) {
        artefactWrites.push(
          limit(() => writeJsonArtefact(path.join('coverage', pid, `${getSafeModelId(mid)}.json`), coverage[pid][mid]))
        );
      }
    }

    // Full conversation histories per prompt/model (if present)
    if (data.fullConversationHistories) {
      for (const pid of Object.keys(data.fullConversationHistories)) {
        for (const mid of Object.keys(data.fullConversationHistories[pid])) {
          const history = data.fullConversationHistories[pid][mid];
          if (Array.isArray(history) && history.length > 0) {
            artefactWrites.push(
              limit(() => writeJsonArtefact(path.join('histories', pid, `${getSafeModelId(mid)}.json`), { history }))
            );
          }
        }
      }
    }

    // Wait for all artefacts to finish writing
    if (artefactWrites.length > 0) {
      await Promise.all(artefactWrites);
    }
  } catch (artefactErr: any) {
    console.warn(`[StorageService] Companion artefact write failed (non-fatal): ${artefactErr.message}`);
  }

  // 3. Clear cache after successful save to ensure fresh reads
  if (savedPath) {
    await clearResultCache(configId, fileNameWithTimestamp);
  }

  return savedPath;
}

/**
 * Lists all available config IDs (directories).
 * For S3, this lists "common prefixes" under MULTI_DIR.
 * For local, this lists directories under RESULTS_DIR/MULTI_DIR.
 */
export async function listConfigIds(): Promise<string[]> {
  const s3Prefix = `${LIVE_DIR}/blueprints/`;
  const localPath = path.join(RESULTS_DIR, LIVE_DIR, 'blueprints');

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: s3BucketName,
        Prefix: s3Prefix,
        Delimiter: '/',
      });
      const response = await s3Client.send(command);
      const configIds = response.CommonPrefixes?.map(p => {
        const prefix = p.Prefix || '';
        return prefix.replace(s3Prefix, '').replace(/\/$/, '');
      }).filter(Boolean) as string[] || [];
      console.log(`[StorageService] Listed config IDs from S3: ${configIds.join(', ')}`);
      return configIds;
    } catch (error) {
      console.error('[StorageService] Error listing config IDs from S3:', error);
      return [];
    }
  } else if (storageProvider === 'local') {
    try {
      const entries = await fs.readdir(localPath, { withFileTypes: true });
      const configIds = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
      console.log(`[StorageService] Listed config IDs locally: ${configIds.join(', ')}`);
      return configIds;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`[StorageService] Local results directory not found: ${localPath}`);
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

  const s3Prefix = `${LIVE_DIR}/blueprints/${configId}/`;
  const localPath = path.join(RESULTS_DIR, LIVE_DIR, 'blueprints', configId);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      // Use pagination and a delimiter so we only list objects directly under the config folder.
      // This avoids drowning in artefact files living under run subdirectories, and prevents
      // missing _comparison.json files when there are >1000 keys.
      let continuationToken: string | undefined = undefined;
      let totalObjectsScanned = 0;
      do {
        const command: ListObjectsV2Command = new ListObjectsV2Command({
          Bucket: s3BucketName,
          Prefix: s3Prefix,
          Delimiter: '/',
          ContinuationToken: continuationToken,
        });
        const response: ListObjectsV2CommandOutput = await s3Client.send(command);
        response.Contents?.forEach((item) => {
          if (item.Key) {
            totalObjectsScanned++;
            const fileName = path.basename(item.Key);
            if (fileName.endsWith('_comparison.json')) {
              const parsed = parseFileName(fileName);
              if (parsed) {
                runs.push(parsed);
              }
            }
          }
        });
        continuationToken = response.NextContinuationToken;
      } while (continuationToken);
      console.log(`[StorageService] Listed ${runs.length} runs for config '${configId}' from S3 (scanned ${totalObjectsScanned} top-level objects).`);
    } catch (error) {
      console.error(`[StorageService] Error listing runs for config '${configId}' from S3:`, error);
    }
  } else if (storageProvider === 'local') {
    try {
      const files = await fs.readdir(localPath);
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
  const s3Key = path.join(LIVE_DIR, 'blueprints', configId, fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);
  const cachePath = path.join(CACHE_DIR, configId, fileName);

  // --- Check Local Cache First ---
  try {
          if (fsSync.existsSync(cachePath)) {
          const stats = await fs.stat(cachePath);
          // console.log(`[StorageService] Cache HIT for ${fileName}. mtime: ${stats.mtime.toISOString()}`);
          const cachedContent = await fs.readFile(cachePath, 'utf-8');
          return JSON.parse(cachedContent);
      }
  } catch (err) {
      console.warn(`[StorageService] Error reading from cache file ${cachePath}. Will fetch from source.`, err);
  }
  // --- End Cache Check ---

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    // console.log(`[StorageService] Attempting to load result by fileName from S3: s3://${s3BucketName}/${s3Key}`);
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
      }));
      if (Body) {
        const content = await streamToString(Body as Readable);
        console.log(`[StorageService] Result retrieved from S3 by fileName: s3://${s3BucketName}/${s3Key}`);
        
        // --- Populate Cache ---
        try {
            await fs.mkdir(path.dirname(cachePath), { recursive: true });
            await fs.writeFile(cachePath, content, 'utf-8');
            console.log(`[StorageService] Cached ${fileName} to ${cachePath}`);
        } catch (err) {
            console.warn(`[StorageService] Failed to write to cache file ${cachePath}.`, err);
        }
        // --- End Cache Population ---

        const parsedData = JSON.parse(content);
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
    console.log(`[StorageService] Attempting to load result by fileName from local disk: ${localPath}`);
    try {
      const fileContents = await fs.readFile(localPath, 'utf-8');
      console.log(`[StorageService] Result retrieved locally by fileName: ${localPath}`);
      const parsedData = JSON.parse(fileContents);

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
 * Combines manual tags from config and auto tags from executive summary.
 * Deduplicates tags case-insensitively while preserving original casing.
 * @param configTags Manual tags from the blueprint config
 * @param autoTags Auto tags from the executive summary
 * @returns Combined and deduplicated array of tags
 */
function combineConfigAndAutoTags(configTags: string[] = [], autoTags: string[] = []): string[] {
  const allTags = [...configTags, ...autoTags];
  const uniqueTags = allTags.filter((tag, index, arr) => 
    arr.findIndex(t => t.toLowerCase() === tag.toLowerCase()) === index
  );
  return uniqueTags;
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
  
  const currentSummary = summary ? summary.map(item => ({ ...item, runs: [...item.runs] })) : [];

  const configId = newResultData.configId;
  const configTitle = newResultData.configTitle || newResultData.config.title || configId;
  const runLabel = newResultData.runLabel;
  const timestamp = newResultData.timestamp;
  
  // Combine manual config tags with auto tags from executive summary
  const configTags = newResultData.config.tags || [];
  const autoTags = newResultData.executiveSummary?.structured?.autoTags || [];
  const unifiedTags = combineConfigAndAutoTags(configTags, autoTags);

  let configSummary = currentSummary.find(
    (c) => (c.id || c.configId) === configId
  );
  if (!configSummary) {
    configSummary = {
      configId: configId,
      configTitle: configTitle,
      id: configId,
      title: configTitle,
      description: newResultData.config?.description || '',
      author: (newResultData.config as any)?.author,
      reference: (newResultData.config as any)?.reference,
      runs: [],
      latestRunTimestamp: timestamp,
      tags: unifiedTags,
    };
    currentSummary.push(configSummary);
  } else {
    // Update metadata that might change between runs
    configSummary.configTitle = configTitle;
    configSummary.title = configTitle;
    configSummary.description = newResultData.config?.description || configSummary.description;
    // Update author if present in latest config
    (configSummary as any).author = (newResultData.config as any)?.author ?? (configSummary as any).author;
    // Update reference if present in latest config
    (configSummary as any).reference = (newResultData.config as any)?.reference ?? (configSummary as any).reference;
    configSummary.tags = unifiedTags;
  }
  
  // Inject prompt weights into coverage map for weighted per-model averages
  try {
    const weightMap: Record<string, number> = {};
    newResultData.config?.prompts?.forEach((p: any) => {
      if (p && typeof p.id === 'string') {
        const w = p.weight;
        if (typeof w === 'number' && !isNaN(w) && w > 0) {
          weightMap[p.id] = w;
        }
      }
    });
    if (Object.keys(weightMap).length > 0 && newResultData.evaluationResults?.llmCoverageScores) {
      (newResultData.evaluationResults.llmCoverageScores as any).__promptWeights = weightMap;
      console.log(`[StorageService] ✅ Attached prompt weights for ${Object.keys(weightMap).length} prompts to llmCoverageScores`);
    } else {
      console.log(`[StorageService] ⚖️  NO prompt weights found in config - using default weight of 1.0 for all prompts`);
    }
  } catch {}

  const perModelScores = calculatePerModelScoreStatsForRun(newResultData);
  const hybridScoreStats = calculateAverageHybridScoreForRun(newResultData);

  const newRunInfo: EnhancedRunInfo = {
    runLabel: runLabel,
    timestamp: timestamp,
    fileName: runFileName,
    temperature: newResultData.config.temperature || 0,
    numPrompts: newResultData.promptIds.length,
    numModels: newResultData.effectiveModels.filter(m => m !== 'ideal').length,
    totalModelsAttempted: newResultData.config.models.length,
    hybridScoreStats: hybridScoreStats,
    perModelScores: perModelScores,
    tags: unifiedTags,
    models: newResultData.effectiveModels,
    promptIds: newResultData.promptIds,
  };

  const runExists = configSummary.runs.some(
    (run) => run.runLabel === newRunInfo.runLabel && run.timestamp === newRunInfo.timestamp
  );
  if (!runExists) {
    configSummary.runs.push(newRunInfo);
    configSummary.runs.sort(
      (a, b) =>
        new Date(fromSafeTimestamp(b.timestamp)).getTime() -
        new Date(fromSafeTimestamp(a.timestamp)).getTime()
    );
  }

  // Update latestRunTimestamp
  configSummary.latestRunTimestamp = configSummary.runs[0].timestamp;

  // Recalculate overall stats for this config
  const allHybridScoresForConfig = configSummary.runs
    .map(run => run.hybridScoreStats?.average)
    .filter(score => score !== null && score !== undefined) as number[];
  
  if (allHybridScoresForConfig.length > 0) {
    const totalScore = allHybridScoresForConfig.reduce((sum, score) => sum + score, 0);
    configSummary.overallAverageHybridScore = totalScore / allHybridScoresForConfig.length;
    configSummary.hybridScoreStdDev = calculateStandardDeviation(allHybridScoresForConfig);
  } else {
    configSummary.overallAverageHybridScore = null;
    configSummary.hybridScoreStdDev = null;
  }

  return currentSummary;
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
    // Support deletion from both legacy and new layouts
    const prefixes = [
      path.join(MULTI_DIR, configId, ''),
      path.join(LIVE_DIR, 'blueprints', configId, ''),
    ];

    let allKeys: string[] = [];
    try {
      for (const prefix of prefixes) {
        let continuationToken: string | undefined = undefined;
        let scannedForPrefix = 0;
        console.log(`[StorageService] Listing objects for deletion in S3 prefix: s3://${s3BucketName}/${prefix}`);
        do {
          const listCommand = new ListObjectsV2Command({
            Bucket: s3BucketName,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          });
          const response: import('@aws-sdk/client-s3').ListObjectsV2CommandOutput = await s3Client.send(listCommand);
          const keys = (response.Contents || []).map(obj => obj.Key).filter(Boolean) as string[];
          if (keys.length > 0) {
            allKeys.push(...keys);
            scannedForPrefix += keys.length;
          }
          continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        if (scannedForPrefix === 0) {
          console.log(`[StorageService] No objects found for prefix '${prefix}' in S3.`);
        } else {
          console.log(`[StorageService] Found ${scannedForPrefix} S3 objects under prefix '${prefix}'.`);
        }
      }

      if (allKeys.length === 0) {
        console.log(`[StorageService] No objects found for configId '${configId}' across legacy and new prefixes. Nothing to delete.`);
        return 0;
      }

      console.log(`[StorageService] Found ${allKeys.length} total S3 objects to delete for configId '${configId}'.`);
      const success = await deleteS3Objects(allKeys);
      if (success) {
        console.log(`[StorageService] Successfully deleted ${allKeys.length} S3 objects for configId '${configId}'.`);
        // Best-effort: clear any cached artefacts for this config
        try {
          const cachePathForConfig = path.join(CACHE_DIR, configId);
          await fs.rm(cachePathForConfig, { recursive: true, force: true });
          console.log(`[StorageService] Cleared cache directory for configId '${configId}': ${cachePathForConfig}`);
        } catch {}
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
    // Support deletion from both legacy and new layouts
    const legacyDir = path.join(process.cwd(), RESULTS_DIR, MULTI_DIR, configId);
    const newDir = path.join(process.cwd(), RESULTS_DIR, LIVE_DIR, 'blueprints', configId);

    const deleteDirIfExists = async (dirPath: string, label: string): Promise<number> => {
      try {
        await fs.access(dirPath);
      } catch {
        console.log(`[StorageService] ${label} directory not found at ${dirPath}. Nothing to delete for this path.`);
        return 0;
      }
      const files = await fs.readdir(dirPath, { recursive: true } as any).catch(async () => await fs.readdir(dirPath));
      await fs.rm(dirPath, { recursive: true, force: true });
      console.log(`[StorageService] Successfully deleted ${label} directory for configId '${configId}': ${dirPath} (contained ${(files as any[]).length} files/items).`);
      return (files as any[]).length;
    };

    try {
      const legacyCount = await deleteDirIfExists(legacyDir, 'legacy');
      const newCount = await deleteDirIfExists(newDir, 'live');
      const total = legacyCount + newCount;

      // Best-effort: clear any cached artefacts for this config
      try {
        const cachePathForConfig = path.join(CACHE_DIR, configId);
        await fs.rm(cachePathForConfig, { recursive: true, force: true });
        console.log(`[StorageService] Cleared cache directory for configId '${configId}': ${cachePathForConfig}`);
      } catch {}

      if (total === 0) {
        console.log(`[StorageService] No local files or directories found for configId '${configId}' in either legacy or live paths.`);
      }
      return total;
    } catch (error) {
      console.error(`[StorageService] Error deleting local directories for configId '${configId}':`, error);
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
    const updatedHeadlineStats = calculateHeadlineStats(updatedConfigsArray, new Map(), new Map());
    const updatedDriftDetectionResult = calculatePotentialModelDrift(updatedConfigsArray);

    // Step 3: Construct the full, updated summary object to save
    const updatedSummaryToSave: HomepageSummaryFileContent = {
      configs: updatedConfigsArray,
      headlineStats: updatedHeadlineStats,
      driftDetectionResult: updatedDriftDetectionResult,
      topicChampions: currentSummaryObject.topicChampions,
      capabilityLeaderboards: currentSummaryObject.capabilityLeaderboards,
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
  const s3Key = path.join(LIVE_DIR, 'aggregates', 'latest_runs_summary.json');
  const localPath = path.join(RESULTS_DIR, s3Key);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key });
      const { Body } = await s3Client.send(command);
      if (Body) {
        fileContent = await streamToString(Body as Readable);
      }
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        // File doesn't exist, return default empty state
        return { runs: [], lastUpdated: '' };
      }
      console.error(`[StorageService] Error fetching latest runs summary from S3: ${s3Key}`, error);
      return { runs: [], lastUpdated: '' };
    }
  } else if (storageProvider === 'local') {
    try {
      if (fsSync.existsSync(localPath)) {
        fileContent = await fs.readFile(localPath, 'utf-8');
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
      perModelScores: run.perModelScores
        ? new Map(Object.entries(run.perModelScores))
        : undefined,
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
    const s3Key = path.join(LIVE_DIR, 'aggregates', 'latest_runs_summary.json');
    const localPath = path.join(RESULTS_DIR, s3Key);
    const serializableRuns: SerializableLatestRunSummaryItem[] = summaryData.runs.map(run => {
        const { perModelScores, perModelHybridScores, ...restOfRun } = run;
        const serializableRun: SerializableLatestRunSummaryItem = { ...restOfRun };

        if (perModelScores instanceof Map) {
            serializableRun.perModelScores = Object.fromEntries(perModelScores);
            serializableRun.perModelHybridScores = Object.fromEntries(
                Array.from(perModelScores.entries()).map(([modelId, scores]) => [
                    modelId,
                    scores.hybrid,
                ])
            );
        } else if ((perModelHybridScores as any) instanceof Map) {
            serializableRun.perModelHybridScores = Object.fromEntries(
                Array.from((perModelHybridScores as Map<string, { average: number | null; stddev?: number | null }>)).map(([modelId, score]) => [
                    modelId,
                    { average: score.average, stddev: score.stddev ?? null }
                ])
            );
        } else if (perModelHybridScores && typeof perModelHybridScores === 'object') {
            serializableRun.perModelHybridScores = Object.fromEntries(
                Object.entries(perModelHybridScores as Record<string, { average: number | null; stddev?: number | null }>).
                    map(([modelId, score]) => [modelId, { average: score.average, stddev: score.stddev ?? null }])
            );
        }

        return serializableRun;
    });

    const serializableSummary: SerializableLatestRunsSummaryFileContent = {
        ...summaryData,
        runs: serializableRuns,
    };
    
    const fileContent = JSON.stringify(serializableSummary, null, 2);
    const fileSizeInKB = (Buffer.byteLength(fileContent, 'utf8') / 1024).toFixed(2);

    if (storageProvider === 's3' && s3Client && s3BucketName) {
        try {
            const command = new PutObjectCommand({
                Bucket: s3BucketName,
                Key: s3Key,
                Body: fileContent,
                ContentType: 'application/json',
            });
            await s3Client.send(command);
            console.log(`[StorageService] Latest runs summary saved to S3: ${s3Key} (${fileSizeInKB} KB)`);
        } catch (error) {
            console.error(`[StorageService] Error saving latest runs summary to S3: ${s3Key}`, error);
            throw error;
        }
    } else if (storageProvider === 'local') {
        try {
            await fs.mkdir(path.dirname(localPath), { recursive: true });
            await fs.writeFile(localPath, fileContent, 'utf-8');
            console.log(`[StorageService] Latest runs summary saved to local disk: ${localPath} (${fileSizeInKB} KB)`);
        } catch (error) {
            console.error(`[StorageService] Error saving latest runs summary to local disk: ${localPath}`, error);
            throw error;
        }
    } else {
        console.warn(`[StorageService] No valid storage provider configured for saveLatestRunsSummary. Data not saved.`);
    }
}

export async function saveModelSummary(modelId: string, summaryData: ModelSummary): Promise<void> {
  const safeModelId = getSafeModelId(modelId);
  const fileName = `${safeModelId}.json`;
  const s3Key = path.join(LIVE_DIR, 'models', 'summaries', fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);
  const fileContent = JSON.stringify(summaryData, null, 2);
  const fileSizeInKB = (Buffer.byteLength(fileContent, 'utf8') / 1024).toFixed(2);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/json',
      });
      await s3Client.send(command);
      console.log(`[StorageService] Model summary saved to S3: ${s3Key} (${fileSizeInKB} KB)`);
    } catch (error) {
      console.error(`[StorageService] Error saving model summary to S3: ${s3Key}`, error);
      throw error;
    }
  } else if (storageProvider === 'local') {
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, fileContent, 'utf-8');
      console.log(`[StorageService] Model summary saved to local disk: ${localPath} (${fileSizeInKB} KB)`);
    } catch (error) {
      console.error(`[StorageService] Error saving model summary to local disk: ${localPath}`, error);
      throw error;
    }
  } else {
    console.warn(`[StorageService] No valid storage provider configured for saveModelSummary. Data not saved.`);
  }
}

export async function getModelSummary(modelId: string): Promise<ModelSummary | null> {
  const safeModelId = getSafeModelId(modelId);
  const fileName = `${safeModelId}.json`;
  const s3Key = path.join(LIVE_DIR, 'models', 'summaries', fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);
  let fileContent: string | null = null;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
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
    try {
      if (fsSync.existsSync(localPath)) {
        fileContent = await fs.readFile(localPath, 'utf-8');
      } else {
        console.log(`[StorageService] Model summary not found locally: ${localPath}`);
        return null;
      }
    } catch (error) {
      console.error(`[StorageService] Error fetching model summary from local disk: ${localPath}`, error);
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
  const s3Prefix = `${LIVE_DIR}/models/summaries/`;
  const localPath = path.join(RESULTS_DIR, LIVE_DIR, 'models', 'summaries');

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: s3BucketName,
        Prefix: s3Prefix,
      });
      const response = await s3Client.send(command);
      const modelFiles = response.Contents?.map(obj => path.basename(obj.Key || ''))
        .filter(name => name.endsWith('.json'))
        .map(name => name.replace(/\.json$/, '')) || [];
      // console.log(`[StorageService] Listed ${modelFiles.length} model summaries from S3.`);
      return modelFiles;
    } catch (error) {
      console.error('[StorageService] Error listing model summaries from S3:', error);
      return [];
    }
  } else if (storageProvider === 'local') {
    try {
      const entries = await fs.readdir(localPath, { withFileTypes: true });
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

// ----------------------
// Model N-Delta Storage (negative deltas vs peers)
// ----------------------

export interface ModelPromptDeltaEntry {
  configId: string;
  configTitle: string;
  runLabel: string;
  timestamp: string;
  promptId: string;
  modelId: string;
  modelCoverage: number; // 0..1
  peerAverageCoverage: number; // 0..1
  delta: number; // modelCoverage - peerAverageCoverage (negative = worse than peers)
  keyPointsCount?: number | null;
  // Optional ranking context among base models for this prompt in this run
  totalBases?: number;
  rankAmongBases?: number; // 1 = best
  percentileFromTop?: number; // 0 best ... 100 worst (approx)
  quartileFromTop?: 1 | 2 | 3 | 4; // 1 best quartile ... 4 worst quartile
  topBases?: Array<{ base: string; coverage: number }>; // e.g., top 3 bases
  // Optional prompt/response context for UI display
  selectedVariantId?: string; // representative variant used to display response
  systemPromptUsed?: string | null;
  temperatureUsed?: number | null;
  promptContext?: any; // string | ConversationMessage[]
  finalResponse?: string | null;
  fullConversationHistory?: any; // ConversationMessage[] | undefined
}

export interface ModelNDeltasFileContent {
  modelId: string; // exact effective model id
  totalEntries: number;
  generatedAt: string;
  entries: ModelPromptDeltaEntry[]; // typically sorted ascending by delta (most negative first)
}

export interface NDeltasIndexEntry {
  modelId: string; // base core name, e.g., "gpt-4o"
  totalEntries: number;
  generatedAt: string;
  worstDelta: number | null; // most negative delta
  medianDelta?: number | null;
}

export interface NDeltasIndexContent {
  models: NDeltasIndexEntry[];
  lastUpdated: string;
}

// --- Vibes Index Types ---
export interface VibesIndexModelStats {
  averageHybrid: number | null;
  totalRuns: number;
  uniqueConfigs: number;
}

export interface VibesIndexContent {
  models: Record<string, VibesIndexModelStats>;
  similarity: Record<string, Record<string, { score: number; count: number }>>; // baseA -> baseB -> { score, count }
  // Optional per-model capability scores (0..1). Shape: modelId -> capabilityId -> { score, contributingRuns }
  capabilityScores?: Record<string, Record<string, { score: number | null; contributingRuns: number }>>;
  generatedAt: string;
}

// --- Compass Index Types and Storage Functions ---
export interface CompassExemplar {
  promptId: string;
  promptText: string; // The actual prompt for context
  modelId: string;
  modelResponse: string;
  coverageScore: number;
  axisScore: number; // how strongly this response exhibits the pole characteristic
  configId: string;
  runLabel: string;
  timestamp: string;
}

export interface CompassComparisonPair {
  promptText: string;
  positiveExemplar: CompassExemplar;
  negativeExemplar: CompassExemplar;
}

export interface CompassAxisExemplars {
  comparisonPairs?: CompassComparisonPair[];
}

export interface CompassIndexContent {
  axes: Record<string, Record<string, { value: number | null; runs: number }>>;
  axisMetadata?: Record<string, { id: string; positivePole: string; negativePole: string }>;
  exemplars?: Record<string, CompassAxisExemplars>; // bipolar axis id -> exemplars
  generatedAt: string;
}

export async function saveModelNDeltas(modelId: string, data: ModelNDeltasFileContent): Promise<void> {
  const safeModelId = getSafeModelId(modelId);
  const fileName = `${safeModelId}.json`;
  const s3Key = path.join(LIVE_DIR, 'models', 'ndeltas', fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);
  const fileContent = JSON.stringify(data, null, 2);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/json',
      });
      await s3Client.send(command);
      console.log(`[StorageService] Model NDeltas saved to S3: ${s3Key}`);
    } catch (error) {
      console.error(`[StorageService] Error saving model NDeltas to S3: ${s3Key}`, error);
      throw error;
    }
  } else if (storageProvider === 'local') {
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, fileContent, 'utf-8');
      console.log(`[StorageService] Model NDeltas saved to local disk: ${localPath}`);
    } catch (error) {
      console.error(`[StorageService] Error saving model NDeltas to local disk: ${localPath}`, error);
      throw error;
    }
  } else {
    console.warn(`[StorageService] No valid storage provider configured for saveModelNDeltas. Data not saved.`);
  }
}

export async function getModelNDeltas(modelId: string): Promise<ModelNDeltasFileContent | null> {
  const safeModelId = getSafeModelId(modelId);
  const fileName = `${safeModelId}.json`;
  const s3Key = path.join(LIVE_DIR, 'models', 'ndeltas', fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);
  let fileContent: string | null = null;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key });
      const { Body } = await s3Client.send(command);
      if (Body) {
        fileContent = await streamToString(Body as Readable);
      }
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return null;
      }
      console.error(`[StorageService] Error fetching model NDeltas from S3: ${s3Key}`, error);
      return null;
    }
  } else if (storageProvider === 'local') {
    try {
      if (fsSync.existsSync(localPath)) {
        fileContent = await fs.readFile(localPath, 'utf-8');
      } else {
        return null;
      }
    } catch (error) {
      console.error(`[StorageService] Error fetching model NDeltas from local disk: ${localPath}`, error);
      return null;
    }
  }

  if (!fileContent) return null;
  try {
    return JSON.parse(fileContent) as ModelNDeltasFileContent;
  } catch (error) {
    console.error(`[StorageService] Error parsing model NDeltas for ${modelId}:`, error);
    return null;
  }
}

export async function listModelNDeltas(): Promise<string[]> {
  const s3Prefix = path.join(LIVE_DIR, 'models', 'ndeltas', '');
  const localPath = path.join(RESULTS_DIR, s3Prefix);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: s3BucketName,
        Prefix: s3Prefix,
      });
      const response = await s3Client.send(command);
      const files = response.Contents?.map(obj => path.basename(obj.Key || ''))
        .filter(name => name.endsWith('.json'))
        .map(name => name.replace(/\.json$/, '')) || [];
      console.log(`[StorageService] Listed ${files.length} NDeltas files from S3.`);
      return files;
    } catch (error) {
      console.error('[StorageService] Error listing NDeltas from S3:', error);
      return [];
    }
  } else if (storageProvider === 'local') {
    try {
      const entries = await fs.readdir(localPath, { withFileTypes: true });
      const files = entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => entry.name.replace(/\.json$/, ''));
      console.log(`[StorageService] Listed ${files.length} NDeltas locally.`);
      return files;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      console.error('[StorageService] Error listing NDeltas locally:', error);
      return [];
    }
  }
  console.warn('[StorageService] No valid storage provider configured. Cannot list model NDeltas.');
  return [];
}

const NDELTAS_INDEX_KEY = path.join(LIVE_DIR, 'models', 'ndeltas', 'manifest.json');

export async function saveNDeltasIndex(index: NDeltasIndexContent): Promise<void> {
  const localPath = path.join(RESULTS_DIR, NDELTAS_INDEX_KEY);
  const fileContent = JSON.stringify(index, null, 2);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({
      Bucket: s3BucketName,
      Key: NDELTAS_INDEX_KEY,
      Body: fileContent,
      ContentType: 'application/json',
    }));
    console.log(`[StorageService] NDeltas index saved to S3: ${NDELTAS_INDEX_KEY}`);
  } else if (storageProvider === 'local') {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, fileContent, 'utf-8');
    console.log(`[StorageService] NDeltas index saved locally: ${localPath}`);
  } else {
    console.warn('[StorageService] No valid storage provider for saveNDeltasIndex.');
  }
}

export async function getNDeltasIndex(): Promise<NDeltasIndexContent | null> {
  const localPath = path.join(RESULTS_DIR, NDELTAS_INDEX_KEY);
  let fileContent: string | null = null;
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: NDELTAS_INDEX_KEY }));
      if (Body) fileContent = await streamToString(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error('[StorageService] Error fetching NDeltas index from S3:', err);
      return null;
    }
  } else if (storageProvider === 'local') {
    try {
      if (fsSync.existsSync(localPath)) fileContent = await fs.readFile(localPath, 'utf-8'); else return null;
    } catch (err) {
      console.error('[StorageService] Error fetching NDeltas index locally:', err);
      return null;
    }
  }
  if (!fileContent) return null;
  try {
    return JSON.parse(fileContent) as NDeltasIndexContent;
  } catch (err) {
    console.error('[StorageService] Error parsing NDeltas index:', err);
    return null;
  }
}

// --- Vibes Index Storage Functions ---
const VIBES_INDEX_KEY = path.join(LIVE_DIR, 'models', 'vibes', 'index.json');

export async function saveVibesIndex(index: VibesIndexContent): Promise<void> {
  const localPath = path.join(RESULTS_DIR, VIBES_INDEX_KEY);
  const fileContent = JSON.stringify(index, null, 2);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({
      Bucket: s3BucketName,
      Key: VIBES_INDEX_KEY,
      Body: fileContent,
      ContentType: 'application/json',
    }));
    console.log(`[StorageService] Vibes index saved to S3: ${VIBES_INDEX_KEY}`);
  } else if (storageProvider === 'local') {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, fileContent, 'utf-8');
    console.log(`[StorageService] Vibes index saved locally: ${localPath}`);
  } else {
    console.warn('[StorageService] No valid storage provider for saveVibesIndex.');
  }
}

export async function getVibesIndex(): Promise<VibesIndexContent | null> {
  const localPath = path.join(RESULTS_DIR, VIBES_INDEX_KEY);
  let fileContent: string | null = null;
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: VIBES_INDEX_KEY }));
      if (Body) fileContent = await streamToString(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error('[StorageService] Error fetching Vibes index from S3:', err);
      return null;
    }
  } else if (storageProvider === 'local') {
    try {
      if (fsSync.existsSync(localPath)) fileContent = await fs.readFile(localPath, 'utf-8'); else return null;
    } catch (err) {
      console.error('[StorageService] Error fetching Vibes index locally:', err);
      return null;
    }
  }
  if (!fileContent) return null;
  try {
    return JSON.parse(fileContent) as VibesIndexContent;
  } catch (err) {
    console.error('[StorageService] Error parsing Vibes index:', err);
    return null;
  }
}

// --- Macro Canvas Artefacts (index, mappings, tiles) ---
// Minimal storage context for modules that need direct access to primitives (e.g., macro storage helpers)
export function getStorageContext() {
  return {
    storageProvider,
    s3Client,
    s3BucketName,
    RESULTS_DIR,
    streamToString,
    streamToBuffer,
  } as const;
}

export * from '@/lib/storage/macro';
const COMPASS_INDEX_KEY = path.join(LIVE_DIR, 'models', 'compass', 'index.json');

export async function saveCompassIndex(content: CompassIndexContent): Promise<void> {
  const localPath = path.join(RESULTS_DIR, COMPASS_INDEX_KEY);
  const fileContent = JSON.stringify(content, null, 2);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({
      Bucket: s3BucketName,
      Key: COMPASS_INDEX_KEY,
      Body: fileContent,
      ContentType: 'application/json',
    }));
    console.log(`[StorageService] Compass index saved to S3: ${COMPASS_INDEX_KEY}`);
  } else if (storageProvider === 'local') {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, fileContent, 'utf-8');
    console.log(`[StorageService] Compass index saved locally: ${localPath}`);
  } else {
    console.warn('[StorageService] No valid storage provider for saveCompassIndex.');
  }
}

export async function getCompassIndex(): Promise<CompassIndexContent | null> {
  const localPath = path.join(RESULTS_DIR, COMPASS_INDEX_KEY);
  let fileContent: string | null = null;
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: COMPASS_INDEX_KEY }));
      if (Body) fileContent = await streamToString(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error('[StorageService] Error fetching Compass index from S3:', err);
      return null;
    }
  } else if (storageProvider === 'local') {
    try {
      if (fsSync.existsSync(localPath)) fileContent = await fs.readFile(localPath, 'utf-8'); else return null;
    } catch (err) {
      console.error('[StorageService] Error fetching Compass index locally:', err);
      return null;
    }
  }
  if (!fileContent) return null;
  try {
    return JSON.parse(fileContent) as CompassIndexContent;
  } catch (err) {
    console.error('[StorageService] Error parsing Compass index:', err);
    return null;
  }
}

// --- Model Card Storage Functions ---

export async function saveModelCard(modelId: string, cardData: any): Promise<void> {
  const safeModelId = getSafeModelId(modelId);
  const fileName = `${safeModelId}.json`;
  const s3Key = path.join(LIVE_DIR, 'models', 'cards', fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);
  const fileContent = JSON.stringify(cardData, null, 2);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
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
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, fileContent, 'utf-8');
      console.log(`[StorageService] Model card saved to local disk: ${localPath}`);
    } catch (error) {
      console.error(`[StorageService] Error saving model card to local disk: ${localPath}`, error);
      throw error;
    }
  } else {
    console.warn(`[StorageService] No valid storage provider configured for saveModelCard. Data not saved.`);
  }
}

export async function getModelCard(modelId: string): Promise<any | null> {
  const safeModelId = getSafeModelId(modelId);
  const fileName = `${safeModelId}.json`;
  const s3Key = path.join(LIVE_DIR, 'models', 'cards', fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);
  let fileContent: string | null = null;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
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
    try {
      if (fsSync.existsSync(localPath)) {
        fileContent = await fs.readFile(localPath, 'utf-8');
      } else {
        console.log(`[StorageService] Model card not found locally: ${localPath}`);
        return null;
      }
    } catch (error) {
      console.error(`[StorageService] Error fetching model card from local disk: ${localPath}`, error);
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
  const s3Prefix = path.join(LIVE_DIR, 'models', 'cards', '');
  const localPath = path.join(RESULTS_DIR, s3Prefix);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: s3BucketName,
        Prefix: s3Prefix,
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
    try {
      const entries = await fs.readdir(localPath, { withFileTypes: true });
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

/**
 * Builds a mapping from individual model IDs to their corresponding model card patterns.
 * This enables linking from leaderboard entries to model cards even when the naming doesn't exactly match.
 * Maps base model IDs (without temp/sp_idx suffixes) to card patterns.
 * When multiple cards contain the same model variant, prefers the most recently generated card.
 */
export async function buildModelCardMappings(): Promise<Record<string, string>> {
  const mappings: Record<string, string> = {};
  const cardTimestamps: Record<string, string> = {}; // Track lastUpdated for each mapping
  
  try {
    const cardPatterns = await listModelCards();
    
    for (const cardPattern of cardPatterns) {
      try {
        const modelCard = await getModelCard(cardPattern);
        if (modelCard?.discoveredModelIds && modelCard?.lastUpdated) {
          // Map each discovered model variant to this card pattern
          for (const modelId of modelCard.discoveredModelIds) {
            // Normalize to canonical base model ID used by leaderboards (provider-normalized, suffix-stripped)
            // This ensures exact matches against leaderboard model IDs (which are baseIds)
            const { parseModelIdForDisplay } = await import('@/app/utils/modelIdUtils');
            const baseModelId = parseModelIdForDisplay(modelId).baseId;
            
            // Check if we already have a mapping for this base model ID
            if (mappings[baseModelId]) {
              const existingTimestamp = cardTimestamps[baseModelId];
              const currentTimestamp = modelCard.lastUpdated;
              
              // Only override if this card is newer
              if (new Date(currentTimestamp) > new Date(existingTimestamp)) {
                mappings[baseModelId] = cardPattern;
                cardTimestamps[baseModelId] = currentTimestamp;
              }
            } else {
              // First mapping for this base model ID
              mappings[baseModelId] = cardPattern;
              cardTimestamps[baseModelId] = modelCard.lastUpdated;
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to load model card for pattern "${cardPattern}": ${error}`);
      }
    }
  } catch (error) {
    console.warn(`Failed to build model card mappings: ${error}`);
  }
  
  return mappings;
}

export async function saveSearchIndex(index: SearchableBlueprintSummary[]): Promise<number> {
    const filePath = 'search-index.json';
    const s3Key = path.join(LIVE_DIR, 'aggregates', filePath);
    const localFilePath = path.join(RESULTS_DIR, s3Key);
    const fileContent = JSON.stringify(index, null, 2);
    const fileSizeInBytes = Buffer.byteLength(fileContent, 'utf8');

    if (storageProvider === 's3') {
        if (!s3Client || !s3BucketName) {
            throw new Error('S3 client or bucket name is not configured.');
        }
        await s3Client.send(new PutObjectCommand({
            Bucket: s3BucketName,
            Key: s3Key,
            Body: fileContent,
            ContentType: 'application/json',
        }));
        console.log(`[StorageService] Search index saved to S3: ${s3Key}`);
    } else {
        // For local, save it to the root of the .results directory
        await fs.mkdir(path.dirname(localFilePath), { recursive: true });
        await fs.writeFile(localFilePath, fileContent);
        console.log(`[StorageService] Search index saved locally: ${localFilePath}`);
    }
    return fileSizeInBytes;
}

export async function getSearchIndex(): Promise<SearchableBlueprintSummary[] | null> {
    const filePath = 'search-index.json';
    const s3Key = path.join(LIVE_DIR, 'aggregates', filePath);
    const localFilePath = path.join(RESULTS_DIR, s3Key);
    try {
        if (storageProvider === 's3') {
            if (!s3Client || !s3BucketName) throw new Error('S3 client or bucket name not configured.');
            const command = new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key });
            const { Body } = await s3Client.send(command);
            if (!Body) return null;
            const bodyString = await streamToString(Body as Readable);
            return JSON.parse(bodyString);
        } else {
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

export async function listBackups(): Promise<string[]> {
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: s3BucketName,
        Prefix: `${BACKUPS_DIR}/`,
        Delimiter: '/',
      });
      const response = await s3Client.send(command);
      const backupNames = response.CommonPrefixes?.map(p => p.Prefix?.replace(`${BACKUPS_DIR}/`, '').replace('/', '')).filter(Boolean) as string[] || [];
      console.log(`[StorageService] Listed backups from S3: ${backupNames.join(', ')}`);
      return backupNames;
    } catch (error) {
      console.error('[StorageService] Error listing backups from S3:', error);
      return [];
    }
  } else if (storageProvider === 'local') {
    const localBackupsDir = path.join(process.cwd(), RESULTS_DIR, BACKUPS_DIR);
    try {
      const entries = await fs.readdir(localBackupsDir, { withFileTypes: true });
      const backupNames = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
      console.log(`[StorageService] Listed backups locally: ${backupNames.join(', ')}`);
      return backupNames;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`[StorageService] Local backups directory not found: ${localBackupsDir}`);
        return [];
      }
      console.error('[StorageService] Error listing backups locally:', error);
      return [];
    }
  }
  console.warn('[StorageService] No valid storage provider configured. Cannot list backups.');
  return [];
} 

interface BackupResult {
    backupName: string;
    fileCount: number;
    totalSize: number;
}

// Private helper to list all live objects/files across different locations
async function _listAllLiveObjectKeys(logger: ReturnType<typeof getConfig>['logger']): Promise<string[]> {
    const allKeys: string[] = [];
    const baseDir = storageProvider === 'local' ? path.join(process.cwd(), RESULTS_DIR) : '';

    if (storageProvider === 's3' && s3Client && s3BucketName) {
        const prefixesToScan = [`${MULTI_DIR}/`, `${SANDBOX_DIR}/`];
        
        logger.info(`[Migration Debug] Scanning S3 bucket '${s3BucketName}' for live objects...`);

        for (const prefix of prefixesToScan) {
            let continuationToken: string | undefined = undefined;
            let foundCount = 0;
            do {
                const listCommand = new ListObjectsV2Command({
                    Bucket: s3BucketName,
                    Prefix: prefix,
                    ContinuationToken: continuationToken,
                });
                const response: ListObjectsV2CommandOutput = await s3Client.send(listCommand);
                if (response.Contents) {
                    const keys = response.Contents.map(obj => obj.Key).filter(Boolean) as string[];
                    allKeys.push(...keys);
                    foundCount += keys.length;
                }
                continuationToken = response.NextContinuationToken;
            } while (continuationToken);
            logger.info(`[Migration Debug] ...found ${foundCount} objects with prefix '${prefix}'.`);
        }
         // Add root files that exist
        for (const rootFile of [HOMEPAGE_SUMMARY_FILENAME, SEARCH_INDEX_FILENAME]) {
            try {
                if (!s3Client) throw new Error("S3 client not initialized");
                await s3Client.send(new HeadObjectCommand({ Bucket: s3BucketName, Key: rootFile }));
                allKeys.push(rootFile);
                logger.info(`[Migration Debug] ...found root object '${rootFile}'.`);
            } catch (err: any) {
                if (err.name === 'NotFound') {
                    logger.warn(`[Migration Debug] Root object '${rootFile}' not found, skipping.`);
                } else {
                    throw err;
                }
            }
        }
    } else if (storageProvider === 'local') {
        const dirsToScan = [MULTI_DIR, SANDBOX_DIR];

        for (const dir of dirsToScan) {
            const fullPath = path.join(baseDir, dir);
            try {
                const entries = await fs.readdir(fullPath, { recursive: true, withFileTypes: true });
                for (const entry of entries) {
                    const relativePath = path.relative(baseDir, path.join(fullPath, entry.name));
                    if (entry.isFile()) {
                        allKeys.push(relativePath.replace(/\\/g, '/')); // Use forward slashes
                    }
                }
            } catch (err: any) {
                if (err.code !== 'ENOENT') throw err;
            }
        }
         // Add root files that exist
        for (const rootFile of [HOMEPAGE_SUMMARY_FILENAME, SEARCH_INDEX_FILENAME]) {
            try {
                await fs.access(path.join(baseDir, rootFile));
                allKeys.push(rootFile);
            } catch (err) {
                // File doesn't exist, which is fine.
            }
        }
    }
    return allKeys;
}

export async function backupData(backupName: string, dryRun: boolean, logger: ReturnType<typeof getConfig>['logger']): Promise<BackupResult> {
    logger.info(`Listing all live files for backup...`);

    const liveKeys = await _listAllLiveObjectKeys(logger);
    let totalSize = 0; // Will be calculated for local, TBD for S3

    if (dryRun) {
        logger.info(`[DRY RUN] Would back up ${liveKeys.length} files to backup location '${backupName}'.`);
        liveKeys.slice(0, 10).forEach(key => logger.info(`  - (sample) ${key}`));
        if (liveKeys.length > 10) logger.info(`  ...and ${liveKeys.length - 10} more.`);
        return { backupName, fileCount: liveKeys.length, totalSize: 0 };
    }
    
    // Create manifest content
    const manifest = {
        backupName: backupName,
        createdAt: new Date().toISOString(),
        fileCount: liveKeys.length,
        files: liveKeys,
    };
    const manifestContent = JSON.stringify(manifest, null, 2);

    if (storageProvider === 's3' && s3Client && s3BucketName) {
        const s3BackupPrefix = `${BACKUPS_DIR}/${backupName}/`;
        
        logger.info(`Copying ${liveKeys.length} objects to S3 prefix: ${s3BackupPrefix}`);
        const limit = pLimit(20); // Limit concurrency
        const copyPromises = liveKeys.map(key => limit(async () => {
            try {
                const copySource = `${s3BucketName}/${LIVE_DIR}/${key}`;
                const destKey = `${s3BackupPrefix}${key}`;
                const command = new CopyObjectCommand({
                    Bucket: s3BucketName,
                    CopySource: copySource,
                    Key: destKey,
                });
                await s3Client.send(command);
                return key; // Return the key on success
            } catch (error: any) {
                 logger.error(`Failed to copy S3 object ${key}: ${error.message}`);
                 return null; // Return null on failure
            }
        }));
        
        const results = await Promise.all(copyPromises);
        const copiedKeys = results.filter(Boolean) as string[];

        // Create manifest content from successfully copied keys
        const manifest = {
            backupName: backupName,
            createdAt: new Date().toISOString(),
            fileCount: copiedKeys.length,
            files: copiedKeys,
        };
        const manifestContent = JSON.stringify(manifest, null, 2);

        // Save manifest
        const manifestKey = `${s3BackupPrefix}${MANIFEST_FILENAME}`;
        await s3Client.send(new PutObjectCommand({
            Bucket: s3BucketName,
            Key: manifestKey,
            Body: manifestContent,
            ContentType: 'application/json',
        }));

        logger.info(`Successfully copied ${copiedKeys.length} files to S3.`);
    } else if (storageProvider === 'local') {
        const sourceBaseDir = path.join(process.cwd(), RESULTS_DIR, LIVE_DIR);
        const backupBaseDir = path.join(process.cwd(), RESULTS_DIR, BACKUPS_DIR, backupName);
        await fs.mkdir(backupBaseDir, { recursive: true });

        const copiedFiles: string[] = [];
        for (const relativeKey of liveKeys) {
            const sourcePath = path.join(sourceBaseDir, relativeKey);
            const destPath = path.join(backupBaseDir, relativeKey);
            try {
                await fs.mkdir(path.dirname(destPath), { recursive: true });
                await fs.copyFile(sourcePath, destPath);
                const stats = await fs.stat(sourcePath);
                totalSize += stats.size;
                copiedFiles.push(relativeKey); // Add to list only on success
            } catch (err: any) {
                if (err.code !== 'ENOENT') {
                     logger.error(`Could not copy ${sourcePath}: ${err.message}`);
                }
            }
        }
        
        // Create manifest from successfully copied files
        const manifest = {
            backupName: backupName,
            createdAt: new Date().toISOString(),
            fileCount: copiedFiles.length,
            files: copiedFiles,
        };
        const manifestContent = JSON.stringify(manifest, null, 2);

        // Save manifest
        await fs.writeFile(path.join(backupBaseDir, MANIFEST_FILENAME), manifestContent, 'utf-8');
    }
    
    return { backupName, fileCount: manifest.fileCount, totalSize };
} 

async function _deleteAllLiveObjectKeys(liveKeys: string[], logger: ReturnType<typeof getConfig>['logger']): Promise<void> {
    if (storageProvider === 's3' && s3Client && s3BucketName) {
        if (liveKeys.length === 0) return;
        // Map relative keys to full paths inside live/
        const fullKeys = liveKeys.map(key => `${LIVE_DIR}/${key}`);
        logger.info(`Deleting ${liveKeys.length} live objects from S3...`);
        const success = await deleteS3Objects(fullKeys);
        if (!success) {
            throw new Error('Failed to delete one or more live objects from S3. Aborting restore.');
        }
    } else if (storageProvider === 'local') {
        logger.info(`Deleting ${liveKeys.length} live files from local filesystem...`);
        const baseDir = path.join(process.cwd(), RESULTS_DIR, LIVE_DIR);
        for (const key of liveKeys) {
            try {
                await fs.unlink(path.join(baseDir, key));
            } catch (err: any) {
                if (err.code !== 'ENOENT') { // It's okay if it's already gone
                    throw new Error(`Failed to delete local file ${key}: ${err.message}`);
                }
            }
        }
        // TODO: Clean up empty directories? For now, this is safer.
    }
}

interface BackupManifest {
    backupName: string;
    createdAt: string;
    fileCount: number;
    files: string[];
}

async function getBackupManifest(backupName: string): Promise<BackupManifest> {
    const manifestKey = `${BACKUPS_DIR}/${backupName}/${MANIFEST_FILENAME}`;
    let manifestContent: string | null = null;

    if (storageProvider === 's3' && s3Client && s3BucketName) {
        try {
            const command = new GetObjectCommand({ Bucket: s3BucketName, Key: manifestKey });
            const { Body } = await s3Client.send(command);
            if (Body) {
                manifestContent = await streamToString(Body as Readable);
            } else {
                throw new Error('Manifest file is empty.');
            }
        } catch (error: any) {
            if (error.name === 'NoSuchKey') {
                throw new Error(`Backup manifest not found for '${backupName}' at S3 key: ${manifestKey}`);
            }
            throw error;
        }
    } else if (storageProvider === 'local') {
        const localPath = path.join(process.cwd(), RESULTS_DIR, manifestKey);
        try {
            manifestContent = await fs.readFile(localPath, 'utf-8');
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new Error(`Backup manifest not found for '${backupName}' at local path: ${localPath}`);
            }
            throw err;
        }
    }

    if (!manifestContent) {
        throw new Error(`Could not read manifest for backup '${backupName}'.`);
    }

    return JSON.parse(manifestContent) as BackupManifest;
}

export async function restoreData(backupName: string, dryRun: boolean, logger: ReturnType<typeof getConfig>['logger']): Promise<void> {
    
    // 1. Get the manifest for the backup we are restoring FROM
    logger.info(`Fetching manifest for backup '${backupName}'...`);
    const manifest = await getBackupManifest(backupName);
    logger.info(`Manifest loaded. Backup was created on ${manifest.createdAt} and contains ${manifest.fileCount} files.`);
    
    // 2. List current live files
    const liveKeys = await _listAllLiveObjectKeys(logger);

    if (dryRun) {
        logger.info(`[DRY RUN] Would delete ${liveKeys.length} current live files.`);
        logger.info(`[DRY RUN] Would restore ${manifest.fileCount} files from backup '${backupName}'.`);
        manifest.files.slice(0, 10).forEach(key => logger.info(`  - (sample) ${key}`));
        if (manifest.files.length > 10) logger.info(`  ...and ${manifest.files.length - 10} more.`);
        return;
    }

    // 3. Perform pre-restore backup as a safety net
    const autoBackupName = `${AUTOBACKUP_PREFIX}${toSafeTimestamp(new Date().toISOString())}`;
    logger.info(`Creating pre-restore backup of current state named '${autoBackupName}'...`);
    try {
        await backupData(autoBackupName, false, logger);
        logger.success(`Successfully created pre-restore backup.`);
    } catch(err: any) {
        logger.error(`Failed to create pre-restore backup. Aborting restore. Your data has not been touched. Error: ${err.message}`);
        return;
    }

    // 4. Delete all current live objects
    await _deleteAllLiveObjectKeys(liveKeys, logger);

    // 5. Restore from backup
    logger.info(`Restoring ${manifest.fileCount} files from backup '${backupName}'...`);
    if (storageProvider === 's3' && s3Client && s3BucketName) {
        const s3BackupPrefix = `${BACKUPS_DIR}/${backupName}/`;
        const limit = pLimit(20);
        const copyPromises = manifest.files.map(key => limit(async () => {
            const copySource = `${s3BucketName}/${s3BackupPrefix}${key}`;
            const destKey = `${LIVE_DIR}/${key}`; // Copy to the live location
            const command = new CopyObjectCommand({
                Bucket: s3BucketName,
                CopySource: copySource,
                Key: destKey,
            });
            await s3Client.send(command);
        }));
        await Promise.all(copyPromises);
    } else if (storageProvider === 'local') {
        const sourceBaseDir = path.join(process.cwd(), RESULTS_DIR, BACKUPS_DIR, backupName);
        const destBaseDir = path.join(process.cwd(), RESULTS_DIR, LIVE_DIR);
        for (const relativeKey of manifest.files) {
            const sourcePath = path.join(sourceBaseDir, relativeKey);
            const destPath = path.join(destBaseDir, relativeKey);
            await fs.mkdir(path.dirname(destPath), { recursive: true });
            await fs.copyFile(sourcePath, destPath);
        }
    }
} 

function getNewKeyFromOldKey(oldKey: string): string {
    const basename = path.basename(oldKey);

    // This function now returns paths relative to the new `live/` directory.
    // The `live/` prefix itself is added by the calling function.

    // 1. Handle root-level aggregate files
    if (oldKey === HOMEPAGE_SUMMARY_FILENAME || oldKey === SEARCH_INDEX_FILENAME) {
        return path.join('aggregates', basename);
    }
    
    // 2. Handle aggregate files that were inside `multi/`
    if (oldKey === LATEST_RUNS_SUMMARY_KEY) {
        return path.join('aggregates', path.basename(LATEST_RUNS_SUMMARY_KEY));
    }

    // 3. Handle model summaries and cards
    if (oldKey.startsWith(`${MULTI_DIR}/${MODEL_DIR}/`)) {
        const modelId = oldKey.substring(`${MULTI_DIR}/${MODEL_DIR}/`.length);
        return path.join('models', 'summaries', modelId);
    }
    if (oldKey.startsWith(`${MULTI_DIR}/${MODEL_CARDS_DIR}/`)) {
        const cardId = oldKey.substring(`${MULTI_DIR}/${MODEL_CARDS_DIR}/`.length);
        return path.join('models', 'cards', cardId);
    }
    
    // 4. Handle blueprints (the remainder of the `multi/` directory)
    if (oldKey.startsWith(`${MULTI_DIR}/`)) {
        const blueprintPath = oldKey.substring(`${MULTI_DIR}/`.length);
        return path.join('blueprints', blueprintPath);
    }

    // 5. Handle the sandbox directory
    if (oldKey.startsWith(`${SANDBOX_DIR}/`)) {
        // The structure inside live/sandbox is the same as the old sandbox/
        return oldKey;
    }

    // This should not be reached with the current file structure.
    return oldKey; 
}

export async function migrateDataToNewLayout(dryRun: boolean, logger: ReturnType<typeof getConfig>['logger']): Promise<{ fileCount: number }> {
    logger.info('Starting data migration to new layout...');
    
    const oldKeys = await _listAllLiveObjectKeys(logger);
    
    if (dryRun) {
        logger.info(`[DRY RUN] Found ${oldKeys.length} files to migrate to the new 'live/' directory structure.`);
        const samples = oldKeys.slice(0, 10);
        for (const oldKey of samples) {
            const newRelativeKey = getNewKeyFromOldKey(oldKey);
            const newKey = path.join(LIVE_DIR, newRelativeKey).replace(/\\/g, '/');
            logger.info(`  - (sample) ${oldKey} -> ${newKey}`);
        }
        if (oldKeys.length > 10) logger.info(`  ...and ${oldKeys.length - 10} more.`);
        return { fileCount: oldKeys.length };
    }

    if (storageProvider === 's3' && s3Client && s3BucketName) {
        logger.info(`Copying ${oldKeys.length} S3 objects to new 'live/' structure...`);
        const limit = pLimit(20);
        const copyPromises = oldKeys.map(oldKey => limit(async () => {
            try {
                const newRelativeKey = getNewKeyFromOldKey(oldKey);
                const newKey = path.join(LIVE_DIR, newRelativeKey).replace(/\\/g, '/');
                const copySource = `${s3BucketName}/${oldKey}`;
                const command = new CopyObjectCommand({
                    Bucket: s3BucketName,
                    CopySource: copySource,
                    Key: newKey,
                });
                await s3Client.send(command);
            } catch (error: any) {
                logger.error(`Failed to copy S3 object ${oldKey}: ${error.message}`);
            }
        }));
        await Promise.all(copyPromises);
    } else if (storageProvider === 'local') {
        logger.info(`Copying ${oldKeys.length} local files to new 'live/' structure...`);
        const sourceBaseDir = path.join(process.cwd(), RESULTS_DIR);
        const destBaseDir = path.join(process.cwd(), RESULTS_DIR, LIVE_DIR);

        for (const oldKey of oldKeys) {
            try {
                const newRelativeKey = getNewKeyFromOldKey(oldKey);
                const sourcePath = path.join(sourceBaseDir, oldKey);
                const destPath = path.join(destBaseDir, newRelativeKey);
                await fs.mkdir(path.dirname(destPath), { recursive: true });
                await fs.copyFile(sourcePath, destPath);
            } catch (err: any) {
                 logger.error(`Could not copy ${oldKey}: ${err.message}`);
            }
        }
    }
    
    logger.success('Data migration copy process complete.');
    return { fileCount: oldKeys.length };
}

export async function saveAllBlueprintsSummary(summaryData: Omit<HomepageSummaryFileContent, 'headlineStats' | 'driftDetectionResult'>): Promise<void> {
  const fileName = 'all_blueprints_summary.json';
  const s3Key = path.join(LIVE_DIR, 'aggregates', fileName);
  const localPath = path.join(RESULTS_DIR, s3Key);

  const fileContent = JSON.stringify(summaryData, null, 2);
  const fileSizeInKB = (Buffer.byteLength(fileContent, 'utf8') / 1024).toFixed(2);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const command = new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/json',
      });
      await s3Client.send(command);
      console.log(`[StorageService] All blueprints summary saved to S3: ${s3Key} (${fileSizeInKB} KB)`);
    } catch (error) {
      console.error(`[StorageService] Error saving all blueprints summary to S3: ${s3Key}`, error);
      throw error;
    }
  } else if (storageProvider === 'local') {
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, fileContent, 'utf-8');
      console.log(`[StorageService] All blueprints summary saved to local disk: ${localPath} (${fileSizeInKB} KB)`);
    } catch (error) {
      console.error(`[StorageService] Error saving all blueprints summary to local disk: ${localPath}`, error);
      throw error;
    }
  } else {
    console.warn(`[StorageService] No valid storage provider configured for saveAllBlueprintsSummary. Data not saved.`);
  }
}

export async function getAllBlueprintsSummary(): Promise<Omit<HomepageSummaryFileContent, 'headlineStats' | 'driftDetectionResult'> | null> {
    const fileName = 'all_blueprints_summary.json';
    const s3Key = path.join(LIVE_DIR, 'aggregates', fileName);
    const localPath = path.join(RESULTS_DIR, s3Key);
    let fileContent: string | null = null;
  
    if (storageProvider === 's3' && s3Client && s3BucketName) {
      try {
        const command = new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key });
        const { Body } = await s3Client.send(command);
        if (Body) {
          fileContent = await streamToString(Body as Readable);
        }
      } catch (error: any) {
        if (error.name === 'NoSuchKey') {
          return null; // File not found is a valid state
        }
        console.error(`[StorageService] Error fetching all blueprints summary from S3: ${s3Key}`, error);
        return null;
      }
    } else if (storageProvider === 'local') {
      try {
        if (fsSync.existsSync(localPath)) {
          fileContent = await fs.readFile(localPath, 'utf-8');
        } else {
          return null;
        }
      } catch (error) {
        console.error(`[StorageService] Error fetching all blueprints summary from local disk: ${fileName}`, error);
        return null;
      }
    }
  
    if (!fileContent) {
      return null;
    }
  
    try {
      // The structure is the same as HomepageSummary but without stats, so we can parse it directly.
      // The runs array will be empty in all configs, so no Map rehydration is needed.
      return JSON.parse(fileContent);
    } catch (error) {
      console.error(`[StorageService] Error parsing all blueprints summary content for ${fileName}:`, error);
      return null;
    }
}

/**
 * Clears the local cache for a specific result file.
 * Should be called after updating a file to ensure subsequent reads get fresh data.
 * @param configId The configuration ID.
 * @param fileName The filename to clear from cache.
 */
export async function clearResultCache(configId: string, fileName: string): Promise<void> {
  const cachePath = path.join(CACHE_DIR, configId, fileName);
  try {
    if (fsSync.existsSync(cachePath)) {
      await fs.unlink(cachePath);
      console.log(`[StorageService] Cleared cache for ${fileName}`);
    }
  } catch (err) {
    console.warn(`[StorageService] Failed to clear cache for ${fileName}:`, err);
  }
}

export async function savePainPointsSummary(
  summary: PainPointsSummary,
): Promise<void> {
  const filePath = 'live/summaries/pain_points.json';
  const localPath = path.join(RESULTS_DIR, filePath);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: s3BucketName,
          Key: filePath,
          Body: JSON.stringify(summary, null, 2),
          ContentType: 'application/json',
        }),
      );
      console.log(`[StorageService] Pain Points summary saved to S3: ${filePath}`);
    } catch (err) {
      console.error(
        `[StorageService] Error saving Pain Points summary to S3:`,
        err,
      );
    }
  } else if (storageProvider === 'local') {
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, JSON.stringify(summary, null, 2), 'utf-8');
      console.log(`[StorageService] Pain Points summary saved locally to ${localPath}`);
    } catch (err) {
      console.error(
        `[StorageService] Error saving Pain Points summary locally:`,
        err,
      );
    }
  } else {
    console.warn(
      '[StorageService] No valid storage provider for savePainPointsSummary.',
    );
  }
}

export async function getPainPointsSummary(): Promise<PainPointsSummary | null> {
  const filePath = 'live/summaries/pain_points.json';
  const localPath = path.join(RESULTS_DIR, filePath);
  let fileContent: string | null = null;

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(
        new GetObjectCommand({ Bucket: s3BucketName, Key: filePath }),
      );
      if (Body) fileContent = await streamToString(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error(
        '[StorageService] Error fetching Pain Points summary from S3:',
        err,
      );
      return null;
    }
  } else if (storageProvider === 'local') {
    try {
      if (fsSync.existsSync(localPath))
        fileContent = await fs.readFile(localPath, 'utf-8');
      else return null;
    } catch (err) {
      console.error(
        '[StorageService] Error fetching Pain Points summary locally:',
        err,
      );
      return null;
    }
  }

  if (!fileContent) return null;
  try {
    return JSON.parse(fileContent) as PainPointsSummary;
  } catch (err) {
    console.error('[StorageService] Error parsing Pain Points summary:', err);
    return null;
  }
}

// --- Redlines (Span Critique) Artefacts ---
export async function saveRedlinesAnnotation(ann: RedlinesAnnotation): Promise<void> {
  const runBase = `${ann.runLabel}_${ann.timestamp}`;
  const key = path.join(LIVE_DIR, 'painpoints', 'annotations', ann.configId, runBase, ann.promptId, `${getSafeModelId(ann.modelId)}.json`);
  const localPath = path.join(RESULTS_DIR, key);
  const body = JSON.stringify(ann, null, 2);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({ Bucket: s3BucketName, Key: key, Body: body, ContentType: 'application/json' }));
  } else {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, body, 'utf-8');
  }


}





// --- Redlines single-feed (experimental, simple) ---
interface RedlinesFeedContent { items: RedlinesAnnotation[]; lastUpdated: string }
const REDLINES_FEED_KEY = path.join(LIVE_DIR, 'painpoints', 'redlines.json');

export async function getRedlinesFeed(): Promise<RedlinesFeedContent | null> {
  const localPath = path.join(RESULTS_DIR, REDLINES_FEED_KEY);
  let body: string | null = null;
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: REDLINES_FEED_KEY }));
      if (Body) body = await streamToString(Body as Readable);
    } catch (err: any) {
      if (err?.name === 'NoSuchKey') return null;
      console.error('[StorageService] Error fetching Redlines feed from S3:', err);
      return null;
    }
  } else {
    try {
      if (fsSync.existsSync(localPath)) body = await fs.readFile(localPath, 'utf-8'); else return null;
    } catch (err) {
      console.error('[StorageService] Error fetching Redlines feed locally:', err);
      return null;
    }
  }
  if (!body) return null;
  try { return JSON.parse(body) as RedlinesFeedContent } catch (e) { console.error('[StorageService] Error parsing Redlines feed:', e); return null; }
}

export async function saveRedlinesFeed(content: RedlinesFeedContent): Promise<void> {
  const localPath = path.join(RESULTS_DIR, REDLINES_FEED_KEY);
  const body = JSON.stringify(content, null, 2);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({ Bucket: s3BucketName, Key: REDLINES_FEED_KEY, Body: body, ContentType: 'application/json' }));
  } else {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, body, 'utf-8');
  }
}

export async function saveConfigRedlinesFeed(configId: string, content: RedlinesFeedContent): Promise<void> {
  const configRedlinesKey = path.join(LIVE_DIR, 'painpoints', 'configs', configId, 'redlines.json');
  const localPath = path.join(RESULTS_DIR, configRedlinesKey);
  const body = JSON.stringify(content, null, 2);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({ Bucket: s3BucketName, Key: configRedlinesKey, Body: body, ContentType: 'application/json' }));
  } else {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, body, 'utf-8');
  }
}

export async function getConfigRedlinesFeed(configId: string): Promise<RedlinesFeedContent | null> {
  const configRedlinesKey = path.join(LIVE_DIR, 'painpoints', 'configs', configId, 'redlines.json');
  const localPath = path.join(RESULTS_DIR, configRedlinesKey);
  let body: string | null = null;
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: configRedlinesKey }));
      if (Body) body = await streamToString(Body as Readable);
    } catch (err: any) {
      if (err?.name === 'NoSuchKey') return null;
      console.error('[StorageService] Error fetching config Redlines feed from S3:', err);
      return null;
    }
  } else {
    try {
      if (fsSync.existsSync(localPath)) body = await fs.readFile(localPath, 'utf-8'); else return null;
    } catch (err) {
      console.error('[StorageService] Error fetching config Redlines feed locally:', err);
      return null;
    }
  }
  if (!body) return null;
  try { return JSON.parse(body) as RedlinesFeedContent } catch (e) { console.error('[StorageService] Error parsing config Redlines feed:', e); return null; }
}

export async function appendRedlinesFeed(entry: RedlinesAnnotation, maxItems: number = 10000): Promise<void> {
  const current = (await getRedlinesFeed()) || { items: [], lastUpdated: new Date().toISOString() };
  const key = `${entry.configId}|${entry.runLabel}|${entry.timestamp}|${entry.promptId}|${entry.modelId}|${entry.responseHash}`;
  const seen = new Set(current.items.map(i => `${i.configId}|${i.runLabel}|${i.timestamp}|${i.promptId}|${i.modelId}|${i.responseHash}`));
  if (!seen.has(key)) {
    current.items.unshift(entry);
    if (current.items.length > maxItems) current.items.length = maxItems;
  }
  current.lastUpdated = new Date().toISOString();
  await saveRedlinesFeed(current);
}

// --- Macro Canvas Artefacts (index, mappings, tiles) ---

export const MACRO_DIR = path.join(LIVE_DIR, 'macro');

/**
 * Saves an arbitrary JSON object to a specified path in the configured storage provider.
 * This is a generic utility for saving JSON files like status trackers.
 *
 * @param filePath The full path (including filename) where the JSON should be saved.
 * @param data The JSON-serializable object to save.
 */
export async function saveJsonFile(filePath: string, data: object): Promise<void> {
    // Use CLI logger if available; otherwise fall back to console in serverless contexts
    const logger = (() => {
        try { return getConfig().logger; } catch { return { info: console.log, error: console.error }; }
    })();
    const content = JSON.stringify(data, null, 2);
    const provider = getStorageProvider();

    if (provider === 's3') {
        const s3Client = getS3Client();
        const bucketName = getBucketName();
        try {
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: filePath,
                Body: content,
                ContentType: 'application/json',
            }));
            if (process.env.DEBUG) {
                logger.info(`[StorageService] Generic JSON file saved to S3: ${filePath}`);
            }
        } catch (error) {
            const message = (error as any)?.message ? String((error as any).message) : String(error);
            logger.error(`[StorageService] Error saving generic JSON file to S3 at ${filePath}: ${message}`);
            throw error;
        }
    } else {
        const localPath = path.join(RESULTS_DIR, filePath);
        try {
            await fs.mkdir(path.dirname(localPath), { recursive: true });
            await fs.writeFile(localPath, content);
            if (process.env.DEBUG) {
                logger.info(`[StorageService] Generic JSON file saved to local disk: ${localPath}`);
            }
        } catch (error) {
            const message = (error as any)?.message ? String((error as any).message) : String(error);
            logger.error(`[StorageService] Error saving generic JSON file to local disk at ${localPath}: ${message}`);
            throw error;
        }
    }
}

/**
 * Reads and parses a JSON file from the configured storage provider.
 * @param filePath The full path/key relative to the storage root (e.g. 'live/blueprints/..' or 'api-runs/...').
 * @returns Parsed JSON object or null if not found.
 */
export async function getJsonFile<T = any>(filePath: string): Promise<T | null> {
  if (getStorageProvider() === 's3') {
    try {
      const client = getS3Client();
      const bucket = getBucketName();
      const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: filePath }));
      if (!Body) return null;
      const text = await streamToString(Body as Readable);
      return JSON.parse(text) as T;
    } catch (err: any) {
      if (err?.name === 'NoSuchKey') return null;
      // Propagate other errors so callers can decide how to handle
      throw err;
    }
  } else {
    const localPath = path.join(RESULTS_DIR, filePath);
    try {
      const content = await fs.readFile(localPath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }
}