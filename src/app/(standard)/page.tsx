import nextDynamic from 'next/dynamic';
import AggregateStatsDisplay from '@/app/components/AggregateStatsDisplay';
import { AggregateStatsData } from '@/app/components/home/types';
import ModelDriftIndicator, { PotentialDriftInfo } from '@/app/components/ModelDriftIndicator';
import HomePageBanner from "@/app/components/HomePageBanner";
import CapabilityLeaderboardDisplay from '@/app/components/home/CapabilityLeaderboardDisplay';
import {
  getComparisonRunInfo,
  EnhancedComparisonConfigInfo,
  EnhancedRunInfo,
  getCachedHomepageStats,
} from '@/app/utils/homepageDataUtils';
import { HomepageSummaryFileContent } from '@/lib/storageService';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import React from 'react';
import type { Metadata } from 'next';
import BrowseAllBlueprintsSection from '@/app/components/home/BrowseAllBlueprintsSection';
import FeaturedBlueprintsSection from '@/app/components/home/FeaturedBlueprintsSection';
import TopTagsSection from '@/app/components/home/TopTagsSection';
import LatestEvaluationRunsSection, { DisplayableRunInstanceInfo } from '@/app/components/home/LatestEvaluationRunsSection';
import { BLUEPRINT_CONFIG_REPO_URL, APP_REPO_URL } from '@/lib/configConstants';
import { processBlueprintSummaries } from '@/app/utils/blueprintSummaryUtils';
import Link from 'next/link';
import Icon from '@/components/ui/icon';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:8888' : 'https://weval.org');

