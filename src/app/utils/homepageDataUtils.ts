import {
  getHomepageSummary
} from '@/lib/storageService'; 
import fs from 'fs';
import path from 'path';
import os from 'os';

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

export async function getComparisonRunInfo(): Promise<EnhancedComparisonConfigInfo[]> {
  console.log("[homepageDataUtils] getComparisonRunInfo CALLED (v2 - Summary File Strategy) at:", new Date().toISOString());

  if (homepageDevCacheDurationMs > 0) {
    try {
      if (fs.existsSync(CACHE_FILE_PATH)) {
        const cachedFileContent = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
        const cachedData = JSON.parse(cachedFileContent);
        if (cachedData.timestamp && (Date.now() - cachedData.timestamp < homepageDevCacheDurationMs)) {
          console.log("[homepageDataUtils] Returning data from /tmp cache (summary file content).");
          // Rehydrate perModelHybridScores from object to Map when serving from cache
          const hydratedData = (cachedData.data as EnhancedComparisonConfigInfo[]).map(config => ({
            ...config,
            runs: config.runs.map(run => {
              if (run.perModelHybridScores && typeof run.perModelHybridScores === 'object' && !(run.perModelHybridScores instanceof Map)) {
                return {
                  ...run,
                  perModelHybridScores: new Map(Object.entries(run.perModelHybridScores as Record<string, { average: number | null; stddev: number | null }>))
                };
              }
              return run;
            })
          }));
          return hydratedData;
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
    const summaryData = await getHomepageSummary(); // Static import is used at the top

    if (!summaryData) {
      console.log("[homepageDataUtils] No summary data returned from getHomepageSummary. Returning empty array.");
      return [];
    }

    if (homepageDevCacheDurationMs > 0) {
      try {
        // Data from getHomepageSummary is EnhancedComparisonConfigInfo[]
        // If perModelHybridScores are Maps, they need to be serialized for JSON.stringify
        // storageService.saveHomepageSummary handles this serialization before S3 write.
        // storageService.getHomepageSummary handles deserialization and Map rehydration.
        // So, summaryData here should have Maps correctly rehydrated.

        // Before writing to cache, serialize Maps in summaryData if they exist
        const serializableDataForCache = summaryData.map(config => ({
          ...config,
          runs: config.runs.map(run => {
            if (run.perModelHybridScores instanceof Map) {
              return {
                ...run,
                perModelHybridScores: Object.fromEntries(run.perModelHybridScores)
              };
            }
            return run;
          })
        }));
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify({ timestamp: Date.now(), data: serializableDataForCache }, null, 2), 'utf-8');
        console.log("[homepageDataUtils] Fresh homepage summary data saved to /tmp cache.");
      } catch (cacheWriteError) {
        console.warn("[homepageDataUtils] Error writing homepage summary data to /tmp cache:", cacheWriteError);
      }
    }
    return summaryData; // This data should have Maps rehydrated by getHomepageSummary
  } catch (error: any) {
    console.error("[homepageDataUtils] Error fetching or processing homepage summary via getHomepageSummary:", error);
    return [];
  }
} 