import { Button } from '@/components/ui/button';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const ArrowLeft = dynamic(() => import('lucide-react').then(mod => mod.ArrowLeft));

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

export default function AllBlueprintsLoading() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-background dark:to-muted/20 bg-gradient-to-br from-background to-muted/10" />
            
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-bold tracking-tight">All Evaluations (...)</h2>
                    <Button asChild variant="ghost" disabled>
                        <Link href="/">
                            {ArrowLeft && <ArrowLeft className="w-4 h-4 mr-2" />}
                            Back to Home
                        </Link>
                    </Button>
                </div>
                
                <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>

                <div className="flex justify-center items-center gap-4 mt-8">
                    <Button variant="outline" disabled>Previous</Button>
                    <span className="text-sm text-muted-foreground">Page 1 of ...</span>
                    <Button variant="outline" disabled>Next</Button>
                </div>
            </main>
        </div>
    );
} 