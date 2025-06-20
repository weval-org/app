import nextDynamic from 'next/dynamic';
import AggregateStatsDisplay, { AggregateStatsData } from '@/app/components/AggregateStatsDisplay';
import ModelDriftIndicator, { PotentialDriftInfo } from '@/app/components/ModelDriftIndicator';
import HomePageBanner from "@/app/components/HomePageBanner";
import CIPLogo from '@/components/icons/CIPLogo';
import {
  getComparisonRunInfo,
  EnhancedComparisonConfigInfo,
  EnhancedRunInfo,
  getCachedHomepageHeadlineStats,
  getCachedHomepageDriftDetectionResult,
} from '@/app/utils/homepageDataUtils';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import React from 'react';
import type { Metadata } from 'next';
import BrowseAllBlueprintsSection, { BlueprintSummaryInfo } from '@/app/components/home/BrowseAllBlueprintsSection';
import LatestEvaluationRunsSection, { DisplayableRunInstanceInfo } from '@/app/components/home/LatestEvaluationRunsSection';
import { BLUEPRINT_CONFIG_REPO_URL, APP_REPO_URL } from '@/lib/configConstants';
import { processBlueprintSummaries } from '@/app/utils/blueprintSummaryUtils';

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
        alt: "Weval - Measuring AI's fitness for civic life",
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
  const [initialConfigsRaw, headlineStats, driftDetectionResult]: [
    EnhancedComparisonConfigInfo[], 
    AggregateStatsData | null, 
    PotentialDriftInfo | null
  ] = await Promise.all([
    getComparisonRunInfo(),
    getCachedHomepageHeadlineStats(),
    getCachedHomepageDriftDetectionResult()
  ]);

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
      
      <header className="w-full bg-header py-4 shadow-sm border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-4">
            <a href="/" aria-label="Homepage">
              <CIPLogo className="w-12 h-12 text-foreground" />
            </a>
            <div>
              <a href="/">
                <h1 className="text-3xl font-bold text-foreground">
                  <span style={{fontWeight: 600}}>w</span><span style={{fontWeight: 200}}>eval</span>
                </h1>
              </a>
              <a href="https://cip.org" target="_blank" rel="noopener noreferrer" className="text-base text-muted-foreground leading-tight hover:underline">
                A Collective Intelligence Project
              </a>
            </div>
          </div>
        </div>
      </header>

      <HomePageBanner />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 sm:pb-2 md:pb-4 pt-8 md:pt-10 space-y-8 md:space-y-10">
        {featuredConfigs.length > 0 && headlineStats && (
          <section 
            aria-labelledby="platform-summary-heading"
            className="bg-card/50 dark:bg-slate-800/50 backdrop-blur-md p-6 rounded-2xl shadow-lg ring-1 ring-border/60 dark:ring-slate-700/60"
          >
            <h2 id="platform-summary-heading" className="text-2xl sm:text-2xl font-semibold tracking-tight text-foreground dark:text-slate-100 mb-6 md:mb-8 text-center">
              Latest Platform Stats
            </h2>
            <div className="space-y-8 md:space-y-10">
                <AggregateStatsDisplay stats={headlineStats} />
                {driftDetectionResult && <ModelDriftIndicator driftInfo={driftDetectionResult} />}
            </div>
          </section>
        )}

        {featuredConfigs.length > 0 ? (
          <>
            <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
            <BrowseAllBlueprintsSection blueprints={blueprintSummaries} title="Featured Blueprints" />
            <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
            <LatestEvaluationRunsSection latestRuns={top20LatestRuns} />
          </>
        ) : (
         <div className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md p-8 sm:p-12 rounded-xl shadow-xl ring-1 ring-border dark:ring-slate-700/80 text-center flex flex-col items-center mt-10">
            {React.createElement(nextDynamic(() => import('lucide-react').then(mod => mod.LayoutGrid)) as any, {className:"w-16 h-16 mx-auto mb-6 text-primary opacity-80"})}
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
        
      </main>

      {/* Footer with full-width background */}
      <div className="w-full bg-header py-6 border-t border-border/50 mt-12 md:mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <footer className="flex flex-col md:flex-row items-center justify-between gap-6">
            <a href="https://cip.org" target="_blank" rel="noopener noreferrer" className="flex items-center space-x-3 group">
              <CIPLogo className="w-8 h-8 text-muted-foreground group-hover:text-foreground transition-colors duration-200" />
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors duration-200">
                A Collective Intelligence Project
              </span>
            </a>
            <div className="flex items-center space-x-4 text-sm">
              <a href={APP_REPO_URL} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors">
                View App on GitHub
              </a>
              <span className="text-muted-foreground/60">|</span>
              <a href={BLUEPRINT_CONFIG_REPO_URL} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors">
                View Eval Blueprints on GitHub
              </a>
            </div>
          </footer>
        </div>
      </div>

    </div>
  );
}
