import { cache } from 'react';
import {
  getHomepageSummary,
  HomepageSummaryFileContent, // Import the type from storageService
  getAllBlueprintsSummary as storageGetAllBlueprintsSummary,
  listConfigIds,
  getConfigSummary,
} from '@/lib/storageService'; 
import { AggregateStatsData } from '@/app/components/home/types';
import { PotentialDriftInfo } from '@/types/summary';

// Re-exporting this from the original source for use in the API route.
export type { AllCoverageScores } from '@/app/analysis/components/CoverageHeatmapCanvas'; 
import { AllCoverageScores } from '@/app/analysis/components/CoverageHeatmapCanvas';

export interface ModelScores {
  average: number | null;
  stddev: number | null;
}

export interface PerModelScoreStats {
  hybrid: ModelScores;
  similarity: ModelScores;
  coverage: ModelScores;
}

export interface EnhancedRunInfo {
  runLabel: string; 
  timestamp: string; 
  fileName: string; 
  temperature?: number;
  numPrompts?: number;
  numModels?: number;
  totalModelsAttempted?: number;
  hybridScoreStats?: { average: number | null; stddev: number | null };
  perModelScores?: Map<string, PerModelScoreStats>;
  tags?: string[];
  allCoverageScores?: AllCoverageScores | null;
  models?: string[];
  promptIds?: string[];
}

export interface EnhancedComparisonConfigInfo {
  configId: string;
  configTitle: string;
  id?: string;
  title?: string;
  description?: string;
  author?: string | { name: string; url?: string; image_url?: string };
  reference?: string | { title: string; url?: string };
  runs: EnhancedRunInfo[];
  latestRunTimestamp: string;
  overallAverageHybridScore?: number | null;
  hybridScoreStdDev?: number | null;
  tags?: string[];
}

const getFullHomepageData = cache(async (): Promise<HomepageSummaryFileContent | null> => {
  console.log("[homepageDataUtils] getFullHomepageData CALLED. This should now only appear once per page render.");
  // The tmp-file-based cache has been removed as it's not effective on serverless platforms
  // like Netlify. Caching is now handled by Next.js's Data Cache (ISR via revalidate).
  try {
    return await getHomepageSummary();
  } catch (error: any) {
    console.error("[homepageDataUtils] Error fetching homepage summary via getHomepageSummary:", error);
    return null;
  }
});

export async function getComparisonRunInfo(): Promise<EnhancedComparisonConfigInfo[]> {
  const fullData = await getFullHomepageData();
  return fullData?.configs || [];
}

export async function getCachedHomepageStats(): Promise<HomepageSummaryFileContent | null> {
  return getFullHomepageData();
}

export async function getCachedHomepageHeadlineStats(): Promise<AggregateStatsData | null> {
  const fullData = await getFullHomepageData();
  return fullData?.headlineStats || null;
}

export async function getCachedHomepageDriftDetectionResult(): Promise<PotentialDriftInfo | null> {
  const fullData = await getFullHomepageData();
  return fullData?.driftDetectionResult || null;
} 

export const getAllBlueprintSummaries = cache(async (): Promise<EnhancedComparisonConfigInfo[]> => {
    const summaryData = await storageGetAllBlueprintsSummary();
    if (!summaryData) {
        // If the dedicated summary doesn't exist, fall back to the old method
        // to maintain functionality during transitions.
        console.warn("[homepageDataUtils] all_blueprints_summary.json not found. Falling back to fetching all configs individually. Performance will be degraded.");
        const allConfigIds = await listConfigIds();
        const blueprintPromises = allConfigIds.map(id => getConfigSummary(id));
        const results = await Promise.all(blueprintPromises);
        return results.filter((summary): summary is EnhancedComparisonConfigInfo => summary !== null);
    }
    return summaryData.configs || [];
}); 