export const metadata: Metadata = {
  title: 'Weval - The Open Platform for AI Evaluation',
  description: 'An open-source framework for creating, sharing, and running a collaborative library of AI model evaluations. Test what matters to you.',
  openGraph: {
    title: 'Weval - The Open Platform for AI Evaluation',
    description: 'Create, share, and run a massive, collaborative library of AI model evaluations. Like a Wikipedia for benchmarks, Weval empowers anyone to test what matters to them.',
    url: appUrl,
    siteName: 'Weval',
    images: [
      {
        url: `${appUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Weval - Open AI Evaluation Platform",
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Weval - The Open Platform for AI Evaluation',
    description: 'Create, share, and run a massive, collaborative library of AI model evaluations. Test what matters to you.',
    images: [`${appUrl}/opengraph-image`],
  },
};

export const revalidate = 3600;

export default async function HomePage() {
  const [initialConfigsRaw, homepageStats]: [
    EnhancedComparisonConfigInfo[], 
    HomepageSummaryFileContent | null, 
  ] = await Promise.all([
    getComparisonRunInfo(),
    getCachedHomepageStats(),
  ]);

  const headlineStats = homepageStats?.headlineStats || null;
  const driftDetectionResult = homepageStats?.driftDetectionResult || null;

  const isDevelopment = process.env.NODE_ENV === 'development';
  // Filter for featured configs on the client, or show all in development.
  // This is necessary because the homepage summary now contains metadata for all configs.
  const featuredConfigs = initialConfigsRaw.filter(config => {
    if (isDevelopment) {
      return true; // Show all configs in dev mode for easier testing
    }
    // In production, only show configs that are explicitly featured and have runs.
    return config.tags?.includes('_featured');
  });

  const allRunInstances: DisplayableRunInstanceInfo[] = [];
  featuredConfigs.forEach(config => {
      config.runs.forEach(run => {
          allRunInstances.push({
              ...run,
              configId: config.id || config.configId!,
              configTitle: config.title || config.configTitle
          });
      });
  });
  allRunInstances.sort((a, b) => {
    const dateA = new Date(fromSafeTimestamp(a.timestamp));
    const dateB = new Date(fromSafeTimestamp(b.timestamp));
    if (isNaN(dateA.getTime())) return 1;
    if (isNaN(dateB.getTime())) return -1;
    return dateB.getTime() - dateA.getTime();
  });
  const top20LatestRuns = allRunInstances.slice(0, 20);

  const blueprintSummaries = processBlueprintSummaries(featuredConfigs);
  
  // Featured config IDs for the top 3 showcase
  const FEATURED_CONFIG_IDS: string[] = [
    'homework-int-help-heuristics',
    'sri-lanka-citizen-compendium-factum',
    'sycophancy-probe'
  ];
  
  // Split blueprints into featured (top 3) and remaining
  const featuredBlueprints = FEATURED_CONFIG_IDS.length > 0 
    ? blueprintSummaries.filter(bp => FEATURED_CONFIG_IDS.includes(bp.id || bp.configId)).slice(0, 3)
    : blueprintSummaries.slice(0, 3); // Fallback to first 3 if no specific IDs provided
  
  const featuredConfigIds = featuredBlueprints.map(bp => bp.id || bp.configId);

  // Extract and count tags from all configs (similar to getTags but using existing data)
  const tagCounts: Record<string, number> = {};
  featuredConfigs.forEach(config => {
    if (config.tags) {
      config.tags.forEach(tag => {
        // Filter out internal tags that start with _
        if (!tag.startsWith('_')) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      });
    }
  });
  
  const tagsData = Object.entries(tagCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count); // Sort by count descending

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
      <div className="max-w-7xl mx-auto">
        <HomePageBanner />
        
        <div className="px-4 sm:px-6 lg:px-8 sm:pb-2 md:pb-4 pt-8 md:pt-10 space-y-8 md:space-y-10">
          {/* {featuredConfigs.length > 0 && headlineStats && (
            <section 
              aria-labelledby="platform-summary-heading"
              className="bg-card/50 dark:bg-slate-800/50 backdrop-blur-md p-6 rounded-2xl shadow-lg ring-1 ring-border/60 dark:ring-slate-700/60"
            >
              <div className="space-y-8 md:space-y-10">
                  <AggregateStatsDisplay stats={headlineStats ? { ...headlineStats, topicChampions: homepageStats?.topicChampions } : null} />
              </div>
            </section>
          )} */}
          
          <hr className="my-4 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />

          {/* Dev Mode Info */}
          {process.env.NODE_ENV === 'development' && homepageStats && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Dev Mode
                  </span>
                </div>
                <span className="text-xs text-blue-600 dark:text-blue-300">
                  Data updated: {new Date(homepageStats.lastUpdated).toLocaleString()}
                </span>
                {homepageStats.fileSizeKB && (
                  <span className="text-xs text-blue-600 dark:text-blue-300">
                    File size: {homepageStats.fileSizeKB} KB
                  </span>
                )}
                <span className="text-xs text-blue-600 dark:text-blue-300">
                  Raw data available: {homepageStats.capabilityRawData ? '✓' : '✗'}
                </span>
                <span className="text-xs text-blue-600 dark:text-blue-300">
                  Configs loaded: {featuredConfigs.length}
                </span>
              </div>
            </div>
          )}

          {/* The Leaderboards - Standalone First-Class Section */}
          {featuredConfigs.length > 0 && homepageStats?.capabilityLeaderboards && (
            <section aria-labelledby="the-leaderboards-heading">
              <CapabilityLeaderboardDisplay 
                leaderboards={homepageStats.capabilityLeaderboards} 
                rawData={homepageStats.capabilityRawData}
              />
            </section>
          )}

          {featuredConfigs.length > 0 ? (
            <>
              <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
              <FeaturedBlueprintsSection featuredBlueprints={featuredBlueprints} />
              <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
              <section id="more-blueprints" className="scroll-mt-20">
                <BrowseAllBlueprintsSection 
                  blueprints={blueprintSummaries} 
                  title="Other Evaluations" 
                  detailed={false}
                  excludeConfigIds={featuredConfigIds}
                  actionLink={{ href: '/all', text: 'View All Evaluations »' }} 
                />
              </section>
              <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
              <TopTagsSection tags={tagsData} />
              {/* <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
              <LatestEvaluationRunsSection latestRuns={top20LatestRuns} /> */}
            </>
          ) : (
           <div className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md p-8 sm:p-12 rounded-xl shadow-xl ring-1 ring-border dark:ring-slate-700/80 text-center flex flex-col items-center mt-10">
              <Icon name="layout-grid" className="w-16 h-16 mx-auto mb-6 text-primary opacity-80" />
              <h2 className="text-xl sm:text-2xl font-semibold text-card-foreground dark:text-slate-100 mb-3">
                No Evaluation Blueprints Found
              </h2>
              <p className="text-muted-foreground dark:text-slate-400 text-sm sm:text-base max-w-lg mx-auto mb-6">
                It looks like you haven't run any evaluation blueprints yet. Use the CLI to generate results, and they will appear here.
                Explore example blueprints or contribute your own at the <a href={`${BLUEPRINT_CONFIG_REPO_URL}/tree/main/blueprints`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Weval Blueprints repository</a>.
              </p>
              <div className="mt-4 text-xs text-muted-foreground/80 dark:text-slate-500/80 bg-muted dark:bg-slate-700/50 p-3 rounded-md w-full max-w-md">
                  <span className="font-semibold">Example command:</span>
                  <code className="block text-xs bg-transparent dark:bg-transparent p-1 rounded mt-1 select-all">
                    pnpm cli run_config --config path/to/your_blueprint.yml --run-label "my-first-run"
                  </code>
              </div>
            </div>
          )}
          
          {driftDetectionResult && (
            <section>
              <ModelDriftIndicator driftInfo={driftDetectionResult} />
            </section>
          )}
          
          <div className="text-center pt-6 pb-4">
            <p className="text-sm text-muted-foreground">
              Weval is an open source project from the <Link href="https://cip.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Collective Intelligence Project</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
