import nextDynamic from 'next/dynamic';
import AggregateStatsDisplay, { AggregateStatsData } from '@/app/components/AggregateStatsDisplay';
import ModelDriftIndicator, { PotentialDriftInfo } from '@/app/components/ModelDriftIndicator';
import HomePageBanner from "@/app/components/HomePageBanner";
import CivicEvalLogo from '@/components/icons/CivicEvalLogo';
import {
  getComparisonRunInfo,
  EnhancedComparisonConfigInfo,
  EnhancedRunInfo,
  getCachedHomepageHeadlineStats,
  getCachedHomepageDriftDetectionResult,
  AllCoverageScores
} from '@/app/utils/homepageDataUtils';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/comparisonUtils';
import { fromSafeTimestamp } from '@/app/utils/timestampUtils';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import React from 'react';
import type { Metadata } from 'next';
import CoverageHeatmapCanvas from '@/app/analysis/components/CoverageHeatmapCanvas';
import BrowseAllBlueprintsSection, { BlueprintSummaryInfo } from '@/app/components/home/BrowseAllBlueprintsSection';
import LatestEvaluationRunsSection, { DisplayableRunInstanceInfo } from '@/app/components/home/LatestEvaluationRunsSection';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:8888' : 'https://civiceval.org');

export const metadata: Metadata = {
  title: 'CivicEval - AI evaluations for civic good',
  description: 'Open-source, independent evaluations of large language models on human rights, law, and civic topics. Track AI model accuracy and consistency.',
  openGraph: {
    title: 'CivicEval - AI Model Evaluations for Civic Topics',
    description: 'Explore how accurately and consistently AI models understand human rights, law, and global civic issues. Public, open-source, and continuously updated.',
    url: appUrl,
    siteName: 'CivicEval',
    images: [
      {
        url: `${appUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "CivicEval - Measuring AI's fitness for civic life",
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CivicEval - AI Model Evaluations for Civic Good',
    description: 'Track AI model accuracy on human rights, law, and civic topics. Open, independent, and continuously updated evaluations.',
    images: [`${appUrl}/opengraph-image`],
  },
};

export const revalidate = 600;

function getLatestDateOfData(configs: EnhancedComparisonConfigInfo[]): string {
  let maxDate: Date | null = null;

  for (const config of configs) {
    for (const run of config.runs) {
      if (run.timestamp) {
        const currentDate = new Date(fromSafeTimestamp(run.timestamp));
        if (!isNaN(currentDate.getTime())) {
          if (!maxDate || currentDate > maxDate) {
            maxDate = currentDate;
          }
        }
      }
    }
  }

  return maxDate ? maxDate.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' }) : "N/A";
}

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
  const initialConfigs = initialConfigsRaw.filter(config => {
    if (isDevelopment) {
      return true;
    }
    return !(config.tags && config.tags.includes('test'));
  });

  const allRunInstances: DisplayableRunInstanceInfo[] = [];
  initialConfigs.forEach(config => {
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

  const blueprintSummaries: BlueprintSummaryInfo[] = initialConfigs.map(config => {
    let latestInstanceTimestamp: string | null = null;
    let latestRunActualLabel: string | null = null;
    let latestRunSafeTimestampForUrl: string | null = null;
    let latestRun: EnhancedRunInfo | null = null;

    if (config.runs && config.runs.length > 0) {
      let latestDateObj: Date | null = null;

      for (const run of config.runs) {
        if (run.timestamp && run.runLabel) {
          const currentDateObj = new Date(fromSafeTimestamp(run.timestamp)); 
          if (!isNaN(currentDateObj.getTime())) {
            if (!latestDateObj || currentDateObj.getTime() > latestDateObj.getTime()) {
              latestDateObj = currentDateObj;
              latestRun = run;
            }
          }
        }
      }

      if (latestRun && latestDateObj) {
        latestInstanceTimestamp = latestDateObj.toISOString();
        latestRunActualLabel = latestRun.runLabel;
        latestRunSafeTimestampForUrl = latestRun.timestamp; 
      }
    }

    const uniqueRunLabels = new Set(config.runs.map(r => r.runLabel).filter(Boolean));
    
    const latestRunCoverageScores = latestRun?.allCoverageScores;
    const latestRunModels = latestRun?.models;
    const latestRunPromptIds = latestRunCoverageScores ? Object.keys(latestRunCoverageScores) : [];

    let bestOverallModelData: { name: string; score: number; displayName: string } | null = null;
    if (config.runs && config.runs.length > 0) {
      const allModelScoresAcrossRuns = new Map<string, { scoreSum: number; count: number }>();

      config.runs.forEach(run => {
        if (run.perModelHybridScores) {
          const scoresMap = run.perModelHybridScores instanceof Map
            ? run.perModelHybridScores
            : new Map(Object.entries(run.perModelHybridScores || {}) as [string, { average: number | null; stddev: number | null }][]);

          scoresMap.forEach((scoreData, modelId) => {
            if (modelId !== IDEAL_MODEL_ID && scoreData.average !== null && scoreData.average !== undefined) {
              const current = allModelScoresAcrossRuns.get(modelId) || { scoreSum: 0, count: 0 };
              current.scoreSum += scoreData.average;
              current.count += 1;
              allModelScoresAcrossRuns.set(modelId, current);
            }
          });
        }
      });

      let bestOverallScore = -Infinity;
      let bestModelId: string | null = null;

      allModelScoresAcrossRuns.forEach((data, modelId) => {
        const avgScore = data.scoreSum / data.count;
        if (avgScore > bestOverallScore) {
          bestOverallScore = avgScore;
          bestModelId = modelId;
        }
      });

      if (bestModelId) {
        bestOverallModelData = {
          name: bestModelId,
          score: bestOverallScore,
          displayName: getModelDisplayLabel(bestModelId, {hideProvider:true})
        };
      }
    }

    return {
      ...config,
      latestInstanceTimestamp,
      uniqueRunLabelCount: uniqueRunLabels.size,
      latestRunActualLabel,
      latestRunSafeTimestamp: latestRunSafeTimestampForUrl,
      bestOverallModel: bestOverallModelData, 
      latestRunCoverageScores,
      latestRunModels,
      latestRunPromptIds,
    };
  });

  blueprintSummaries.sort((a, b) => {
    const tsA = a.latestInstanceTimestamp; 
    const tsB = b.latestInstanceTimestamp;

    if (!tsA) return 1;
    if (!tsB) return -1;
    return new Date(tsB).getTime() - new Date(tsA).getTime();
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 sm:py-3 md:pt-4 space-y-8 md:space-y-10">
        {/* <DonationBanner />  */}
        
        <header className="text-center pt-4">
          <a href="/">
            <CivicEvalLogo 
              className="w-12 h-12 md:w-14 md:h-14 mx-auto mb-3 text-primary dark:text-sky-400" 
              aria-label="CivicEval Logo"
            /> 
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground dark:text-slate-50 mb-3">
              CivicEval
            </h1>
          </a>
          <p className="text-lg sm:text-xl text-muted-foreground dark:text-slate-300 mb-4 max-w-3xl mx-auto">
            Measuring AI's fitness for civic life
          </p>
        </header>
      </div>

      <HomePageBanner />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 sm:pb-2 md:pb-4 pt-8 md:pt-10 space-y-8 md:space-y-10">
        {initialConfigs.length > 0 && headlineStats && (
          <section 
            aria-labelledby="platform-summary-heading"
            className="bg-card/50 dark:bg-slate-800/50 backdrop-blur-md p-6 rounded-2xl shadow-lg ring-1 ring-border/60 dark:ring-slate-700/60"
          >
            <h2 id="platform-summary-heading" className="text-2xl sm:text-2xl font-semibold tracking-tight text-foreground dark:text-slate-100 mb-6 md:mb-8 text-center">
              Latest Platform Stats as of {getLatestDateOfData(initialConfigs)}
            </h2>
            <div className="space-y-8 md:space-y-10">
                <AggregateStatsDisplay stats={headlineStats} />
                {driftDetectionResult && <ModelDriftIndicator driftInfo={driftDetectionResult} />}
            </div>
          </section>
        )}

        {initialConfigs.length > 0 ? (
          <>
            <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
            <BrowseAllBlueprintsSection blueprints={blueprintSummaries} />
            <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
            <LatestEvaluationRunsSection latestRuns={top20LatestRuns} />
          </>
        ) : (
         <div className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md p-8 sm:p-12 rounded-xl shadow-xl ring-1 ring-border dark:ring-slate-700/80 text-center flex flex-col items-center mt-10">
            {React.createElement(nextDynamic(() => import('lucide-react').then(mod => mod.LayoutGrid)) as any, {className:"w-16 h-16 mx-auto mb-6 text-primary dark:text-sky-400 opacity-80"})}
            <h2 className="text-xl sm:text-2xl font-semibold text-card-foreground dark:text-slate-100 mb-3">
              No Evaluation Blueprints Found
            </h2>
            <p className="text-muted-foreground dark:text-slate-400 text-sm sm:text-base max-w-lg mx-auto mb-6">
              It looks like you haven't run any evaluation blueprints yet. Use the CLI to generate results, and they will appear here.
              Explore example blueprints or contribute your own at the <a href="https://github.com/civiceval/configs/tree/main/blueprints" target="_blank" rel="noopener noreferrer" className="text-primary dark:text-sky-400 hover:underline">CivicEval Blueprints repository</a>.
            </p>
            <div className="mt-4 text-xs text-muted-foreground/80 dark:text-slate-500/80 bg-muted dark:bg-slate-700/50 p-3 rounded-md w-full max-w-md">
                <span className="font-semibold">Example command:</span>
                <code className="block text-xs bg-transparent dark:bg-transparent p-1 rounded mt-1 select-all">
                  pnpm cli run_config --config path/to/your_blueprint.json --run-label "my-first-run"
                </code>
            </div>
          </div>
        )}
        
      </div>

      {/* Footer with full-width background */}
      <div className="w-full bg-slate-100 dark:bg-slate-800 py-8 md:py-12 mt-12 md:mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <footer className="text-center">
            <p className="text-sm text-muted-foreground">
            </p>
            <div className="mt-4 space-x-4">
              <a href="https://github.com/civiceval/app" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors">
                View App on GitHub
              </a>
              <span className="text-sm text-muted-foreground">|</span>
              <a href="https://github.com/civiceval/configs" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors">
                View Eval Blueprints on GitHub
              </a>
            </div>
          </footer>
        </div>
      </div>

    </div>
  );
}
