'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import EvaluationCard from './EvaluationCard';
import CapabilityLeaderboardDisplay from './CapabilityLeaderboardDisplay';
import type { CapabilityLeaderboard, CapabilityRawData } from './types';

interface EvaluationFilterSectionProps {
  blueprints: BlueprintSummaryInfo[];
  featuredConfigIds: string[];
  topTags: { name: string; count: number }[];
  leaderboards?: CapabilityLeaderboard[] | null;
  leaderboardRawData?: CapabilityRawData | null;
  modelCardMappings?: Record<string, string>;
}

export default function EvaluationFilterSection({
  blueprints,
  featuredConfigIds,
  topTags,
  leaderboards,
  leaderboardRawData,
  modelCardMappings,
}: EvaluationFilterSectionProps) {
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const filteredBlueprints = (() => {
    if (activeFilter === 'featured') {
      return blueprints.filter(bp => featuredConfigIds.includes(bp.id || bp.configId));
    }
    if (activeFilter !== 'all') {
      return blueprints.filter(bp => bp.tags?.includes(activeFilter));
    }
    // 'all': featured first, then the rest
    const featured = blueprints.filter(bp => featuredConfigIds.includes(bp.id || bp.configId));
    const others = blueprints.filter(bp => !featuredConfigIds.includes(bp.id || bp.configId));
    return [...featured, ...others];
  })();

  const pills = [
    { key: 'all', label: 'All' },
    { key: 'featured', label: 'Featured' },
    ...topTags.slice(0, 6).map(t => ({ key: t.name, label: t.name.charAt(0).toUpperCase() + t.name.slice(1) })),
  ];

  return (
    <section id="evaluations" className="scroll-mt-20">
      {/* Filter pill bar */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-8">
        {pills.map(pill => (
          <button
            key={pill.key}
            onClick={() => setActiveFilter(pill.key)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              activeFilter === pill.key
                ? 'bg-foreground text-background border-foreground'
                : 'bg-transparent text-foreground/70 border-border hover:border-foreground/50 hover:text-foreground'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {activeFilter === 'all' && leaderboards && leaderboards.length > 0 && (
        <>
          <CapabilityLeaderboardDisplay
            leaderboards={leaderboards}
            rawData={leaderboardRawData}
            modelCardMappings={modelCardMappings}
          />
          <hr className="my-8 md:my-12 border-border/70 dark:border-slate-700/50 w-3/4 mx-auto" />
        </>
      )}

      {filteredBlueprints.length === 0 ? (
        <p className="text-muted-foreground text-sm">No evaluations found for this filter.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {filteredBlueprints.map(bp => {
            const id = bp.id || bp.configId;
            const hasRun = bp.latestRunActualLabel && bp.latestRunSafeTimestamp;
            const href = hasRun
              ? `/analysis/${id}/${encodeURIComponent(bp.latestRunActualLabel!)}/${bp.latestRunSafeTimestamp!}`
              : null;

            return href ? (
              <Link href={href} key={id} className="block">
                <EvaluationCard blueprint={bp} />
              </Link>
            ) : (
              <div key={id}>
                <EvaluationCard blueprint={bp} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
