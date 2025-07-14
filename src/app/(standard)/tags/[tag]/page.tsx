import Link from 'next/link';
import { getComparisonRunInfo, EnhancedComparisonConfigInfo } from '@/app/utils/homepageDataUtils';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import AnalysisPageHeader from '@/app/analysis/components/AnalysisPageHeader';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';
import { normalizeTag } from '@/app/utils/tagUtils';
import BrowseAllBlueprintsSection from '@/app/components/home/BrowseAllBlueprintsSection';
import { processBlueprintSummaries, BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';
import type { Metadata } from 'next';

const Tag = dynamic(() => import('lucide-react').then(mod => mod.Tag));
const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const XCircle = dynamic(() => import('lucide-react').then(mod => mod.XCircle));

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const tagName = decodeURIComponent(tag);
  return {
    title: `Blueprints tagged "${tagName}" - Weval`,
    description: `Browse all evaluation blueprints on Weval tagged with "${tagName}".`,
  };
}

export default async function TaggedBlueprintsPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const tagName = decodeURIComponent(tag);
  const allConfigs = await getComparisonRunInfo(); // This gets from homepage_summary.json

  let filteredConfigs: EnhancedComparisonConfigInfo[] = [];
  let blueprintSummaries: BlueprintSummaryInfo[] = [];
  let error: string | null = null;

  try {
    if (!allConfigs) {
      // This case might indicate an issue with getComparisonRunInfo itself or underlying storage
      // Depending on how getComparisonRunInfo handles errors, it might throw, or return null/empty.
      // If it can return null for "no data found and that's okay", then `notFound()` might be more appropriate.
      throw new Error('Could not fetch comparison configurations data.');
    }
    
    filteredConfigs = allConfigs.filter(config => 
      config.tags && config.tags.some(originalTag => normalizeTag(originalTag) === tagName)
    );
    
    // Sort by latest run, similar to homepage blueprint section
    filteredConfigs.sort((a, b) => 
      new Date(b.latestRunTimestamp).getTime() - new Date(a.latestRunTimestamp).getTime()
    );

    blueprintSummaries = processBlueprintSummaries(filteredConfigs);

  } catch (err) {
    console.error(`Error fetching or filtering configurations for tag "${tagName}":`, err);
    error = err instanceof Error ? err.message : 'An unknown error occurred while fetching data for this tag.';
    // Optionally, re-throw or use notFound() if critical
    // For now, we'll let it render an error message on the page.
  }

  const pageTitle = `Evaluations Tagged: "${tagName}"`;
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Tags', href: '#' }, // Placeholder, could link to a future "all tags" page
    { label: tagName }
  ];

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8">
        <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-background dark:to-muted/20 bg-gradient-to-br from-background to-muted/10" />
        <div className="bg-card/80 dark:bg-card/50 backdrop-blur-md p-8 rounded-xl shadow-lg ring-1 ring-destructive/70 dark:ring-red-500/70 text-center max-w-lg w-full">
          {AlertTriangle && <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-destructive dark:text-red-400" />}
          <h2 className="text-2xl font-semibold mb-3 text-destructive dark:text-red-300">Error Loading Tag Results</h2>
          <p className="text-card-foreground dark:text-muted-foreground mb-4">Could not load evaluations for tag: <strong className="text-card-foreground dark:text-foreground">{tagName}</strong></p>
          <div className="text-sm text-muted-foreground dark:text-muted-foreground bg-muted/70 dark:bg-muted/50 p-4 rounded-md ring-1 ring-border dark:ring-border/80 mb-6">
              <p className="font-semibold text-card-foreground dark:text-card-foreground mb-1">Error Details:</p>
              <code className="block text-left text-xs bg-card p-2 rounded-md overflow-x-auto custom-scrollbar">
                {error}
              </code>
          </div>
          <Link href="/">
            <Button variant="default" className="mt-8 w-full sm:w-auto px-6 py-2.5">
                Go to Homepage
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <AnalysisProvider
      configId=""
      configTitle=""
      description={`Showing all evaluation blueprints that have been tagged with \"${tagName}\".`}
      tags={[]}
      pageTitle={pageTitle}
      breadcrumbItems={breadcrumbItems}
    >
      <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
        <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-background dark:to-muted/20 bg-gradient-to-br from-background to-muted/10" />
        <div className="max-w-[1800px] mx-auto">
          <AnalysisPageHeader isSticky={false} />

        <main className="max-w-4xl mx-auto mt-6 md:mt-8">
          {filteredConfigs.length === 0 && (
            <div className="text-center py-12 bg-card/50 dark:bg-card/40 rounded-lg shadow-md">
              {Tag && <Tag className="w-12 h-12 mx-auto mb-4 text-muted-foreground dark:text-muted-foreground" />}
              <p className="text-lg text-muted-foreground dark:text-muted-foreground">
                No evaluation blueprints found with the tag: <strong className="text-foreground dark:text-foreground">{tagName}</strong>
              </p>
              <Link href="/" className="mt-6 inline-block">
                <Button variant="outline">Back to Homepage</Button>
              </Link>
            </div>
          )}

          {filteredConfigs.length > 0 && (
            <div className="space-y-5 md:space-y-6">
              <BrowseAllBlueprintsSection blueprints={blueprintSummaries} title={``} />
            </div>
          )}
        </main>
        </div>
      </div>
    </AnalysisProvider>
  );
} 