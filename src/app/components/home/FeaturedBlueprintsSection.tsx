'use client';

import Link from 'next/link';
import type { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import EvaluationCard from './EvaluationCard';

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

          return (
            <Link href={latestRunInstanceUrl} key={bp.id || bp.configId} className="block">
              <EvaluationCard blueprint={bp} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
