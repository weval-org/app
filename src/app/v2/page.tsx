import CapabilityLeaderboardDisplay from '@/app/components/home/CapabilityLeaderboardDisplay';
import {
  getComparisonRunInfo,
  EnhancedComparisonConfigInfo,
  getCachedHomepageStats,
} from '@/app/utils/homepageDataUtils';
import { HomepageSummaryFileContent } from '@/lib/storageService';
import React from 'react';
import type { Metadata } from 'next';
import BrowseAllBlueprintsSection from '@/app/components/home/BrowseAllBlueprintsSection';
import FeaturedBlueprintsSection from '@/app/components/home/FeaturedBlueprintsSection';
import TopTagsSection from '@/app/components/home/TopTagsSection';
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

// Config ID prefixes that indicate non-public evaluations
// - Reserved prefixes from blueprint-parser.ts: _pr_, _staging_, _test_
// - API runs: api-run-*
// - Sandbox runs: sandbox-*
const EXCLUDED_CONFIG_ID_PREFIXES = ['_pr_', '_staging_', '_test_', 'api-run-', 'sandbox-'];

// Tags that indicate non-public/internal evaluations
const EXCLUDED_TAGS = ['_test', '_sandbox_test'];

function isPublicEvaluation(config: EnhancedComparisonConfigInfo): boolean {
  const configId = config.id || config.configId || '';
  // Check config ID prefix
  if (EXCLUDED_CONFIG_ID_PREFIXES.some(prefix => configId.startsWith(prefix))) {
    return false;
  }
  // Check tags
  if (config.tags && config.tags.some(tag => EXCLUDED_TAGS.includes(tag))) {
    return false;
  }
  return true;
}

export default async function HomePageV2() {
  const [initialConfigsRaw, homepageStats]: [
    EnhancedComparisonConfigInfo[],
    HomepageSummaryFileContent | null,
  ] = await Promise.all([
    getComparisonRunInfo(),
    getCachedHomepageStats(),
  ]);

  // Count of all public evaluations (excluding sandbox, test, etc.)
  // initialConfigsRaw contains all configs from the pre-computed homepage summary
  const publicEvalCount = initialConfigsRaw.filter(isPublicEvaluation).length;

  const isDevelopment = process.env.NODE_ENV === 'development';
  const featuredConfigs = initialConfigsRaw.filter(config => {
    if (isDevelopment) {
      return true;
    }
    return config.tags?.includes('_featured');
  });

  const blueprintSummaries = processBlueprintSummaries(featuredConfigs);

  // Featured config IDs for the top 3 showcase
  const FEATURED_CONFIG_IDS: string[] = [
    'evidence-based-ai-tutoring',
    'sri-lanka-citizen-compendium-factum',
    'sycophancy-probe'
  ];

  // Split blueprints into featured (top 3) and remaining
  const featuredBlueprints = FEATURED_CONFIG_IDS.length > 0
    ? blueprintSummaries.filter(bp => FEATURED_CONFIG_IDS.includes(bp.id || bp.configId)).slice(0, 3)
    : blueprintSummaries.slice(0, 3);

  const featuredConfigIds = featuredBlueprints.map(bp => bp.id || bp.configId);

  // Extract and count tags
  const tagCounts: Record<string, number> = {};
  featuredConfigs.forEach(config => {
    if (config.tags) {
      config.tags.forEach(tag => {
        if (!tag.startsWith('_')) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      });
    }
  });

  const tagsData = Object.entries(tagCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
      <div className="max-w-7xl mx-auto">

        {/* Hero Section - simplified tagline */}
        <div className="w-full bg-background pt-8 pb-4 text-foreground">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h1 className="text-3xl sm:text-4xl font-bold mb-2">The Open Platform for AI Evaluation</h1>
              <p className="text-base sm:text-lg text-muted-foreground">
                {publicEvalCount} community-built evaluations testing models on real-world tasks
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 sm:pb-2 md:pb-4 pt-4 md:pt-6 space-y-8 md:space-y-10">

          {/* Dev Mode Info */}
          {process.env.NODE_ENV === 'development' && homepageStats && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Dev Mode (v2)
                  </span>
                </div>
                <span className="text-xs text-blue-600 dark:text-blue-300">
                  Configs loaded: {featuredConfigs.length}
                </span>
              </div>
            </div>
          )}

          {/* The Leaderboards */}
          {featuredConfigs.length > 0 && homepageStats?.capabilityLeaderboards && (
            <section aria-labelledby="the-leaderboards-heading">
              <CapabilityLeaderboardDisplay
                leaderboards={homepageStats.capabilityLeaderboards}
                rawData={homepageStats.capabilityRawData}
                modelCardMappings={homepageStats.modelCardMappings}
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
                  actionLink={{ href: '/all', text: 'View All Evaluations' }}
                />
              </section>
              <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
              <TopTagsSection tags={tagsData} />
            </>
          ) : (
           <div className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md p-8 sm:p-12 rounded-xl shadow-xl ring-1 ring-border dark:ring-slate-700/80 text-center flex flex-col items-center mt-10">
              <Icon name="layout-grid" className="w-16 h-16 mx-auto mb-6 text-primary opacity-80" />
              <h2 className="text-xl sm:text-2xl font-semibold text-card-foreground dark:text-slate-100 mb-3">
                No Evaluation Blueprints Found
              </h2>
              <p className="text-muted-foreground dark:text-slate-400 text-sm sm:text-base max-w-lg mx-auto mb-6">
                It looks like you haven&apos;t run any evaluation blueprints yet. Use the CLI to generate results.
              </p>
            </div>
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
