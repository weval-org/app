'use client';

import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import CoverageHeatmapCanvas from '@/app/analysis/components/CoverageHeatmapCanvas';
import { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });

// Define dynamic components once, outside the render function
const FolderOpen = nextDynamic(() => import('lucide-react').then(mod => mod.FolderOpen));

const getHybridScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-muted-foreground';
  if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

interface FeaturedBlueprintsSectionProps {
  featuredBlueprints: BlueprintSummaryInfo[];
}

export default function FeaturedBlueprintsSection({ featuredBlueprints }: FeaturedBlueprintsSectionProps) {
  // Filter out blueprints without latest runs
  const validBlueprints = featuredBlueprints.filter(bp => 
    bp.latestRunActualLabel && bp.latestRunSafeTimestamp
  );

  if (validBlueprints.length === 0) {
    return null;
  }

  return (
    <section id="featured-blueprints" className="scroll-mt-20 mb-12 md:mb-16">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-foreground mb-2">
          Featured Evaluations
        </h2>
        <p className="text-muted-foreground dark:text-muted-foreground text-sm">
          Our most comprehensive and community-valued evaluations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {validBlueprints.slice(0, 3).map((bp, index) => {
          // We know all blueprints here have valid latest runs due to filtering above
          const latestRunInstanceUrl = `/analysis/${bp.id || bp.configId}/${encodeURIComponent(bp.latestRunActualLabel!)}/${bp.latestRunSafeTimestamp!}`;

          const CardContent = () => (
            <div className="bg-card/40 dark:bg-card/40 backdrop-blur-sm p-6 rounded-lg shadow-lg ring-1 ring-border/50 dark:ring-border/50 flex flex-col h-full group hover:ring-primary/50 transition-all duration-200 hover:shadow-xl">
              <div className="flex items-center mb-4">
                <h3 className="text-xl font-semibold text-foreground dark:text-slate-100 truncate group-hover:underline">
                  {bp.title || bp.configTitle}
                </h3>
              </div>
              
              {bp.description && (
                <div className="text-sm text-foreground/80 dark:text-muted-foreground leading-relaxed flex-grow mb-4 line-clamp-4">
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
                      a: ({ children }) => <span className="text-primary">{children}</span>, // Strip links, keep styling
                    }}
                  >
                    {bp.description}
                  </ReactMarkdown>
                </div>
              )}

              {/* Stats Section */}
              <div className="flex items-center justify-between gap-4">
                <div className="text-center">
                  {typeof bp.overallAverageHybridScore === 'number' ? (
                    <div>
                      <span className={`block text-2xl font-bold ${getHybridScoreColor(bp.overallAverageHybridScore)}`}>
                        {(bp.overallAverageHybridScore * 100).toFixed(1)}%
                      </span>
                      <p className="text-xs text-muted-foreground dark:text-muted-foreground">Avg. Score</p>
                    </div>
                  ) : (
                    <div>
                      <span className={`block text-2xl font-bold ${getHybridScoreColor(null)}`}>N/A</span>
                      <p className="text-xs text-muted-foreground dark:text-muted-foreground">Avg. Score</p>
                    </div>
                  )}
                </div>

                {bp.latestRunCoverageScores && bp.latestRunModels && bp.latestRunPromptIds && bp.latestRunModels.length > 0 && bp.latestRunPromptIds.length > 0 && (
                  <div className="text-center">
                    <CoverageHeatmapCanvas
                      allCoverageScores={bp.latestRunCoverageScores}
                      models={bp.latestRunModels}
                      promptIds={bp.latestRunPromptIds}
                      width={64}
                      height={58}
                      className="rounded-sm border border-border/50 dark:border-border mx-auto"
                    />
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground mb-1">Latest Run</p>
                  </div>
                )}
              </div>


            </div>
          );

          return (
            <Link href={latestRunInstanceUrl} key={bp.id || bp.configId} className="block">
              <CardContent />
            </Link>
          );
        })}
      </div>
    </section>
  );
} 