'use client';

import Link from 'next/link';
import { BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import { Button } from '@/components/ui/button';
import { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import DetailedBlueprintCard from './DetailedBlueprintCard';
import EvaluationCard from './EvaluationCard';
import Icon from '@/components/ui/icon';

interface BrowseAllBlueprintsSectionProps {
  blueprints: BlueprintSummaryInfo[];
  title: string;
  detailed?: boolean;
  actionLink?: {
    href: string;
    text: string;
  };
  excludeConfigIds?: string[];
}

const BrowseAllBlueprintsSection = ({ 
  blueprints, 
  title, 
  detailed = true, 
  actionLink, 
  excludeConfigIds = [] 
}: BrowseAllBlueprintsSectionProps) => {
  // Filter out excluded config IDs
  const filteredBlueprints = blueprints.filter(bp => 
    !excludeConfigIds.includes(bp.id || bp.configId)
  );
  
  return (
    <section id="browse-blueprints" className="mb-12 md:mb-16">
      <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-foreground text-center">
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
      {filteredBlueprints.length === 0 ? (
        <div className="text-center py-10 bg-card/50 dark:bg-card/40 rounded-lg shadow-md">
          <Icon name="package-search" className="w-12 h-12 mx-auto mb-4 text-muted-foreground dark:text-muted-foreground" />
          <p className="text-lg text-muted-foreground dark:text-muted-foreground">No evaluation blueprints found.</p>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">Contribute blueprints to the <a href={`${BLUEPRINT_CONFIG_REPO_URL}/tree/main/blueprints`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Weval Blueprints repository</a>.</p>
        </div>
      ) : detailed ? (
        <div className="space-y-5 md:space-y-6">
          {filteredBlueprints.map(bp => (
            <DetailedBlueprintCard key={bp.id || bp.configId} blueprint={bp} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {filteredBlueprints.map(bp => {
            const key = bp.id || bp.configId;
            if (bp.latestRunActualLabel && bp.latestRunSafeTimestamp) {
              const latestRunUrl = `/analysis/${key}/${encodeURIComponent(bp.latestRunActualLabel)}/${bp.latestRunSafeTimestamp}`;
              return (
                <Link href={latestRunUrl} key={key} className="block">
                  <EvaluationCard blueprint={bp} />
                </Link>
              );
            }
            return (
              <div key={key}>
                <EvaluationCard blueprint={bp} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default BrowseAllBlueprintsSection; 