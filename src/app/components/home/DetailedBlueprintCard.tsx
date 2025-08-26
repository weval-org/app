'use client';

import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import CoverageHeatmapCanvas from '@/app/analysis/components/CoverageHeatmapCanvas';
import ClientDateTime from '../ClientDateTime';
import { Badge } from '@/components/ui/badge';
import { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import { normalizeTag, prettifyTag } from '@/app/utils/tagUtils';
import Icon from '@/components/ui/icon';
import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';

const getHybridScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-muted-foreground';
  if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

interface DetailedBlueprintCardProps {
  blueprint: BlueprintSummaryInfo;
}

export default function DetailedBlueprintCard({ blueprint: bp }: DetailedBlueprintCardProps) {
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
                    <Icon name="folder-open" className="w-6 h-6 mr-2.5 text-primary flex-shrink-0" />
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
                {/* Optional author badge */}
                {bp.author && (
                  <div className="mb-2">
                    {(() => {
                      const a: any = (bp as any).author;
                      const name: string = typeof a === 'string' ? a : a.name;
                      const url: string | undefined = typeof a === 'string' ? undefined : a.url;
                      const imageUrl: string | undefined = typeof a === 'string' ? undefined : a.image_url;
                      const content = (
                        <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl} alt={name} className="h-5 w-5 rounded-full border border-border" />
                          ) : (
                            <Icon name="user" className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span>By</span>
                          <span className="text-foreground">{name}</span>
                        </span>
                      );
                      return (
                        <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 border border-border/60" title="Blueprint author">
                          {url ? (
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
                    <div className="text-xs text-muted-foreground dark:text-muted-foreground mb-3 leading-relaxed line-clamp-4 pr-4 group-hover:text-foreground/80 dark:group-hover:text-foreground/80">
                        <Icon name="info" className="w-3 h-3 mr-1 inline-block relative -top-px opacity-70"/> 
                        <div className="inline">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <span>{children}</span>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              em: ({ children }) => <em>{children}</em>,
                              h1: ({ children }) => <span className="font-semibold">{children}</span>,
                              h2: ({ children }) => <span className="font-semibold">{children}</span>,
                              h3: ({ children }) => <span className="font-semibold">{children}</span>,
                              h4: ({ children }) => <span className="font-semibold">{children}</span>,
                              h5: ({ children }) => <span className="font-semibold">{children}</span>,
                              h6: ({ children }) => <span className="font-semibold">{children}</span>,
                            }}
                          >
                            {bp.description}
                          </ReactMarkdown>
                        </div>
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {(bp.tags && bp.tags.length > 0) && (
                    <>
                      {bp.tags.filter(tag => tag[0] !== '_').map((tag: string) => (
                        <Link href={`/tags/${normalizeTag(tag)}`} key={tag}>
                          <Badge variant="secondary" className="hover:bg-primary/20 transition-colors">{prettifyTag(tag)}</Badge>
                        </Link>
                      ))}
                    </>
                  )}
                </div>
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
                                        <Icon name="trophy" className="w-3.5 h-3.5 mr-1.5 text-amber-500 dark:text-amber-400 flex-shrink-0" /> 
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
            <Icon name="external-link" className="w-4 h-4 mr-2 opacity-90" />
            View Latest Run Analysis
          </Link>
        )}
        <Link 
          href={blueprintOverallViewUrl} 
          className={allRunsLinkClassName}
        >
          View All Runs for this Blueprint 
          <Icon name="chevron-right" className="w-3.5 h-3.5 ml-1 inline-block relative -top-px opacity-80"/>
        </Link>
      </div>
    </Card>
  );
} 