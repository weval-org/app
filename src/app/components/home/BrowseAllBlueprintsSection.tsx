'use client';

import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import { Button } from '@/components/ui/button';
import { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import DetailedBlueprintCard from './DetailedBlueprintCard';
import SimplifiedBlueprintCard from './SimplifiedBlueprintCard';

// Define dynamic components once, outside the render function
const PackageSearch = nextDynamic(() => import('lucide-react').then(mod => mod.PackageSearch));

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
      {filteredBlueprints.length === 0 ? (
        <div className="text-center py-10 bg-card/50 dark:bg-card/40 rounded-lg shadow-md">
          {PackageSearch && <PackageSearch className="w-12 h-12 mx-auto mb-4 text-muted-foreground dark:text-muted-foreground" />}
          <p className="text-lg text-muted-foreground dark:text-muted-foreground">No evaluation blueprints found.</p>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">Contribute blueprints to the <a href={`${BLUEPRINT_CONFIG_REPO_URL}/tree/main/blueprints`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Weval Blueprints repository</a>.</p>
        </div>
      ) : (
        <div className="space-y-5 md:space-y-6">
          {filteredBlueprints.map(bp => 
            detailed ? (
              <DetailedBlueprintCard key={bp.id || bp.configId} blueprint={bp} />
            ) : (
              <SimplifiedBlueprintCard key={bp.id || bp.configId} blueprint={bp} />
            )
          )}
        </div>
      )}
    </section>
  );
};

export default BrowseAllBlueprintsSection; 