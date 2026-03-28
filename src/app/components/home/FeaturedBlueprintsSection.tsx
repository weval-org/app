'use client';

import Link from 'next/link';
import type { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';

function formatDate(isoString: string | null): string | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface FeaturedBlueprintsSectionProps {
  featuredBlueprints: BlueprintSummaryInfo[];
}

export default function FeaturedBlueprintsSection({ featuredBlueprints }: FeaturedBlueprintsSectionProps) {
  const validBlueprints = featuredBlueprints.filter(bp =>
    bp.latestRunActualLabel && bp.latestRunSafeTimestamp
  );

  if (validBlueprints.length === 0) {
    return null;
  }

  return (
    <section id="featured-blueprints" className="scroll-mt-20 mb-12 md:mb-16">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-2">
          Featured Evaluations
        </h2>
        <p className="text-muted-foreground text-sm">
          Our most comprehensive and community-valued evaluations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {validBlueprints.slice(0, 3).map((bp) => {
          const latestRunInstanceUrl = `/analysis/${bp.id || bp.configId}/${encodeURIComponent(bp.latestRunActualLabel!)}/${bp.latestRunSafeTimestamp!}`;
          const visibleTags = (bp.tags || []).filter(t => !t.startsWith('_'));
          const modelCount = bp.latestRunModels?.length ?? null;
          const promptCount = bp.latestRunPromptIds?.length ?? null;
          const dateStr = formatDate(bp.latestInstanceTimestamp);

          return (
            <Link href={latestRunInstanceUrl} key={bp.id || bp.configId} className="block">
              <div className="bg-white dark:bg-card border border-[#f2eaea] dark:border-border rounded-[10px] p-6 flex flex-col h-full hover:shadow-md transition-shadow">
                {/* Type label */}
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Evaluation</p>

                {/* Title */}
                <h3 className="text-xl font-bold text-foreground leading-tight mb-3">
                  {bp.title || bp.configTitle}
                </h3>

                {/* Description */}
                {bp.description && (
                  <p className="text-sm text-foreground/80 dark:text-muted-foreground leading-relaxed flex-grow mb-4 line-clamp-5">
                    {bp.description}
                  </p>
                )}

                {/* Tags */}
                {visibleTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {visibleTags.slice(0, 3).map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-3 py-1 rounded-full border border-border text-xs text-foreground/70 capitalize"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats row */}
                {(modelCount !== null || promptCount !== null || dateStr) && (
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-auto pt-2">
                    {modelCount !== null && (
                      <span><strong className="text-foreground font-semibold">{modelCount}</strong> models</span>
                    )}
                    {promptCount !== null && (
                      <span><strong className="text-foreground font-semibold">{promptCount}</strong> prompts</span>
                    )}
                    {dateStr && <span className="ml-auto">{dateStr}</span>}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
