import RefactoredAnalysisPageHeader from '@/app/analysis/components/RefactoredAnalysisPageHeader';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';

function SkeletonCard() {
    return (
        <div className="bg-card/80 dark:bg-card/60 p-5 rounded-lg border border-border/60 dark:border-border/60 shadow-sm animate-pulse">
            <div className="h-5 bg-muted rounded w-3/4 mb-3"></div>
            <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-full"></div>
                <div className="h-4 bg-muted rounded w-5/6"></div>
            </div>
            <div className="flex items-center justify-between mt-4">
                <div className="h-4 bg-muted rounded w-1/4"></div>
                <div className="h-4 bg-muted rounded w-1/4"></div>
            </div>
        </div>
    );
}

export default function TaggedBlueprintsLoading() {
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Tags', href: '/tags' },
    { label: 'Loading...' }
  ];

  return (
    <AnalysisProvider
      configId=""
      configTitle=""
      description="Showing all evaluation blueprints that have been tagged with..."
      tags={[]}
      pageTitle="Evaluations Tagged: ..."
      breadcrumbItems={breadcrumbItems}
    >
      <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
        <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-background dark:to-muted/20 bg-gradient-to-br from-background to-muted/10" />
        <div className="max-w-[1800px] mx-auto">
          <RefactoredAnalysisPageHeader isSticky={false} />

        <main className="max-w-4xl mx-auto mt-6 md:mt-8">
          <div className="space-y-5 md:space-y-6">
            <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                    <SkeletonCard key={i} />
                ))}
            </div>
          </div>
        </main>
        </div>
      </div>
    </AnalysisProvider>
  );
} 