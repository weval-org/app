'use client';

import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import CoverageHeatmapCanvas from '@/app/analysis/components/CoverageHeatmapCanvas';
import { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import Icon from '@/components/ui/icon';
import ResponseRenderer from '@/app/components/ResponseRenderer';

const getHybridScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-muted-foreground';
  if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

interface SimplifiedBlueprintCardProps {
  blueprint: BlueprintSummaryInfo;
}

export default function SimplifiedBlueprintCard({ blueprint: bp }: SimplifiedBlueprintCardProps) {
  const latestRunInstanceUrl = bp.latestRunActualLabel && bp.latestRunSafeTimestamp ?
    `/analysis/${bp.id || bp.configId}/${encodeURIComponent(bp.latestRunActualLabel)}/${bp.latestRunSafeTimestamp}`
    : null;

  // When wrapped in a Link, we must suppress nested <a> tags to avoid hydration errors
  const isLinked = !!latestRunInstanceUrl;

  const CardContent = () => (
    <Card className="bg-card/80 dark:bg-card/70 backdrop-blur-lg group ring-1 ring-border dark:ring-border/70 flex flex-col hover:ring-primary/50 transition-all duration-200 hover:shadow-lg">
      <div className="p-4 md:p-5 flex-grow">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="flex-grow min-w-0">
            <div className="flex items-center mb-3">
              <Icon name="folder-open" className="w-6 h-6 mr-2.5 text-primary flex-shrink-0" />
              <h3 className="font-semibold text-lg md:text-xl text-primary truncate group-hover:underline">
                {bp.title || bp.configTitle}
              </h3>
            </div>
            {bp.author && (
              <div className="-mt-1 mb-2">
                {(() => {
                  const a: any = (bp as any).author;
                  const name: string = typeof a === 'string' ? a : a.name;
                  const url: string | undefined = typeof a === 'string' ? undefined : a.url;
                  const imageUrl: string | undefined = typeof a === 'string' ? undefined : a.image_url;
                  const content = (
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt={name} className="h-4 w-4 rounded-full border border-border" />
                      ) : (
                        <Icon name="user" className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span>By</span>
                      <span className="text-foreground">{name}</span>
                    </span>
                  );
                  return (
                    <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 border border-border/60" title="Blueprint author">
                      {url && !isLinked ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {content}
                        </a>
                      ) : content}
                    </span>
                  );
                })()}
              </div>
            )}
            {bp.description && (
              <div className="text-sm text-muted-foreground dark:text-muted-foreground mb-3 leading-relaxed line-clamp-3 pr-4 group-hover:text-foreground/80 dark:group-hover:text-foreground/80">
                <ResponseRenderer content={bp.description} suppressLinks={isLinked} />
              </div>
            )}
          </div>
          
          {/* Stats Section - Simplified */}
          <div className="flex-shrink-0 sm:pl-6 mt-2 sm:mt-0">
            <div className="flex items-center justify-end gap-x-6">
              {/* Primary Score */}
              <div className="flex flex-col items-center sm:items-end">
                {typeof bp.overallAverageHybridScore === 'number' ? (
                  <div className="text-center sm:text-right">
                    <span className={`block text-3xl sm:text-4xl font-bold ${getHybridScoreColor(bp.overallAverageHybridScore)}`}>
                      {(bp.overallAverageHybridScore * 100).toFixed(1)}%
                    </span>
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground -mt-0.5">Avg. Score</p>
                  </div>
                ) : (
                  <div className="text-center sm:text-right">
                    <span className={`block text-3xl sm:text-4xl font-bold ${getHybridScoreColor(null)}`}>N/A</span>
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground -mt-0.5">Avg. Score</p>
                  </div>
                )}
              </div>

              {/* Heatmap */}
              <div className="flex flex-col items-center">
                {bp.latestRunCoverageScores && bp.latestRunModels && bp.latestRunPromptIds && bp.latestRunModels.length > 0 && bp.latestRunPromptIds.length > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground mb-1 text-center">Latest Run</p>
                    <CoverageHeatmapCanvas
                      allCoverageScores={bp.latestRunCoverageScores}
                      models={bp.latestRunModels}
                      promptIds={bp.latestRunPromptIds}
                      width={80}
                      height={70}
                      className="rounded-sm border border-border/50 dark:border-border"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-20 h-14 text-xs text-muted-foreground dark:text-muted-foreground p-2 rounded-md bg-muted/40 dark:bg-muted/30">
                    No Data
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );

  if (latestRunInstanceUrl) {
    return (
      <Link href={latestRunInstanceUrl} className="block">
        <CardContent />
      </Link>
    );
  } else {
    return <CardContent />;
  }
} 