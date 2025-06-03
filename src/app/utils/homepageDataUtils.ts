import {
  getHomepageSummary,
  HomepageSummaryFileContent // Import the type from storageService
} from '@/lib/storageService'; 
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AggregateStatsData } from '@/app/components/AggregateStatsDisplay';
import { PotentialDriftInfo } from '@/app/components/ModelDriftIndicator';

const CACHE_FILE_PATH = path.join(os.tmpdir(), 'civiceval_homepage_cache.json');

const DEFAULT_CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
let homepageDevCacheDurationMs = DEFAULT_CACHE_DURATION_MS;
if (process.env.HOMEPAGE_DEV_CACHE_DURATION_MS) {
  const envVal = parseInt(process.env.HOMEPAGE_DEV_CACHE_DURATION_MS, 10);
  if (!isNaN(envVal) && envVal >= 0) {
    homepageDevCacheDurationMs = envVal;
    console.log(`[homepageDataUtils] Using HOMEPAGE_DEV_CACHE_DURATION_MS: ${homepageDevCacheDurationMs}ms`);
  } else {
    console.warn(`[homepageDataUtils] Invalid value for HOMEPAGE_DEV_CACHE_DURATION_MS: '${process.env.HOMEPAGE_DEV_CACHE_DURATION_MS}'. Using default: ${DEFAULT_CACHE_DURATION_MS}ms.`);
  }
} else {
  console.log(`[homepageDataUtils] HOMEPAGE_DEV_CACHE_DURATION_MS not set. Using default: ${DEFAULT_CACHE_DURATION_MS}ms.`);
}

export interface EnhancedRunInfo {
  runLabel: string; 
  timestamp: string; 
  fileName: string; 
  numPrompts?: number;
  numModels?: number;
  hybridScoreStats?: { average: number | null; stddev: number | null };
  perModelHybridScores?: Map<string, { average: number | null; stddev: number | null }>;
}

export interface EnhancedComparisonConfigInfo {
  configId: string;
  configTitle: string;
  id?: string;
  title?: string;
  description?: string;
  runs: EnhancedRunInfo[];
  latestRunTimestamp: string;
  overallAverageHybridScore?: number | null;
  hybridScoreStdDev?: number | null;
  tags?: string[];
}

// Helper to deserialize: Converts perModelHybridScores from object to Map if needed
function deserializeSummaryContent(summary: HomepageSummaryFileContent | null): HomepageSummaryFileContent | null {
  if (!summary || !summary.configs) return summary;
  return {
    ...summary,
    configs: summary.configs.map((config: EnhancedComparisonConfigInfo) => ({
      ...config,
      runs: config.runs.map((run: EnhancedRunInfo) => {
        if (run.perModelHybridScores && typeof run.perModelHybridScores === 'object' && !(run.perModelHybridScores instanceof Map)) {
          return {
            ...run,
            perModelHybridScores: new Map(Object.entries(run.perModelHybridScores as Record<string, { average: number | null; stddev: number | null }>))
          };
        }
        return run;
      })
    }))
  };
}

// Helper to serialize: Converts perModelHybridScores from Map to object for JSON compatibility
function serializeSummaryContentForCache(summary: HomepageSummaryFileContent): any {
  // Creates a version of the summary where Maps are converted to objects for JSON stringification
  if (!summary || !summary.configs) return summary;
  return {
    ...summary,
    configs: summary.configs.map((config: EnhancedComparisonConfigInfo) => ({
      ...config,
      runs: config.runs.map((run: EnhancedRunInfo) => {
        if (run.perModelHybridScores instanceof Map) {
          return {
            ...run,
            perModelHybridScores: Object.fromEntries(run.perModelHybridScores)
          };
        }
        return run;
      })
    }))
  };
}

async function getFullHomepageDataWithCache(): Promise<HomepageSummaryFileContent | null> {
  console.log("[homepageDataUtils] getFullHomepageDataWithCache CALLED at:", new Date().toISOString());

  if (homepageDevCacheDurationMs > 0) {
    try {
      if (fs.existsSync(CACHE_FILE_PATH)) {
        const cachedFileContent = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
        const cachedJson = JSON.parse(cachedFileContent);
        if (cachedJson.timestamp && (Date.now() - cachedJson.timestamp < homepageDevCacheDurationMs)) {
          console.log("[homepageDataUtils] Returning full summary data from /tmp cache.");
          // cachedJson.data here is the serialized version, so deserialize it
          return deserializeSummaryContent(cachedJson.data as HomepageSummaryFileContent);
        }
        console.log("[homepageDataUtils] /tmp cache file found but is stale or invalid.");
      }
    } catch (cacheError) {
      console.warn("[homepageDataUtils] Error reading from /tmp cache:", cacheError);
    }
  } else {
    console.log("[homepageDataUtils] /tmp cache is DISABLED (duration is 0ms).");
  }

  console.log("[homepageDataUtils] No valid /tmp cache or cache disabled/stale. Fetching homepage summary from S3 via storageService...");
  
  try {
    const summaryData = await getHomepageSummary(); // This already returns HomepageSummaryFileContent with Maps hydrated

    if (!summaryData) {
      console.log("[homepageDataUtils] No summary data returned from getHomepageSummary. Returning null.");
      return null;
    }

    if (homepageDevCacheDurationMs > 0) {
      try {
        // Before writing to cache, serialize Maps in summaryData if they exist
        const serializableDataForCache = serializeSummaryContentForCache(summaryData);
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify({ timestamp: Date.now(), data: serializableDataForCache }, null, 2), 'utf-8');
        console.log("[homepageDataUtils] Fresh homepage summary data saved to /tmp cache.");
      } catch (cacheWriteError) {
        console.warn("[homepageDataUtils] Error writing homepage summary data to /tmp cache:", cacheWriteError);
      }
    }
    return summaryData; // This data from getHomepageSummary should have Maps already rehydrated
  } catch (error: any) {
    console.error("[homepageDataUtils] Error fetching or processing homepage summary via getHomepageSummary:", error);
    return null;
  }
}

export async function getComparisonRunInfo(): Promise<EnhancedComparisonConfigInfo[]> {
  const fullData = await getFullHomepageDataWithCache();
  return fullData?.configs || [];
}

export async function getCachedHomepageHeadlineStats(): Promise<AggregateStatsData | null> {
  const fullData = await getFullHomepageDataWithCache();
  return fullData?.headlineStats || null;
}

export async function getCachedHomepageDriftDetectionResult(): Promise<PotentialDriftInfo | null> {
  const fullData = await getFullHomepageDataWithCache();
  return fullData?.driftDetectionResult || null;
} 