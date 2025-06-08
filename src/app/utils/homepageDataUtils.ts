import {
  getHomepageSummary,
  HomepageSummaryFileContent // Import the type from storageService
} from '@/lib/storageService'; 
import { AggregateStatsData } from '@/app/components/AggregateStatsDisplay';
import { PotentialDriftInfo } from '@/app/components/ModelDriftIndicator';

export interface EnhancedRunInfo {
  runLabel: string; 
  timestamp: string; 
  fileName: string; 
  numPrompts?: number;
  numModels?: number;
  hybridScoreStats?: { average: number | null; stddev: number | null };
  perModelHybridScores?: Map<string, { average: number | null; stddev: number | null }>;
  tags?: string[];
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

async function getFullHomepageData(): Promise<HomepageSummaryFileContent | null> {
  console.log("[homepageDataUtils] getFullHomepageData CALLED. Forwarding to getHomepageSummary.");
  // The tmp-file-based cache has been removed as it's not effective on serverless platforms
  // like Netlify. Caching is now handled by Next.js's Data Cache (ISR via revalidate).
  try {
    return await getHomepageSummary();
  } catch (error: any) {
    console.error("[homepageDataUtils] Error fetching homepage summary via getHomepageSummary:", error);
    return null;
  }
}

export async function getComparisonRunInfo(): Promise<EnhancedComparisonConfigInfo[]> {
  const fullData = await getFullHomepageData();
  return fullData?.configs || [];
}

export async function getCachedHomepageHeadlineStats(): Promise<AggregateStatsData | null> {
  const fullData = await getFullHomepageData();
  return fullData?.headlineStats || null;
}

export async function getCachedHomepageDriftDetectionResult(): Promise<PotentialDriftInfo | null> {
  const fullData = await getFullHomepageData();
  return fullData?.driftDetectionResult || null;
} 