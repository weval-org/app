'use client';

import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import CoverageHeatmapCanvas from '@/app/(full)/analysis/components/CoverageHeatmapCanvas';
import { EnhancedComparisonConfigInfo, AllCoverageScores } from '@/app/utils/homepageDataUtils';
import ClientDateTime from '../ClientDateTime';
import { BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface BlueprintSummaryInfo extends EnhancedComparisonConfigInfo {
  latestInstanceTimestamp?: string | null;
  latestInstanceDisplayDate?: string;
  uniqueRunLabelCount?: number;
  latestRunActualLabel?: string | null;
  latestRunSafeTimestamp?: string | null;
  bestOverallModel?: { name: string; score: number; displayName: string; } | null;
  latestRunCoverageScores?: AllCoverageScores | null;
  latestRunModels?: string[];
  latestRunPromptIds?: string[];
  tags?: string[];
}

const getHybridScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-muted-foreground';
  if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

// Define dynamic components once, outside the render function
const FolderOpen = nextDynamic(() => import('lucide-react').then(mod => mod.FolderOpen));
const ChevronRight = nextDynamic(() => import('lucide-react').then(mod => mod.ChevronRight));
const Tag = nextDynamic(() => import('lucide-react').then(mod => mod.Tag));
const Info = nextDynamic(() => import('lucide-react').then(mod => mod.Info));
const PackageSearch = nextDynamic(() => import('lucide-react').then(mod => mod.PackageSearch));
const ExternalLink = nextDynamic(() => import('lucide-react').then(mod => mod.ExternalLink));
const Trophy = nextDynamic(() => import('lucide-react').then(mod => mod.Trophy));

interface BrowseAllBlueprintsSectionProps {
  blueprints: BlueprintSummaryInfo[];
  title: string;
  actionLink?: {
    href: string;
    text: string;
  }
}

const BrowseAllBlueprintsSection = ({ blueprints, title, actionLink }: BrowseAllBlueprintsSectionProps) => {
  const [filteredBlueprints, setFilteredBlueprints] = useState(blueprints);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  return (
    <section id="browse-blueprints" className="mb-12 md:mb-16">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 md:mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-foreground text-center sm:text-left">
          {title}
        </h2>
        {actionLink && (
           <Button asChild variant="link" className="mt-2 sm:mt-0">
             <Link href={actionLink.href}>
                {actionLink.text}
             </Link>
           </Button>
        )}
      </div>
      {blueprints.length === 0 ? (
        <div className="text-center py-10 bg-card/50 dark:bg-card/40 rounded-lg shadow-md">
          {PackageSearch && <PackageSearch className="w-12 h-12 mx-auto mb-4 text-muted-foreground dark:text-muted-foreground" />}
          <p className="text-lg text-muted-foreground dark:text-muted-foreground">No evaluation blueprints found.</p>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">Contribute blueprints to the <a href={`${BLUEPRINT_CONFIG_REPO_URL}/tree/main/blueprints`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Weval Blueprints repository</a>.</p>
        </div>
      ) : (
        <div className="space-y-5 md:space-y-6">
          {blueprints.map(bp => {
            const blueprintOverallViewUrl = `/analysis/${bp.id || bp.configId}`;
            const latestRunInstanceUrl = bp.latestRunActualLabel && bp.latestRunSafeTimestamp ? 
              `/analysis/${bp.id || bp.configId}/${encodeURIComponent(bp.latestRunActualLabel)}/${bp.latestRunSafeTimestamp}` 
              : null;
            
            const allRunsLinkClassName = ["w-full sm:w-auto text-center px-4 py-2 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground hover:bg-muted/70 dark:hover:bg-muted/50 transition-colors", !latestRunInstanceUrl ? "sm:ml-auto" : ""].join(" ").trim();

            return (
            <Card key={bp.id || bp.configId} className="bg-card/80 dark:bg-card/70 backdrop-blur-lg group ring-1 ring-border dark:ring-border/70 flex flex-col">
              <div className="p-4 md:p-5 flex-grow">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                    <div className="flex-grow min-w-0">
                        <div className="flex items-center mb-2">
                            {FolderOpen && <FolderOpen className="w-6 h-6 mr-2.5 text-primary flex-shrink-0" />}
                            {latestRunInstanceUrl ? (
                              <Link href={latestRunInstanceUrl} title={`View latest run: ${bp.title || bp.configTitle}`}>
                                <h3 className="font-semibold text-lg md:text-xl text-primary truncate hover:underline">
                                    {bp.title || bp.configTitle}
                                </h3>
                              </Link>
                            ) : (
                                <h3 className="font-semibold text-lg md:text-xl text-primary truncate" title={bp.title || bp.configTitle}>
                                    {bp.title || bp.configTitle}
                                </h3>
                            )}
                        </div>
                        {bp.description && (
                            <p className="text-xs text-muted-foreground dark:text-muted-foreground mb-3 leading-relaxed line-clamp-4 pr-4 group-hover:text-foreground/80 dark:group-hover:text-foreground/80" title={bp.description}>
                                {Info && <Info className="w-3 h-3 mr-1 inline-block relative -top-px opacity-70"/>} 
                                {bp.description}
                            </p>
                        )}
                        {(bp.tags && bp.tags.length > 0) && (
                            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                {Tag && <Tag className="w-3.5 h-3.5 text-muted-foreground dark:text-muted-foreground flex-shrink-0" />} 
                                {bp.tags.map((tag: string) => (
                                <Link
                                  href={`/tags/${tag}`}
                                  key={tag}
                                  className="px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full transition-colors hover:bg-primary/20"
                                >
                                    {tag}
                                </Link>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* Stats Section */}
                    <div className="flex-shrink-0 sm:pl-6 mt-4 sm:mt-0">
                        <div className="flex items-stretch justify-end gap-x-5 sm:gap-x-6">
                            {/* Primary Score Column */}
                            <div className="flex flex-col sm:items-end">
                                {typeof bp.overallAverageHybridScore === 'number' ? (
                                    <div className="text-center sm:text-right">
                                        <span className={`block text-4xl font-bold ${getHybridScoreColor(bp.overallAverageHybridScore)}`}>
                                            {(bp.overallAverageHybridScore * 100).toFixed(1)}%
                                        </span>
                                        <p className="text-xs text-muted-foreground dark:text-muted-foreground -mt-0.5">Avg. Hybrid Score</p>
                                    </div>
                                ) : (
                                    <div className="text-center sm:text-right">
                                        <span className={`block text-4xl font-bold ${getHybridScoreColor(null)}`}>N/A</span>
                                        <p className="text-xs text-muted-foreground dark:text-muted-foreground -mt-0.5">Avg. Hybrid Score</p>
                                    </div>
                                )}
                            </div>

                            {/* Separator */}
                            <div className="w-px bg-border/60 dark:bg-border/60" />

                            {/* Secondary Stats Column */}
                            <div className="w-40 flex flex-col justify-between space-y-3 text-center sm:text-right">
                                <div className="min-h-[84px] flex flex-col justify-center">
                                    {bp.latestRunCoverageScores && bp.latestRunModels && bp.latestRunPromptIds && bp.latestRunModels.length > 0 && bp.latestRunPromptIds.length > 0 ? (
                                        latestRunInstanceUrl ? (
                                            <Link href={latestRunInstanceUrl} className="transition-opacity hover:opacity-80" title="View latest run analysis">
                                                <p className="text-xs text-muted-foreground dark:text-muted-foreground mb-1">Latest Run Heatmap</p>
                                                <CoverageHeatmapCanvas
                                                    allCoverageScores={bp.latestRunCoverageScores}
                                                    models={bp.latestRunModels}
                                                    promptIds={bp.latestRunPromptIds}
                                                    width={96}
                                                    height={64}
                                                    className="rounded-sm border border-border/50 dark:border-border ml-auto"
                                                />
                                            </Link>
                                        ) : (
                                            <div>
                                                <CoverageHeatmapCanvas
                                                    allCoverageScores={bp.latestRunCoverageScores}
                                                    models={bp.latestRunModels}
                                                    promptIds={bp.latestRunPromptIds}
                                                    width={96}
                                                    height={64}
                                                    className="rounded-sm border border-border/50 dark:border-border ml-auto"
                                                />
                                            </div>
                                        )
                                    ) : (
                                        <div className="flex items-center justify-center w-full h-full text-xs text-muted-foreground dark:text-muted-foreground p-2 rounded-md bg-muted/40 dark:bg-muted/30">No Heatmap Data</div>
                                    )}
                                </div>
                                
                                <div className="min-h-[50px] flex flex-col justify-center">
                                    {bp.bestOverallModel ? (
                                        <div>
                                            <div className="flex items-center justify-center sm:justify-end text-xs text-muted-foreground dark:text-muted-foreground mb-0.5">
                                                <Trophy className="w-3.5 h-3.5 mr-1.5 text-amber-500 dark:text-amber-400 flex-shrink-0" /> 
                                                <span className="font-medium">Top Performing Model:</span>
                                            </div>
                                            <span className="block font-semibold text-sm group-hover:text-foreground dark:group-hover:text-foreground truncate" title={bp.bestOverallModel.displayName}>
                                                {bp.bestOverallModel.displayName}
                                            </span>
                                            <span className={`text-xs font-medium ${getHybridScoreColor(bp.bestOverallModel.score)}`}>
                                                Avg. {(bp.bestOverallModel.score * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    ) : (
                                      <div className="flex items-center justify-center w-full h-full text-xs text-muted-foreground dark:text-muted-foreground p-2 rounded-md bg-muted/40 dark:bg-muted/30">No Top Model</div>
                                    )}
                                </div>
                                
                                <div className="text-xs text-muted-foreground dark:text-muted-foreground">
                                    <p>
                                        Latest: <span className="font-medium text-foreground dark:text-foreground">
                                            <ClientDateTime timestamp={bp.latestInstanceTimestamp} options={{ year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }} />
                                        </span>
                                    </p>
                                    <p className="mt-0.5">
                                        Unique Versions: <span className="font-medium text-foreground dark:text-foreground">{bp.uniqueRunLabelCount}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
              </div>
              <div className="p-3 md:p-4 border-t border-border dark:border-border/50 bg-muted/20 dark:bg-muted/30 rounded-b-lg flex flex-col sm:flex-row justify-between items-center gap-3">
                {latestRunInstanceUrl && (
                  <Link 
                    href={latestRunInstanceUrl} 
                    className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 border border-primary/70 text-sm font-medium rounded-md text-primary bg-primary/10 hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:ring-offset-background transition-all shadow-sm hover:shadow-md"
                  >
                    {ExternalLink && <ExternalLink className="w-4 h-4 mr-2 opacity-90" />}
                    View Latest Run Analysis
                  </Link>
                )}
                <Link 
                  href={blueprintOverallViewUrl} 
                  className={allRunsLinkClassName}
                >
                  View All Runs for this Blueprint 
                  {ChevronRight && <ChevronRight className="w-3.5 h-3.5 ml-1 inline-block relative -top-px opacity-80"/>}
                </Link>
              </div>
            </Card>
            )}
          )}
        </div>
      )}
    </section>
  );
};

export default BrowseAllBlueprintsSection;
export type { BlueprintSummaryInfo }; 