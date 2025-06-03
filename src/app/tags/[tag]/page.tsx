import Link from 'next/link';
import { getComparisonRunInfo, EnhancedComparisonConfigInfo } from '@/app/utils/homepageDataUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import AnalysisPageHeader from '@/app/analysis/components/AnalysisPageHeader';
import { fromSafeTimestamp } from '@/app/utils/timestampUtils';
import { notFound } from 'next/navigation';
import { normalizeTag } from '@/app/utils/tagUtils';

// Use next/dynamic for lucide-react icons, similar to other server components in the project
const Tag = dynamic(() => import('lucide-react').then(mod => mod.Tag));
const FolderOpen = dynamic(() => import('lucide-react').then(mod => mod.FolderOpen));
const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const ChevronRight = dynamic(() => import('lucide-react').then(mod => mod.ChevronRight));
// Loader2 is not currently used in the successful render paths of this server component.
// If needed later, it can be added similarly: const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));

interface TagFilteredPageProps {
  params: Promise<{
    tag: string;
  }>;
}

// Helper function to determine score color, can be moved to utils if needed
const getHybridScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground dark:text-slate-400';
  if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
  if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

export default async function TagFilteredPage({ params }: TagFilteredPageProps) {
  const { tag: normalizedTagFromUrl } = await params;
  const tagToMatch = decodeURIComponent(normalizedTagFromUrl);

  let filteredConfigs: EnhancedComparisonConfigInfo[] = [];
  let error: string | null = null;

  try {
    const allConfigs = await getComparisonRunInfo();
    if (!allConfigs) {
      // This case might indicate an issue with getComparisonRunInfo itself or underlying storage
      // Depending on how getComparisonRunInfo handles errors, it might throw, or return null/empty.
      // If it can return null for "no data found and that's okay", then `notFound()` might be more appropriate.
      throw new Error('Could not fetch comparison configurations data.');
    }
    
    filteredConfigs = allConfigs.filter(config => 
      config.tags && config.tags.some(originalTag => normalizeTag(originalTag) === tagToMatch)
    );
    
    // Sort by latest run, similar to homepage blueprint section
    filteredConfigs.sort((a, b) => 
      new Date(b.latestRunTimestamp).getTime() - new Date(a.latestRunTimestamp).getTime()
    );

  } catch (err) {
    console.error(`Error fetching or filtering configurations for tag "${tagToMatch}":`, err);
    error = err instanceof Error ? err.message : 'An unknown error occurred while fetching data for this tag.';
    // Optionally, re-throw or use notFound() if critical
    // For now, we'll let it render an error message on the page.
  }

  const pageTitle = `Evaluations Tagged: "${tagToMatch}"`;
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Tags', href: '#' }, // Placeholder, could link to a future "all tags" page
    { label: tagToMatch }
  ];

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8">
        <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
        <div className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md p-8 rounded-xl shadow-lg ring-1 ring-destructive/70 dark:ring-red-500/70 text-center max-w-lg w-full">
          {AlertTriangle && <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-destructive dark:text-red-400" />}
          <h2 className="text-2xl font-semibold mb-3 text-destructive dark:text-red-300">Error Loading Tag Results</h2>
          <p className="text-card-foreground dark:text-slate-300 mb-4">Could not load evaluations for tag: <strong className="text-card-foreground dark:text-slate-100">{tagToMatch}</strong></p>
          <div className="text-sm text-muted-foreground dark:text-slate-400 bg-muted/70 dark:bg-slate-700/50 p-4 rounded-md ring-1 ring-border dark:ring-slate-600 mb-6">
              <p className="font-semibold text-card-foreground dark:text-slate-300 mb-1">Error Details:</p>
              {error}
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
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
      <div className="max-w-[1800px] mx-auto">
        <AnalysisPageHeader
          breadcrumbs={breadcrumbItems}
          pageTitle={pageTitle}
          contextualInfo={{
            description: `Showing all evaluation blueprints that have been tagged with \"${tagToMatch}\".`,
          }}
          isSticky={false}
        />

        <main className="max-w-4xl mx-auto mt-6 md:mt-8">
          {filteredConfigs.length === 0 && (
            <div className="text-center py-12 bg-card/50 dark:bg-slate-800/40 rounded-lg shadow-md">
              {Tag && <Tag className="w-12 h-12 mx-auto mb-4 text-muted-foreground dark:text-slate-500" />}
              <p className="text-lg text-muted-foreground dark:text-slate-400">
                No evaluation blueprints found with the tag: <strong className="text-foreground dark:text-slate-200">{tagToMatch}</strong>
              </p>
              <Link href="/" className="mt-6 inline-block">
                <Button variant="outline">Back to Homepage</Button>
              </Link>
            </div>
          )}

          {filteredConfigs.length > 0 && (
            <div className="space-y-5 md:space-y-6">
              {filteredConfigs.map(bp => (
                <Card key={bp.configId} className="bg-card/80 dark:bg-slate-800/70 backdrop-blur-lg group ring-1 ring-border dark:ring-slate-700/70 flex flex-col">
                  <Link href={`/analysis/${bp.configId}`} className="block hover:bg-muted/30 dark:hover:bg-slate-700/40 transition-colors flex-grow">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center min-w-0">
                          {FolderOpen && <FolderOpen className="w-5 h-5 mr-2.5 text-primary dark:text-sky-400 flex-shrink-0" />}
                          <CardTitle className="text-base font-medium text-primary dark:text-sky-400 truncate group-hover:text-primary/80 dark:group-hover:text-sky-300" title={bp.title || bp.configTitle}>
                            {bp.title || bp.configTitle}
                          </CardTitle>
                        </div>
                        {ChevronRight && <ChevronRight className="w-5 h-5 text-muted-foreground dark:text-slate-400 flex-shrink-0 ml-2" />}
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4 space-y-1.5 text-xs">
                      {bp.description && (
                        <p className="text-muted-foreground dark:text-slate-400 line-clamp-2" title={bp.description}>
                          {bp.description}
                        </p>
                      )}
                      <p className="text-muted-foreground dark:text-slate-500">
                        Latest Run: <span className="font-medium text-foreground/90 dark:text-slate-300/90">
                          {new Date(fromSafeTimestamp(bp.latestRunTimestamp)).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </p>
                       {typeof bp.overallAverageHybridScore === 'number' && (
                         <p className="text-muted-foreground dark:text-slate-500">
                            Avg. Hybrid Score: <span className={`font-semibold ${getHybridScoreColor(bp.overallAverageHybridScore)}`}>
                                {(bp.overallAverageHybridScore * 100).toFixed(1)}%
                            </span>
                         </p>
                       )}
                      {bp.tags && bp.tags.length > 0 && (
                        <div className="pt-1.5 flex flex-wrap items-center gap-1.5">
                          {Tag && <Tag className="w-3 h-3 text-muted-foreground/70 dark:text-slate-500/70 flex-shrink-0" />}
                          {bp.tags.map(t => (
                            <span 
                              key={t} 
                              className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${normalizeTag(t) === tagToMatch ? 'bg-primary/20 text-primary dark:bg-sky-500/30 dark:text-sky-200 ring-1 ring-primary/50 dark:ring-sky-500/60' : 'bg-muted text-muted-foreground dark:bg-slate-700/50 dark:text-slate-400'}`}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
} 